import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  IdempotencyConflictException,
  UnitConversionService,
  ValidationException,
  calculateEpley1Rm,
  calculateSetVolume,
} from '../../../common';
import { ExerciseMetadataService } from '../../exercises';
import {
  LogWorkoutDto,
  LogWorkoutEntryDto,
  LoggedSetResponseDto,
  LoggedWorkoutEntryResponseDto,
  LoggedWorkoutResponseDto,
} from '../dto';
import {
  PreparedWorkoutEntry,
  PreparedWorkoutSet,
  WorkoutEntryWithSets,
  WorkoutRepository,
} from '../repositories';

@Injectable()
export class LogWorkoutService {
  private readonly logger = new Logger(LogWorkoutService.name);

  constructor(
    private readonly workoutRepo: WorkoutRepository,
    private readonly exerciseMetadataService: ExerciseMetadataService,
    private readonly unitConversionService: UnitConversionService,
  ) {}

  /**
   * Logs single or bulk workout entries for a user with write-time pre-computed metrics
   * and idempotency protection.
   */
  async logWorkouts(
    userId: string,
    dto: LogWorkoutDto,
    idempotencyKey?: string,
  ): Promise<LoggedWorkoutResponseDto> {
    const effectiveUserId = (userId || dto.userId)?.trim();
    if (!effectiveUserId) {
      throw new ValidationException(
        'Validation failed for one or more fields.',
        [{ field: 'userId', issue: 'User ID is required.' }],
      );
    }

    const entries = dto.toEntries();

    if (entries.length === 0) {
      throw new ValidationException(
        'Validation failed for one or more fields.',
        [
          {
            field: 'entries',
            issue: 'At least one exercise entry is required.',
          },
        ],
      );
    }

    const trimmedIdempotencyKey = idempotencyKey?.trim() || undefined;

    // 1. Idempotency check for existing processed records
    if (trimmedIdempotencyKey) {
      const existingEntries = await this.workoutRepo.findByIdempotencyKey(
        effectiveUserId,
        trimmedIdempotencyKey,
      );

      if (existingEntries.length > 0) {
        if (this.isPayloadMatching(existingEntries, entries)) {
          this.logger.log({
            msg: 'Returning idempotent cached response for workout request',
            userId: effectiveUserId,
            idempotencyKey: trimmedIdempotencyKey,
          });
          return this.serializeEntries(existingEntries);
        }

        throw new IdempotencyConflictException(
          'A conflicting request with this Idempotency-Key was already processed with different payload parameters.',
        );
      }
    }

    // 2. Pre-compute metrics & normalize exercises
    const preparedEntries: PreparedWorkoutEntry[] = entries.map((entry) => {
      const exerciseNameTrimmed = entry.exerciseName.trim();
      const exerciseNameNorm = exerciseNameTrimmed.toLowerCase();
      const resolution =
        this.exerciseMetadataService.resolveMuscleGroup(exerciseNameTrimmed);
      const performedAt = new Date(entry.date);

      const preparedSets: PreparedWorkoutSet[] = entry.sets.map((set, idx) => {
        const weightKg = this.unitConversionService.toKg(
          set.weight,
          set.unit,
          4,
        );
        const volumeKg = calculateSetVolume(set.reps, weightKg, 4);
        const estimated1rmKg = calculateEpley1Rm(set.reps, weightKg, 4);

        return {
          setNumber: idx + 1,
          reps: set.reps,
          originalWeight: set.weight,
          originalUnit: set.unit.toLowerCase(),
          weightKg,
          volumeKg,
          estimated1rmKg,
        };
      });

      return {
        date: performedAt,
        exerciseName: exerciseNameTrimmed,
        exerciseNameNorm,
        muscleGroup: resolution.muscleGroup,
        exerciseCatalogId: resolution.catalogId,
        sets: preparedSets,
      };
    });

    // 3. Atomically persist records in database
    try {
      const createdEntries = await this.workoutRepo.createBulkWorkoutTx(
        effectiveUserId,
        preparedEntries,
        trimmedIdempotencyKey,
      );

      return this.serializeEntries(createdEntries);
    } catch (error) {
      // Handle concurrent race condition triggering unique index violation
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        trimmedIdempotencyKey
      ) {
        const existingEntries = await this.workoutRepo.findByIdempotencyKey(
          effectiveUserId,
          trimmedIdempotencyKey,
        );

        if (
          existingEntries.length > 0 &&
          this.isPayloadMatching(existingEntries, entries)
        ) {
          return this.serializeEntries(existingEntries);
        }

        throw new IdempotencyConflictException(
          'A conflicting request with this Idempotency-Key was already processed with different payload parameters.',
        );
      }

      throw error;
    }
  }

  /**
   * Compares incoming request payload with existing persisted entries for idempotent replay validation.
   */
  private isPayloadMatching(
    existing: WorkoutEntryWithSets[],
    incoming: LogWorkoutEntryDto[],
  ): boolean {
    if (existing.length !== incoming.length) {
      return false;
    }

    for (let i = 0; i < existing.length; i++) {
      const exEntry = existing[i];
      const inEntry = incoming[i];

      if (
        exEntry.exerciseNameNorm !== inEntry.exerciseName.trim().toLowerCase()
      ) {
        return false;
      }

      if (
        new Date(exEntry.performedAt).getTime() !==
        new Date(inEntry.date).getTime()
      ) {
        return false;
      }

      if (exEntry.sets.length !== inEntry.sets.length) {
        return false;
      }

      for (let j = 0; j < exEntry.sets.length; j++) {
        const exSet = exEntry.sets[j];
        const inSet = inEntry.sets[j];

        if (exSet.reps !== inSet.reps) {
          return false;
        }

        if (Number(exSet.originalWeight) !== inSet.weight) {
          return false;
        }

        if (
          exSet.originalUnit.toLowerCase() !== inSet.unit.trim().toLowerCase()
        ) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Serializes database records into the standardized RFC-compliant response format.
   */
  private serializeEntries(
    entries: WorkoutEntryWithSets[],
  ): LoggedWorkoutResponseDto {
    let totalSetsLogged = 0;

    const data: LoggedWorkoutEntryResponseDto[] = entries.map((entry) => {
      const sets: LoggedSetResponseDto[] = entry.sets.map((set) => {
        totalSetsLogged++;

        return {
          id: set.id,
          setNumber: set.setNumber,
          reps: set.reps,
          original: {
            weight: Number(set.originalWeight),
            unit: set.originalUnit,
          },
          normalized: {
            weightKg: this.unitConversionService.round(Number(set.weightKg), 2),
            volumeKg: this.unitConversionService.round(Number(set.volumeKg), 2),
            estimated1RmKg: this.unitConversionService.round(
              Number(set.estimated1rmKg),
              2,
            ),
          },
        };
      });

      return {
        id: entry.id,
        userId: entry.userId,
        date: entry.performedAt.toISOString(),
        exerciseName: entry.exerciseName,
        exerciseNameNormalized: entry.exerciseNameNorm,
        muscleGroup: entry.muscleGroup,
        sets,
        createdAt: entry.createdAt.toISOString(),
      };
    });

    return {
      data,
      meta: {
        entriesLogged: data.length,
        totalSetsLogged,
      },
    };
  }
}
