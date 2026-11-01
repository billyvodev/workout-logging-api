import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { WorkoutsController } from './workouts.controller';
import { LogWorkoutService, WorkoutHistoryService } from '../services';
import {
  LogWorkoutDto,
  LoggedWorkoutResponseDto,
  WorkoutHistoryQueryDto,
  WorkoutHistoryResponseDto,
} from '../dto';
import {
  IdempotencyConflictException,
  InvalidCursorException,
  UnsupportedUnitException,
  ValidationException,
} from '../../../common';

describe('WorkoutsController', () => {
  let controller: WorkoutsController;
  let logWorkoutServiceMock: {
    logWorkouts: jest.Mock;
  };
  let workoutHistoryServiceMock: {
    getWorkoutHistory: jest.Mock;
  };
  let loggerSpy: jest.SpyInstance;

  const mockResponse: LoggedWorkoutResponseDto = {
    data: [
      {
        id: 'entry_1',
        userId: 'user_123',
        date: '2026-10-29T10:30:00.000Z',
        exerciseName: 'Barbell Bench Press',
        exerciseNameNormalized: 'barbell bench press',
        muscleGroup: 'chest',
        sets: [
          {
            id: 'set_1',
            setNumber: 1,
            reps: 8,
            original: { weight: 225, unit: 'lb' },
            normalized: {
              weightKg: 102.06,
              volumeKg: 816.47,
              estimated1RmKg: 129.27,
            },
          },
        ],
        createdAt: '2026-10-29T10:30:05.120Z',
      },
    ],
    meta: {
      entriesLogged: 1,
      totalSetsLogged: 1,
    },
  };

  const mockHistoryResponse: WorkoutHistoryResponseDto = {
    data: [
      {
        id: 'entry_1',
        userId: 'user_123',
        date: '2026-10-29T10:30:00.000Z',
        exerciseName: 'Barbell Bench Press',
        muscleGroup: 'chest',
        sets: [
          {
            setNumber: 1,
            reps: 8,
            weight: 225,
            unit: 'lb',
            volume: 1800,
            estimated1RM: 285,
            original: { weight: 225, unit: 'lb' },
            normalizedKg: 102.06,
          },
        ],
      },
    ],
    pagination: {
      limit: 20,
      hasNextPage: false,
      nextCursor: null,
    },
    meta: {
      requestedUnit: 'lb',
      message: 'Workout entries retrieved successfully.',
    },
  };

  beforeEach(async () => {
    loggerSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();

    logWorkoutServiceMock = {
      logWorkouts: jest.fn().mockResolvedValue(mockResponse),
    };

    workoutHistoryServiceMock = {
      getWorkoutHistory: jest.fn().mockResolvedValue(mockHistoryResponse),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkoutsController],
      providers: [
        {
          provide: LogWorkoutService,
          useValue: logWorkoutServiceMock,
        },
        {
          provide: WorkoutHistoryService,
          useValue: workoutHistoryServiceMock,
        },
      ],
    }).compile();

    controller = module.get<WorkoutsController>(WorkoutsController);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('POST /api/v1/users/:userId/workouts (logWorkout)', () => {
    it('should successfully log workouts using param userId and return 201 response', async () => {
      const dto: LogWorkoutDto = Object.assign(new LogWorkoutDto(), {
        date: '2026-10-29T10:30:00Z',
        exerciseName: 'Barbell Bench Press',
        sets: [{ reps: 8, weight: 225, unit: 'lb' }],
      });

      const result = await controller.logWorkout(
        'user_123',
        dto,
        'idemp-key-1',
      );

      expect(result).toEqual(mockResponse);
      expect(logWorkoutServiceMock.logWorkouts).toHaveBeenCalledWith(
        'user_123',
        dto,
        'idemp-key-1',
      );
      const expectedDuration = expect.any(Number) as unknown as number;
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Workout entry created successfully',
          userId: 'user_123',
          entriesCount: 1,
          setsCount: 1,
          durationMs: expectedDuration,
        }),
      );
    });

    it('should trim userId before delegating to service', async () => {
      const dto: LogWorkoutDto = Object.assign(new LogWorkoutDto(), {
        date: '2026-10-29T10:30:00Z',
        exerciseName: 'Barbell Bench Press',
        sets: [{ reps: 8, weight: 225, unit: 'lb' }],
      });

      await controller.logWorkout('  user_123  ', dto);

      expect(logWorkoutServiceMock.logWorkouts).toHaveBeenCalledWith(
        'user_123',
        dto,
        undefined,
      );
    });

    it('should propagate ValidationException from service when userId is empty', async () => {
      const dto: LogWorkoutDto = Object.assign(new LogWorkoutDto(), {
        date: '2026-10-29T10:30:00Z',
        exerciseName: 'Barbell Bench Press',
        sets: [{ reps: 8, weight: 225, unit: 'lb' }],
      });

      logWorkoutServiceMock.logWorkouts.mockRejectedValue(
        new ValidationException('Validation failed', [
          { field: 'userId', issue: 'User ID is required.' },
        ]),
      );

      await expect(controller.logWorkout('', dto)).rejects.toThrow(
        ValidationException,
      );
    });

    it('should propagate IdempotencyConflictException from service', async () => {
      const dto: LogWorkoutDto = Object.assign(new LogWorkoutDto(), {
        date: '2026-10-29T10:30:00Z',
        exerciseName: 'Barbell Bench Press',
        sets: [{ reps: 8, weight: 225, unit: 'lb' }],
      });

      logWorkoutServiceMock.logWorkouts.mockRejectedValue(
        new IdempotencyConflictException('Conflict detected'),
      );

      await expect(
        controller.logWorkout('user_123', dto, 'duplicate-key'),
      ).rejects.toThrow(IdempotencyConflictException);
    });
  });

  describe('GET /api/v1/users/:userId/workouts (getWorkoutHistory)', () => {
    it('should successfully get workout history with query parameters and structured log', async () => {
      const query: WorkoutHistoryQueryDto = Object.assign(
        new WorkoutHistoryQueryDto(),
        {
          exerciseName: 'bench',
          from: '2026-10-01T00:00:00.000Z',
          to: '2026-10-31T23:59:59.999Z',
          muscleGroup: 'chest',
          unit: 'lb',
          limit: 20,
        },
      );

      const result = await controller.getWorkoutHistory('user_123', query);

      expect(result).toEqual(mockHistoryResponse);
      expect(workoutHistoryServiceMock.getWorkoutHistory).toHaveBeenCalledWith(
        'user_123',
        query,
      );
      const expectedDuration = expect.any(Number) as unknown as number;
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Workout history retrieved successfully',
          userId: 'user_123',
          returnedCount: 1,
          hasNextPage: false,
          durationMs: expectedDuration,
        }),
      );
    });

    it('should trim userId param before passing to history service', async () => {
      const query = new WorkoutHistoryQueryDto();

      await controller.getWorkoutHistory('  user_123  ', query);

      expect(workoutHistoryServiceMock.getWorkoutHistory).toHaveBeenCalledWith(
        'user_123',
        query,
      );
    });

    it('should propagate ValidationException from service', async () => {
      workoutHistoryServiceMock.getWorkoutHistory.mockRejectedValue(
        new ValidationException('Validation failed', [
          { field: 'from', issue: 'Invalid date' },
        ]),
      );

      await expect(
        controller.getWorkoutHistory('user_123', {} as WorkoutHistoryQueryDto),
      ).rejects.toThrow(ValidationException);
    });

    it('should propagate UnsupportedUnitException from service', async () => {
      workoutHistoryServiceMock.getWorkoutHistory.mockRejectedValue(
        new UnsupportedUnitException('stone'),
      );

      await expect(
        controller.getWorkoutHistory('user_123', {
          unit: 'stone',
        } as WorkoutHistoryQueryDto),
      ).rejects.toThrow(UnsupportedUnitException);
    });

    it('should propagate InvalidCursorException from service', async () => {
      workoutHistoryServiceMock.getWorkoutHistory.mockRejectedValue(
        new InvalidCursorException(),
      );

      await expect(
        controller.getWorkoutHistory('user_123', {
          cursor: 'invalid',
        } as WorkoutHistoryQueryDto),
      ).rejects.toThrow(InvalidCursorException);
    });
  });
});
