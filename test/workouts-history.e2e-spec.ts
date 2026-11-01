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
import { WorkoutHistoryResponseDto } from '../src/modules/workouts/dto';

describe('WorkoutsController (e2e) - GET /api/v1/users/:userId/workouts', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const testUserPrefix = `history_user_${Date.now()}`;
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

    // Seed test workout entries chronologically via POST /workouts
    const seedPayloads = [
      {
        date: '2026-10-26T08:00:00.000Z',
        exerciseName: 'Barbell Curl',
        sets: [{ reps: 12, weight: 30, unit: 'kg' }],
      },
      {
        date: '2026-10-27T16:00:00.000Z',
        exerciseName: 'Romanian Deadlift',
        sets: [{ reps: 8, weight: 120, unit: 'kg' }],
      },
      {
        date: '2026-10-28T09:00:00.000Z',
        exerciseName: 'Back Squat',
        sets: [{ reps: 5, weight: 140, unit: 'kg' }],
      },
      {
        date: '2026-10-29T14:00:00.000Z',
        exerciseName: 'Incline Bench Press',
        sets: [{ reps: 10, weight: 70, unit: 'kg' }],
      },
      {
        date: '2026-10-30T10:00:00.000Z',
        exerciseName: 'Barbell Bench Press',
        sets: [
          { reps: 8, weight: 225, unit: 'lb' },
          { reps: 6, weight: 235, unit: 'lb' },
        ],
      },
    ];

    for (const payload of seedPayloads) {
      await request(app.getHttpServer())
        .post(`/api/v1/users/${userId}/workouts`)
        .send(payload)
        .expect(HttpStatus.CREATED);
    }
  });

  afterAll(async () => {
    await prisma.workoutSet.deleteMany({
      where: { userId: { startsWith: testUserPrefix } },
    });
    await prisma.workoutEntry.deleteMany({
      where: { userId: { startsWith: testUserPrefix } },
    });
    await app.close();
  });

  describe('Default Pagination and Response Envelope', () => {
    it('should return 200 OK with default pagination (limit 20) and target unit (kg)', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/users/${userId}/workouts`)
        .expect(HttpStatus.OK);

      expect(response.headers['x-correlation-id']).toBeDefined();

      const body = response.body as WorkoutHistoryResponseDto;
      expect(body.data).toHaveLength(5);
      expect(body.pagination).toEqual({
        limit: 20,
        hasNextPage: false,
        nextCursor: null,
      });
      expect(body.meta).toEqual({
        requestedUnit: 'kg',
        message: 'Workout entries retrieved successfully.',
      });

      // Verify descending chronological ordering (performedAt DESC)
      const dates = body.data.map((e) => new Date(e.date).getTime());
      for (let i = 0; i < dates.length - 1; i++) {
        expect(dates[i]).toBeGreaterThanOrEqual(dates[i + 1]);
      }

      // Verify first entry is latest (Barbell Bench Press)
      expect(body.data[0].exerciseName).toBe('Barbell Bench Press');
      expect(body.data[0].sets).toHaveLength(2);
    });
  });

  describe('Keyset Cursor Pagination Traversal', () => {
    it('should sequentially traverse pages using nextCursor without skips or duplicates', async () => {
      // Page 1: limit = 2
      const page1Res = await request(app.getHttpServer())
        .get(`/api/v1/users/${userId}/workouts?limit=2`)
        .expect(HttpStatus.OK);

      const page1 = page1Res.body as WorkoutHistoryResponseDto;
      expect(page1.data).toHaveLength(2);
      expect(page1.pagination.limit).toBe(2);
      expect(page1.pagination.hasNextPage).toBe(true);
      expect(page1.pagination.nextCursor).toBeDefined();

      const page1Ids = page1.data.map((e) => e.id);

      // Page 2: pass cursor from Page 1
      const page2Res = await request(app.getHttpServer())
        .get(
          `/api/v1/users/${userId}/workouts?limit=2&cursor=${encodeURIComponent(page1.pagination.nextCursor as string)}`,
        )
        .expect(HttpStatus.OK);

      const page2 = page2Res.body as WorkoutHistoryResponseDto;
      expect(page2.data).toHaveLength(2);
      expect(page2.pagination.hasNextPage).toBe(true);
      expect(page2.pagination.nextCursor).toBeDefined();

      const page2Ids = page2.data.map((e) => e.id);

      // Page 3: pass cursor from Page 2
      const page3Res = await request(app.getHttpServer())
        .get(
          `/api/v1/users/${userId}/workouts?limit=2&cursor=${encodeURIComponent(page2.pagination.nextCursor as string)}`,
        )
        .expect(HttpStatus.OK);

      const page3 = page3Res.body as WorkoutHistoryResponseDto;
      expect(page3.data).toHaveLength(1);
      expect(page3.pagination.hasNextPage).toBe(false);
      expect(page3.pagination.nextCursor).toBeNull();

      const page3Ids = page3.data.map((e) => e.id);

      // Ensure all 5 entries were retrieved with zero duplicates
      const allIds = [...page1Ids, ...page2Ids, ...page3Ids];
      expect(allIds).toHaveLength(5);
      expect(new Set(allIds).size).toBe(5);
    });
  });

  describe('Filters: Partial Exercise Name, Muscle Group, and Date Boundaries', () => {
    it('should filter by case-insensitive partial exerciseName matching multiple exercises', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/users/${userId}/workouts?exerciseName=bench`)
        .expect(HttpStatus.OK);

      const body = response.body as WorkoutHistoryResponseDto;
      expect(body.data).toHaveLength(2);
      const names = body.data.map((e) => e.exerciseName);
      expect(names).toContain('Barbell Bench Press');
      expect(names).toContain('Incline Bench Press');
    });

    it('should filter by muscleGroup and bounded date ranges', async () => {
      const response = await request(app.getHttpServer())
        .get(
          `/api/v1/users/${userId}/workouts?muscleGroup=chest&from=2026-10-30&to=2026-10-30`,
        )
        .expect(HttpStatus.OK);

      const body = response.body as WorkoutHistoryResponseDto;
      expect(body.data).toHaveLength(1);
      expect(body.data[0].exerciseName).toBe('Barbell Bench Press');
      expect(body.data[0].muscleGroup).toBe('chest');
    });
  });

  describe('Unit Conversions & Zero-Drift Guarantee', () => {
    it('should preserve exact original weight without drift when target unit matches original unit (lb)', async () => {
      const response = await request(app.getHttpServer())
        .get(
          `/api/v1/users/${userId}/workouts?exerciseName=Barbell Bench Press&unit=lb`,
        )
        .expect(HttpStatus.OK);

      const body = response.body as WorkoutHistoryResponseDto;
      expect(body.data).toHaveLength(1);
      expect(body.meta.requestedUnit).toBe('lb');

      const entry = body.data[0];
      const set1 = entry.sets[0];
      expect(set1.weight).toBe(225);
      expect(set1.unit).toBe('lb');
      expect(set1.original).toEqual({ weight: 225, unit: 'lb' });
      expect(set1.volume).toBe(1800);
      expect(set1.estimated1RM).toBe(285);
      expect(set1.normalizedKg).toBe(102.06);
    });

    it('should accurately convert weights to kg when target unit is kg', async () => {
      const response = await request(app.getHttpServer())
        .get(
          `/api/v1/users/${userId}/workouts?exerciseName=Barbell Bench Press&unit=kg`,
        )
        .expect(HttpStatus.OK);

      const body = response.body as WorkoutHistoryResponseDto;
      const set1 = body.data[0].sets[0];
      expect(set1.weight).toBe(102.06);
      expect(set1.unit).toBe('kg');
      expect(set1.original).toEqual({ weight: 225, unit: 'lb' });
      expect(set1.volume).toBe(816.48);
      expect(set1.estimated1RM).toBe(129.28);
      expect(set1.normalizedKg).toBe(102.06);
    });
  });

  describe('Empty Results Contract', () => {
    it('should return 200 OK with empty array when no entries match filters (never 404)', async () => {
      const response = await request(app.getHttpServer())
        .get(
          `/api/v1/users/${userId}/workouts?exerciseName=nonexistent_exercise_123`,
        )
        .expect(HttpStatus.OK);

      const body = response.body as WorkoutHistoryResponseDto;
      expect(body).toEqual({
        data: [],
        pagination: {
          limit: 20,
          hasNextPage: false,
          nextCursor: null,
        },
        meta: {
          requestedUnit: 'kg',
          message:
            'No workout entries found for the specified filter criteria and date range.',
        },
      });
    });
  });

  describe('Error Handling & RFC 7807 Error Envelope', () => {
    it('should reject unsupported unit with 400 UNSUPPORTED_UNIT', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/users/${userId}/workouts?unit=grams`)
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ErrorResponseEnvelope;
      expect(body).toMatchObject({
        statusCode: 400,
        error: 'BAD_REQUEST',
        code: ErrorCode.UNSUPPORTED_UNIT,
      });
      expect(body.message).toContain('Unsupported weight unit');
      expect(body.timestamp).toBeDefined();
      expect(body.path).toContain(`/api/v1/users/${userId}/workouts`);
    });

    it('should reject corrupt cursor with 400 INVALID_CURSOR', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/users/${userId}/workouts?cursor=invalid_base64_!@#$`)
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ErrorResponseEnvelope;
      expect(body).toMatchObject({
        statusCode: 400,
        error: 'BAD_REQUEST',
        code: ErrorCode.INVALID_CURSOR,
      });
      expect(body.message).toContain('Pagination cursor cannot be decoded');
    });

    it('should reject inverted dates (from > to) with 400 VALIDATION_ERROR', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/users/${userId}/workouts?from=2026-11-01&to=2026-10-01`)
        .expect(HttpStatus.BAD_REQUEST);

      const body = response.body as ErrorResponseEnvelope;
      expect(body).toMatchObject({
        statusCode: 400,
        error: 'BAD_REQUEST',
        code: ErrorCode.VALIDATION_ERROR,
      });
      const fromDetail = body.details?.find((d) => d.field === 'from');
      expect(fromDetail).toBeDefined();
      expect(fromDetail?.issue).toContain(
        "'from' date must be earlier than or equal to 'to' date.",
      );
    });

    it('should reject limit out of bounds (< 1 or > 100) with 400 VALIDATION_ERROR', async () => {
      const lowLimitRes = await request(app.getHttpServer())
        .get(`/api/v1/users/${userId}/workouts?limit=0`)
        .expect(HttpStatus.BAD_REQUEST);

      expect((lowLimitRes.body as ErrorResponseEnvelope).code).toBe(
        ErrorCode.VALIDATION_ERROR,
      );

      const highLimitRes = await request(app.getHttpServer())
        .get(`/api/v1/users/${userId}/workouts?limit=101`)
        .expect(HttpStatus.BAD_REQUEST);

      expect((highLimitRes.body as ErrorResponseEnvelope).code).toBe(
        ErrorCode.VALIDATION_ERROR,
      );
    });
  });
});
