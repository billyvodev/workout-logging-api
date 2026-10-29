import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorCode } from '../constants';
import { ErrorDetail, ErrorResponseEnvelope } from '../interfaces';
import { AppException } from '../exceptions';
import {
  getCorrelationId,
  CORRELATION_ID_HEADER,
} from '../middleware/correlation-id.middleware';

/**
 * Maps standard HTTP status codes to standardized UPPER_SNAKE_CASE error names.
 */
function getErrorNameForStatus(status: HttpStatus): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'BAD_REQUEST';
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHORIZED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return 'UNPROCESSABLE_ENTITY';
    case HttpStatus.INTERNAL_SERVER_ERROR:
      return 'INTERNAL_SERVER_ERROR';
    case HttpStatus.SERVICE_UNAVAILABLE:
      return 'SERVICE_UNAVAILABLE';
    default: {
      const statusKey = HttpStatus[status];
      return statusKey
        ? statusKey
            .replace(/([A-Z])/g, '_$1')
            .replace(/^_/, '')
            .toUpperCase()
        : 'HTTP_ERROR';
    }
  }
}

/**
 * Resolves standard ErrorCode based on HTTP status code if not explicitly provided.
 */
function getDefaultErrorCodeForStatus(status: HttpStatus): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return ErrorCode.VALIDATION_ERROR;
    case HttpStatus.NOT_FOUND:
      return ErrorCode.NOT_FOUND;
    case HttpStatus.CONFLICT:
      return ErrorCode.IDEMPOTENCY_CONFLICT;
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return ErrorCode.BUSINESS_RULE_VIOLATION;
    case HttpStatus.INTERNAL_SERVER_ERROR:
      return ErrorCode.INTERNAL_SERVER_ERROR;
    default:
      return getErrorNameForStatus(status);
  }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Determine status code
    let statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorName = 'INTERNAL_SERVER_ERROR';
    let code: string = ErrorCode.INTERNAL_SERVER_ERROR;
    let message = 'An unexpected internal error occurred.';
    let details: ErrorDetail[] | undefined = undefined;

    if (exception instanceof AppException) {
      statusCode = exception.getStatus();
      errorName = getErrorNameForStatus(statusCode);
      code = exception.code;
      message = exception.message;
      details = exception.details ? [...exception.details] : undefined;
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      errorName = getErrorNameForStatus(statusCode);
      code = getDefaultErrorCodeForStatus(statusCode);

      const resBody = exception.getResponse();

      if (typeof resBody === 'string') {
        message = resBody;
      } else if (typeof resBody === 'object' && resBody !== null) {
        const bodyObj = resBody as Record<string, unknown>;

        if (typeof bodyObj.code === 'string') {
          code = bodyObj.code;
        }

        if (typeof bodyObj.error === 'string') {
          errorName = bodyObj.error.toUpperCase().replace(/ /g, '_');
        }

        if (typeof bodyObj.message === 'string') {
          message = bodyObj.message;
        } else if (Array.isArray(bodyObj.message)) {
          // Default Nest ValidationPipe outputs string[] messages
          message = 'Validation failed for one or more fields.';
          details = bodyObj.message.map((msg: unknown) => {
            const issue = String(msg);
            const firstSpace = issue.indexOf(' ');
            if (firstSpace > 0) {
              const potentialField = issue.slice(0, firstSpace);
              // Check if potentialField looks like a property name or path
              if (/^[a-zA-Z0-9_[\].]+$/.test(potentialField)) {
                return {
                  field: potentialField,
                  issue,
                };
              }
            }
            return { issue };
          });
        }

        if (Array.isArray(bodyObj.details)) {
          details = bodyObj.details as ErrorDetail[];
        }
      }
    } else if (exception instanceof Error) {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      errorName = 'INTERNAL_SERVER_ERROR';
      code = ErrorCode.INTERNAL_SERVER_ERROR;
      // In production or safe mode, do not leak raw exception messages
      message =
        process.env.NODE_ENV === 'production'
          ? 'An unexpected internal error occurred.'
          : exception.message || 'An unexpected internal error occurred.';
    }

    const correlationId =
      (request as Request & { correlationId?: string }).correlationId ||
      getCorrelationId() ||
      (request.headers[CORRELATION_ID_HEADER] as string) ||
      (request.headers['x-request-id'] as string);

    if (correlationId && !response.headersSent) {
      response.setHeader(CORRELATION_ID_HEADER, correlationId);
    }

    const path = request.originalUrl || request.url;
    const timestamp = new Date().toISOString();

    const errorEnvelope: ErrorResponseEnvelope = {
      statusCode,
      error: errorName,
      code,
      message,
      ...(details && details.length > 0 ? { details } : {}),
      timestamp,
      path,
      ...(correlationId ? { correlationId } : {}),
    };

    // Structured logging with correlation ID
    const logContext = {
      msg: `HTTP ${request.method} ${path} -> ${statusCode} [${code}] - ${message}`,
      statusCode,
      code,
      path,
      method: request.method,
      ...(correlationId ? { correlationId } : {}),
      ...(details ? { details } : {}),
      ...(exception instanceof Error ? { err: exception.stack } : {}),
    };

    if (statusCode >= 500) {
      this.logger.error(logContext);
    } else {
      this.logger.warn(logContext);
    }

    response.status(statusCode).json(errorEnvelope);
  }
}
