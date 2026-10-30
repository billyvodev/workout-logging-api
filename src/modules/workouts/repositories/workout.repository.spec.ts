import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { WorkoutRepository } from './workout.repository';
import { PrismaService } from '../../prisma';
import { PreparedWorkoutEntry } from './interfaces/workout-repository.interface';

describe('WorkoutRepository', () => {
  let repository: WorkoutRepository;
  let prismaMock: {
    workoutEntry: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const samplePreparedEntry: PreparedWorkoutEntry = {
    date: '2026-10-29T10:30:00Z',
    exerciseName: 'Barbell Bench Press',
    exerciseNameNorm: 'barbell bench press',
    muscleGroup: 'chest',
    exerciseCatalogId: 'cat-uuid-1',
    sets: [
      {
        setNumber: 1,
        reps: 8,
        originalWeight: 225,
        originalUnit: 'lb',
        weightKg: 102.0583,
        volumeKg: 816.4663,
        estimated1rmKg: 129.2738,
      },
    ],
  };

  beforeEach(async () => {
    prismaMock = {
      workoutEntry: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: unknown) => Promise<unknown>) =>
          callback(prismaMock),
        ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkoutRepository,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    repository = module.get<WorkoutRepository>(WorkoutRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('findByIdempotencyKey', () => {
    it('should query entries matching exact key or bulk prefix', async () => {
      const mockResult = [
        {
          id: 'entry-1',
          userId: 'user_123',
          idempotencyKey: 'idemp-key-1',
          sets: [],
        },
      ];
      prismaMock.workoutEntry.findMany.mockResolvedValue(mockResult);

      const result = await repository.findByIdempotencyKey(
        'user_123',
        'idemp-key-1',
      );

      expect(prismaMock.workoutEntry.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user_123',
          OR: [
            { idempotencyKey: 'idemp-key-1' },
            { idempotencyKey: { startsWith: 'idemp-key-1:' } },
          ],
        },
        include: {
          sets: {
            orderBy: { setNumber: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('createBulkWorkoutTx', () => {
    it('should create single entry with exact idempotencyKey inside transaction', async () => {
      const mockCreatedEntry = {
        id: 'entry-uuid-1',
        userId: 'user_123',
        exerciseName: 'Barbell Bench Press',
        exerciseNameNorm: 'barbell bench press',
        muscleGroup: 'chest',
        idempotencyKey: 'idemp-key-single',
        sets: [
          {
            id: 'set-uuid-1',
            setNumber: 1,
            reps: 8,
            originalWeight: new Prisma.Decimal(225),
            originalUnit: 'lb',
            weightKg: new Prisma.Decimal(102.0583),
          },
        ],
      };
      prismaMock.workoutEntry.create.mockResolvedValue(mockCreatedEntry);

      const result = await repository.createBulkWorkoutTx(
        'user_123',
        [samplePreparedEntry],
        'idemp-key-single',
      );

      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(prismaMock.workoutEntry.create).toHaveBeenCalledTimes(1);

      const createCall = prismaMock.workoutEntry.create.mock.calls[0] as [
        {
          data: {
            userId: string;
            exerciseName: string;
            idempotencyKey: string | null;
            sets: {
              create: Array<{
                userId: string;
                exerciseNameNorm: string;
                setNumber: number;
                reps: number;
                originalUnit: string;
              }>;
            };
          };
          include: { sets: { orderBy: { setNumber: string } } };
        },
      ];

      expect(createCall[0].data.userId).toBe('user_123');
      expect(createCall[0].data.exerciseName).toBe('Barbell Bench Press');
      expect(createCall[0].data.idempotencyKey).toBe('idemp-key-single');
      expect(createCall[0].data.sets.create[0].userId).toBe('user_123');
      expect(createCall[0].data.sets.create[0].exerciseNameNorm).toBe(
        'barbell bench press',
      );
      expect(createCall[0].data.sets.create[0].setNumber).toBe(1);
      expect(createCall[0].data.sets.create[0].reps).toBe(8);
      expect(createCall[0].data.sets.create[0].originalUnit).toBe('lb');
      expect(createCall[0].include.sets.orderBy.setNumber).toBe('asc');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockCreatedEntry);
    });

    it('should create multiple bulk entries with indexed idempotency keys', async () => {
      const mockCreatedEntry1 = {
        id: 'entry-1',
        idempotencyKey: 'bulk-key:0',
        sets: [],
      };
      const mockCreatedEntry2 = {
        id: 'entry-2',
        idempotencyKey: 'bulk-key:1',
        sets: [],
      };

      prismaMock.workoutEntry.create
        .mockResolvedValueOnce(mockCreatedEntry1)
        .mockResolvedValueOnce(mockCreatedEntry2);

      const bulkEntries: PreparedWorkoutEntry[] = [
        samplePreparedEntry,
        {
          ...samplePreparedEntry,
          exerciseName: 'Incline Dumbbell Press',
          exerciseNameNorm: 'incline dumbbell press',
        },
      ];

      const result = await repository.createBulkWorkoutTx(
        'user_123',
        bulkEntries,
        'bulk-key',
      );

      expect(prismaMock.workoutEntry.create).toHaveBeenCalledTimes(2);

      const firstCall = prismaMock.workoutEntry.create.mock.calls[0] as [
        { data: { idempotencyKey: string | null } },
      ];
      const secondCall = prismaMock.workoutEntry.create.mock.calls[1] as [
        { data: { idempotencyKey: string | null } },
      ];

      expect(firstCall[0].data.idempotencyKey).toBe('bulk-key:0');
      expect(secondCall[0].data.idempotencyKey).toBe('bulk-key:1');
      expect(result).toHaveLength(2);
    });

    it('should assign null idempotencyKey when not provided', async () => {
      prismaMock.workoutEntry.create.mockResolvedValue({
        id: 'entry-no-key',
        sets: [],
      });

      await repository.createBulkWorkoutTx('user_123', [samplePreparedEntry]);

      const call = prismaMock.workoutEntry.create.mock.calls[0] as [
        { data: { idempotencyKey: string | null } },
      ];
      expect(call[0].data.idempotencyKey).toBeNull();
    });
  });

  describe('findById', () => {
    it('should query entry by ID with ordered sets', async () => {
      const mockEntry = { id: 'entry-uuid-1', sets: [] };
      prismaMock.workoutEntry.findUnique.mockResolvedValue(mockEntry);

      const result = await repository.findById('entry-uuid-1');

      expect(prismaMock.workoutEntry.findUnique).toHaveBeenCalledWith({
        where: { id: 'entry-uuid-1' },
        include: {
          sets: {
            orderBy: { setNumber: 'asc' },
          },
        },
      });
      expect(result).toEqual(mockEntry);
    });
  });
});
