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
import { PersonalRecordsResponseDto } from '../src/modules/workouts/dto';

describe('PersonalRecordsController (e2e) - GET /api/v1/users/:userId/personal-records', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const testUserPrefix = `pr_e2e_user_${Date.now()}`;
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

    // Seed test workout entries:
    // 1. Comparison period workouts (September 2026)
    await request(app.getHttpServer())
      .post(`/api/v1/users/${userId}/workouts`)
      .send({
        date: '2026-09-10T11:00:00.000Z',
        exerciseName: 'Barbell Bench Press',
        sets: [{ reps: 10, weight: 190, unit: 'lb' }], // volume = 1900 lb, 1RM = 253.33 lb
      })
      .expect(HttpStatus.CREATED);

    await request(app.getHttpServer())
      .post(`/api/v1/users/${userId}/workouts`)
      .send({
        date: '2026-09-20T14:20:00.000Z',
        exerciseName: 'Barbell Bench Press',
        sets: [
          { reps: 3, weight: 235, unit: 'lb' }, // heaviest in Sept = 235 lb
          { reps: 6, weight: 225, unit: 'lb' }, // 1RM = 225 * (1 + 6/30) = 270 lb
        ],
      })
      .expect(HttpStatus.CREATED);

    // 2. Primary period workouts (October 2026)
    await request(app.getHttpServer())
      .post(`/api/v1/users/${userId}/workouts`)
      .send({
        date: '2026-10-12T11:00:00.000Z',
        exerciseName: 'Barbell Bench Press',
        sets: [{ reps: 10, weight: 210, unit: 'lb' }], // volume = 2100 lb, 1RM = 280 lb
      })
      .expect(HttpStatus.CREATED);

    await request(app.getHttpServer())
      .post(`/api/v1/users/${userId}/workouts`)
      .send({
        date: '2026-10-18T14:20:00.000Z',
        exerciseName: 'Barbell Bench Press',
        sets: [{ reps: 3, weight: 245, unit: 'lb' }], // heaviest = 245 lb
      })
      .expect(HttpStatus.CREATED);

    await request(app.getHttpServer())
      .post(`/api/v1/users/${userId}/workouts`)
      .send({
        date: '2026-10-25T16:00:00.000Z',
        exerciseName: 'Barbell Bench Press',
        sets: [{ reps: 8, weight: 225, unit: 'lb' }], // 1RM = 225 * (1 + 8/30) = 285 lb
      })
      .expect(HttpStatus.CREATED);

    // 3. Seed tie-breaking workouts
    await request(app.getHttpServer())
      .post(`/api/v1/users/${userId}/workouts`)
      .send({
        date: '2026-10-10T10:00:00.000Z',
        exerciseName: 'Back Squat',
        sets: [
          // Heaviest set tie-break: 100kg x 5 vs 100kg x 8 (higher reps wins!)
          { reps: 5, weight: 100, unit: 'kg' },
          { reps: 8, weight: 100, unit: 'kg' },
        ],
      })
      .expect(HttpStatus.CREATED);

    await request(app.getHttpServer())
      .post(`/api/v1/users/${userId}/workouts`)
      .send({
        date: '2026-10-10T10:00:00.000Z',
        exerciseName: 'Overhead Press',
        sets: [
          // 1RM tie-break: 60kg x 10 (1RM=80kg) vs 75kg x 2 (1RM=80kg, heavier weight wins!)
          { reps: 10, weight: 60, unit: 'kg' },
          { reps: 2, weight: 75, unit: 'kg' },
        ],
      })
      .expect(HttpStatus.CREATED);
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

  describe('All-Time Personal Records', () => {
    it('should return 200 OK with All-Time PRs when from and to are omitted', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/users/${userId}/personal-records`)
        .query({
          exerciseName: 'Barbell Bench Press',
          unit: 'lb',
        })
        .expect(HttpStatus.OK);

      const body = response.body as PersonalRecordsResponseDto;
      expect(body.data).toBeDefined();
      expect(body.data.userId).toBe(userId);
      expect(body.data.exerciseName).toBe('Barbell Bench Press');
      expect(body.data.muscleGroup).toBe('chest');
      expect(body.data.unit).toBe('lb');

      expect(body.data.primaryPeriod.range).toEqual({
        from: null,
        to: null,
      });

      const { heaviestSet, highestVolumeSet, bestEstimated1RM } =
        body.data.primaryPeriod.records;

      // Heaviest: 245 lb x 3
      expect(heaviestSet).toBeDefined();
      expect(heaviestSet?.weight).toBe(245);
      expect(heaviestSet?.reps).toBe(3);
      expect(heaviestSet?.unit).toBe('lb');
      expect(heaviestSet?.achievedAt).toBe('2026-10-18T14:20:00.000Z');

      // Highest volume: 210 lb x 10 = 2100 lb
      expect(highestVolumeSet).toBeDefined();
      expect(highestVolumeSet?.volume).toBe(2100);
      expect(highestVolumeSet?.weight).toBe(210);
      expect(highestVolumeSet?.reps).toBe(10);
      expect(highestVolumeSet?.unit).toBe('lb');

      // Best estimated 1RM: 225 lb x 8 = 285 lb
      expect(bestEstimated1RM).toBeDefined();
      expect(bestEstimated1RM?.estimated1RM).toBe(285);
      expect(bestEstimated1RM?.weight).toBe(225);
      expect(bestEstimated1RM?.reps).toBe(8);
      expect(bestEstimated1RM?.unit).toBe('lb');

      expect(body.data.comparisonPeriod).toBeNull();
      expect(body.data.comparison).toBeNull();
      expect(body.meta.message).toBe(
        'Personal records calculated successfully.',
      );
      expect(response.headers['x-correlation-id']).toBeDefined();
    });

    it('should resolve exercise alias seamlessly ("bench press" -> "Barbell Bench Press")', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/users/${userId}/personal-records`)
        .query({
          exerciseName: 'bench press',
          unit: 'lb',
        })
        .expect(HttpStatus.OK);

      const body = response.body as PersonalRecordsResponseDto;
      expect(body.data.exerciseName).toBe('Barbell Bench Press');
      expect(body.data.muscleGroup).toBe('chest');
      expect(body.data.primaryPeriod.records.heaviestSet?.weight).toBe(245);
    });
  });

  describe('Time-Bounded Personal Records', () => {
    it('should return 200 OK scoped to September 2026 date boundaries', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/users/${userId}/personal-records`)
        .query({
          exerciseName: 'Barbell Bench Press',
          unit: 'lb',
          from: '2026-09-01',
          to: '2026-09-30',
        })
        .expect(HttpStatus.OK);

      const body = response.body as PersonalRecordsResponseDto;
      expect(body.data.primaryPeriod.range).toEqual({
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-30T23:59:59.999Z',
      });

      const { heaviestSet, highestVolumeSet, bestEstimated1RM } =
        body.data.primaryPeriod.records;

      expect(heaviestSet?.weight).toBe(235);
      expect(heaviestSet?.reps).toBe(3);

      expect(highestVolumeSet?.volume).toBe(1900);
      expect(highestVolumeSet?.weight).toBe(190);
      expect(highestVolumeSet?.reps).toBe(10);

      expect(bestEstimated1RM?.estimated1RM).toBe(270);
      expect(bestEstimated1RM?.weight).toBe(225);
      expect(bestEstimated1RM?.reps).toBe(6);
    });
  });

  describe('Time-Range Comparison (Period-over-Period)', () => {
    it('should calculate comparison deltas and improved flags between October and September', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/users/${userId}/personal-records`)
        .query({
          exerciseName: 'Barbell Bench Press',
          unit: 'lb',
          from: '2026-10-01',
          to: '2026-10-31',
          compareFrom: '2026-09-01',
          compareTo: '2026-09-30',
        })
        .expect(HttpStatus.OK);

      const body = response.body as PersonalRecordsResponseDto;

      // Primary Period (October)
      expect(body.data.primaryPeriod.records.heaviestSet?.weight).toBe(245);
      expect(body.data.primaryPeriod.records.highestVolumeSet?.volume).toBe(
        2100,
      );
      expect(
        body.data.primaryPeriod.records.bestEstimated1RM?.estimated1RM,
      ).toBe(285);

      // Comparison Period (September)
      expect(body.data.comparisonPeriod).toBeDefined();
      expect(body.data.comparisonPeriod?.records.heaviestSet?.weight).toBe(235);
      expect(body.data.comparisonPeriod?.records.highestVolumeSet?.volume).toBe(
        1900,
      );
      expect(
        body.data.comparisonPeriod?.records.bestEstimated1RM?.estimated1RM,
      ).toBe(270);

      // Comparison Deltas
      expect(body.data.comparison).toBeDefined();
      expect(body.data.comparison?.heaviestSet).toEqual({
        absoluteDiff: 10,
        percentageDiff: 4.26,
        improved: true,
      });

      expect(body.data.comparison?.highestVolumeSet).toEqual({
        absoluteDiff: 200,
        percentageDiff: 10.53,
        improved: true,
      });

      expect(body.data.comparison?.bestEstimated1RM).toEqual({
        absoluteDiff: 15,
        percentageDiff: 5.56,
        improved: true,
      });
    });
  });

  describe('Deterministic Tie-Breaking Verification', () => {
    it('should break heaviest set ties by selecting higher reps', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/users/${userId}/personal-records`)
        .query({
          exerciseName: 'Back Squat',
          unit: 'kg',
        })
        .expect(HttpStatus.OK);

      const body = response.body as PersonalRecordsResponseDto;
      const heaviest = body.data.primaryPeriod.records.heaviestSet;

      // Both sets had 100kg, but the set with 8 reps wins over 5 reps!
      expect(heaviest?.weight).toBe(100);
      expect(heaviest?.reps).toBe(8);
    });

    it('should break best estimated 1RM ties by selecting heavier actual weight', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/users/${userId}/personal-records`)
        .query({
          exerciseName: 'Overhead Press',
          unit: 'kg',
        })
        .expect(HttpStatus.OK);

      const body = response.body as PersonalRecordsResponseDto;
      const best1rm = body.data.primaryPeriod.records.bestEstimated1RM;

      // Both sets resulted in 80kg 1RM (60x10 vs 75x2). 75kg set wins!
      expect(best1rm?.estimated1RM).toBe(80);
      expect(best1rm?.weight).toBe(75);
      expect(best1rm?.reps).toBe(2);
    });
  });

  describe('Empty Results Contract (200 OK)', () => {
    it('should return 200 OK with null records when no sets are found in the date range', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/users/${userId}/personal-records`)
        .query({
          exerciseName: 'Barbell Bench Press',
          unit: 'lb',
          from: '2025-01-01',
          to: '2025-01-31',
        })
        .expect(HttpStatus.OK);

      const body = response.body as PersonalRecordsResponseDto;
      expect(body.data.primaryPeriod.records).toEqual({
        heaviestSet: null,
        highestVolumeSet: null,
        bestEstimated1RM: null,
      });
      expect(body.data.comparisonPeriod).toBeNull();
      expect(body.data.comparison).toBeNull();
      expect(body.meta.message).toBe(
        "No workout sets found for 'Barbell Bench Press' in the specified date range.",
      );
    });
  });

  describe('Error Responses & Boundary Validation (RFC 7807)', () => {
    it('should reject missing exerciseName with 400 Bad Request (VALIDATION_ERROR)', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/users/${userId}/personal-records`)
        .expect(HttpStatus.BAD_REQUEST);

      const error = response.body as ErrorResponseEnvelope;
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'exerciseName',
          }),
        ]),
      );
    });

    it('should reject inverted primary dates (from > to) with 400 VALIDATION_ERROR', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/users/${userId}/personal-records`)
        .query({
          exerciseName: 'Squat',
          from: '2026-10-31',
          to: '2026-10-01',
        })
        .expect(HttpStatus.BAD_REQUEST);

      const error = response.body as ErrorResponseEnvelope;
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'from',
            issue: "'from' date must be earlier than or equal to 'to' date.",
          }),
        ]),
      );
    });

    it('should reject compareFrom without compareTo with 400 VALIDATION_ERROR', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/users/${userId}/personal-records`)
        .query({
          exerciseName: 'Squat',
          compareFrom: '2026-09-01',
        })
        .expect(HttpStatus.BAD_REQUEST);

      const error = response.body as ErrorResponseEnvelope;
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'compareFrom',
            issue: "'compareFrom' requires 'compareTo' to also be specified.",
          }),
        ]),
      );
    });

    it('should reject inverted comparison dates (compareFrom > compareTo) with 400 VALIDATION_ERROR', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/users/${userId}/personal-records`)
        .query({
          exerciseName: 'Squat',
          compareFrom: '2026-09-30',
          compareTo: '2026-09-01',
        })
        .expect(HttpStatus.BAD_REQUEST);

      const error = response.body as ErrorResponseEnvelope;
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'compareFrom',
            issue:
              "'compareFrom' date must be earlier than or equal to 'compareTo' date.",
          }),
        ]),
      );
    });

    it('should reject unsupported weight unit with 400 UNSUPPORTED_UNIT', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/users/${userId}/personal-records`)
        .query({
          exerciseName: 'Squat',
          unit: 'grams',
        })
        .expect(HttpStatus.BAD_REQUEST);

      const error = response.body as ErrorResponseEnvelope;
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe(ErrorCode.UNSUPPORTED_UNIT);
      expect(error.message).toContain("Unsupported weight unit 'grams'");
    });
  });
});
