import { Injectable, Logger } from '@nestjs/common';
import {
  UnitConversionService,
  UnsupportedUnitException,
  ValidationException,
  WeightUnit,
  calculateEpley1Rm,
  calculateSetVolume,
  roundToPrecision,
} from '../../../common';
import { ExerciseMetadataService } from '../../exercises';
import {
  BestEstimated1RmRecordDto,
  HeaviestSetRecordDto,
  HighestVolumeSetRecordDto,
  MetricComparisonDto,
  PeriodComparisonDto,
  PeriodRangeDto,
  PeriodRecordsDto,
  PersonalRecordsGroupDto,
  PersonalRecordsQueryDto,
  PersonalRecordsResponseDto,
  normalizeFromDate,
  normalizeToDate,
} from '../dto';
import { RawPersonalRecordRow, WorkoutRepository } from '../repositories';

@Injectable()
export class PersonalRecordsService {
  private readonly logger = new Logger(PersonalRecordsService.name);

  constructor(
    private readonly workoutRepo: WorkoutRepository,
    private readonly exerciseMetadataService: ExerciseMetadataService,
    private readonly unitConversionService: UnitConversionService,
  ) {}

  /**
   * Calculates personal records (heaviest set, highest volume, best 1RM)
   * and optional period-over-period comparisons with zero-drift unit preservation.
   */
  async getPersonalRecords(
    userId: string,
    query: PersonalRecordsQueryDto,
  ): Promise<PersonalRecordsResponseDto> {
    const effectiveUserId = userId?.trim();
    if (!effectiveUserId) {
      throw new ValidationException(
        'Validation failed for one or more fields.',
        [{ field: 'userId', issue: 'User ID is required.' }],
      );
    }

    const rawExerciseName = query.exerciseName?.trim();
    if (!rawExerciseName) {
      throw new ValidationException(
        'Validation failed for one or more fields.',
        [{ field: 'exerciseName', issue: 'exerciseName must not be empty' }],
      );
    }

    const targetUnit = (query.unit ?? WeightUnit.KG).trim().toLowerCase();
    if (!this.unitConversionService.isSupported(targetUnit)) {
      throw new UnsupportedUnitException(
        query.unit,
        this.unitConversionService.getSupportedUnits(),
      );
    }

    // Step 2: Exercise Name & Canonical Alias Resolution
    const resolution = this.exerciseMetadataService.resolveMuscleGroup(
      rawExerciseName,
    ) ?? {
      muscleGroup: null,
    };
    const exerciseNamesSet = new Set<string>();
    exerciseNamesSet.add(rawExerciseName.toLowerCase());

    if (resolution?.canonicalName) {
      exerciseNamesSet.add(resolution.canonicalName.toLowerCase());
      const canonical = this.exerciseMetadataService.getExerciseByCanonicalName(
        resolution.canonicalName,
      );
      if (canonical?.aliases) {
        for (const alias of canonical.aliases) {
          exerciseNamesSet.add(alias.toLowerCase());
        }
      }
    }

    const exerciseNames = Array.from(exerciseNamesSet);
    const displayName = resolution?.displayName ?? rawExerciseName;
    const muscleGroup = resolution?.muscleGroup ?? null;

    // Step 3: Date Parsing & Mutual Dependency Validation
    const { fromDate: primaryFromDate, toDate: primaryToDate } =
      this.parseDateRange(query.from, query.to, 'from', 'to');

    if (
      (query.compareFrom && !query.compareTo) ||
      (!query.compareFrom && query.compareTo)
    ) {
      const providedField = query.compareFrom ? 'compareFrom' : 'compareTo';
      const requiredField = query.compareFrom ? 'compareTo' : 'compareFrom';
      throw new ValidationException(
        'Validation failed for one or more fields.',
        [
          {
            field: providedField,
            issue: `'${providedField}' requires '${requiredField}' to also be specified.`,
          },
        ],
      );
    }

    const hasComparison = Boolean(query.compareFrom && query.compareTo);
    let compFromDate: Date | undefined;
    let compToDate: Date | undefined;

    if (hasComparison) {
      const compDates = this.parseDateRange(
        query.compareFrom,
        query.compareTo,
        'compareFrom',
        'compareTo',
      );
      compFromDate = compDates.fromDate;
      compToDate = compDates.toDate;
    }

    const primaryRange: PeriodRangeDto = {
      from: primaryFromDate ? primaryFromDate.toISOString() : null,
      to: primaryToDate ? primaryToDate.toISOString() : null,
    };

    const comparisonRange: PeriodRangeDto = {
      from: compFromDate ? compFromDate.toISOString() : null,
      to: compToDate ? compToDate.toISOString() : null,
    };

    // Parallel Query Execution for Primary and Comparison Periods
    const [primaryRows, comparisonRows] = await Promise.all([
      this.workoutRepo.findPersonalRecords(
        effectiveUserId,
        exerciseNames,
        primaryFromDate,
        primaryToDate,
      ),
      hasComparison
        ? this.workoutRepo.findPersonalRecords(
            effectiveUserId,
            exerciseNames,
            compFromDate,
            compToDate,
          )
        : Promise.resolve([] as RawPersonalRecordRow[]),
    ]);

    // Step 6: Empty Results Contract
    if (primaryRows.length === 0) {
      this.logger.log({
        msg: 'No workout sets found for exercise in primary period',
        userId: effectiveUserId,
        exerciseName: displayName,
      });

      return {
        data: {
          userId: effectiveUserId,
          exerciseName: displayName,
          muscleGroup,
          unit: targetUnit,
          primaryPeriod: {
            range: primaryRange,
            records: {
              heaviestSet: null,
              highestVolumeSet: null,
              bestEstimated1RM: null,
            },
          },
          comparisonPeriod: null,
          comparison: null,
        },
        meta: {
          message: `No workout sets found for '${displayName}' in the specified date range.`,
        },
      };
    }

    // Step 4: Record Formatting with Zero-Drift Preservation
    const heaviestPrimary = primaryRows.find(
      (r) => r.pr_type === 'heaviest_set',
    );
    const highestVolumePrimary = primaryRows.find(
      (r) => r.pr_type === 'highest_volume_set',
    );
    const best1rmPrimary = primaryRows.find(
      (r) => r.pr_type === 'best_1rm_set',
    );

    const primaryGroup: PersonalRecordsGroupDto = {
      heaviestSet: this.formatHeaviestSet(heaviestPrimary, targetUnit),
      highestVolumeSet: this.formatHighestVolumeSet(
        highestVolumePrimary,
        targetUnit,
      ),
      bestEstimated1RM: this.formatBest1RmSet(best1rmPrimary, targetUnit),
    };

    let comparisonPeriodDto: PeriodRecordsDto | null = null;
    let comparisonDto: PeriodComparisonDto | null = null;

    if (hasComparison) {
      const heaviestComp = comparisonRows.find(
        (r) => r.pr_type === 'heaviest_set',
      );
      const highestVolumeComp = comparisonRows.find(
        (r) => r.pr_type === 'highest_volume_set',
      );
      const best1rmComp = comparisonRows.find(
        (r) => r.pr_type === 'best_1rm_set',
      );

      const compGroup: PersonalRecordsGroupDto = {
        heaviestSet: this.formatHeaviestSet(heaviestComp, targetUnit),
        highestVolumeSet: this.formatHighestVolumeSet(
          highestVolumeComp,
          targetUnit,
        ),
        bestEstimated1RM: this.formatBest1RmSet(best1rmComp, targetUnit),
      };

      comparisonPeriodDto = {
        range: comparisonRange,
        records: compGroup,
      };

      // Step 5: Period Comparison Calculation
      comparisonDto = {
        heaviestSet: this.calculateMetricComparison(
          primaryGroup.heaviestSet?.weight,
          compGroup.heaviestSet?.weight,
        ),
        highestVolumeSet: this.calculateMetricComparison(
          primaryGroup.highestVolumeSet?.volume,
          compGroup.highestVolumeSet?.volume,
        ),
        bestEstimated1RM: this.calculateMetricComparison(
          primaryGroup.bestEstimated1RM?.estimated1RM,
          compGroup.bestEstimated1RM?.estimated1RM,
        ),
      };
    }

    this.logger.log({
      msg: 'Personal records calculated successfully',
      userId: effectiveUserId,
      exerciseName: displayName,
      hasComparison,
    });

    return {
      data: {
        userId: effectiveUserId,
        exerciseName: displayName,
        muscleGroup,
        unit: targetUnit,
        primaryPeriod: {
          range: primaryRange,
          records: primaryGroup,
        },
        comparisonPeriod: comparisonPeriodDto,
        comparison: comparisonDto,
      },
      meta: {
        message: 'Personal records calculated successfully.',
      },
    };
  }

