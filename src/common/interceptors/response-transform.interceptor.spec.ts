import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { ResponseTransformInterceptor } from './response-transform.interceptor';
import {
  BYPASS_RESPONSE_TRANSFORM_KEY,
  RESPONSE_MESSAGE_KEY,
  RESPONSE_META_KEY,
} from '../decorators';

describe('ResponseTransformInterceptor', () => {
  let interceptor: ResponseTransformInterceptor<unknown>;
  let reflector: jest.Mocked<Reflector>;
  let mockContext: ExecutionContext;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    interceptor = new ResponseTransformInterceptor(reflector);

    mockContext = {
      getType: jest.fn().mockReturnValue('http'),
      getHandler: jest.fn().mockReturnValue({}),
      getClass: jest.fn().mockReturnValue({}),
    } as unknown as ExecutionContext;
  });

  it('should wrap raw object payload into { data: payload }', (done) => {
    const rawData = { id: 'entry_123', exerciseName: 'Bench Press' };
    const callHandler: CallHandler = {
      handle: () => of(rawData),
    };

    reflector.getAllAndOverride.mockReturnValue(undefined);

    interceptor.intercept(mockContext, callHandler).subscribe((result) => {
      expect(result).toEqual({
        data: rawData,
      });
      done();
    });
  });

  it('should wrap raw array into { data: [...] }', (done) => {
    const rawArray = [{ id: '1' }, { id: '2' }];
    const callHandler: CallHandler = {
      handle: () => of(rawArray),
    };

    reflector.getAllAndOverride.mockReturnValue(undefined);

    interceptor.intercept(mockContext, callHandler).subscribe((result) => {
      expect(result).toEqual({
        data: rawArray,
      });
      done();
    });
  });

  it('should attach meta from @ResponseMessage decorator', (done) => {
    const rawData = [{ id: '1' }];
    const callHandler: CallHandler = {
      handle: () => of(rawData),
    };

    reflector.getAllAndOverride.mockImplementation((key) => {
      if (key === RESPONSE_MESSAGE_KEY) {
        return 'Workout entries retrieved successfully.';
      }
      return undefined;
    });

    interceptor.intercept(mockContext, callHandler).subscribe((result) => {
      expect(result).toEqual({
        data: rawData,
        meta: {
          message: 'Workout entries retrieved successfully.',
        },
      });
      done();
    });
  });

  it('should attach meta from @ResponseMeta decorator and merge with existing meta', (done) => {
    const envelopeData = {
      data: [{ id: '1' }],
      meta: { entriesLogged: 1 },
    };
    const callHandler: CallHandler = {
      handle: () => of(envelopeData),
    };

    reflector.getAllAndOverride.mockImplementation((key) => {
      if (key === RESPONSE_META_KEY) {
        return { customMetaKey: 'val' };
      }
      return undefined;
    });

    interceptor.intercept(mockContext, callHandler).subscribe((result) => {
      expect(result).toEqual({
        data: [{ id: '1' }],
        meta: {
          customMetaKey: 'val',
          entriesLogged: 1,
        },
      });
      done();
    });
  });

  it('should preserve existing envelope structure { data, pagination, meta }', (done) => {
    const existingEnvelope = {
      data: [{ id: 'entry_1' }],
      pagination: {
        limit: 20,
        hasNextPage: false,
        nextCursor: null,
      },
      meta: {
        requestedUnit: 'lb',
        message: 'Success',
      },
    };
    const callHandler: CallHandler = {
      handle: () => of(existingEnvelope),
    };

    reflector.getAllAndOverride.mockReturnValue(undefined);

    interceptor.intercept(mockContext, callHandler).subscribe((result) => {
      expect(result).toEqual(existingEnvelope);
      done();
    });
  });

  it('should bypass transformation when @BypassResponseTransform is applied', (done) => {
    const rawString = 'Hello World!';
    const callHandler: CallHandler = {
      handle: () => of(rawString),
    };

    reflector.getAllAndOverride.mockImplementation((key) => {
      if (key === BYPASS_RESPONSE_TRANSFORM_KEY) {
        return true;
      }
      return undefined;
    });

    interceptor.intercept(mockContext, callHandler).subscribe((result) => {
      expect(result).toBe('Hello World!');
      done();
    });
  });

  it('should pass through health check responses with status property', (done) => {
    const healthResponse = {
      status: 'ok',
      database: 'connected',
      uptimeSeconds: 123.4,
    };
    const callHandler: CallHandler = {
      handle: () => of(healthResponse),
    };

    reflector.getAllAndOverride.mockReturnValue(undefined);

    interceptor.intercept(mockContext, callHandler).subscribe((result) => {
      expect(result).toEqual(healthResponse);
      done();
    });
  });

  it('should return { data: null } when response is null or undefined', (done) => {
    const callHandler: CallHandler = {
      handle: () => of(null),
    };

    reflector.getAllAndOverride.mockReturnValue(undefined);

    interceptor.intercept(mockContext, callHandler).subscribe((result) => {
      expect(result).toEqual({ data: null });
      done();
    });
  });
});
