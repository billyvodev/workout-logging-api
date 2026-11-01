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
});
