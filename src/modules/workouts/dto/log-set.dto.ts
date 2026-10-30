import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, IsString, Max, Min } from 'class-validator';
import { IsSupportedUnit } from '../../../common';

export class LogSetDto {
  @ApiProperty({
    description: 'Number of repetitions performed',
    example: 8,
    minimum: 1,
    maximum: 1000,
  })
  @IsInt({ message: 'reps must be an integer' })
  @Min(1, { message: 'reps must be at least 1' })
  @Max(1000, { message: 'reps cannot exceed 1000' })
  readonly reps!: number;

  @ApiProperty({
    description:
      'Weight lifted (supports 0 for bodyweight exercises, up to 2 decimal places)',
    example: 225,
    minimum: 0,
    maximum: 5000,
  })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'weight must be a number with at most 2 decimal places' },
  )
  @Min(0, { message: 'weight cannot be negative' })
  @Max(5000, { message: 'weight cannot exceed 5000' })
  readonly weight!: number;

  @ApiProperty({
    description: 'Weight unit (case-insensitive, e.g. kg, lb)',
    example: 'lb',
  })
  @IsString({ message: 'unit must be a string' })
  @IsSupportedUnit()
  readonly unit!: string;
}
