import { Test, TestingModule } from '@nestjs/testing';
import { ExerciseMetadataService } from './exercise-metadata.service';
import { PrismaService } from '../prisma';
import { ExerciseMappingsConfig } from './interfaces/exercise-mapping.interface';

describe('ExerciseMetadataService', () => {
  let service: ExerciseMetadataService;
  let prismaMock: {
    exerciseCatalog: {
      upsert: jest.Mock;
    };
  };

  const sampleConfig: ExerciseMappingsConfig = {
    exercises: [
      {
        canonicalName: 'barbell bench press',
        displayName: 'Barbell Bench Press',
        primaryMuscleGroup: 'chest',
        aliases: ['bench press', 'flat bench press', 'bb bench'],
      },
      {
        canonicalName: 'back squat',
        displayName: 'Back Squat',
        primaryMuscleGroup: 'legs',
        aliases: ['squat', 'barbell squat', 'bb squat'],
      },
    ],
    keywordFallbacks: [
      { keyword: 'bench', muscleGroup: 'chest' },
      { keyword: 'squat', muscleGroup: 'legs' },
      { keyword: 'curl', muscleGroup: 'arms' },
    ],
  };

  beforeEach(async () => {
    prismaMock = {
      exerciseCatalog: {
        upsert: jest
          .fn()
          .mockImplementation(
            ({ where }: { where: { canonicalName: string } }) =>
              Promise.resolve({
                id: `uuid-${where.canonicalName}`,
                canonicalName: where.canonicalName,
                displayName: 'Display Name',
                primaryMuscleGroup: 'chest',
                aliases: [],
                createdAt: new Date(),
                updatedAt: new Date(),
              }),
          ),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExerciseMetadataService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<ExerciseMetadataService>(ExerciseMetadataService);
  });

  it('should be defined and initialized', () => {
    expect(service).toBeDefined();
    expect(service.isLoaded()).toBe(true);
  });

  describe('resolveMuscleGroup', () => {
    it('should resolve canonical exercise names exactly (case-insensitive and trimmed)', () => {
      const result = service.resolveMuscleGroup('  Barbell Bench Press  ');
      expect(result).toEqual({
        canonicalName: 'barbell bench press',
        displayName: 'Barbell Bench Press',
        muscleGroup: 'chest',
        catalogId: undefined,
      });

      const squatResult = service.resolveMuscleGroup('BACK SQUAT');
      expect(squatResult.canonicalName).toBe('back squat');
      expect(squatResult.muscleGroup).toBe('legs');
    });

    it('should resolve exercise by alias', () => {
      const result1 = service.resolveMuscleGroup('bench press');
      expect(result1).toEqual({
        canonicalName: 'barbell bench press',
        displayName: 'Barbell Bench Press',
        muscleGroup: 'chest',
        catalogId: undefined,
      });

      const result2 = service.resolveMuscleGroup('bb bench');
      expect(result2.canonicalName).toBe('barbell bench press');
      expect(result2.muscleGroup).toBe('chest');

      const result3 = service.resolveMuscleGroup('squat');
      expect(result3.canonicalName).toBe('back squat');
      expect(result3.muscleGroup).toBe('legs');
    });

    it('should fall back to keyword matching when not matching canonical name or alias', () => {
      const result = service.resolveMuscleGroup(
        'Incline Dumbbell Bench Machine',
      );
      expect(result).toEqual({
        muscleGroup: 'chest',
      });
      expect(result.canonicalName).toBeUndefined();

      const armResult = service.resolveMuscleGroup('Spider Curl Iso');
      expect(armResult).toEqual({
        muscleGroup: 'arms',
      });
    });

    it('should return null muscleGroup for unknown exercises without blocking', () => {
      const result = service.resolveMuscleGroup('Underwater Basket Weaving');
      expect(result).toEqual({
        muscleGroup: null,
      });
    });

    it('should return null muscleGroup for empty or whitespace-only inputs', () => {
      expect(service.resolveMuscleGroup('')).toEqual({ muscleGroup: null });
      expect(service.resolveMuscleGroup('   ')).toEqual({ muscleGroup: null });
      expect(service.resolveMuscleGroup(null as unknown as string)).toEqual({
        muscleGroup: null,
      });
      expect(
        service.resolveMuscleGroup(undefined as unknown as string),
      ).toEqual({
        muscleGroup: null,
      });
    });
  });

  describe('Custom Configuration', () => {
    it('should support loading custom configuration in memory', () => {
      service.loadConfig(sampleConfig);

      const bench = service.resolveMuscleGroup('bench press');
      expect(bench.canonicalName).toBe('barbell bench press');
      expect(bench.muscleGroup).toBe('chest');

      expect(service.getAllCanonicalExercises()).toHaveLength(2);
      expect(service.getKeywordFallbacks()).toHaveLength(3);
      expect(
        service.getExerciseByCanonicalName('barbell bench press')?.displayName,
      ).toBe('Barbell Bench Press');
    });
  });

  describe('Database Synchronization', () => {
    it('should sync catalog entries into prisma exerciseCatalog on module init or sync call', async () => {
      service.loadConfig(sampleConfig);
      await service.syncWithDatabase();

      expect(prismaMock.exerciseCatalog.upsert).toHaveBeenCalledTimes(2);

      const resolved = service.resolveMuscleGroup('barbell bench press');
      expect(resolved.catalogId).toBe('uuid-barbell bench press');
    });

    it('should handle database errors gracefully during sync without crashing', async () => {
      prismaMock.exerciseCatalog.upsert.mockRejectedValueOnce(
        new Error('Database connection failed'),
      );

      service.loadConfig(sampleConfig);
      await expect(service.syncWithDatabase()).resolves.not.toThrow();
    });
  });
});
