import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { WorkoutsController } from './workouts.controller';
import { LogWorkoutService } from '../services';
import { LogWorkoutDto, LoggedWorkoutResponseDto } from '../dto';
import {
  IdempotencyConflictException,
  ValidationException,
} from '../../../common';

describe('WorkoutsController', () => {
  let controller: WorkoutsController;
  let logWorkoutServiceMock: {
    logWorkouts: jest.Mock;
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

  beforeEach(async () => {
    loggerSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();

    logWorkoutServiceMock = {
      logWorkouts: jest.fn().mockResolvedValue(mockResponse),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkoutsController],
      providers: [
        {
          provide: LogWorkoutService,
          useValue: logWorkoutServiceMock,
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
});
