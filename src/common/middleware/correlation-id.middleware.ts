import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

export const correlationStorage = new AsyncLocalStorage<string>();

/**
 * Returns the current request correlation ID from AsyncLocalStorage, if available.
 */
export function getCorrelationId(): string | undefined {
  return correlationStorage.getStore();
}

/**
 * Generates a unique correlation ID prefixed with 'req_'.
 */
export function generateCorrelationId(): string {
  return `req_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const rawHeader =
      req.headers[CORRELATION_ID_HEADER] || req.headers['x-request-id'];

    const correlationId =
      (Array.isArray(rawHeader) ? rawHeader[0] : rawHeader)?.trim() ||
      generateCorrelationId();

    req.headers[CORRELATION_ID_HEADER] = correlationId;
    (req as Request & { correlationId?: string; id?: string }).correlationId =
      correlationId;
    (req as Request & { correlationId?: string; id?: string }).id =
      correlationId;

    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    correlationStorage.run(correlationId, () => {
      next();
    });
  }
}
