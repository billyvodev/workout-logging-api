import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import { LogSetDto } from './log-set.dto';

export class LogWorkoutEntryDto {
  @ApiProperty({
    description: 'ISO 8601 timestamp when the exercise was performed',
    example: '2026-10-29T10:30:00Z',
  })
  @IsISO8601({}, { message: 'date must be a valid ISO 8601 date string' })
  readonly date!: string;

  @ApiProperty({
    description: 'Name of the exercise performed',
    example: 'Barbell Bench Press',
    minLength: 1,
    maxLength: 150,
  })
  @IsString({ message: 'exerciseName must be a string' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Length(1, 150, {
    message: 'exerciseName must be between 1 and 150 characters',
  })
  readonly exerciseName!: string;

  @ApiProperty({
    description: 'Sets performed for this exercise',
    type: [LogSetDto],
    minItems: 1,
    maxItems: 100,
  })
  @IsArray({ message: 'sets must be an array' })
  @ArrayMinSize(1, { message: 'sets must contain at least 1 item' })
  @ArrayMaxSize(100, { message: 'sets cannot exceed 100 items' })
  @ValidateNested({ each: true })
  @Type(() => LogSetDto)
  readonly sets!: LogSetDto[];
}
