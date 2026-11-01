import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma';
import { WorkoutRepository } from '../src/modules/workouts/repositories';

describe('WorkoutRepository findPersonalRecords (Integration / E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let repository: WorkoutRepository;

  const testUser = `pr_repo_user_${Date.now()}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    repository = app.get(WorkoutRepository);

    // Seed workout entries and sets for testUser
    await repository.createBulkWorkoutTx(testUser, [
      {
        date: new Date('2026-10-10T10:00:00.000Z'),
        exerciseName: 'Barbell Bench Press',
        exerciseNameNorm: 'barbell bench press',
        muscleGroup: 'chest',
        sets: [
          // Set 1: 100kg x 5 -> volume = 500, 1RM = 100 * (1 + 5/30) = 116.6667
          {
            setNumber: 1,
            reps: 5,
            originalWeight: 100,
            originalUnit: 'kg',
            weightKg: 100,
            volumeKg: 500,
            estimated1rmKg: 116.6667,
          },
          // Set 2: 100kg x 8 -> higher reps tie-break for heaviest!
          // volume = 800, 1RM = 100 * (1 + 8/30) = 126.6667
          {
            setNumber: 2,
            reps: 8,
            originalWeight: 100,
            originalUnit: 'kg',
            weightKg: 100,
            volumeKg: 800,
            estimated1rmKg: 126.6667,
          },
        ],
      },
      {
        date: new Date('2026-10-20T10:00:00.000Z'),
        exerciseName: 'Bench Press',
        exerciseNameNorm: 'bench press',
        muscleGroup: 'chest',
        sets: [
          // Set 1: 70kg x 20 -> volume = 1400 (Highest volume!)
          // 1RM = 70 * (1 + 20/30) = 116.6667
          {
            setNumber: 1,
            reps: 20,
            originalWeight: 70,
            originalUnit: 'kg',
            weightKg: 70,
            volumeKg: 1400,
            estimated1rmKg: 116.6667,
          },
          // Set 2: 120kg x 3 -> 1RM = 120 * (1 + 3/30) = 132 (Best 1RM!)
          // volume = 360
          {
            setNumber: 2,
            reps: 3,
            originalWeight: 120,
            originalUnit: 'kg',
            weightKg: 120,
            volumeKg: 360,
            estimated1rmKg: 132,
          },
        ],
      },
    ]);
  });

  afterAll(async () => {
    await prisma.workoutSet.deleteMany({
      where: { userId: testUser },
    });
    await prisma.workoutEntry.deleteMany({
      where: { userId: testUser },
    });
    await app.close();
  });

  it('should retrieve all-time PRs across canonical and alias exercise names', async () => {
    const records = await repository.findPersonalRecords(testUser, [
      'barbell bench press',
      'bench press',
    ]);

    expect(records).toHaveLength(3);

    const heaviest = records.find((r) => r.pr_type === 'heaviest_set');
    const highestVolume = records.find(
      (r) => r.pr_type === 'highest_volume_set',
    );
    const best1rm = records.find((r) => r.pr_type === 'best_1rm_set');

    expect(heaviest).toBeDefined();
    expect(Number(heaviest!.weight_kg)).toBe(120);
    expect(heaviest!.reps).toBe(3);

    expect(highestVolume).toBeDefined();
    expect(Number(highestVolume!.volume_kg)).toBe(1400);
    expect(highestVolume!.reps).toBe(20);

    expect(best1rm).toBeDefined();
    expect(Number(best1rm!.estimated_1rm_kg)).toBe(132);
    expect(best1rm!.reps).toBe(3);
  });

  it('should correctly scope PRs within date range', async () => {
    // Only query the first workout (2026-10-10)
    const records = await repository.findPersonalRecords(
      testUser,
      ['barbell bench press', 'bench press'],
      new Date('2026-10-01T00:00:00.000Z'),
      new Date('2026-10-15T23:59:59.999Z'),
    );

    expect(records).toHaveLength(3);

    const heaviest = records.find((r) => r.pr_type === 'heaviest_set');
    // Both sets on Oct 10 had 100kg; set 2 had 8 reps vs set 1 with 5 reps. Tie-break by reps!
    expect(heaviest).toBeDefined();
    expect(Number(heaviest!.weight_kg)).toBe(100);
    expect(heaviest!.reps).toBe(8);

    const highestVolume = records.find(
      (r) => r.pr_type === 'highest_volume_set',
    );
    expect(highestVolume).toBeDefined();
    expect(Number(highestVolume!.volume_kg)).toBe(800);

    const best1rm = records.find((r) => r.pr_type === 'best_1rm_set');
    expect(best1rm).toBeDefined();
    expect(Number(best1rm!.estimated_1rm_kg)).toBeCloseTo(126.6667, 2);
  });

  it('should return empty array when date range has no matching workouts', async () => {
    const records = await repository.findPersonalRecords(
      testUser,
      ['barbell bench press', 'bench press'],
      new Date('2025-01-01T00:00:00.000Z'),
      new Date('2025-01-31T23:59:59.999Z'),
    );

    expect(records).toEqual([]);
  });

  it('should return empty array when exercise name does not match', async () => {
    const records = await repository.findPersonalRecords(testUser, [
      'incline dumbbell press',
    ]);

    expect(records).toEqual([]);
  });

  describe('Deterministic Tie-Breaking & Scalability Safeguards', () => {
    const tieBreakUser = `tie_break_user_${Date.now()}`;
    const otherUser = `other_user_${Date.now()}`;

    beforeAll(async () => {
      // 1. Seed sets with identical volume (1000kg) but different weights (50kg vs 100kg)
      // 2. Seed sets with identical 1RM (80kg) but different weights (60kg vs 75kg)
      // 3. Seed sets with identical weight & reps but different timestamps
      await repository.createBulkWorkoutTx(tieBreakUser, [
        {
          date: new Date('2026-10-01T10:00:00.000Z'),
          exerciseName: 'Squat',
          exerciseNameNorm: 'squat',
          muscleGroup: 'legs',
          sets: [
            // Volume tie-breaker: Set 1 has 50kg x 20 -> volume = 1000kg
            {
              setNumber: 1,
              reps: 20,
              originalWeight: 50,
              originalUnit: 'kg',
              weightKg: 50,
              volumeKg: 1000,
              estimated1rmKg: 83.3333,
            },
            // Volume tie-breaker: Set 2 has 100kg x 10 -> volume = 1000kg, heavier weight wins!
            {
              setNumber: 2,
              reps: 10,
              originalWeight: 100,
              originalUnit: 'kg',
              weightKg: 100,
              volumeKg: 1000,
              estimated1rmKg: 133.3333,
            },
          ],
        },
        {
          date: new Date('2026-10-02T10:00:00.000Z'),
          exerciseName: 'Overhead Press',
          exerciseNameNorm: 'overhead press',
          muscleGroup: 'shoulders',
          sets: [
            // 1RM tie-breaker: Set 1 has 60kg x 10 -> 1RM = 60 * (1 + 10/30) = 80kg
            {
              setNumber: 1,
              reps: 10,
              originalWeight: 60,
              originalUnit: 'kg',
              weightKg: 60,
              volumeKg: 600,
              estimated1rmKg: 80,
            },
            // 1RM tie-breaker: Set 2 has 75kg x 2 -> 1RM = 75 * (1 + 2/30) = 80kg, heavier weight wins!
            {
              setNumber: 2,
              reps: 2,
              originalWeight: 75,
              originalUnit: 'kg',
              weightKg: 75,
              volumeKg: 150,
              estimated1rmKg: 80,
            },
          ],
        },
        {
          // Timestamp tie-breaker: older set (Oct 03) vs newer set (Oct 05)
          date: new Date('2026-10-03T10:00:00.000Z'),
          exerciseName: 'Deadlift',
          exerciseNameNorm: 'deadlift',
          muscleGroup: 'back',
          sets: [
            {
              setNumber: 1,
              reps: 5,
              originalWeight: 150,
              originalUnit: 'kg',
              weightKg: 150,
              volumeKg: 750,
              estimated1rmKg: 175,
            },
          ],
        },
        {
          date: new Date('2026-10-05T10:00:00.000Z'),
          exerciseName: 'Deadlift',
          exerciseNameNorm: 'deadlift',
          muscleGroup: 'back',
          sets: [
            {
              setNumber: 1,
              reps: 5,
              originalWeight: 150,
              originalUnit: 'kg',
              weightKg: 150,
              volumeKg: 750,
              estimated1rmKg: 175,
            },
          ],
        },
      ]);

      // Seed competitor/other user with massive records
      await repository.createBulkWorkoutTx(otherUser, [
        {
          date: new Date('2026-10-01T10:00:00.000Z'),
          exerciseName: 'Squat',
          exerciseNameNorm: 'squat',
          muscleGroup: 'legs',
          sets: [
            {
              setNumber: 1,
              reps: 10,
              originalWeight: 300,
              originalUnit: 'kg',
              weightKg: 300,
              volumeKg: 3000,
              estimated1rmKg: 400,
            },
          ],
        },
      ]);
    });

    afterAll(async () => {
      await prisma.workoutSet.deleteMany({
        where: { userId: { in: [tieBreakUser, otherUser] } },
      });
      await prisma.workoutEntry.deleteMany({
        where: { userId: { in: [tieBreakUser, otherUser] } },
      });
    });

    it('should break volume ties by selecting the set with heavier actual weight (weight_kg DESC)', async () => {
      const records = await repository.findPersonalRecords(tieBreakUser, [
        'squat',
      ]);

      const highestVolume = records.find(
        (r) => r.pr_type === 'highest_volume_set',
      );
      expect(highestVolume).toBeDefined();
      expect(Number(highestVolume!.volume_kg)).toBe(1000);
      // Both sets had 1000kg volume, but 100kg set should beat 50kg set
      expect(Number(highestVolume!.weight_kg)).toBe(100);
      expect(highestVolume!.reps).toBe(10);
    });

    it('should break estimated 1RM ties by selecting the set with heavier actual weight (weight_kg DESC)', async () => {
      const records = await repository.findPersonalRecords(tieBreakUser, [
        'overhead press',
      ]);

      const best1rm = records.find((r) => r.pr_type === 'best_1rm_set');
      expect(best1rm).toBeDefined();
      expect(Number(best1rm!.estimated_1rm_kg)).toBe(80);
      // Both sets had 80kg estimated 1RM, but 75kg set should beat 60kg set
      expect(Number(best1rm!.weight_kg)).toBe(75);
      expect(best1rm!.reps).toBe(2);
    });

    it('should break identical metric and weight ties by selecting the most recent set (performed_at DESC)', async () => {
      const records = await repository.findPersonalRecords(tieBreakUser, [
        'deadlift',
      ]);

      const heaviest = records.find((r) => r.pr_type === 'heaviest_set');
      expect(heaviest).toBeDefined();
      expect(Number(heaviest!.weight_kg)).toBe(150);
      // Oct 05 is more recent than Oct 03
      expect(new Date(heaviest!.performed_at).toISOString()).toBe(
        '2026-10-05T10:00:00.000Z',
      );
    });

    it('should enforce strict user isolation without bleeding other user records', async () => {
      const records = await repository.findPersonalRecords(tieBreakUser, [
        'squat',
      ]);

      const heaviest = records.find((r) => r.pr_type === 'heaviest_set');
      expect(heaviest).toBeDefined();
      // Must be 100kg, not otherUser's 300kg!
      expect(Number(heaviest!.weight_kg)).toBe(100);
    });
  });
});
