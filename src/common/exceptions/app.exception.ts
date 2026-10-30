import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, WeightUnit } from '../constants';
import { ErrorDetail } from '../interfaces';

export interface AppExceptionOptions {
  readonly message: string;
  readonly statusCode?: HttpStatus;
  readonly code?: string;
  readonly details?: readonly ErrorDetail[];
}

export class AppException extends HttpException {
  readonly code: string;
  readonly details?: readonly ErrorDetail[];

  constructor(options: AppExceptionOptions) {
    const statusCode = options.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR;
    const code = options.code ?? ErrorCode.INTERNAL_SERVER_ERROR;

    super(
      {
        statusCode,
        message: options.message,
        code,
        ...(options.details && options.details.length > 0
          ? { details: options.details }
          : {}),
      },
      statusCode,
    );

    this.code = code;
    this.details = options.details;
  }
}

export class ValidationException extends AppException {
  constructor(
    message = 'Validation failed for one or more fields.',
    details?: readonly ErrorDetail[],
    code: string = ErrorCode.VALIDATION_ERROR,
  ) {
    super({
      message,
      statusCode: HttpStatus.BAD_REQUEST,
      code,
      details,
    });
  }
}

export class UnsupportedUnitException extends AppException {
  constructor(
    unit: string,
    supportedUnits: readonly string[] = [WeightUnit.KG, WeightUnit.LB],
  ) {
    const issue = `Unsupported weight unit '${unit}'. Supported units are: ${supportedUnits.join(', ')}.`;
    super({
      message: issue,
      statusCode: HttpStatus.BAD_REQUEST,
      code: ErrorCode.UNSUPPORTED_UNIT,
      details: [{ issue }],
    });
  }
}

export class InvalidCursorException extends AppException {
  constructor(
    message = 'Pagination cursor is invalid, corrupted, or has expired.',
  ) {
    super({
      message,
      statusCode: HttpStatus.BAD_REQUEST,
      code: ErrorCode.INVALID_CURSOR,
    });
  }
}

export class IdempotencyConflictException extends AppException {
  constructor(
    message = 'A request with this Idempotency-Key is currently in progress or conflicts with a previous request payload.',
  ) {
    super({
      message,
      statusCode: HttpStatus.CONFLICT,
      code: ErrorCode.IDEMPOTENCY_CONFLICT,
    });
  }
}

export class BusinessRuleViolationException extends AppException {
  constructor(message: string, details?: readonly ErrorDetail[]) {
    super({
      message,
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      code: ErrorCode.BUSINESS_RULE_VIOLATION,
      details,
    });
  }
}

export class ResourceNotFoundException extends AppException {
  constructor(message = 'Requested resource not found.') {
    super({
      message,
      statusCode: HttpStatus.NOT_FOUND,
      code: ErrorCode.NOT_FOUND,
    });
  }
}
