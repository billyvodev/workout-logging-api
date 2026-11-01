import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import {
  IsDefinedTogetherWith,
  IsEarlierThanOrEqualTo,
  IsSupportedUnit,
  WeightUnit,
} from '../../../common';
import {
  normalizeFromDate,
  normalizeToDate,
} from './workout-history-query.dto';

export class PersonalRecordsQueryDto {
  @ApiProperty({
    description:
      'Target exercise name (case-insensitive trimmed match, or canonical alias match)',
    example: 'Barbell Bench Press',
    minLength: 1,
    maxLength: 150,
  })
  @IsNotEmpty({ message: 'exerciseName must not be empty' })
  @IsString({ message: 'exerciseName must be a string' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Length(1, 150, {
    message: 'exerciseName must be between 1 and 150 characters',
  })
  readonly exerciseName!: string;

  @ApiPropertyOptional({
    description:
      'Target unit for all returned PR weights, volumes, and 1RMs (kg, lb)',
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
    description:
      'Start of primary period (ISO 8601). If date-only (YYYY-MM-DD), expands to 00:00:00.000Z. If both from and to are omitted, calculates All-Time PRs.',
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
      'End of primary period (ISO 8601). If date-only (YYYY-MM-DD), expands to 23:59:59.999Z',
    example: '2026-10-31',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizeToDate(value))
  @IsString({ message: 'to must be a string' })
  @IsISO8601({}, { message: 'to must be a valid ISO 8601 date string' })
  readonly to?: string;

  @ApiPropertyOptional({
    description:
      'Start of comparison period (ISO 8601). Requires compareTo if provided.',
    example: '2026-09-01',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizeFromDate(value))
  @IsString({ message: 'compareFrom must be a string' })
  @IsISO8601(
    {},
    { message: 'compareFrom must be a valid ISO 8601 date string' },
  )
  @IsDefinedTogetherWith('compareTo', {
    message: "'compareFrom' requires 'compareTo' to also be specified.",
  })
  @IsEarlierThanOrEqualTo('compareTo', {
    message:
      "'compareFrom' date must be earlier than or equal to 'compareTo' date.",
  })
  readonly compareFrom?: string;

  @ApiPropertyOptional({
    description:
      'End of comparison period (ISO 8601). Requires compareFrom if provided.',
    example: '2026-09-30',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizeToDate(value))
  @IsString({ message: 'compareTo must be a string' })
  @IsISO8601({}, { message: 'compareTo must be a valid ISO 8601 date string' })
  @IsDefinedTogetherWith('compareFrom', {
    message: "'compareTo' requires 'compareFrom' to also be specified.",
  })
  readonly compareTo?: string;
}