  private formatHeaviestSet(
    row: RawPersonalRecordRow | undefined,
    targetUnit: string,
  ): HeaviestSetRecordDto | null {
    if (!row) {
      return null;
    }

    const isZeroDrift = row.original_unit.trim().toLowerCase() === targetUnit;
    const displayWeight = isZeroDrift
      ? roundToPrecision(Number(row.original_weight), 2)
      : this.unitConversionService.fromKg(Number(row.weight_kg), targetUnit, 2);

    const achievedAt =
      row.performed_at instanceof Date
        ? row.performed_at.toISOString()
        : new Date(row.performed_at).toISOString();

    return {
      weight: displayWeight,
      reps: row.reps,
      unit: targetUnit,
      achievedAt,
      workoutEntryId: row.workout_entry_id,
      setId: row.id,
    };
  }

  private formatHighestVolumeSet(
    row: RawPersonalRecordRow | undefined,
    targetUnit: string,
  ): HighestVolumeSetRecordDto | null {
    if (!row) {
      return null;
    }

    const isZeroDrift = row.original_unit.trim().toLowerCase() === targetUnit;
    const displayWeight = isZeroDrift
      ? roundToPrecision(Number(row.original_weight), 2)
      : this.unitConversionService.fromKg(Number(row.weight_kg), targetUnit, 2);

    const volume = calculateSetVolume(row.reps, displayWeight, 2);
    const achievedAt =
      row.performed_at instanceof Date
        ? row.performed_at.toISOString()
        : new Date(row.performed_at).toISOString();

    return {
      volume,
      weight: displayWeight,
      reps: row.reps,
      unit: targetUnit,
      achievedAt,
      workoutEntryId: row.workout_entry_id,
      setId: row.id,
    };
  }

