import { Injectable, Logger } from '@nestjs/common';
import {
  UnitConversionService,
  UnsupportedUnitException,
  ValidationException,
  WeightUnit,
  calculateEpley1Rm,
  calculateSetVolume,
  decodeCursor,
  encodeCursor,
  roundToPrecision,
} from '../../../common';
import {
  WorkoutHistoryEntryDto,
  WorkoutHistoryQueryDto,
  WorkoutHistoryResponseDto,
  WorkoutHistorySetDto,
  normalizeFromDate,
  normalizeToDate,
} from '../dto';
import { FindHistoryFilter, WorkoutRepository } from '../repositories';

@Injectable()
export class WorkoutHistoryService {
  private readonly logger = new Logger(WorkoutHistoryService.name);

  constructor(
    private readonly workoutRepo: WorkoutRepository,
    private readonly unitConversionService: UnitConversionService,
  ) {}

  /**
   * Retrieves paginated workout entries for a user with keyset cursor navigation,
   * metric pre-computations, and zero-drift dynamic unit conversion.
   */
  async getWorkoutHistory(
    userId: string,
    query: WorkoutHistoryQueryDto,
  ): Promise<WorkoutHistoryResponseDto> {
    const effectiveUserId = userId?.trim();
    if (!effectiveUserId) {
      throw new ValidationException(
        'Validation failed for one or more fields.',
        [{ field: 'userId', issue: 'User ID is required.' }],
      );
    }

    const limit = query.limit ?? 20;
    const targetUnit = (query.unit ?? WeightUnit.KG).trim().toLowerCase();

    if (!this.unitConversionService.isSupported(targetUnit)) {
      throw new UnsupportedUnitException(
        query.unit,
        this.unitConversionService.getSupportedUnits(),
      );
    }

    const { fromDate, toDate } = this.parseDateBounds(query.from, query.to);
    const decodedCursor = query.cursor ? decodeCursor(query.cursor) : undefined;

    const filter: FindHistoryFilter = {
      limit,
      exerciseName: query.exerciseName?.trim(),
      fromDate,
      toDate,
      muscleGroup: query.muscleGroup?.trim(),
      cursor: decodedCursor,
    };

    const entries = await this.workoutRepo.findHistory(effectiveUserId, filter);

    const hasNextPage = entries.length > limit;
    const visibleEntries = hasNextPage ? entries.slice(0, limit) : entries;

    let nextCursor: string | null = null;
    if (hasNextPage && visibleEntries.length > 0) {
      const lastEntry = visibleEntries[visibleEntries.length - 1];
      nextCursor = encodeCursor({
        performedAt: lastEntry.performedAt,
        id: lastEntry.id,
      });
    }

    const data: WorkoutHistoryEntryDto[] = visibleEntries.map((entry) => {
      const sets: WorkoutHistorySetDto[] = (entry.sets ?? []).map((set) => {
        const originalWeight = Number(set.originalWeight);
        const weightKg = Number(set.weightKg);
        const isOriginalUnit = targetUnit === set.originalUnit.toLowerCase();

        // Zero-drift return: if requested unit matches original unit, preserve exact originalWeight
        const displayWeight = isOriginalUnit
          ? originalWeight
          : this.unitConversionService.fromKg(weightKg, targetUnit, 2);

        const volume = calculateSetVolume(set.reps, displayWeight, 2);
        const estimated1RM = calculateEpley1Rm(set.reps, displayWeight, 2);
        const normalizedKg = roundToPrecision(weightKg, 2);

        return {
          setNumber: set.setNumber,
          reps: set.reps,
          weight: displayWeight,
          unit: targetUnit,
          volume,
          estimated1RM,
          original: {
            weight: originalWeight,
            unit: set.originalUnit,
          },
          normalizedKg,
        };
      });

      return {
        id: entry.id,
        userId: entry.userId,
        date: entry.performedAt.toISOString(),
        exerciseName: entry.exerciseName,
        muscleGroup: entry.muscleGroup ?? null,
        sets,
      };
    });

    const message =
      data.length === 0
        ? 'No workout entries found for the specified filter criteria and date range.'
        : 'Workout entries retrieved successfully.';

    this.logger.log({
      msg: 'Workout history retrieved successfully',
      userId: effectiveUserId,
      returnedCount: data.length,
      limit,
      hasNextPage,
      targetUnit,
    });

    return {
      data,
      pagination: {
        limit,
        hasNextPage,
        nextCursor,
      },
      meta: {
        requestedUnit: targetUnit,
        message,
      },
    };
  }

  /**
   * Normalizes and validates 'from' and 'to' date boundaries.
   */
  private parseDateBounds(
    from?: string,
    to?: string,
  ): { fromDate?: Date; toDate?: Date } {
    let fromDate: Date | undefined;
    let toDate: Date | undefined;

    if (from) {
      const normalizedFrom = normalizeFromDate(from);
      fromDate = new Date(normalizedFrom as string);
      if (isNaN(fromDate.getTime())) {
        throw new ValidationException(
          'Validation failed for one or more fields.',
          [
            {
              field: 'from',
              issue: 'from must be a valid ISO 8601 date string',
            },
          ],
        );
      }
    }

    if (to) {
      const normalizedTo = normalizeToDate(to);
      toDate = new Date(normalizedTo as string);
      if (isNaN(toDate.getTime())) {
        throw new ValidationException(
          'Validation failed for one or more fields.',
          [{ field: 'to', issue: 'to must be a valid ISO 8601 date string' }],
        );
      }
    }

    if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
      throw new ValidationException(
        'Validation failed for one or more fields.',
        [
          {
            field: 'from',
            issue: "'from' date must be earlier than or equal to 'to' date.",
          },
        ],
      );
    }

    return { fromDate, toDate };
  }
}

