import { ApiProperty } from '@nestjs/swagger';

export class WorkoutHistorySetOriginalDto {
  @ApiProperty({
    description: 'Original weight entered by the client',
    example: 225,
  })
  readonly weight!: number;

  @ApiProperty({
    description: 'Original unit entered by the client',
    example: 'lb',
  })
  readonly unit!: string;
}

export class WorkoutHistorySetDto {
  @ApiProperty({
    description: '1-based sequential set number within the workout entry',
    example: 1,
  })
  readonly setNumber!: number;

  @ApiProperty({
    description: 'Number of repetitions performed',
    example: 8,
  })
  readonly reps!: number;

  @ApiProperty({
    description:
      'Display weight in requested unit (rounded to 2 decimal places)',
    example: 225,
  })
  readonly weight!: number;

  @ApiProperty({
    description: 'Unit of display weight',
    example: 'lb',
  })
  readonly unit!: string;

  @ApiProperty({
    description:
      'Set volume in requested unit (reps * weight, rounded to 2 decimal places)',
    example: 1800,
  })
  readonly volume!: number;

  @ApiProperty({
    description:
      'Estimated Epley 1RM in requested unit (rounded to 2 decimal places)',
    example: 285,
  })
  readonly estimated1RM!: number;

  @ApiProperty({
    description: 'Original set metrics entered by the client',
    type: WorkoutHistorySetOriginalDto,
  })
  readonly original!: WorkoutHistorySetOriginalDto;

  @ApiProperty({
    description: 'Weight normalized to kilograms (rounded to 2 decimal places)',
    example: 102.06,
  })
  readonly normalizedKg!: number;
}

export class WorkoutHistoryEntryDto {
  @ApiProperty({
    description: 'Unique UUID identifier of the workout entry',
    example: 'entry_01jcbe99z8x',
  })
  readonly id!: string;

  @ApiProperty({
    description: 'Unique identifier of the user',
    example: 'user_123',
  })
  readonly userId!: string;

  @ApiProperty({
    description: 'Normalized ISO 8601 UTC timestamp of workout execution',
    example: '2026-10-29T10:30:00.000Z',
  })
  readonly date!: string;

  @ApiProperty({
    description: 'Exercise name performed',
    example: 'Barbell Bench Press',
  })
  readonly exerciseName!: string;

  @ApiProperty({
    description: 'Resolved primary muscle group or null if unmapped',
    example: 'chest',
    nullable: true,
  })
  readonly muscleGroup!: string | null;

  @ApiProperty({
    description: 'List of sets performed for this entry',
    type: [WorkoutHistorySetDto],
  })
  readonly sets!: WorkoutHistorySetDto[];
}

export class WorkoutHistoryPaginationDto {
  @ApiProperty({
    description: 'Number of entries per page',
    example: 20,
  })
  readonly limit!: number;

  @ApiProperty({
    description: 'Indicates whether more records exist beyond current page',
    example: true,
  })
  readonly hasNextPage!: boolean;

  @ApiProperty({
    description:
      'Opaque Base64 keyset pagination cursor for next page, or null if no further pages',
    example:
      'eyJwZXJmb3JtZWRBdCI6IjIwMjYtMTAtMjlUMTA6MzA6MDAuMDAwWiIsImlkIjoiZW50cnlfMDFqY2JlOTl6OHgifQ==',
    nullable: true,
  })
  readonly nextCursor!: string | null;
}

export class WorkoutHistoryMetaDto {
  @ApiProperty({
    description: 'Target unit used for converted weight values',
    example: 'lb',
  })
  readonly requestedUnit!: string;

  @ApiProperty({
    description: 'Informational message regarding the query outcome',
    example: 'Workout entries retrieved successfully.',
  })
  readonly message!: string;
}

export class WorkoutHistoryResponseDto {
  @ApiProperty({
    description: 'Array of workout entries matching criteria',
    type: [WorkoutHistoryEntryDto],
  })
  readonly data!: WorkoutHistoryEntryDto[];

  @ApiProperty({
    description: 'Pagination metadata',
    type: WorkoutHistoryPaginationDto,
  })
  readonly pagination!: WorkoutHistoryPaginationDto;

  @ApiProperty({
    description: 'Response metadata',
    type: WorkoutHistoryMetaDto,
  })
  readonly meta!: WorkoutHistoryMetaDto;
}
