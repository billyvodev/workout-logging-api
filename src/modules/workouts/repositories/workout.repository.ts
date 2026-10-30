import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import {
  PreparedWorkoutEntry,
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
    return this.prisma.workoutEntry.findMany({
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
}
