import { Request, Response } from 'express';
import { Logger } from '@nestjs/common';
import { RequestLoggerMiddleware } from './request-logger.middleware';

describe('RequestLoggerMiddleware', () => {
  let middleware: RequestLoggerMiddleware;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    middleware = new RequestLoggerMiddleware();
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should call next() and log 200 response on finish', () => {
    let finishCallback: () => void = () => {};
    const req = {
      method: 'GET',
      originalUrl: '/api/v1/users/user_123/workouts',
      correlationId: 'req_test_123',
    } as unknown as Request;

    const onMock = jest.fn((event: string, cb: () => void) => {
      if (event === 'finish') {
        finishCallback = cb;
      }
    });
    const res = {
      statusCode: 200,
      on: onMock,
    } as unknown as Response;

    const next = jest.fn();

    middleware.use(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(onMock).toHaveBeenCalledWith('finish', expect.any(Function));

    // Simulate response finish
    finishCallback();

    const expectedDuration = expect.any(Number) as unknown as number;
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: '/api/v1/users/user_123/workouts',
        statusCode: 200,
        correlationId: 'req_test_123',
        userId: 'user_123',
        durationMs: expectedDuration,
      }),
    );
  });

  it('should log warn on 4xx response on finish', () => {
    let finishCallback: () => void = () => {};
    const req = {
      method: 'POST',
      originalUrl: '/api/v1/workouts',
      body: { userId: 'user_body_456' },
      correlationId: 'req_warn_123',
    } as unknown as Request;

    const onMock = jest.fn((event: string, cb: () => void) => {
      if (event === 'finish') {
        finishCallback = cb;
      }
    });
    const res = {
      statusCode: 400,
      on: onMock,
    } as unknown as Response;

    const next = jest.fn();

    middleware.use(req, res, next);
    finishCallback();

    const expectedDuration = expect.any(Number) as unknown as number;
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: '/api/v1/workouts',
        statusCode: 400,
        correlationId: 'req_warn_123',
        userId: 'user_body_456',
        durationMs: expectedDuration,
      }),
    );
  });

  it('should log error on 5xx response on finish', () => {
    let finishCallback: () => void = () => {};
    const req = {
      method: 'GET',
      originalUrl: '/api/v1/health',
      correlationId: 'req_err_123',
    } as unknown as Request;

    const onMock = jest.fn((event: string, cb: () => void) => {
      if (event === 'finish') {
        finishCallback = cb;
      }
    });
    const res = {
      statusCode: 500,
      on: onMock,
    } as unknown as Response;

    const next = jest.fn();

    middleware.use(req, res, next);
    finishCallback();

    const expectedDuration = expect.any(Number) as unknown as number;
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: '/api/v1/health',
        statusCode: 500,
        correlationId: 'req_err_123',
        durationMs: expectedDuration,
      }),
    );
  });
});
