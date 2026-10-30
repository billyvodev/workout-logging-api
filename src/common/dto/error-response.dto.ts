import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ErrorDetail, ErrorResponseEnvelope } from '../interfaces';

export class ErrorDetailDto implements ErrorDetail {
  @ApiPropertyOptional({
    description:
      'Path of the request field that caused the validation or business logic error.',
    example: 'entries[0].sets[1].weight',
  })
  readonly field?: string;

  @ApiProperty({
    description: 'Human-readable description of the specific issue.',
    example: 'Weight must be a non-negative number (received: -50).',
  })
  readonly issue!: string;
}

export class ErrorResponseDto implements ErrorResponseEnvelope {
  @ApiProperty({
    description: 'HTTP status code.',
    example: 400,
  })
  readonly statusCode!: number;

  @ApiProperty({
    description: 'HTTP standard error title (UPPER_SNAKE_CASE).',
    example: 'BAD_REQUEST',
  })
  readonly error!: string;

  @ApiProperty({
    description:
      'Standardized application error code following RFC 7807 problem details specification.',
    example: 'VALIDATION_ERROR',
  })
  readonly code!: string;

  @ApiProperty({
    description: 'Top-level description of the error.',
    example: 'Validation failed for one or more fields.',
  })
  readonly message!: string;

  @ApiPropertyOptional({
    description: 'Detailed list of field-level or specific failure reasons.',
    type: [ErrorDetailDto],
  })
  readonly details?: readonly ErrorDetailDto[];

  @ApiProperty({
    description: 'ISO 8601 UTC timestamp when the error occurred.',
    example: '2026-10-29T08:30:00.000Z',
  })
  readonly timestamp!: string;

  @ApiProperty({
    description: 'Request URL path where the error occurred.',
    example: '/api/v1/users/user_123/workouts',
  })
  readonly path!: string;

  @ApiPropertyOptional({
    description:
      'Unique correlation ID for tracing the request across logs and systems.',
    example: 'req_9f8d7a6b5c4e',
  })
  readonly correlationId?: string;
}
