import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import {
  FindHistoryFilter,
  PreparedWorkoutEntry,
  RawPersonalRecordRow,
  WorkoutEntryWithSets,
} from './interfaces/workout-repository.interface';

@Injectable()
export class WorkoutRepository {
  private readonly logger = new Logger(WorkoutRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves workout entries and their associated sets by idempotency key for a given user.
   * Matches both exact idempotencyKey (single entry) and compound idempotencyKey:index (bulk entries).
   */
  async findByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<WorkoutEntryWithSets[]> {
    const entries = await this.prisma.workoutEntry.findMany({
      where: {
        userId,
        OR: [
          { idempotencyKey },
          { idempotencyKey: { startsWith: `${idempotencyKey}:` } },
        ],
      },
      include: {
        sets: {
          orderBy: { setNumber: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (entries.length <= 1) {
      return entries;
    }

    return entries.sort((a, b) => {
      const aKey = a.idempotencyKey ?? '';
      const bKey = b.idempotencyKey ?? '';
      const prefix = `${idempotencyKey}:`;
      const aIdx = aKey.startsWith(prefix)
        ? parseInt(aKey.slice(prefix.length), 10)
        : 0;
      const bIdx = bKey.startsWith(prefix)
        ? parseInt(bKey.slice(prefix.length), 10)
        : 0;
      return (isNaN(aIdx) ? 0 : aIdx) - (isNaN(bIdx) ? 0 : bIdx);
    });
  }

  /**
   * Persists single or bulk workout entries with pre-computed normalized metrics
   * atomically inside a single database transaction.
   */
  async createBulkWorkoutTx(
    userId: string,
    preparedEntries: readonly PreparedWorkoutEntry[],
    idempotencyKey?: string,
  ): Promise<WorkoutEntryWithSets[]> {
    return this.prisma.$transaction(async (tx) => {
      const results: WorkoutEntryWithSets[] = [];

      for (let i = 0; i < preparedEntries.length; i++) {
        const entryData = preparedEntries[i];
        const performedAtDate =
          entryData.date instanceof Date
            ? entryData.date
            : new Date(entryData.date);

        const entryIdempotencyKey = idempotencyKey
          ? preparedEntries.length === 1
            ? idempotencyKey
            : `${idempotencyKey}:${i}`
          : null;

        const createdEntry = await tx.workoutEntry.create({
          data: {
            userId,
            exerciseName: entryData.exerciseName,
            exerciseNameNorm: entryData.exerciseNameNorm,
            exerciseCatalogId: entryData.exerciseCatalogId ?? null,
            muscleGroup: entryData.muscleGroup ?? null,
            performedAt: performedAtDate,
            idempotencyKey: entryIdempotencyKey,
            sets: {
              create: entryData.sets.map((set) => ({
                userId,
                exerciseNameNorm: entryData.exerciseNameNorm,
                performedAt: performedAtDate,
                setNumber: set.setNumber,
                reps: set.reps,
                originalWeight: new Prisma.Decimal(set.originalWeight),
                originalUnit: set.originalUnit,
                weightKg: new Prisma.Decimal(set.weightKg),
                volumeKg: new Prisma.Decimal(set.volumeKg),
                estimated1rmKg: new Prisma.Decimal(set.estimated1rmKg),
              })),
            },
          },
          include: {
            sets: {
              orderBy: { setNumber: 'asc' },
            },
          },
        });

        results.push(createdEntry);
      }

      return results;
    });
  }

  /**
   * Retrieves a workout entry by its unique primary UUID.
   */
  async findById(id: string): Promise<WorkoutEntryWithSets | null> {
    return this.prisma.workoutEntry.findUnique({
      where: { id },
      include: {
        sets: {
          orderBy: { setNumber: 'asc' },
        },
      },
    });
  }

  /**
   * Retrieves a paginated history of workout entries for a user using keyset cursor pagination.
   * Leverages composite index (user_id, performed_at DESC, id DESC) and trigram index on exercise_name_norm.
   */
  async findHistory(
    userId: string,
    filter: FindHistoryFilter,
  ): Promise<WorkoutEntryWithSets[]> {
    const where: Prisma.WorkoutEntryWhereInput = {
      userId,
      ...(filter.fromDate || filter.toDate
        ? {
            performedAt: {
              ...(filter.fromDate ? { gte: filter.fromDate } : {}),
              ...(filter.toDate ? { lte: filter.toDate } : {}),
            },
          }
        : {}),
      ...(filter.exerciseName && filter.exerciseName.trim().length > 0
        ? {
            exerciseNameNorm: {
              contains: filter.exerciseName.trim().toLowerCase(),
            },
          }
        : {}),
      ...(filter.muscleGroup && filter.muscleGroup.trim().length > 0
        ? {
            muscleGroup: {
              equals: filter.muscleGroup.trim().toLowerCase(),
              mode: 'insensitive',
            },
          }
        : {}),
      ...(filter.cursor
        ? {
            OR: [
              { performedAt: { lt: filter.cursor.performedAt } },
              {
                performedAt: filter.cursor.performedAt,
                id: { lt: filter.cursor.id },
              },
            ],
          }
        : {}),
    };

    return this.prisma.workoutEntry.findMany({
      where,
      orderBy: [{ performedAt: 'desc' }, { id: 'desc' }],
      take: filter.limit + 1,
      include: {
        sets: {
          orderBy: { setNumber: 'asc' },
        },
      },
    });
  }

  /**
   * Retrieves Personal Records (heaviest set, highest volume, best estimated 1RM)
   * for a user across one or more exercise canonical names/aliases and optional date boundaries.
   * Executes a single-pass parameterized SQL CTE query with deterministic tie-breaking.
   */
  async findPersonalRecords(
    userId: string,
    exerciseNames: string[],
    fromDate?: Date,
    toDate?: Date,
  ): Promise<RawPersonalRecordRow[]> {
    if (!exerciseNames || exerciseNames.length === 0) {
      return [];
    }

    const fromIso = fromDate ? fromDate.toISOString() : null;
    const toIso = toDate ? toDate.toISOString() : null;

    return this.prisma.$queryRaw<RawPersonalRecordRow[]>`
      WITH scoped_sets AS (
        SELECT 
          id, 
          workout_entry_id, 
          reps, 
          original_weight, 
          original_unit, 
          weight_kg, 
          volume_kg, 
          estimated_1rm_kg, 
          performed_at
        FROM workout_sets
        WHERE user_id = ${userId}
          AND exercise_name_norm = ANY(${exerciseNames}::text[])
          AND (${fromIso}::timestamptz IS NULL OR performed_at >= ${fromIso}::timestamptz)
          AND (${toIso}::timestamptz IS NULL OR performed_at <= ${toIso}::timestamptz)
      )
      (
        SELECT 'heaviest_set' AS pr_type, id, workout_entry_id, reps, original_weight, original_unit, weight_kg, volume_kg, estimated_1rm_kg, performed_at
        FROM scoped_sets
        ORDER BY weight_kg DESC, reps DESC, performed_at DESC, id DESC
        LIMIT 1
      )
      UNION ALL
      (
        SELECT 'highest_volume_set' AS pr_type, id, workout_entry_id, reps, original_weight, original_unit, weight_kg, volume_kg, estimated_1rm_kg, performed_at
        FROM scoped_sets
        ORDER BY volume_kg DESC, weight_kg DESC, performed_at DESC, id DESC
        LIMIT 1
      )
      UNION ALL
      (
        SELECT 'best_1rm_set' AS pr_type, id, workout_entry_id, reps, original_weight, original_unit, weight_kg, volume_kg, estimated_1rm_kg, performed_at
        FROM scoped_sets
        ORDER BY estimated_1rm_kg DESC, weight_kg DESC, performed_at DESC, id DESC
        LIMIT 1
      );
    `;
  }
}
