import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  Controller,
  Get,
  Post,
  Body,
  HttpStatus,
  VersioningType,
} from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { IsNotEmpty, IsInt, Min } from 'class-validator';
import { AppModule } from '../src/app.module';
import {
  BypassResponseTransform,
  ResponseMessage,
  ResponseMeta,
  ValidationException,
  UnsupportedUnitException,
  IdempotencyConflictException,
  BusinessRuleViolationException,
  DEFAULT_GLOBAL_PREFIX,
  DEFAULT_API_VERSION,
} from '../src/common';

class TestDto {
  @IsNotEmpty()
  exerciseName!: string;

  @IsInt()
  @Min(1)
  reps!: number;
}

@Controller('test')
class TestResponseController {
  @Get('success-raw')
  getSuccessRaw() {
    return [{ id: '1', name: 'Barbell Squat' }];
  }

  @Get('success-envelope')
  getSuccessEnvelope() {
    return {
      data: [{ id: '1', name: 'Bench Press' }],
      pagination: {
        limit: 20,
        hasNextPage: true,
        nextCursor: 'cursor_123',
      },
      meta: {
        message: 'Entries retrieved',
      },
    };
  }

  @Get('success-decorator')
  @ResponseMessage('Custom success message')
  @ResponseMeta({ cached: false })
  getSuccessDecorator() {
    return { total: 42 };
  }

  @Get('bypass')
  @BypassResponseTransform()
  getBypass() {
    return { status: 'ok', raw: true };
  }

  @Get('error-validation')
  getErrorValidation() {
    throw new ValidationException('Validation failed for one or more fields.', [
      {
        field: 'entries[0].sets[1].weight',
        issue: 'Weight must be a non-negative number (received: -50).',
      },
      {
        field: 'entries[0].sets[1].unit',
        issue: "Unsupported weight unit 'oz'. Supported units are: kg, lb.",
      },
    ]);
  }

  @Get('error-unsupported-unit')
  getErrorUnsupportedUnit() {
    throw new UnsupportedUnitException('oz', ['kg', 'lb']);
  }

  @Get('error-idempotency')
  getErrorIdempotency() {
    throw new IdempotencyConflictException();
  }

  @Get('error-business')
  getErrorBusiness() {
    throw new BusinessRuleViolationException(
      'Bulk request exceeds max batch size of 100 exercises.',
    );
  }

  @Get('error-500')
  getError500() {
    throw new Error('Database connection broke unexpectedly');
  }

  @Post('dto-validation')
  postDtoValidation(@Body() body: TestDto) {
    return { success: Boolean(body) };
  }
}

describe('Response Scheme Handler E2E', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestResponseController],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix(DEFAULT_GLOBAL_PREFIX);
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: DEFAULT_API_VERSION,
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Success Responses', () => {
    it('should wrap raw controller output in { data: ... }', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/test/success-raw')
        .expect(HttpStatus.OK);

      expect(response.body).toEqual({
        data: [{ id: '1', name: 'Barbell Squat' }],
      });
      expect(response.headers['x-correlation-id']).toBeDefined();
    });

    it('should preserve existing envelope structure { data, pagination, meta }', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/test/success-envelope')
        .expect(HttpStatus.OK);

      expect(response.body).toEqual({
        data: [{ id: '1', name: 'Bench Press' }],
        pagination: {
          limit: 20,
          hasNextPage: true,
          nextCursor: 'cursor_123',
        },
        meta: {
          message: 'Entries retrieved',
        },
      });
    });

    it('should attach metadata from @ResponseMessage and @ResponseMeta decorators', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/test/success-decorator')
        .expect(HttpStatus.OK);

      expect(response.body).toEqual({
        data: { total: 42 },
        meta: {
          cached: false,
          message: 'Custom success message',
        },
      });
    });

    it('should allow bypassing response transformation via @BypassResponseTransform', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/test/bypass')
        .expect(HttpStatus.OK);

      const body = response.body as Record<string, unknown>;
      expect(body).toEqual({
        status: 'ok',
        raw: true,
      });
      expect(body.data).toBeUndefined();
    });
  });

  describe('RFC 7807 Error Responses', () => {
    it('should return RFC 7807 schema on ValidationException', async () => {
      const customTraceId = 'req_test_trace_123';
      const response = await request(app.getHttpServer())
        .get('/api/v1/test/error-validation')
        .set('x-correlation-id', customTraceId)
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as Record<string, unknown>;
      expect(body).toMatchObject({
        statusCode: 400,
        error: 'BAD_REQUEST',
        code: 'VALIDATION_ERROR',
        message: 'Validation failed for one or more fields.',
        details: [
          {
            field: 'entries[0].sets[1].weight',
            issue: 'Weight must be a non-negative number (received: -50).',
          },
          {
            field: 'entries[0].sets[1].unit',
            issue: "Unsupported weight unit 'oz'. Supported units are: kg, lb.",
          },
        ],
        path: '/api/v1/test/error-validation',
        correlationId: customTraceId,
      });
      expect(typeof body.timestamp).toBe('string');
      expect(response.headers['x-correlation-id']).toBe(customTraceId);
    });

    it('should return UNSUPPORTED_UNIT error code on UnsupportedUnitException', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/test/error-unsupported-unit')
        .expect(HttpStatus.BAD_REQUEST);

      expect(response.body).toEqual(
        expect.objectContaining({
          statusCode: 400,
          error: 'BAD_REQUEST',
          code: 'UNSUPPORTED_UNIT',
          message: "Unsupported weight unit 'oz'. Supported units are: kg, lb.",
          details: [
            {
              issue:
                "Unsupported weight unit 'oz'. Supported units are: kg, lb.",
            },
          ],
        }),
      );
    });

    it('should return 409 IDEMPOTENCY_CONFLICT on IdempotencyConflictException', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/test/error-idempotency')
        .expect(HttpStatus.CONFLICT);

      expect(response.body).toEqual(
        expect.objectContaining({
          statusCode: 409,
          error: 'CONFLICT',
          code: 'IDEMPOTENCY_CONFLICT',
        }),
      );
    });

    it('should return 422 BUSINESS_RULE_VIOLATION on BusinessRuleViolationException', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/test/error-business')
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);

      expect(response.body).toEqual(
        expect.objectContaining({
          statusCode: 422,
          error: 'UNPROCESSABLE_ENTITY',
          code: 'BUSINESS_RULE_VIOLATION',
          message: 'Bulk request exceeds max batch size of 100 exercises.',
        }),
      );
    });

    it('should return 500 INTERNAL_SERVER_ERROR without leaking raw stack trace', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/test/error-500')
        .expect(HttpStatus.INTERNAL_SERVER_ERROR);

      const body = response.body as Record<string, unknown>;
      expect(body).toEqual(
        expect.objectContaining({
          statusCode: 500,
          error: 'INTERNAL_SERVER_ERROR',
          code: 'INTERNAL_SERVER_ERROR',
          path: '/api/v1/test/error-500',
        }),
      );
      expect(body.stack).toBeUndefined();
    });

    it('should validate DTOs via CustomValidationPipe and produce RFC 7807 error schema', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/test/dto-validation')
        .send({
          exerciseName: '',
          reps: 0,
        })
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as {
        statusCode: number;
        error: string;
        code: string;
        message: string;
        details: Array<{ field?: string }>;
      };
      expect(body.statusCode).toBe(400);
      expect(body.error).toBe('BAD_REQUEST');
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.message).toBe('Validation failed for one or more fields.');
      const fields = body.details.map((d) => d.field);
      expect(fields).toContain('exerciseName');
      expect(fields).toContain('reps');
    });
  });
});
