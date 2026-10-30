import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationMeta } from '../interfaces';

export class PaginationMetaDto implements PaginationMeta {
  @ApiProperty({
    description: 'Number of items per page.',
    example: 20,
    default: 20,
  })
  readonly limit!: number;

  @ApiProperty({
    description:
      'Indicates whether more records exist beyond the current page.',
    example: true,
  })
  readonly hasNextPage!: boolean;

  @ApiPropertyOptional({
    description:
      'Opaque Base64-encoded cursor for keyset pagination to fetch subsequent records.',
    example:
      'eyJwZXJmb3JtZWRBdCI6IjIwMjYtMTAtMjlUMTA6MzA6MDAuMDAwWiIsImlkIjoiZW50cnlfMDFqY2JlOTl6OHgifQ==',
    nullable: true,
  })
  readonly nextCursor?: string | null;

  @ApiPropertyOptional({
    description:
      'Total count of records matching the query filters, if calculated.',
    example: 150,
  })
  readonly totalCount?: number;

  @ApiPropertyOptional({
    description: '1-based page number if offset pagination is utilized.',
    example: 1,
  })
  readonly page?: number;
}
