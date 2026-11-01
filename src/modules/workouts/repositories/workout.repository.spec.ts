import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { WorkoutRepository } from './workout.repository';
import { PrismaService } from '../../prisma';
import {
  PreparedWorkoutEntry,
  RawPersonalRecordRow,
} from './interfaces/workout-repository.interface';

describe('WorkoutRepository', () => {
  let repository: WorkoutRepository;
  let prismaMock: {
    workoutEntry: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock<
      Promise<unknown>,
      [TemplateStringsArray, ...unknown[]]
    >;
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
      $queryRaw: jest.fn<
        Promise<unknown>,
        [TemplateStringsArray, ...unknown[]]
      >(),
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

    it('should sort bulk entries deterministically by index suffix if returned out of order', async () => {
      const mockResult = [
        {
          id: 'entry-2',
          userId: 'user_123',
          idempotencyKey: 'idemp-bulk:2',
          sets: [],
        },
        {
          id: 'entry-0',
          userId: 'user_123',
          idempotencyKey: 'idemp-bulk:0',
          sets: [],
        },
        {
          id: 'entry-1',
          userId: 'user_123',
          idempotencyKey: 'idemp-bulk:1',
          sets: [],
        },
      ];
      prismaMock.workoutEntry.findMany.mockResolvedValue(mockResult);

      const result = await repository.findByIdempotencyKey(
        'user_123',
        'idemp-bulk',
      );

      expect(result.map((r) => r.idempotencyKey)).toEqual([
        'idemp-bulk:0',
        'idemp-bulk:1',
        'idemp-bulk:2',
      ]);
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

  describe('findHistory', () => {
    it('should query entries with default options and take limit + 1', async () => {
      const mockEntries = [{ id: 'entry-1', userId: 'user_123', sets: [] }];
      prismaMock.workoutEntry.findMany.mockResolvedValue(mockEntries);

      const result = await repository.findHistory('user_123', { limit: 20 });

      expect(prismaMock.workoutEntry.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user_123',
        },
        orderBy: [{ performedAt: 'desc' }, { id: 'desc' }],
        take: 21,
        include: {
          sets: {
            orderBy: { setNumber: 'asc' },
          },
        },
      });
      expect(result).toEqual(mockEntries);
    });

    it('should apply partial exerciseName match with trimmed lowercase normalization', async () => {
      prismaMock.workoutEntry.findMany.mockResolvedValue([]);

      await repository.findHistory('user_123', {
        limit: 10,
        exerciseName: '  Bench Press  ',
      });

      expect(prismaMock.workoutEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user_123',
            exerciseNameNorm: {
              contains: 'bench press',
            },
          },
        }),
      );
    });

    it('should apply date range filters with both fromDate and toDate', async () => {
      const fromDate = new Date('2026-10-01T00:00:00.000Z');
      const toDate = new Date('2026-10-31T23:59:59.999Z');
      prismaMock.workoutEntry.findMany.mockResolvedValue([]);

      await repository.findHistory('user_123', {
        limit: 20,
        fromDate,
        toDate,
      });

      expect(prismaMock.workoutEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user_123',
            performedAt: {
              gte: fromDate,
              lte: toDate,
            },
          },
        }),
      );
    });

    it('should apply single-sided date filters', async () => {
      const fromDate = new Date('2026-10-01T00:00:00.000Z');
      prismaMock.workoutEntry.findMany.mockResolvedValue([]);

      await repository.findHistory('user_123', {
        limit: 20,
        fromDate,
      });

      expect(prismaMock.workoutEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user_123',
            performedAt: {
              gte: fromDate,
            },
          },
        }),
      );

      const toDate = new Date('2026-10-31T23:59:59.999Z');
      await repository.findHistory('user_123', {
        limit: 20,
        toDate,
      });

      expect(prismaMock.workoutEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user_123',
            performedAt: {
              lte: toDate,
            },
          },
        }),
      );
    });

    it('should apply muscleGroup filter with trimmed lowercase and case-insensitive mode', async () => {
      prismaMock.workoutEntry.findMany.mockResolvedValue([]);

      await repository.findHistory('user_123', {
        limit: 10,
        muscleGroup: '  CHEST  ',
      });

      expect(prismaMock.workoutEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user_123',
            muscleGroup: {
              equals: 'chest',
              mode: 'insensitive',
            },
          },
        }),
      );
    });

    it('should apply keyset cursor conditions (performedAt, id)', async () => {
      const cursorDate = new Date('2026-10-25T14:00:00.000Z');
      const cursorId = 'entry-uuid-cursor';
      prismaMock.workoutEntry.findMany.mockResolvedValue([]);

      await repository.findHistory('user_123', {
        limit: 15,
        cursor: {
          performedAt: cursorDate,
          id: cursorId,
        },
      });

      expect(prismaMock.workoutEntry.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user_123',
          OR: [
            { performedAt: { lt: cursorDate } },
            { performedAt: cursorDate, id: { lt: cursorId } },
          ],
        },
        orderBy: [{ performedAt: 'desc' }, { id: 'desc' }],
        take: 16,
        include: {
          sets: {
            orderBy: { setNumber: 'asc' },
          },
        },
      });
    });

    it('should combine all filters simultaneously', async () => {
      const fromDate = new Date('2026-10-01T00:00:00.000Z');
      const toDate = new Date('2026-10-31T23:59:59.999Z');
      const cursorDate = new Date('2026-10-20T10:00:00.000Z');
      const cursorId = 'entry-uuid-combo';
      prismaMock.workoutEntry.findMany.mockResolvedValue([]);

      await repository.findHistory('user_123', {
        limit: 25,
        exerciseName: 'Squat',
        fromDate,
        toDate,
        muscleGroup: 'legs',
        cursor: {
          performedAt: cursorDate,
          id: cursorId,
        },
      });

      expect(prismaMock.workoutEntry.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user_123',
          performedAt: {
            gte: fromDate,
            lte: toDate,
          },
          exerciseNameNorm: {
            contains: 'squat',
          },
          muscleGroup: {
            equals: 'legs',
            mode: 'insensitive',
          },
          OR: [
            { performedAt: { lt: cursorDate } },
            { performedAt: cursorDate, id: { lt: cursorId } },
          ],
        },
        orderBy: [{ performedAt: 'desc' }, { id: 'desc' }],
        take: 26,
        include: {
          sets: {
            orderBy: { setNumber: 'asc' },
          },
        },
      });
    });
  });

  describe('findPersonalRecords', () => {
    const mockRows: RawPersonalRecordRow[] = [
      {
        pr_type: 'heaviest_set',
        id: 'set-uuid-1',
        workout_entry_id: 'entry-uuid-1',
        reps: 5,
        original_weight: new Prisma.Decimal(100),
        original_unit: 'kg',
        weight_kg: new Prisma.Decimal(100),
        volume_kg: new Prisma.Decimal(500),
        estimated_1rm_kg: new Prisma.Decimal(116.67),
        performed_at: new Date('2026-10-20T10:00:00.000Z'),
      },
      {
        pr_type: 'highest_volume_set',
        id: 'set-uuid-2',
        workout_entry_id: 'entry-uuid-2',
        reps: 12,
        original_weight: new Prisma.Decimal(80),
        original_unit: 'kg',
        weight_kg: new Prisma.Decimal(80),
        volume_kg: new Prisma.Decimal(960),
        estimated_1rm_kg: new Prisma.Decimal(112),
        performed_at: new Date('2026-10-18T14:30:00.000Z'),
      },
      {
        pr_type: 'best_1rm_set',
        id: 'set-uuid-3',
        workout_entry_id: 'entry-uuid-3',
        reps: 1,
        original_weight: new Prisma.Decimal(120),
        original_unit: 'kg',
        weight_kg: new Prisma.Decimal(120),
        volume_kg: new Prisma.Decimal(120),
        estimated_1rm_kg: new Prisma.Decimal(120),
        performed_at: new Date('2026-10-25T09:00:00.000Z'),
      },
    ];

    it('should return empty array immediately when exerciseNames is empty', async () => {
      const result = await repository.findPersonalRecords('user_123', []);

      expect(result).toEqual([]);
      expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    });

    it('should return empty array immediately when exerciseNames is undefined or null', async () => {
      const result = await repository.findPersonalRecords(
        'user_123',
        undefined as unknown as string[],
      );

      expect(result).toEqual([]);
      expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    });

    it('should execute parameterized CTE query for All-Time PRs when dates are omitted', async () => {
      prismaMock.$queryRaw.mockResolvedValue(mockRows);

      const result = await repository.findPersonalRecords('user_123', [
        'bench press',
        'barbell bench press',
      ]);

      expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
      const [templateStrings, ...values] = prismaMock.$queryRaw.mock
        .calls[0] as [readonly string[], ...unknown[]];

      const fullQuery = templateStrings.join('?');
      expect(fullQuery).toContain('WITH scoped_sets AS');
      expect(fullQuery).toContain('WHERE user_id =');
      expect(fullQuery).toContain('AND exercise_name_norm = ANY(');
      expect(fullQuery).toContain('heaviest_set');
      expect(fullQuery).toContain('highest_volume_set');
      expect(fullQuery).toContain('best_1rm_set');
      expect(fullQuery).toContain(
        'ORDER BY weight_kg DESC, reps DESC, performed_at DESC, id DESC',
      );
      expect(fullQuery).toContain(
        'ORDER BY volume_kg DESC, weight_kg DESC, performed_at DESC, id DESC',
      );
      expect(fullQuery).toContain(
        'ORDER BY estimated_1rm_kg DESC, weight_kg DESC, performed_at DESC, id DESC',
      );

      expect(values).toEqual([
        'user_123',
        ['bench press', 'barbell bench press'],
        null,
        null,
        null,
        null,
      ]);

      expect(result).toEqual(mockRows);
    });

    it('should pass ISO string date bounds when fromDate and toDate are provided', async () => {
      prismaMock.$queryRaw.mockResolvedValue(mockRows);

      const fromDate = new Date('2026-10-01T00:00:00.000Z');
      const toDate = new Date('2026-10-31T23:59:59.999Z');

      const result = await repository.findPersonalRecords(
        'user_123',
        ['squat'],
        fromDate,
        toDate,
      );

      expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
      const [, ...values] = prismaMock.$queryRaw.mock.calls[0] as [
        unknown,
        ...unknown[],
      ];

      expect(values).toEqual([
        'user_123',
        ['squat'],
        '2026-10-01T00:00:00.000Z',
        '2026-10-01T00:00:00.000Z',
        '2026-10-31T23:59:59.999Z',
        '2026-10-31T23:59:59.999Z',
      ]);

      expect(result).toEqual(mockRows);
    });

    it('should correctly handle when only fromDate is provided', async () => {
      prismaMock.$queryRaw.mockResolvedValue(mockRows);

      const fromDate = new Date('2026-10-01T00:00:00.000Z');

      await repository.findPersonalRecords(
        'user_123',
        ['deadlift'],
        fromDate,
        undefined,
      );

      const [, ...values] = prismaMock.$queryRaw.mock.calls[0] as [
        unknown,
        ...unknown[],
      ];

      expect(values).toEqual([
        'user_123',
        ['deadlift'],
        '2026-10-01T00:00:00.000Z',
        '2026-10-01T00:00:00.000Z',
        null,
        null,
      ]);
    });

    it('should correctly handle when only toDate is provided', async () => {
      prismaMock.$queryRaw.mockResolvedValue(mockRows);

      const toDate = new Date('2026-10-31T23:59:59.999Z');

      await repository.findPersonalRecords(
        'user_123',
        ['deadlift'],
        undefined,
        toDate,
      );

      const [, ...values] = prismaMock.$queryRaw.mock.calls[0] as [
        unknown,
        ...unknown[],
      ];

      expect(values).toEqual([
        'user_123',
        ['deadlift'],
        null,
        null,
        '2026-10-31T23:59:59.999Z',
        '2026-10-31T23:59:59.999Z',
      ]);
    });
  });
});
