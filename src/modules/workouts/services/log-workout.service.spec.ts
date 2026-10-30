import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import {
  BusinessRuleViolationException,
  IdempotencyConflictException,
  UnitConversionService,
  ValidationException,
} from '../../../common';
import { ExerciseMetadataService } from '../../exercises';
import { LogWorkoutDto } from '../dto';
import { WorkoutRepository } from '../repositories';
import { LogWorkoutService } from './log-workout.service';

describe('LogWorkoutService', () => {
  let service: LogWorkoutService;
  let workoutRepoMock: {
    findByIdempotencyKey: jest.Mock;
    createBulkWorkoutTx: jest.Mock;
  };
  let exerciseMetadataServiceMock: {
    resolveMuscleGroup: jest.Mock;
  };
  let unitConversionService: UnitConversionService;

  beforeEach(async () => {
    workoutRepoMock = {
      findByIdempotencyKey: jest.fn().mockResolvedValue([]),
      createBulkWorkoutTx: jest.fn(),
    };

    exerciseMetadataServiceMock = {
      resolveMuscleGroup: jest.fn().mockImplementation((name: string) => {
        if (name.toLowerCase().includes('bench')) {
          return {
            canonicalName: 'barbell bench press',
            displayName: 'Barbell Bench Press',
            muscleGroup: 'chest',
            catalogId: 'cat-uuid-bench',
          };
        }
        return { muscleGroup: null };
      }),
    };

    unitConversionService = new UnitConversionService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LogWorkoutService,
        {
          provide: WorkoutRepository,
          useValue: workoutRepoMock,
        },
        {
          provide: ExerciseMetadataService,
          useValue: exerciseMetadataServiceMock,
        },
        {
          provide: UnitConversionService,
          useValue: unitConversionService,
        },
      ],
    }).compile();

    service = module.get<LogWorkoutService>(LogWorkoutService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('logWorkouts - Single Exercise', () => {
    const singleDto: LogWorkoutDto = Object.assign(new LogWorkoutDto(), {
      date: '2026-10-29T10:30:00.000Z',
      exerciseName: 'Barbell Bench Press',
      sets: [
        { reps: 8, weight: 225, unit: 'lb' },
        { reps: 6, weight: 235, unit: 'lb' },
      ],
    });

    it('should log a single workout entry with pre-computed metrics and 2-decimal response', async () => {
      const mockCreatedEntry = {
        id: 'entry-uuid-1',
        userId: 'user_123',
        exerciseName: 'Barbell Bench Press',
        exerciseNameNorm: 'barbell bench press',
        exerciseCatalogId: 'cat-uuid-bench',
        muscleGroup: 'chest',
        performedAt: new Date('2026-10-29T10:30:00.000Z'),
        idempotencyKey: null,
        createdAt: new Date('2026-10-29T10:30:05.120Z'),
        sets: [
          {
            id: 'set-1',
            workoutEntryId: 'entry-uuid-1',
            userId: 'user_123',
            exerciseNameNorm: 'barbell bench press',
            performedAt: new Date('2026-10-29T10:30:00.000Z'),
            setNumber: 1,
            reps: 8,
            originalWeight: new Prisma.Decimal(225),
            originalUnit: 'lb',
            weightKg: new Prisma.Decimal(102.0583),
            volumeKg: new Prisma.Decimal(816.4663),
            estimated1rmKg: new Prisma.Decimal(129.2738),
          },
          {
            id: 'set-2',
            workoutEntryId: 'entry-uuid-1',
            userId: 'user_123',
            exerciseNameNorm: 'barbell bench press',
            performedAt: new Date('2026-10-29T10:30:00.000Z'),
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

      workoutRepoMock.createBulkWorkoutTx.mockResolvedValue([mockCreatedEntry]);

      const result = await service.logWorkouts('user_123', singleDto);

      expect(workoutRepoMock.createBulkWorkoutTx).toHaveBeenCalled();
      expect(result.data).toHaveLength(1);
      expect(result.meta.entriesLogged).toBe(1);
      expect(result.meta.totalSetsLogged).toBe(2);

      const entry = result.data[0];
      expect(entry.exerciseName).toBe('Barbell Bench Press');
      expect(entry.muscleGroup).toBe('chest');
      expect(entry.sets[0].original).toEqual({ weight: 225, unit: 'lb' });
      expect(entry.sets[0].normalized).toEqual({
        weightKg: 102.06,
        volumeKg: 816.47,
        estimated1RmKg: 129.27,
      });
      expect(entry.sets[1].normalized).toEqual({
        weightKg: 106.59,
        volumeKg: 639.57,
        estimated1RmKg: 127.91,
      });
    });

    it('should gracefully handle unknown exercises setting muscleGroup to null', async () => {
      const unknownDto: LogWorkoutDto = Object.assign(new LogWorkoutDto(), {
        date: '2026-10-29T10:30:00.000Z',
        exerciseName: 'Mystery Exercise',
        sets: [{ reps: 10, weight: 50, unit: 'kg' }],
      });

      const mockEntry = {
        id: 'entry-unknown',
        userId: 'user_123',
        exerciseName: 'Mystery Exercise',
        exerciseNameNorm: 'mystery exercise',
        exerciseCatalogId: null,
        muscleGroup: null,
        performedAt: new Date('2026-10-29T10:30:00.000Z'),
        idempotencyKey: null,
        createdAt: new Date(),
        sets: [
          {
            id: 'set-unknown',
            setNumber: 1,
            reps: 10,
            originalWeight: new Prisma.Decimal(50),
            originalUnit: 'kg',
            weightKg: new Prisma.Decimal(50),
            volumeKg: new Prisma.Decimal(500),
            estimated1rmKg: new Prisma.Decimal(66.6667),
          },
        ],
      };

      workoutRepoMock.createBulkWorkoutTx.mockResolvedValue([mockEntry]);

      const result = await service.logWorkouts('user_123', unknownDto);

      expect(result.data[0].muscleGroup).toBeNull();
    });

    it('should support bodyweight exercises (weight = 0)', async () => {
      const bodyweightDto: LogWorkoutDto = Object.assign(new LogWorkoutDto(), {
        date: '2026-10-29T10:30:00.000Z',
        exerciseName: 'Pull Up',
        sets: [{ reps: 10, weight: 0, unit: 'kg' }],
      });

      const mockEntry = {
        id: 'entry-bw',
        userId: 'user_123',
        exerciseName: 'Pull Up',
        exerciseNameNorm: 'pull up',
        muscleGroup: 'back',
        performedAt: new Date('2026-10-29T10:30:00.000Z'),
        idempotencyKey: null,
        createdAt: new Date(),
        sets: [
          {
            id: 'set-bw',
            setNumber: 1,
            reps: 10,
            originalWeight: new Prisma.Decimal(0),
            originalUnit: 'kg',
            weightKg: new Prisma.Decimal(0),
            volumeKg: new Prisma.Decimal(0),
            estimated1rmKg: new Prisma.Decimal(0),
          },
        ],
      };

      workoutRepoMock.createBulkWorkoutTx.mockResolvedValue([mockEntry]);

      const result = await service.logWorkouts('user_123', bodyweightDto);

      expect(result.data[0].sets[0].normalized).toEqual({
        weightKg: 0,
        volumeKg: 0,
        estimated1RmKg: 0,
      });
    });
  });

  describe('logWorkouts - Bulk Entries', () => {
    const bulkDto: LogWorkoutDto = Object.assign(new LogWorkoutDto(), {
      entries: [
        {
          date: '2026-10-29T10:30:00.000Z',
          exerciseName: 'Barbell Bench Press',
          sets: [
            { reps: 8, weight: 225, unit: 'lb' },
            { reps: 6, weight: 235, unit: 'lb' },
          ],
        },
        {
          date: '2026-10-29T11:00:00.000Z',
          exerciseName: 'Back Squat',
          sets: [{ reps: 5, weight: 140, unit: 'kg' }],
        },
      ],
    });

    it('should log bulk workout entries with pre-computed metrics and aggregated metadata', async () => {
      const mockCreatedEntries = [
        {
          id: 'entry-uuid-1',
          userId: 'user_123',
          exerciseName: 'Barbell Bench Press',
          exerciseNameNorm: 'barbell bench press',
          exerciseCatalogId: 'cat-uuid-bench',
          muscleGroup: 'chest',
          performedAt: new Date('2026-10-29T10:30:00.000Z'),
          idempotencyKey: 'bulk-key:0',
          createdAt: new Date('2026-10-29T10:30:05.120Z'),
          sets: [
            {
              id: 'set-1',
              workoutEntryId: 'entry-uuid-1',
              userId: 'user_123',
              exerciseNameNorm: 'barbell bench press',
              performedAt: new Date('2026-10-29T10:30:00.000Z'),
              setNumber: 1,
              reps: 8,
              originalWeight: new Prisma.Decimal(225),
              originalUnit: 'lb',
              weightKg: new Prisma.Decimal(102.0583),
              volumeKg: new Prisma.Decimal(816.4663),
              estimated1rmKg: new Prisma.Decimal(129.2738),
            },
            {
              id: 'set-2',
              workoutEntryId: 'entry-uuid-1',
              userId: 'user_123',
              exerciseNameNorm: 'barbell bench press',
              performedAt: new Date('2026-10-29T10:30:00.000Z'),
              setNumber: 2,
              reps: 6,
              originalWeight: new Prisma.Decimal(235),
              originalUnit: 'lb',
              weightKg: new Prisma.Decimal(106.5942),
              volumeKg: new Prisma.Decimal(639.5652),
              estimated1rmKg: new Prisma.Decimal(127.913),
            },
          ],
        },
        {
          id: 'entry-uuid-2',
          userId: 'user_123',
          exerciseName: 'Back Squat',
          exerciseNameNorm: 'back squat',
          exerciseCatalogId: null,
          muscleGroup: null,
          performedAt: new Date('2026-10-29T11:00:00.000Z'),
          idempotencyKey: 'bulk-key:1',
          createdAt: new Date('2026-10-29T11:00:05.120Z'),
          sets: [
            {
              id: 'set-3',
              workoutEntryId: 'entry-uuid-2',
              userId: 'user_123',
              exerciseNameNorm: 'back squat',
              performedAt: new Date('2026-10-29T11:00:00.000Z'),
              setNumber: 1,
              reps: 5,
              originalWeight: new Prisma.Decimal(140),
              originalUnit: 'kg',
              weightKg: new Prisma.Decimal(140),
              volumeKg: new Prisma.Decimal(700),
              estimated1rmKg: new Prisma.Decimal(163.3333),
            },
          ],
        },
      ];

      workoutRepoMock.createBulkWorkoutTx.mockResolvedValue(mockCreatedEntries);

      const result = await service.logWorkouts('user_123', bulkDto, 'bulk-key');

      expect(workoutRepoMock.createBulkWorkoutTx).toHaveBeenCalledWith(
        'user_123',
        expect.arrayContaining([
          expect.objectContaining({
            exerciseName: 'Barbell Bench Press',
            exerciseNameNorm: 'barbell bench press',
          }),
          expect.objectContaining({
            exerciseName: 'Back Squat',
            exerciseNameNorm: 'back squat',
          }),
        ]),
        'bulk-key',
      );

      expect(result.data).toHaveLength(2);
      expect(result.meta.entriesLogged).toBe(2);
      expect(result.meta.totalSetsLogged).toBe(3);

      expect(result.data[0].exerciseName).toBe('Barbell Bench Press');
      expect(result.data[0].sets).toHaveLength(2);
      expect(result.data[1].exerciseName).toBe('Back Squat');
      expect(result.data[1].sets).toHaveLength(1);
      expect(result.data[1].sets[0].normalized).toEqual({
        weightKg: 140,
        volumeKg: 700,
        estimated1RmKg: 163.33,
      });
    });

    it('should return cached response on idempotent bulk retry with identical payload', async () => {
      const mockExistingEntries = [
        {
          id: 'entry-uuid-1',
          userId: 'user_123',
          exerciseName: 'Barbell Bench Press',
          exerciseNameNorm: 'barbell bench press',
          muscleGroup: 'chest',
          performedAt: new Date('2026-10-29T10:30:00.000Z'),
          idempotencyKey: 'bulk-key:0',
          createdAt: new Date('2026-10-29T10:30:05.120Z'),
          sets: [
            {
              id: 'set-1',
              workoutEntryId: 'entry-uuid-1',
              userId: 'user_123',
              exerciseNameNorm: 'barbell bench press',
              performedAt: new Date('2026-10-29T10:30:00.000Z'),
              setNumber: 1,
              reps: 8,
              originalWeight: new Prisma.Decimal(225),
              originalUnit: 'lb',
              weightKg: new Prisma.Decimal(102.0583),
              volumeKg: new Prisma.Decimal(816.4663),
              estimated1rmKg: new Prisma.Decimal(129.2738),
            },
            {
              id: 'set-2',
              workoutEntryId: 'entry-uuid-1',
              userId: 'user_123',
              exerciseNameNorm: 'barbell bench press',
              performedAt: new Date('2026-10-29T10:30:00.000Z'),
              setNumber: 2,
              reps: 6,
              originalWeight: new Prisma.Decimal(235),
              originalUnit: 'lb',
              weightKg: new Prisma.Decimal(106.5942),
              volumeKg: new Prisma.Decimal(639.5652),
              estimated1rmKg: new Prisma.Decimal(127.913),
            },
          ],
        },
        {
          id: 'entry-uuid-2',
          userId: 'user_123',
          exerciseName: 'Back Squat',
          exerciseNameNorm: 'back squat',
          muscleGroup: null,
          performedAt: new Date('2026-10-29T11:00:00.000Z'),
          idempotencyKey: 'bulk-key:1',
          createdAt: new Date('2026-10-29T11:00:05.120Z'),
          sets: [
            {
              id: 'set-3',
              workoutEntryId: 'entry-uuid-2',
              userId: 'user_123',
              exerciseNameNorm: 'back squat',
              performedAt: new Date('2026-10-29T11:00:00.000Z'),
              setNumber: 1,
              reps: 5,
              originalWeight: new Prisma.Decimal(140),
              originalUnit: 'kg',
              weightKg: new Prisma.Decimal(140),
              volumeKg: new Prisma.Decimal(700),
              estimated1rmKg: new Prisma.Decimal(163.3333),
            },
          ],
        },
      ];

      workoutRepoMock.findByIdempotencyKey.mockResolvedValue(
        mockExistingEntries,
      );

      const result = await service.logWorkouts('user_123', bulkDto, 'bulk-key');

      expect(workoutRepoMock.createBulkWorkoutTx).not.toHaveBeenCalled();
      expect(result.data).toHaveLength(2);
      expect(result.data[0].id).toBe('entry-uuid-1');
      expect(result.data[1].id).toBe('entry-uuid-2');
    });

    it('should throw IdempotencyConflictException (409) if bulk payload size differs', async () => {
      const mockExistingSingleEntry = [
        {
          id: 'entry-uuid-1',
          userId: 'user_123',
          exerciseName: 'Barbell Bench Press',
          exerciseNameNorm: 'barbell bench press',
          muscleGroup: 'chest',
          performedAt: new Date('2026-10-29T10:30:00.000Z'),
          idempotencyKey: 'bulk-key:0',
          createdAt: new Date('2026-10-29T10:30:05.120Z'),
          sets: [],
        },
      ];

      workoutRepoMock.findByIdempotencyKey.mockResolvedValue(
        mockExistingSingleEntry,
      );

      await expect(
        service.logWorkouts('user_123', bulkDto, 'bulk-key'),
      ).rejects.toThrow(IdempotencyConflictException);
    });
  });

  describe('logWorkouts - Validation', () => {
    it('should throw ValidationException if userId is missing', async () => {
      const dto = Object.assign(new LogWorkoutDto(), {
        date: '2026-10-29T10:30:00.000Z',
        exerciseName: 'Bench',
        sets: [{ reps: 10, weight: 50, unit: 'kg' }],
      });

      await expect(service.logWorkouts('', dto)).rejects.toThrow(
        ValidationException,
      );
    });

    it('should throw BusinessRuleViolationException if bulk entries exceed 100', async () => {
      const excessiveEntries = Array.from({ length: 101 }, (_, i) => ({
        date: '2026-10-29T10:30:00.000Z',
        exerciseName: `Exercise ${i + 1}`,
        sets: [{ reps: 10, weight: 50, unit: 'kg' }],
      }));

      const dto = Object.assign(new LogWorkoutDto(), {
        entries: excessiveEntries,
      });

      await expect(service.logWorkouts('user_123', dto)).rejects.toThrow(
        BusinessRuleViolationException,
      );
    });

    it('should throw ValidationException if dto has no entries', async () => {
      const emptyDto = new LogWorkoutDto();

      await expect(service.logWorkouts('user_123', emptyDto)).rejects.toThrow(
        ValidationException,
      );
    });
  });

  describe('logWorkouts - Idempotency Replay & Conflict Detection', () => {
    const singleDto: LogWorkoutDto = Object.assign(new LogWorkoutDto(), {
      date: '2026-10-29T10:30:00.000Z',
      exerciseName: 'Barbell Bench Press',
      sets: [{ reps: 8, weight: 225, unit: 'lb' }],
    });

    const existingEntry = {
      id: 'existing-entry-id',
      userId: 'user_123',
      exerciseName: 'Barbell Bench Press',
      exerciseNameNorm: 'barbell bench press',
      muscleGroup: 'chest',
      performedAt: new Date('2026-10-29T10:30:00.000Z'),
      idempotencyKey: 'idemp-key-1',
      createdAt: new Date('2026-10-29T10:30:05.000Z'),
      sets: [
        {
          id: 'existing-set-id',
          setNumber: 1,
          reps: 8,
          originalWeight: new Prisma.Decimal(225),
          originalUnit: 'lb',
          weightKg: new Prisma.Decimal(102.0583),
          volumeKg: new Prisma.Decimal(816.4663),
          estimated1rmKg: new Prisma.Decimal(129.2738),
        },
      ],
    };

    it('should return cached response on idempotent retry with identical payload', async () => {
      workoutRepoMock.findByIdempotencyKey.mockResolvedValue([existingEntry]);

      const result = await service.logWorkouts(
        'user_123',
        singleDto,
        'idemp-key-1',
      );

      expect(workoutRepoMock.createBulkWorkoutTx).not.toHaveBeenCalled();
      expect(result.data[0].id).toBe('existing-entry-id');
      expect(result.meta.entriesLogged).toBe(1);
    });

    it('should throw IdempotencyConflictException (409) if payload differs on same idempotency key', async () => {
      workoutRepoMock.findByIdempotencyKey.mockResolvedValue([existingEntry]);

      const alteredDto: LogWorkoutDto = Object.assign(new LogWorkoutDto(), {
        date: '2026-10-29T10:30:00.000Z',
        exerciseName: 'Barbell Bench Press',
        sets: [{ reps: 10, weight: 225, unit: 'lb' }], // altered reps
      });

      await expect(
        service.logWorkouts('user_123', alteredDto, 'idemp-key-1'),
      ).rejects.toThrow(IdempotencyConflictException);
    });

    it('should catch race-condition P2002 error and return cached response if payload matches', async () => {
      workoutRepoMock.findByIdempotencyKey
        .mockResolvedValueOnce([]) // First check sees no entry
        .mockResolvedValueOnce([existingEntry]); // After P2002, re-query sees committed entry

      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint violation',
        { code: 'P2002', clientVersion: '5.0.0' },
      );
      workoutRepoMock.createBulkWorkoutTx.mockRejectedValue(p2002Error);

      const result = await service.logWorkouts(
        'user_123',
        singleDto,
        'idemp-key-1',
      );

      expect(result.data[0].id).toBe('existing-entry-id');
    });

    it('should throw IdempotencyConflictException if race-condition P2002 occurs and payload conflicts', async () => {
      workoutRepoMock.findByIdempotencyKey
        .mockResolvedValueOnce([]) // First check sees no entry
        .mockResolvedValueOnce([existingEntry]); // After P2002, existing entry found with different reps

      const conflictingDto: LogWorkoutDto = Object.assign(new LogWorkoutDto(), {
        date: '2026-10-29T10:30:00.000Z',
        exerciseName: 'Barbell Bench Press',
        sets: [{ reps: 99, weight: 225, unit: 'lb' }],
      });

      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint violation',
        { code: 'P2002', clientVersion: '5.0.0' },
      );
      workoutRepoMock.createBulkWorkoutTx.mockRejectedValue(p2002Error);

      await expect(
        service.logWorkouts('user_123', conflictingDto, 'idemp-key-1'),
      ).rejects.toThrow(IdempotencyConflictException);
    });
  });
});