  private formatBest1RmSet(
    row: RawPersonalRecordRow | undefined,
    targetUnit: string,
  ): BestEstimated1RmRecordDto | null {
    if (!row) {
      return null;
    }

    const isZeroDrift = row.original_unit.trim().toLowerCase() === targetUnit;
    const displayWeight = isZeroDrift
      ? roundToPrecision(Number(row.original_weight), 2)
      : this.unitConversionService.fromKg(Number(row.weight_kg), targetUnit, 2);

    const estimated1RM = calculateEpley1Rm(row.reps, displayWeight, 2);
    const achievedAt =
      row.performed_at instanceof Date
        ? row.performed_at.toISOString()
        : new Date(row.performed_at).toISOString();

    return {
      estimated1RM,
      weight: displayWeight,
      reps: row.reps,
      unit: targetUnit,
      achievedAt,
      workoutEntryId: row.workout_entry_id,
      setId: row.id,
    };
  }

  private calculateMetricComparison(
    primaryVal: number | null | undefined,
    compVal: number | null | undefined,
  ): MetricComparisonDto | null {
    if (
      primaryVal === null ||
      primaryVal === undefined ||
      compVal === null ||
      compVal === undefined
    ) {
      return null;
    }

    const absoluteDiff = roundToPrecision(primaryVal - compVal, 2);
    const percentageDiff =
      compVal > 0
        ? roundToPrecision(((primaryVal - compVal) / compVal) * 100, 2)
        : 0;
    const improved = primaryVal > compVal;

    return {
      absoluteDiff,
      percentageDiff,
      improved,
    };
  }

  private parseDateRange(
    from?: string,
    to?: string,
    fromFieldName = 'from',
    toFieldName = 'to',
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
              field: fromFieldName,
              issue: `${fromFieldName} must be a valid ISO 8601 date string`,
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
          [
            {
              field: toFieldName,
              issue: `${toFieldName} must be a valid ISO 8601 date string`,
            },
          ],
        );
      }
    }

    if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
      throw new ValidationException(
        'Validation failed for one or more fields.',
        [
          {
            field: fromFieldName,
            issue: `'${fromFieldName}' date must be earlier than or equal to '${toFieldName}' date.`,
          },
        ],
      );
    }

    return { fromDate, toDate };
  }
}
