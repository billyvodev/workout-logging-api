import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import {
  IsEarlierThanOrEqualTo,
  IsSupportedUnit,
  WeightUnit,
} from '../../../common';

/**
 * Normalizes date-only string (YYYY-MM-DD) to start-of-day ISO 8601 UTC string (00:00:00.000Z).
 */
export function normalizeFromDate(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T00:00:00.000Z`;
  }
  return trimmed;
}

/**
 * Normalizes date-only string (YYYY-MM-DD) to end-of-day ISO 8601 UTC string (23:59:59.999Z).
 */
export function normalizeToDate(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T23:59:59.999Z`;
  }
  return trimmed;
}

export class WorkoutHistoryQueryDto {
  @ApiPropertyOptional({
    description:
      'Case-insensitive partial match on exercise name (e.g. bench matches Barbell Bench Press)',
    example: 'bench',
    minLength: 1,
    maxLength: 150,
  })
  @IsOptional()
  @IsString({ message: 'exerciseName must be a string' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Length(1, 150, {
    message: 'exerciseName must be between 1 and 150 characters',
  })
  readonly exerciseName?: string;

  @ApiPropertyOptional({
    description:
      'Inclusive start date/timestamp (ISO 8601). If date-only (YYYY-MM-DD), expands to 00:00:00.000Z',
    example: '2026-10-01',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizeFromDate(value))
  @IsString({ message: 'from must be a string' })
  @IsISO8601({}, { message: 'from must be a valid ISO 8601 date string' })
  @IsEarlierThanOrEqualTo('to', {
    message: "'from' date must be earlier than or equal to 'to' date.",
  })
  readonly from?: string;

  @ApiPropertyOptional({
    description:
      'Inclusive end date/timestamp (ISO 8601). If date-only (YYYY-MM-DD), expands to 23:59:59.999Z',
    example: '2026-10-31',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizeToDate(value))
  @IsString({ message: 'to must be a string' })
  @IsISO8601({}, { message: 'to must be a valid ISO 8601 date string' })
  readonly to?: string;

  @ApiPropertyOptional({
    description:
      'Case-insensitive exact match on resolved muscle group (e.g. chest, back, legs)',
    example: 'chest',
    minLength: 1,
    maxLength: 50,
  })
  @IsOptional()
  @IsString({ message: 'muscleGroup must be a string' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Length(1, 50, {
    message: 'muscleGroup must be between 1 and 50 characters',
  })
  readonly muscleGroup?: string;

  @ApiPropertyOptional({
    description: 'Target unit for returned weights (kg, lb)',
    example: 'kg',
    default: WeightUnit.KG,
  })
  @IsOptional()
  @IsString({ message: 'unit must be a string' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsSupportedUnit()
  readonly unit: string = WeightUnit.KG;

  @ApiPropertyOptional({
    description: 'Number of entries per page (1 to 100)',
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must be at least 1' })
  @Max(100, { message: 'limit cannot exceed 100' })
  readonly limit: number = 20;

  @ApiPropertyOptional({
    description:
      'Opaque Base64-encoded cursor token (performed_at + id) from previous response for keyset pagination',
    example: '',
  })
  @IsOptional()
  @IsString({ message: 'cursor must be a string' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  readonly cursor?: string;
}
