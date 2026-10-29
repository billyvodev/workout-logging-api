import { Request, Response } from 'express';
import {
  CorrelationIdMiddleware,
  CORRELATION_ID_HEADER,
  getCorrelationId,
} from './correlation-id.middleware';

describe('CorrelationIdMiddleware', () => {
  let middleware: CorrelationIdMiddleware;

  beforeEach(() => {
    middleware = new CorrelationIdMiddleware();
  });

  it('should generate a correlation ID starting with req_ when no header is present', () => {
    const req = {
      headers: {},
    } as unknown as Request;

    const setHeaderMock = jest.fn();
    const res = {
      setHeader: setHeaderMock,
    } as unknown as Response;

    const next = jest.fn();

    middleware.use(req, res, next);

    const generatedId = (req as Request & { correlationId: string })
      .correlationId;
    expect(generatedId).toBeDefined();
    expect(generatedId.startsWith('req_')).toBe(true);
    expect(req.headers[CORRELATION_ID_HEADER]).toBe(generatedId);
    expect(setHeaderMock).toHaveBeenCalledWith(
      CORRELATION_ID_HEADER,
      generatedId,
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should preserve incoming x-correlation-id header', () => {
    const existingId = 'req_custom_12345';
    const req = {
      headers: {
        [CORRELATION_ID_HEADER]: existingId,
      },
    } as unknown as Request;

    const setHeaderMock = jest.fn();
    const res = {
      setHeader: setHeaderMock,
    } as unknown as Response;

    const next = jest.fn();

    middleware.use(req, res, next);

    expect((req as Request & { correlationId: string }).correlationId).toBe(
      existingId,
    );
    expect(setHeaderMock).toHaveBeenCalledWith(
      CORRELATION_ID_HEADER,
      existingId,
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should fallback to x-request-id if x-correlation-id is not provided', () => {
    const requestId = 'req_from_x_request_id';
    const req = {
      headers: {
        'x-request-id': requestId,
      },
    } as unknown as Request;

    const setHeaderMock = jest.fn();
    const res = {
      setHeader: setHeaderMock,
    } as unknown as Response;

    const next = jest.fn();

    middleware.use(req, res, next);

    expect((req as Request & { correlationId: string }).correlationId).toBe(
      requestId,
    );
    expect(setHeaderMock).toHaveBeenCalledWith(
      CORRELATION_ID_HEADER,
      requestId,
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should provide correlationId via getCorrelationId() inside next() call', () => {
    const req = {
      headers: {},
    } as unknown as Request;

    const res = {
      setHeader: jest.fn(),
    } as unknown as Response;

    let idInContext: string | undefined;
    const next = jest.fn(() => {
      idInContext = getCorrelationId();
    });

    middleware.use(req, res, next);

    expect(idInContext).toBeDefined();
    expect(idInContext?.startsWith('req_')).toBe(true);
    expect(idInContext).toBe(
      (req as Request & { correlationId: string }).correlationId,
    );
  });
});
