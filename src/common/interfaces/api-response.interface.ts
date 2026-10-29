export interface ErrorDetail {
  readonly field?: string;
  readonly issue: string;
}

export interface ErrorResponseEnvelope {
  readonly statusCode: number;
  readonly error: string;
  readonly code: string;
  readonly message: string;
  readonly details?: readonly ErrorDetail[];
  readonly timestamp: string;
  readonly path: string;
  readonly correlationId?: string;
}

export interface PaginationMeta {
  readonly limit: number;
  readonly hasNextPage: boolean;
  readonly nextCursor?: string | null;
  readonly totalCount?: number;
  readonly page?: number;
}

export interface ApiResponseEnvelope<T, M = Record<string, unknown>> {
  readonly data: T;
  readonly pagination?: PaginationMeta;
  readonly meta?: M;
}
