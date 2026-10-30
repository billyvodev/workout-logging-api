import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma';
import {
  DEFAULT_GLOBAL_PREFIX,
  DEFAULT_API_VERSION,
  ErrorCode,
  ErrorResponseEnvelope,
} from '../src/common';
import { LoggedWorkoutResponseDto } from '../src/modules/workouts/dto';

describe('WorkoutsController (e2e) - POST /api/v1/users/:userId/workouts', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const testUserPrefix = `test_user_${Date.now()}`;
  const userId = `${testUserPrefix}_1`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix(DEFAULT_GLOBAL_PREFIX);
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: DEFAULT_API_VERSION,
    });
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // Clean up all entries and sets created during test run
    await prisma.workoutSet.deleteMany({
      where: { userId: { startsWith: testUserPrefix } },
    });
    await prisma.workoutEntry.deleteMany({
      where: { userId: { startsWith: testUserPrefix } },
    });
    await app.close();
  });

  describe('Single Entry Logging', () => {
    it('should successfully log a single workout entry with 201 Created and normalized metrics', async () => {
      const payload = {
        date: '2026-10-29T10:30:00Z',
        exerciseName: 'Barbell Bench Press',
        sets: [
          { reps: 8, weight: 225, unit: 'lb' },
          { reps: 6, weight: 235, unit: 'lb' },
        ],
      };

      const response = await request(app.getHttpServer())
        .post(`/api/v1/users/${userId}/workouts`)
        .send(payload)
        .expect(HttpStatus.CREATED);

      expect(response.headers['x-correlation-id']).toBeDefined();

      const body = response.body as LoggedWorkoutResponseDto;
      expect(body.data).toHaveLength(1);
      expect(body.meta).toEqual({
        entriesLogged: 1,
        totalSetsLogged: 2,
      });

      const entry = body.data[0];
      expect(entry.id).toBeDefined();
      expect(entry.userId).toBe(userId);
      expect(entry.exerciseName).toBe('Barbell Bench Press');
      expect(entry.exerciseNameNormalized).toBe('barbell bench press');
      expect(entry.muscleGroup).toBe('chest');
      expect(new Date(entry.date).toISOString()).toBe(
        '2026-10-29T10:30:00.000Z',
      );
      expect(entry.createdAt).toBeDefined();

      expect(entry.sets).toHaveLength(2);
      expect(entry.sets[0]).toMatchObject({
        setNumber: 1,
        reps: 8,
        original: { weight: 225, unit: 'lb' },
        normalized: {
          weightKg: 102.06,
          volumeKg: 816.47,
          estimated1RmKg: 129.27,
        },
      });
      expect(typeof entry.sets[0].id).toBe('string');

      expect(entry.sets[1]).toMatchObject({
        setNumber: 2,
        reps: 6,
        original: { weight: 235, unit: 'lb' },
        normalized: {
          weightKg: 106.59,
          volumeKg: 639.57,
          estimated1RmKg: 127.91,
        },
      });
      expect(typeof entry.sets[1].id).toBe('string');

      // Verify database persistence
      const dbEntry = await prisma.workoutEntry.findUnique({
        where: { id: entry.id },
        include: { sets: { orderBy: { setNumber: 'asc' } } },
      });
      expect(dbEntry).toBeDefined();
      expect(dbEntry?.exerciseNameNorm).toBe('barbell bench press');
      expect(dbEntry?.sets).toHaveLength(2);
      expect(Number(dbEntry?.sets[0].weightKg)).toBeCloseTo(102.0583, 3);
    });

    it('should support bodyweight sets with weight 0', async () => {
      const payload = {
        date: '2026-10-29T11:00:00Z',
        exerciseName: 'Pull Up',
        sets: [{ reps: 12, weight: 0, unit: 'kg' }],
      };

      const response = await request(app.getHttpServer())
        .post(`/api/v1/users/${userId}/workouts`)
        .send(payload)
        .expect(HttpStatus.CREATED);

      const body = response.body as LoggedWorkoutResponseDto;
      const entry = body.data[0];
      expect(entry.sets[0].original).toEqual({ weight: 0, unit: 'kg' });
      expect(entry.sets[0].normalized).toEqual({
        weightKg: 0,
        volumeKg: 0,
        estimated1RmKg: 0,
      });
    });

    it('should handle uncataloged exercises setting muscleGroup to null without error', async () => {
      const payload = {
        date: '2026-10-29T11:30:00Z',
        exerciseName: 'Mystic Cosmic Levitation',
        sets: [{ reps: 5, weight: 60, unit: 'kg' }],
      };

      const response = await request(app.getHttpServer())
        .post(`/api/v1/users/${userId}/workouts`)
        .send(payload)
        .expect(HttpStatus.CREATED);

      const body = response.body as LoggedWorkoutResponseDto;
      expect(body.data[0].muscleGroup).toBeNull();
      expect(body.data[0].exerciseNameNormalized).toBe(
        'mystic cosmic levitation',
      );
    });
  });

  describe('Bulk Entries Logging', () => {
    it('should successfully log multiple workout entries atomically with aggregated meta', async () => {
      const bulkPayload = {
        entries: [
          {
            date: '2026-10-29T10:30:00Z',
            exerciseName: 'Barbell Bench Press',
            sets: [
              { reps: 8, weight: 225, unit: 'lb' },
              { reps: 6, weight: 235, unit: 'lb' },
            ],
          },
          {
            date: '2026-10-29T10:55:00Z',
            exerciseName: 'Back Squat',
            sets: [{ reps: 5, weight: 140, unit: 'kg' }],
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post(`/api/v1/users/${userId}/workouts`)
        .send(bulkPayload)
        .expect(HttpStatus.CREATED);

      const body = response.body as LoggedWorkoutResponseDto;
      expect(body.data).toHaveLength(2);
      expect(body.meta).toEqual({
        entriesLogged: 2,
        totalSetsLogged: 3,
      });

      expect(body.data[0].exerciseName).toBe('Barbell Bench Press');
      expect(body.data[0].muscleGroup).toBe('chest');
      expect(body.data[0].sets).toHaveLength(2);

      expect(body.data[1].exerciseName).toBe('Back Squat');
      expect(body.data[1].muscleGroup).toBe('legs');
      expect(body.data[1].sets).toHaveLength(1);
      expect(body.data[1].sets[0].normalized).toEqual({
        weightKg: 140,
        volumeKg: 700,
        estimated1RmKg: 163.33,
      });
    });
  });

  describe('Validation Failure Scenarios', () => {
    it('should reject reps <= 0 with 400 VALIDATION_ERROR and exact error field path', async () => {
      const invalidPayload = {
        date: '2026-10-29T10:30:00Z',
        exerciseName: 'Barbell Bench Press',
        sets: [{ reps: 0, weight: 100, unit: 'kg' }],
      };

      const response = await request(app.getHttpServer())
        .post(`/api/v1/users/${userId}/workouts`)
        .send(invalidPayload)
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ErrorResponseEnvelope;
      expect(body).toMatchObject({
        statusCode: 400,
        error: 'BAD_REQUEST',
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed for one or more fields.',
      });
      expect(
        body.details?.some(
          (d) => d.field === 'sets[0].reps' || d.field?.includes('reps'),
        ),
      ).toBe(true);
    });

    it('should reject negative weights with 400 VALIDATION_ERROR', async () => {
      const invalidPayload = {
        date: '2026-10-29T10:30:00Z',
        exerciseName: 'Barbell Bench Press',
        sets: [{ reps: 10, weight: -50, unit: 'kg' }],
      };

      const response = await request(app.getHttpServer())
        .post(`/api/v1/users/${userId}/workouts`)
        .send(invalidPayload)
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ErrorResponseEnvelope;
      expect(body).toMatchObject({
        statusCode: 400,
        error: 'BAD_REQUEST',
        code: ErrorCode.VALIDATION_ERROR,
      });
      expect(
        body.details?.some((d) => Boolean(d.field?.includes('weight'))),
      ).toBe(true);
    });

    it('should reject unsupported weight units with 400 UNSUPPORTED_UNIT', async () => {
      const invalidPayload = {
        date: '2026-10-29T10:30:00Z',
        exerciseName: 'Barbell Bench Press',
        sets: [{ reps: 10, weight: 100, unit: 'oz' }],
      };

      const response = await request(app.getHttpServer())
        .post(`/api/v1/users/${userId}/workouts`)
        .send(invalidPayload)
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ErrorResponseEnvelope;
      expect(body).toMatchObject({
        statusCode: 400,
        error: 'BAD_REQUEST',
        code: ErrorCode.UNSUPPORTED_UNIT,
        message: "Unsupported weight unit 'oz'. Supported units are: kg, lb.",
      });
      expect(body.details?.[0].issue).toContain("Unsupported weight unit 'oz'");
    });

    it('should reject empty sets array with 400 VALIDATION_ERROR', async () => {
      const invalidPayload = {
        date: '2026-10-29T10:30:00Z',
        exerciseName: 'Barbell Bench Press',
        sets: [],
      };

      const response = await request(app.getHttpServer())
        .post(`/api/v1/users/${userId}/workouts`)
        .send(invalidPayload)
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ErrorResponseEnvelope;
      expect(body).toMatchObject({
        statusCode: 400,
        error: 'BAD_REQUEST',
        code: ErrorCode.VALIDATION_ERROR,
      });
      expect(
        body.details?.some((d) => Boolean(d.field?.includes('sets'))),
      ).toBe(true);
    });

    it('should reject bulk request exceeding 100 entries with 422 BUSINESS_RULE_VIOLATION', async () => {
      const excessivePayload = {
        entries: Array.from({ length: 101 }, (_, i) => ({
          date: '2026-10-29T10:30:00Z',
          exerciseName: `Exercise ${i + 1}`,
          sets: [{ reps: 10, weight: 50, unit: 'kg' }],
        })),
      };

      const response = await request(app.getHttpServer())
        .post(`/api/v1/users/${userId}/workouts`)
        .send(excessivePayload)
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);

      const body = response.body as ErrorResponseEnvelope;
      expect(body).toMatchObject({
        statusCode: 422,
        error: 'UNPROCESSABLE_ENTITY',
        code: ErrorCode.BUSINESS_RULE_VIOLATION,
        message:
          'Bulk workout logging is limited to a maximum of 100 entries per request.',
      });
    });
  });

  describe('Idempotency Replay & Conflict Safety', () => {
    it('should replay cached response on duplicate request with same Idempotency-Key and payload', async () => {
      const idempotencyKey = `idemp_e2e_${Date.now()}`;
      const payload = {
        date: '2026-10-29T12:00:00Z',
        exerciseName: 'Barbell Bench Press',
        sets: [{ reps: 10, weight: 100, unit: 'kg' }],
      };

      // 1. Initial request
      const firstResponse = await request(app.getHttpServer())
        .post(`/api/v1/users/${userId}/workouts`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload)
        .expect(HttpStatus.CREATED);

      const firstBody = firstResponse.body as LoggedWorkoutResponseDto;
      const firstEntryId = firstBody.data[0].id;

      // Check DB count for this idempotency key
      const initialDbCount = await prisma.workoutEntry.count({
        where: { userId, idempotencyKey },
      });
      expect(initialDbCount).toBe(1);

      // 2. Retry request with identical payload and key
      const secondResponse = await request(app.getHttpServer())
        .post(`/api/v1/users/${userId}/workouts`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload)
        .expect(HttpStatus.CREATED);

      const secondBody = secondResponse.body as LoggedWorkoutResponseDto;
      // Must return identical cached record ID
      expect(secondBody.data[0].id).toBe(firstEntryId);

      // Database should NOT have created a duplicate entry
      const postRetryDbCount = await prisma.workoutEntry.count({
        where: { userId, idempotencyKey },
      });
      expect(postRetryDbCount).toBe(1);
    });

    it('should return 409 IDEMPOTENCY_CONFLICT when same Idempotency-Key is reused with different payload', async () => {
      const idempotencyKey = `idemp_conflict_${Date.now()}`;
      const originalPayload = {
        date: '2026-10-29T13:00:00Z',
        exerciseName: 'Barbell Bench Press',
        sets: [{ reps: 8, weight: 100, unit: 'kg' }],
      };

      // 1. First successful submission
      await request(app.getHttpServer())
        .post(`/api/v1/users/${userId}/workouts`)
        .set('Idempotency-Key', idempotencyKey)
        .send(originalPayload)
        .expect(HttpStatus.CREATED);

      // 2. Conflicting submission with different reps
      const conflictingPayload = {
        date: '2026-10-29T13:00:00Z',
        exerciseName: 'Barbell Bench Press',
        sets: [{ reps: 12, weight: 100, unit: 'kg' }], // changed reps
      };

      const conflictResponse = await request(app.getHttpServer())
        .post(`/api/v1/users/${userId}/workouts`)
        .set('Idempotency-Key', idempotencyKey)
        .send(conflictingPayload)
        .expect(HttpStatus.CONFLICT);

      const body = conflictResponse.body as ErrorResponseEnvelope;
      expect(body).toMatchObject({
        statusCode: 409,
        error: 'CONFLICT',
        code: ErrorCode.IDEMPOTENCY_CONFLICT,
      });
    });

    it('should support Idempotency-Key replay on bulk payloads', async () => {
      const bulkIdempotencyKey = `idemp_bulk_${Date.now()}`;
      const bulkPayload = {
        entries: [
          {
            date: '2026-10-29T14:00:00Z',
            exerciseName: 'Barbell Bench Press',
            sets: [{ reps: 5, weight: 100, unit: 'kg' }],
          },
          {
            date: '2026-10-29T14:15:00Z',
            exerciseName: 'Back Squat',
            sets: [{ reps: 5, weight: 120, unit: 'kg' }],
          },
        ],
      };

      // 1. First bulk submission
      const firstResponse = await request(app.getHttpServer())
        .post(`/api/v1/users/${userId}/workouts`)
        .set('Idempotency-Key', bulkIdempotencyKey)
        .send(bulkPayload)
        .expect(HttpStatus.CREATED);

      const firstBody = firstResponse.body as LoggedWorkoutResponseDto;
      expect(firstBody.data).toHaveLength(2);
      const entryIds = firstBody.data.map((e) => e.id);

      // 2. Replay bulk submission
      const replayResponse = await request(app.getHttpServer())
        .post(`/api/v1/users/${userId}/workouts`)
        .set('Idempotency-Key', bulkIdempotencyKey)
        .send(bulkPayload)
        .expect(HttpStatus.CREATED);

      const replayBody = replayResponse.body as LoggedWorkoutResponseDto;
      expect(replayBody.data).toHaveLength(2);
      expect(replayBody.data.map((e) => e.id)).toEqual(entryIds);

      // Verify DB only has 2 entries (one per bulk item) with prefix
      const count = await prisma.workoutEntry.count({
        where: {
          userId,
          idempotencyKey: { startsWith: bulkIdempotencyKey },
        },
      });
      expect(count).toBe(2);
    });
  });
});
