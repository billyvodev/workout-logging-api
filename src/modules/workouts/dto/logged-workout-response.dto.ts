import { ApiProperty } from '@nestjs/swagger';

export class LoggedSetOriginalDto {
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

export class LoggedSetNormalizedDto {
  @ApiProperty({
    description:
      'Pre-computed weight normalized to kg (rounded to 2 decimal places in response)',
    example: 102.06,
  })
  readonly weightKg!: number;

  @ApiProperty({
    description:
      'Pre-computed volume in kg (reps * weightKg, rounded to 2 decimal places)',
    example: 816.47,
  })
  readonly volumeKg!: number;

  @ApiProperty({
    description:
      'Pre-computed Epley 1RM in kg (weightKg * (1 + reps/30), rounded to 2 decimal places)',
    example: 129.27,
  })
  readonly estimated1RmKg!: number;
}

export class LoggedSetResponseDto {
  @ApiProperty({
    description: 'Unique UUID identifier of the set',
    example: 'set_01jcbe99z9a',
  })
  readonly id!: string;

  @ApiProperty({
    description: '1-based sequential set number within the workout entry',
    example: 1,
  })
  readonly setNumber!: number;

  @ApiProperty({ description: 'Repetitions performed', example: 8 })
  readonly reps!: number;

  @ApiProperty({
    description: 'Original set metrics entered by the client',
    type: LoggedSetOriginalDto,
  })
  readonly original!: LoggedSetOriginalDto;

  @ApiProperty({
    description: 'Normalized metric values in kilograms',
    type: LoggedSetNormalizedDto,
  })
  readonly normalized!: LoggedSetNormalizedDto;
}

export class LoggedWorkoutEntryResponseDto {
  @ApiProperty({
    description: 'Unique UUID identifier of the workout entry',
    example: 'entry_01jcbe99z8x',
  })
  readonly id!: string;

  @ApiProperty({ description: 'User identifier', example: 'user_123' })
  readonly userId!: string;

  @ApiProperty({
    description: 'Normalized ISO 8601 UTC timestamp of workout execution',
    example: '2026-10-29T10:30:00.000Z',
  })
  readonly date!: string;

  @ApiProperty({
    description: 'Client-provided exercise name',
    example: 'Barbell Bench Press',
  })
  readonly exerciseName!: string;

  @ApiProperty({
    description: 'Normalized exercise name for searching and indexing',
    example: 'barbell bench press',
  })
  readonly exerciseNameNormalized!: string;

  @ApiProperty({
    description: 'Resolved primary muscle group or null if unmapped',
    example: 'chest',
    nullable: true,
  })
  readonly muscleGroup!: string | null;

  @ApiProperty({
    description: 'List of sets performed',
    type: [LoggedSetResponseDto],
  })
  readonly sets!: LoggedSetResponseDto[];

  @ApiProperty({
    description: 'ISO 8601 timestamp of record persistence',
    example: '2026-10-29T10:30:05.120Z',
  })
  readonly createdAt!: string;
}

export class LoggedWorkoutMetaDto {
  @ApiProperty({
    description: 'Total number of workout entries logged in this batch',
    example: 1,
  })
  readonly entriesLogged!: number;

  @ApiProperty({
    description: 'Total number of individual sets logged across all entries',
    example: 2,
  })
  readonly totalSetsLogged!: number;

  @ApiProperty({
    description: 'Optional operational message or notice',
    required: false,
    example: 'Workout logged successfully.',
  })
  readonly message?: string;
}

export class LoggedWorkoutResponseDto {
  @ApiProperty({
    description: 'Array of logged workout entries',
    type: [LoggedWorkoutEntryResponseDto],
  })
  readonly data!: LoggedWorkoutEntryResponseDto[];

  @ApiProperty({
    description: 'Batch summary metadata',
    type: LoggedWorkoutMetaDto,
  })
  readonly meta!: LoggedWorkoutMetaDto;
}
