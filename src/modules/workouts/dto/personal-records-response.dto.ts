import { ApiProperty } from '@nestjs/swagger';

export class HeaviestSetRecordDto {
  @ApiProperty({
    description:
      'Maximum single-set weight lifted in target unit (rounded to 2 decimal places)',
    example: 245,
  })
  readonly weight!: number;

  @ApiProperty({
    description: 'Repetitions completed on the heaviest set',
    example: 3,
  })
  readonly reps!: number;

  @ApiProperty({
    description: 'Unit of display weight',
    example: 'lb',
  })
  readonly unit!: string;

  @ApiProperty({
    description: 'Normalized ISO 8601 UTC timestamp when set was achieved',
    example: '2026-10-18T14:20:00.000Z',
  })
  readonly achievedAt!: string;

  @ApiProperty({
    description: 'Unique UUID identifier of the parent workout entry',
    example: 'entry_01j9abc',
  })
  readonly workoutEntryId!: string;

  @ApiProperty({
    description: 'Unique UUID identifier of the workout set',
    example: 'set_01j9abd',
  })
  readonly setId!: string;
}

export class HighestVolumeSetRecordDto {
  @ApiProperty({
    description:
      'Maximum single-set volume (reps * weight) in target unit (rounded to 2 decimal places)',
    example: 2250,
  })
  readonly volume!: number;

  @ApiProperty({
    description: 'Weight lifted during highest volume set in target unit',
    example: 225,
  })
  readonly weight!: number;

  @ApiProperty({
    description: 'Repetitions completed on the highest volume set',
    example: 10,
  })
  readonly reps!: number;

  @ApiProperty({
    description: 'Unit of display weight',
    example: 'lb',
  })
  readonly unit!: string;

  @ApiProperty({
    description: 'Normalized ISO 8601 UTC timestamp when set was achieved',
    example: '2026-10-12T11:00:00.000Z',
  })
  readonly achievedAt!: string;

  @ApiProperty({
    description: 'Unique UUID identifier of the parent workout entry',
    example: 'entry_01j8xyz',
  })
  readonly workoutEntryId!: string;

  @ApiProperty({
    description: 'Unique UUID identifier of the workout set',
    example: 'set_01j8xy0',
  })
  readonly setId!: string;
}

export class BestEstimated1RmRecordDto {
  @ApiProperty({
    description:
      'Maximum single-set Epley 1RM in target unit (rounded to 2 decimal places)',
    example: 285,
  })
  readonly estimated1RM!: number;

  @ApiProperty({
    description: 'Weight lifted during best 1RM set in target unit',
    example: 225,
  })
  readonly weight!: number;

  @ApiProperty({
    description: 'Repetitions completed on best 1RM set',
    example: 8,
  })
  readonly reps!: number;

  @ApiProperty({
    description: 'Unit of display weight',
    example: 'lb',
  })
  readonly unit!: string;

  @ApiProperty({
    description: 'Normalized ISO 8601 UTC timestamp when set was achieved',
    example: '2026-10-25T16:00:00.000Z',
  })
  readonly achievedAt!: string;

  @ApiProperty({
    description: 'Unique UUID identifier of the parent workout entry',
    example: 'entry_01j9def',
  })
  readonly workoutEntryId!: string;

  @ApiProperty({
    description: 'Unique UUID identifier of the workout set',
    example: 'set_01j9deg',
  })
  readonly setId!: string;
}

export class PersonalRecordsGroupDto {
  @ApiProperty({
    description:
      'Heaviest single set achieved, or null if no sets logged in period',
    type: HeaviestSetRecordDto,
    nullable: true,
  })
  readonly heaviestSet!: HeaviestSetRecordDto | null;

  @ApiProperty({
    description:
      'Highest volume single set achieved, or null if no sets logged in period',
    type: HighestVolumeSetRecordDto,
    nullable: true,
  })
  readonly highestVolumeSet!: HighestVolumeSetRecordDto | null;

  @ApiProperty({
    description:
      'Best estimated Epley 1RM set achieved, or null if no sets logged in period',
    type: BestEstimated1RmRecordDto,
    nullable: true,
  })
  readonly bestEstimated1RM!: BestEstimated1RmRecordDto | null;
}

