import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { getCorrelationId } from './correlation-id.middleware';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestLoggerMiddleware.name);

  use(req: Request, res: Response, next: NextFunction): void {
    const startTime = Date.now();

    res.on('finish', () => {
      const durationMs = Date.now() - startTime;
      const { method, originalUrl } = req;
      const { statusCode } = res;
      const correlationId =
        (req as Request & { correlationId?: string }).correlationId ||
        getCorrelationId();

      // Extract userId from URL if present (e.g., /api/v1/users/:userId/...) or body
      const userMatch = originalUrl.match(/\/users\/([^/?#]+)/);
      const userId = userMatch
        ? userMatch[1]
        : req.body &&
            typeof req.body === 'object' &&
            'userId' in req.body &&
            typeof (req.body as { userId?: unknown }).userId === 'string'
          ? (req.body as { userId: string }).userId
          : undefined;

      const logPayload: Record<string, unknown> = {
        msg: `HTTP ${method} ${originalUrl} ${statusCode} [${durationMs}ms]`,
        method,
        url: originalUrl,
        statusCode,
        durationMs,
        ...(correlationId ? { correlationId } : {}),
        ...(userId ? { userId } : {}),
      };

      if (statusCode >= 500) {
        this.logger.error(logPayload);
      } else if (statusCode >= 400) {
        this.logger.warn(logPayload);
      } else {
        this.logger.log(logPayload);
      }
    });

    next();
  }
}
