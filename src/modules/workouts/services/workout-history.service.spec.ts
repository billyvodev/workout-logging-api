import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import {
  InvalidCursorException,
  UnitConversionService,
  UnsupportedUnitException,
  ValidationException,
  encodeCursor,
} from '../../../common';
import { WorkoutHistoryQueryDto } from '../dto';
import { WorkoutRepository } from '../repositories';
import { WorkoutHistoryService } from './workout-history.service';

describe('WorkoutHistoryService', () => {
  let service: WorkoutHistoryService;
  let workoutRepoMock: {
    findHistory: jest.Mock;
  };

  const mockEntry1 = {
    id: 'entry-uuid-1',
    userId: 'user_123',
    exerciseName: 'Barbell Bench Press',
    exerciseNameNorm: 'barbell bench press',
    muscleGroup: 'chest',
    performedAt: new Date('2026-10-29T10:30:00.000Z'),
    sets: [
      {
        id: 'set-uuid-1',
        setNumber: 1,
        reps: 8,
        originalWeight: new Prisma.Decimal(225),
        originalUnit: 'lb',
        weightKg: new Prisma.Decimal(102.0583),
        volumeKg: new Prisma.Decimal(816.4663),
        estimated1rmKg: new Prisma.Decimal(129.2738),
      },
      {
        id: 'set-uuid-2',
        setNumber: 2,
        reps: 6,
        originalWeight: new Prisma.Decimal(235),
        originalUnit: 'lb',
        weightKg: new Prisma.Decimal(106.5942),
        volumeKg: new Prisma.Decimal(639.5652),
        estimated1rmKg: new Prisma.Decimal(127.913),
      },
    ],
  };

  const mockEntry2 = {
    id: 'entry-uuid-2',
    userId: 'user_123',
    exerciseName: 'Back Squat',
    exerciseNameNorm: 'back squat',
    muscleGroup: 'legs',
    performedAt: new Date('2026-10-28T09:00:00.000Z'),
    sets: [
      {
        id: 'set-uuid-3',
        setNumber: 1,
        reps: 5,
        originalWeight: new Prisma.Decimal(140),
        originalUnit: 'kg',
        weightKg: new Prisma.Decimal(140),
        volumeKg: new Prisma.Decimal(700),
        estimated1rmKg: new Prisma.Decimal(163.3333),
      },
    ],
  };

  beforeEach(async () => {
    workoutRepoMock = {
      findHistory: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkoutHistoryService,
        UnitConversionService,
        {
          provide: WorkoutRepository,
          useValue: workoutRepoMock,
        },
      ],
    }).compile();

    service = module.get<WorkoutHistoryService>(WorkoutHistoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Validation & Edge Cases', () => {
    it('should throw ValidationException if userId is empty or whitespace', async () => {
      await expect(
        service.getWorkoutHistory('   ', {} as WorkoutHistoryQueryDto),
      ).rejects.toThrow(ValidationException);
    });

    it('should throw UnsupportedUnitException if unit is not registered', async () => {
      await expect(
        service.getWorkoutHistory('user_123', {
          unit: 'stone_unsupported',
        } as WorkoutHistoryQueryDto),
      ).rejects.toThrow(UnsupportedUnitException);
    });

    it('should throw ValidationException on invalid date formats', async () => {
      await expect(
        service.getWorkoutHistory('user_123', {
          from: 'invalid-date',
        } as WorkoutHistoryQueryDto),
      ).rejects.toThrow(ValidationException);

      await expect(
        service.getWorkoutHistory('user_123', {
          to: 'invalid-date',
        } as WorkoutHistoryQueryDto),
      ).rejects.toThrow(ValidationException);
    });

    it('should throw ValidationException if from date is after to date', async () => {
      await expect(
        service.getWorkoutHistory('user_123', {
          from: '2026-10-31',
          to: '2026-10-01',
        } as WorkoutHistoryQueryDto),
      ).rejects.toThrow(ValidationException);
    });

    it('should throw InvalidCursorException on malformed cursor string', async () => {
      await expect(
        service.getWorkoutHistory('user_123', {
          cursor: 'not-valid-base64-!!!',
        } as WorkoutHistoryQueryDto),
      ).rejects.toThrow(InvalidCursorException);
    });
  });

  describe('Empty Results Handling', () => {
    it('should return 200 envelope with empty data array and informational message when no records match', async () => {
      workoutRepoMock.findHistory.mockResolvedValue([]);

      const response = await service.getWorkoutHistory('user_123', {
        limit: 20,
        unit: 'kg',
      });

      expect(response).toEqual({
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

  describe('Keyset Pagination Evaluation', () => {
    it('should set hasNextPage = true, nextCursor, and slice visible entries to limit when entries > limit', async () => {
      // Limit 1, repo returns 2 entries (take: limit + 1)
      workoutRepoMock.findHistory.mockResolvedValue([mockEntry1, mockEntry2]);

      const response = await service.getWorkoutHistory('user_123', {
        limit: 1,
        unit: 'lb',
      });

      expect(response.pagination.limit).toBe(1);
      expect(response.pagination.hasNextPage).toBe(true);
      expect(response.data).toHaveLength(1);
      expect(response.data[0].id).toBe('entry-uuid-1');

      // nextCursor should encode last visible entry (mockEntry1)
      const expectedCursor = encodeCursor({
        performedAt: mockEntry1.performedAt,
        id: mockEntry1.id,
      });
      expect(response.pagination.nextCursor).toBe(expectedCursor);
    });

    it('should set hasNextPage = false and nextCursor = null when entries <= limit', async () => {
      workoutRepoMock.findHistory.mockResolvedValue([mockEntry1]);

      const response = await service.getWorkoutHistory('user_123', {
        limit: 20,
        unit: 'lb',
      });

      expect(response.pagination.limit).toBe(20);
      expect(response.pagination.hasNextPage).toBe(false);
      expect(response.pagination.nextCursor).toBeNull();
      expect(response.data).toHaveLength(1);
    });

    it('should correctly decode provided cursor and pass to repository', async () => {
      const cursorPayload = {
        performedAt: new Date('2026-10-30T12:00:00.000Z'),
        id: 'entry-uuid-cursor',
      };
      const encodedCursor = encodeCursor(cursorPayload);

      workoutRepoMock.findHistory.mockResolvedValue([]);

      await service.getWorkoutHistory('user_123', {
        cursor: encodedCursor,
      } as WorkoutHistoryQueryDto);

      expect(workoutRepoMock.findHistory).toHaveBeenCalledWith(
        'user_123',
        expect.objectContaining({
          cursor: {
            performedAt: cursorPayload.performedAt,
            id: cursorPayload.id,
          },
        }),
      );
    });
  });

  describe('Zero-Drift & Metric Calculation Rules', () => {
    it('should preserve exact original weight without floating-point conversion drift when requested unit matches original unit', async () => {
      workoutRepoMock.findHistory.mockResolvedValue([mockEntry1]);

      const response = await service.getWorkoutHistory('user_123', {
        unit: 'lb',
      } as WorkoutHistoryQueryDto);

      expect(response.meta.requestedUnit).toBe('lb');
      const set1 = response.data[0].sets[0];
      // Original was 225 lb
      expect(set1.weight).toBe(225);
      expect(set1.unit).toBe('lb');
      expect(set1.original).toEqual({ weight: 225, unit: 'lb' });
      // reps = 8, weight = 225 -> volume = 8 * 225 = 1800
      expect(set1.volume).toBe(1800);
      // estimated1RM = 225 * (1 + 8/30) = 285
      expect(set1.estimated1RM).toBe(285);
      // normalizedKg rounded to 2 decimals
      expect(set1.normalizedKg).toBe(102.06);
    });

    it('should perform accurate conversion from kg to target unit when units differ', async () => {
      workoutRepoMock.findHistory.mockResolvedValue([mockEntry2]);

      const response = await service.getWorkoutHistory('user_123', {
        unit: 'lb',
      } as WorkoutHistoryQueryDto);

      expect(response.meta.requestedUnit).toBe('lb');
      const set1 = response.data[0].sets[0];
      // Original was 140 kg, requested is lb: 140 / 0.45359237 = 308.65 lb
      expect(set1.weight).toBe(308.65);
      expect(set1.unit).toBe('lb');
      expect(set1.original).toEqual({ weight: 140, unit: 'kg' });
      // reps = 5, weight = 308.65 -> volume = 5 * 308.65 = 1543.25
      expect(set1.volume).toBe(1543.25);
      // estimated1RM = 308.65 * (1 + 5/30) = 360.09
      expect(set1.estimated1RM).toBe(360.09);
      expect(set1.normalizedKg).toBe(140);
    });

    it('should convert lb set to kg display unit accurately', async () => {
      workoutRepoMock.findHistory.mockResolvedValue([mockEntry1]);

      const response = await service.getWorkoutHistory('user_123', {
        unit: 'kg',
      } as WorkoutHistoryQueryDto);

      expect(response.meta.requestedUnit).toBe('kg');
      const set1 = response.data[0].sets[0];
      // weightKg was 102.0583, rounded to 2 decimals is 102.06
      expect(set1.weight).toBe(102.06);
      expect(set1.unit).toBe('kg');
      expect(set1.original).toEqual({ weight: 225, unit: 'lb' });
      // reps = 8, weight = 102.06 -> volume = 816.48
      expect(set1.volume).toBe(816.48);
      // estimated1RM = 102.06 * (1 + 8/30) = 129.28
      expect(set1.estimated1RM).toBe(129.28);
      expect(set1.normalizedKg).toBe(102.06);
    });
  });

  describe('Date Boundary Expansion', () => {
    it('should expand date-only strings to start-of-day and end-of-day UTC boundaries', async () => {
      workoutRepoMock.findHistory.mockResolvedValue([]);

      await service.getWorkoutHistory('user_123', {
        from: '2026-10-01',
        to: '2026-10-31',
      } as WorkoutHistoryQueryDto);

      expect(workoutRepoMock.findHistory).toHaveBeenCalledWith(
        'user_123',
        expect.objectContaining({
          fromDate: new Date('2026-10-01T00:00:00.000Z'),
          toDate: new Date('2026-10-31T23:59:59.999Z'),
        }),
      );
    });
  });

  describe('Edge Cases: Bodyweight Sets and Empty Sets', () => {
    it('should correctly calculate volume and 1RM for bodyweight sets (0 weight)', async () => {
      const bodyweightEntry = {
        id: 'entry-uuid-bw',
        userId: 'user_123',
        exerciseName: 'Pull-up',
        exerciseNameNorm: 'pull-up',
        muscleGroup: null,
        performedAt: new Date('2026-10-29T10:30:00.000Z'),
        sets: [
          {
            id: 'set-uuid-bw-1',
            setNumber: 1,
            reps: 15,
            originalWeight: new Prisma.Decimal(0),
            originalUnit: 'kg',
            weightKg: new Prisma.Decimal(0),
            volumeKg: new Prisma.Decimal(0),
            estimated1rmKg: new Prisma.Decimal(0),
          },
        ],
      };

      workoutRepoMock.findHistory.mockResolvedValue([bodyweightEntry]);

      const response = await service.getWorkoutHistory('user_123', {
        unit: 'kg',
      } as WorkoutHistoryQueryDto);

      expect(response.data[0].muscleGroup).toBeNull();
      const set = response.data[0].sets[0];
      expect(set.weight).toBe(0);
      expect(set.volume).toBe(0);
      expect(set.estimated1RM).toBe(0);
      expect(set.normalizedKg).toBe(0);
    });

    it('should handle entry with empty sets array gracefully', async () => {
      const entryNoSets = {
        id: 'entry-uuid-empty',
        userId: 'user_123',
        exerciseName: 'Stretching',
        exerciseNameNorm: 'stretching',
        muscleGroup: null,
        performedAt: new Date('2026-10-29T10:30:00.000Z'),
        sets: [],
      };

      workoutRepoMock.findHistory.mockResolvedValue([entryNoSets]);

      const response = await service.getWorkoutHistory('user_123', {
        unit: 'kg',
      } as WorkoutHistoryQueryDto);

      expect(response.data[0].sets).toEqual([]);
    });

    it('should ignore empty or whitespace-only cursor and proceed without cursor filter', async () => {
      workoutRepoMock.findHistory.mockResolvedValue([]);

      await service.getWorkoutHistory('user_123', {
        cursor: '   ',
      } as WorkoutHistoryQueryDto);

      expect(workoutRepoMock.findHistory).toHaveBeenCalledWith(
        'user_123',
        expect.objectContaining({
          cursor: undefined,
        }),
      );
    });
  });
});