export class PeriodRangeDto {
  @ApiProperty({
    description:
      'Normalized ISO 8601 UTC start of the period range, or null for all-time',
    example: '2026-10-01T00:00:00.000Z',
    nullable: true,
  })
  readonly from!: string | null;

  @ApiProperty({
    description:
      'Normalized ISO 8601 UTC end of the period range, or null for all-time',
    example: '2026-10-31T23:59:59.000Z',
    nullable: true,
  })
  readonly to!: string | null;
}

export class PeriodRecordsDto {
  @ApiProperty({
    description: 'Date range boundaries for this period',
    type: PeriodRangeDto,
  })
  readonly range!: PeriodRangeDto;

  @ApiProperty({
    description: 'Personal records achieved within this period',
    type: PersonalRecordsGroupDto,
  })
  readonly records!: PersonalRecordsGroupDto;
}

export class MetricComparisonDto {
  @ApiProperty({
    description:
      'Absolute difference (primaryValue - comparisonValue) in target unit (rounded to 2 decimal places)',
    example: 10,
  })
  readonly absoluteDiff!: number;

  @ApiProperty({
    description:
      'Percentage difference (((primaryValue - comparisonValue) / comparisonValue) * 100) (rounded to 2 decimal places)',
    example: 4.26,
  })
  readonly percentageDiff!: number;

  @ApiProperty({
    description: 'True if primary period exceeded comparison period',
    example: true,
  })
  readonly improved!: boolean;
}

export class PeriodComparisonDto {
  @ApiProperty({
    description:
      'Period-over-period comparison for heaviest set, or null if either period has no record',
    type: MetricComparisonDto,
    nullable: true,
  })
  readonly heaviestSet!: MetricComparisonDto | null;

  @ApiProperty({
    description:
      'Period-over-period comparison for highest volume set, or null if either period has no record',
    type: MetricComparisonDto,
    nullable: true,
  })
  readonly highestVolumeSet!: MetricComparisonDto | null;

  @ApiProperty({
    description:
      'Period-over-period comparison for best estimated 1RM, or null if either period has no record',
    type: MetricComparisonDto,
    nullable: true,
  })
  readonly bestEstimated1RM!: MetricComparisonDto | null;
}

export class PersonalRecordsDataDto {
  @ApiProperty({
    description: 'Unique identifier of the user',
    example: 'user_123',
  })
  readonly userId!: string;

  @ApiProperty({
    description: 'Exercise name queried or canonical display name',
    example: 'Barbell Bench Press',
  })
  readonly exerciseName!: string;

  @ApiProperty({
    description:
      'Primary muscle group associated with exercise, or null if unmapped',
    example: 'chest',
    nullable: true,
  })
  readonly muscleGroup!: string | null;

  @ApiProperty({
    description: 'Unit of all returned PR weights, volumes, and 1RMs',
    example: 'lb',
  })
  readonly unit!: string;

  @ApiProperty({
    description: 'PR records and range for the primary evaluation period',
    type: PeriodRecordsDto,
  })
  readonly primaryPeriod!: PeriodRecordsDto;

  @ApiProperty({
    description:
      'PR records and range for the comparison period, or null if comparison not requested/empty',
    type: PeriodRecordsDto,
    nullable: true,
  })
  readonly comparisonPeriod!: PeriodRecordsDto | null;

  @ApiProperty({
    description:
      'Calculated delta comparison between primary and comparison periods, or null if comparison not active/empty',
    type: PeriodComparisonDto,
    nullable: true,
  })
  readonly comparison!: PeriodComparisonDto | null;
}

export class PersonalRecordsMetaDto {
  @ApiProperty({
    description: 'Human-readable outcome or informational status message',
    example: 'Personal records calculated successfully.',
  })
  readonly message!: string;
}

export class PersonalRecordsResponseDto {
  @ApiProperty({
    description: 'Personal records payload',
    type: PersonalRecordsDataDto,
  })
  readonly data!: PersonalRecordsDataDto;

  @ApiProperty({
    description: 'Response metadata',
    type: PersonalRecordsMetaDto,
  })
  readonly meta!: PersonalRecordsMetaDto;
}
