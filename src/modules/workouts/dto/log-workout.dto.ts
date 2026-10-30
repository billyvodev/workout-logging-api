import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsISO8601,
  IsString,
  Length,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { LogSetDto } from './log-set.dto';
import { LogWorkoutEntryDto } from './log-workout-entry.dto';

export class LogWorkoutDto {
  @ApiPropertyOptional({
    description: 'ISO 8601 timestamp (for single exercise logging)',
    example: '2026-10-29T10:30:00Z',
  })
  @ValidateIf((o: LogWorkoutDto) => !Array.isArray(o.entries))
  @IsDefined({ message: 'date is required when entries array is not provided' })
  @IsISO8601({}, { message: 'date must be a valid ISO 8601 date string' })
  readonly date?: string;

  @ApiPropertyOptional({
    description: 'Exercise name (for single exercise logging)',
    example: 'Barbell Bench Press',
  })
  @ValidateIf((o: LogWorkoutDto) => !Array.isArray(o.entries))
  @IsDefined({
    message: 'exerciseName is required when entries array is not provided',
  })
  @IsString({ message: 'exerciseName must be a string' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Length(1, 150, {
    message: 'exerciseName must be between 1 and 150 characters',
  })
  readonly exerciseName?: string;

  @ApiPropertyOptional({
    description: 'Sets performed (for single exercise logging)',
    type: [LogSetDto],
  })
  @ValidateIf((o: LogWorkoutDto) => !Array.isArray(o.entries))
  @IsDefined({ message: 'sets is required when entries array is not provided' })
  @IsArray({ message: 'sets must be an array' })
  @ArrayMinSize(1, { message: 'sets must contain at least 1 item' })
  @ArrayMaxSize(100, { message: 'sets cannot exceed 100 items' })
  @ValidateNested({ each: true })
  @Type(() => LogSetDto)
  readonly sets?: LogSetDto[];

  @ApiPropertyOptional({
    description: 'Array of exercises (for bulk exercise logging)',
    type: [LogWorkoutEntryDto],
  })
  @ValidateIf(
    (o: LogWorkoutDto) =>
      Boolean(o.entries) || (!o.date && !o.exerciseName && !o.sets),
  )
  @IsDefined({
    message: 'entries is required when single exercise fields are not provided',
  })
  @IsArray({ message: 'entries must be an array' })
  @ArrayMinSize(1, { message: 'entries must contain at least 1 item' })
  @ValidateNested({ each: true })
  @Type(() => LogWorkoutEntryDto)
  readonly entries?: LogWorkoutEntryDto[];

  toEntries(): LogWorkoutEntryDto[] {
    if (this.entries && this.entries.length > 0) {
      return this.entries;
    }
    if (this.date && this.exerciseName && this.sets) {
      return [
        {
          date: this.date,
          exerciseName: this.exerciseName,
          sets: this.sets,
        },
      ];
    }
    return [];
  }

  isBulk(): boolean {
    return Array.isArray(this.entries);
  }
}
