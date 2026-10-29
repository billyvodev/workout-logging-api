import {
  ArgumentsHost,
  HttpStatus,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import {
  ValidationException,
  UnsupportedUnitException,
  IdempotencyConflictException,
  BusinessRuleViolationException,
} from '../exceptions';
import { ErrorCode } from '../constants';
import { CORRELATION_ID_HEADER } from '../middleware/correlation-id.middleware';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockResponse: {
    status: jest.Mock;
    json: jest.Mock;
    setHeader: jest.Mock;
    headersSent: boolean;
  };
  let mockRequest: {
    method: string;
    url: string;
    originalUrl: string;
    headers: Record<string, string>;
    correlationId?: string;
  };
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new AllExceptionsFilter();

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
      headersSent: false,
    };

    mockRequest = {
      method: 'POST',
      url: '/api/v1/users/user_123/workouts',
      originalUrl: '/api/v1/users/user_123/workouts',
      headers: {
        [CORRELATION_ID_HEADER]: 'req_test123456',
      },
      correlationId: 'req_test123456',
    };

    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as unknown as ArgumentsHost;
  });

  it('should format ValidationException according to RFC 7807 schema', () => {
    const details = [
      {
        field: 'entries[0].sets[1].weight',
        issue: 'Weight must be a non-negative number (received: -50).',
      },
    ];
    const exception = new ValidationException(
      'Validation failed for one or more fields.',
      details,
    );

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      CORRELATION_ID_HEADER,
      'req_test123456',
    );
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        error: 'BAD_REQUEST',
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed for one or more fields.',
        details,
        path: '/api/v1/users/user_123/workouts',
        correlationId: 'req_test123456',
      }),
    );
    const jsonCalls = mockResponse.json.mock.calls as Array<
      [{ timestamp?: string }]
    >;
    expect(typeof jsonCalls[0]?.[0]?.timestamp).toBe('string');
  });

  it('should format UnsupportedUnitException with dynamic unit details', () => {
    const exception = new UnsupportedUnitException('oz', ['kg', 'lb']);

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        error: 'BAD_REQUEST',
        code: ErrorCode.UNSUPPORTED_UNIT,
        message: "Unsupported weight unit 'oz'. Supported units are: kg, lb.",
        details: [
          {
            issue: "Unsupported weight unit 'oz'. Supported units are: kg, lb.",
          },
        ],
        path: '/api/v1/users/user_123/workouts',
        correlationId: 'req_test123456',
      }),
    );
  });

  it('should format IdempotencyConflictException as 409 CONFLICT', () => {
    const exception = new IdempotencyConflictException();

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    const conflictCallArgs = mockResponse.json.mock.calls as Array<
      [
        {
          statusCode?: number;
          error?: string;
          code?: string;
          message?: string;
        },
      ]
    >;
    expect(conflictCallArgs[0]?.[0]).toMatchObject({
      statusCode: 409,
      error: 'CONFLICT',
      code: ErrorCode.IDEMPOTENCY_CONFLICT,
    });
    expect(conflictCallArgs[0]?.[0]?.message).toContain('Idempotency-Key');
  });

  it('should format BusinessRuleViolationException as 422 UNPROCESSABLE_ENTITY', () => {
    const exception = new BusinessRuleViolationException(
      'Bulk request exceeds max batch size of 100 exercises.',
    );

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 422,
        error: 'UNPROCESSABLE_ENTITY',
        code: ErrorCode.BUSINESS_RULE_VIOLATION,
        message: 'Bulk request exceeds max batch size of 100 exercises.',
      }),
    );
  });

  it('should handle standard NestJS BadRequestException with string array message', () => {
    const exception = new BadRequestException([
      'entries[0].sets[0].reps must be a positive integer',
      'weight must be a number',
    ]);

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        error: 'BAD_REQUEST',
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed for one or more fields.',
        details: [
          {
            field: 'entries[0].sets[0].reps',
            issue: 'entries[0].sets[0].reps must be a positive integer',
          },
          {
            field: 'weight',
            issue: 'weight must be a number',
          },
        ],
      }),
    );
  });

  it('should handle standard NestJS NotFoundException', () => {
    const exception = new NotFoundException('User not found');

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        error: 'NOT_FOUND',
        code: ErrorCode.NOT_FOUND,
        message: 'User not found',
      }),
    );
  });

  it('should handle generic unhandled Error and mask message in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const error = new Error('Database connection crashed: fatal deadlock');

      filter.catch(error, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
          error: 'INTERNAL_SERVER_ERROR',
          code: ErrorCode.INTERNAL_SERVER_ERROR,
          message: 'An unexpected internal error occurred.',
        }),
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
