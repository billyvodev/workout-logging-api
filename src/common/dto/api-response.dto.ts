import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiResponseEnvelope } from '../interfaces';
import { PaginationMetaDto } from './pagination.dto';

export class ApiResponseEnvelopeDto<
  T,
  M = Record<string, unknown>,
> implements ApiResponseEnvelope<T, M> {
  @ApiProperty({
    description: 'Data payload returned by the endpoint.',
  })
  readonly data!: T;

  @ApiPropertyOptional({
    description: 'Pagination metadata for list-based responses.',
    type: () => PaginationMetaDto,
  })
  readonly pagination?: PaginationMetaDto;

  @ApiPropertyOptional({
    description:
      'Additional metadata or summary metrics relevant to the response.',
  })
  readonly meta?: M;
}
