import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import {
  UnitConversionService,
  UnsupportedUnitException,
  ValidationException,
} from '../../../common';
import { ExerciseMetadataService } from '../../exercises';
import { PersonalRecordsQueryDto } from '../dto';
import { RawPersonalRecordRow, WorkoutRepository } from '../repositories';
import { PersonalRecordsService } from './personal-records.service';

describe('PersonalRecordsService', () => {
  let service: PersonalRecordsService;
  let workoutRepoMock: {
    findPersonalRecords: jest.Mock;
  };
  let exerciseMetadataMock: {
    resolveMuscleGroup: jest.Mock;
    getExerciseByCanonicalName: jest.Mock;
  };

  const samplePrimaryRows: RawPersonalRecordRow[] = [
    {
      pr_type: 'heaviest_set',
      id: 'set-primary-1',
      workout_entry_id: 'entry-primary-1',
      reps: 3,
      original_weight: new Prisma.Decimal(245),
      original_unit: 'lb',
      weight_kg: new Prisma.Decimal(111.1301),
      volume_kg: new Prisma.Decimal(333.3904),
      estimated_1rm_kg: new Prisma.Decimal(122.2431),
      performed_at: new Date('2026-10-18T14:20:00.000Z'),
    },
    {
      pr_type: 'highest_volume_set',
      id: 'set-primary-2',
      workout_entry_id: 'entry-primary-2',
      reps: 10,
      original_weight: new Prisma.Decimal(225),
      original_unit: 'lb',
      weight_kg: new Prisma.Decimal(102.0583),
      volume_kg: new Prisma.Decimal(1020.5828),
      estimated_1rm_kg: new Prisma.Decimal(136.0777),
      performed_at: new Date('2026-10-12T11:00:00.000Z'),
    },
    {
      pr_type: 'best_1rm_set',
      id: 'set-primary-3',
      workout_entry_id: 'entry-primary-3',
      reps: 8,
      original_weight: new Prisma.Decimal(225),
      original_unit: 'lb',
      weight_kg: new Prisma.Decimal(102.0583),
      volume_kg: new Prisma.Decimal(816.4663),
      estimated_1rm_kg: new Prisma.Decimal(129.2738),
      performed_at: new Date('2026-10-25T16:00:00.000Z'),
    },
  ];

  const sampleComparisonRows: RawPersonalRecordRow[] = [
    {
      pr_type: 'heaviest_set',
      id: 'set-comp-1',
      workout_entry_id: 'entry-comp-1',
      reps: 3,
      original_weight: new Prisma.Decimal(235),
      original_unit: 'lb',
      weight_kg: new Prisma.Decimal(106.5942),
      volume_kg: new Prisma.Decimal(319.7826),
      estimated_1rm_kg: new Prisma.Decimal(117.2536),
      performed_at: new Date('2026-09-20T14:20:00.000Z'),
    },
    {
      pr_type: 'highest_volume_set',
      id: 'set-comp-2',
      workout_entry_id: 'entry-comp-2',
      reps: 10,
      original_weight: new Prisma.Decimal(205),
      original_unit: 'lb',
      weight_kg: new Prisma.Decimal(92.9864),
      volume_kg: new Prisma.Decimal(929.8644),
      estimated_1rm_kg: new Prisma.Decimal(123.9819),
      performed_at: new Date('2026-09-10T11:00:00.000Z'),
    },
    {
      pr_type: 'best_1rm_set',
      id: 'set-comp-3',
      workout_entry_id: 'entry-comp-3',
      reps: 6,
      original_weight: new Prisma.Decimal(225),
      original_unit: 'lb',
      weight_kg: new Prisma.Decimal(102.0583),
      volume_kg: new Prisma.Decimal(612.3497),
      estimated_1rm_kg: new Prisma.Decimal(122.4699),
      performed_at: new Date('2026-09-28T16:00:00.000Z'),
    },
  ];

  beforeEach(async () => {
    workoutRepoMock = {
      findPersonalRecords: jest.fn(),
    };

    exerciseMetadataMock = {
      resolveMuscleGroup: jest.fn().mockReturnValue({ muscleGroup: null }),
      getExerciseByCanonicalName: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PersonalRecordsService,
        UnitConversionService,
        {
          provide: WorkoutRepository,
          useValue: workoutRepoMock,
        },
        {
          provide: ExerciseMetadataService,
          useValue: exerciseMetadataMock,
        },
      ],
    }).compile();

    service = module.get<PersonalRecordsService>(PersonalRecordsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Input Validation & Safeguards', () => {
    it('should throw ValidationException when userId is missing or empty', async () => {
      const query: PersonalRecordsQueryDto = {
        exerciseName: 'Barbell Bench Press',
        unit: 'kg',
      };

      await expect(service.getPersonalRecords('', query)).rejects.toThrow(
        ValidationException,
      );
      await expect(service.getPersonalRecords('   ', query)).rejects.toThrow(
        ValidationException,
      );
    });

    it('should throw ValidationException when exerciseName is missing or empty', async () => {
      const query = {
        exerciseName: '   ',
        unit: 'kg',
      } as unknown as PersonalRecordsQueryDto;

      await expect(
        service.getPersonalRecords('user_123', query),
      ).rejects.toThrow(ValidationException);
    });

    it('should throw UnsupportedUnitException when unit is unsupported', async () => {
      const query: PersonalRecordsQueryDto = {
        exerciseName: 'Barbell Bench Press',
        unit: 'grams',
      };

      await expect(
        service.getPersonalRecords('user_123', query),
      ).rejects.toThrow(UnsupportedUnitException);
    });

    it('should throw ValidationException when from is after to', async () => {
      const query: PersonalRecordsQueryDto = {
        exerciseName: 'Barbell Bench Press',
        unit: 'kg',
        from: '2026-10-31T00:00:00.000Z',
        to: '2026-10-01T00:00:00.000Z',
      };

      await expect(
        service.getPersonalRecords('user_123', query),
      ).rejects.toThrow(ValidationException);
    });

    it('should throw ValidationException when compareFrom is after compareTo', async () => {
      const query: PersonalRecordsQueryDto = {
        exerciseName: 'Barbell Bench Press',
        unit: 'kg',
        compareFrom: '2026-10-31T00:00:00.000Z',
        compareTo: '2026-10-01T00:00:00.000Z',
      };

      await expect(
        service.getPersonalRecords('user_123', query),
      ).rejects.toThrow(ValidationException);
    });

    it('should throw ValidationException when compareFrom is provided without compareTo', async () => {
      const query: PersonalRecordsQueryDto = {
        exerciseName: 'Barbell Bench Press',
        unit: 'kg',
        compareFrom: '2026-09-01T00:00:00.000Z',
      };

      await expect(
        service.getPersonalRecords('user_123', query),
      ).rejects.toThrow(ValidationException);
    });

    it('should throw ValidationException when compareTo is provided without compareFrom', async () => {
      const query: PersonalRecordsQueryDto = {
        exerciseName: 'Barbell Bench Press',
        unit: 'kg',
        compareTo: '2026-09-30T23:59:59.000Z',
      };

      await expect(
        service.getPersonalRecords('user_123', query),
      ).rejects.toThrow(ValidationException);
    });

    it('should throw ValidationException when date string is invalid ISO', async () => {
      const query: PersonalRecordsQueryDto = {
        exerciseName: 'Barbell Bench Press',
        unit: 'kg',
        from: 'not-a-valid-date',
      };

      await expect(
        service.getPersonalRecords('user_123', query),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe('Exercise Resolution', () => {
    it('should query canonical name and aliases when exercise matches catalog', async () => {
      exerciseMetadataMock.resolveMuscleGroup.mockReturnValue({
        canonicalName: 'barbell bench press',
        displayName: 'Barbell Bench Press',
        muscleGroup: 'chest',
      });

      exerciseMetadataMock.getExerciseByCanonicalName.mockReturnValue({
        canonicalName: 'barbell bench press',
        displayName: 'Barbell Bench Press',
        primaryMuscleGroup: 'chest',
        aliases: ['bench press', 'flat bench press', 'bb bench'],
      });

      workoutRepoMock.findPersonalRecords.mockResolvedValue([]);

      const result = await service.getPersonalRecords('user_123', {
        exerciseName: 'Bench Press',
        unit: 'kg',
      });

      expect(exerciseMetadataMock.resolveMuscleGroup).toHaveBeenCalledWith(
        'Bench Press',
      );
      expect(workoutRepoMock.findPersonalRecords).toHaveBeenCalledWith(
        'user_123',
        expect.arrayContaining([
          'bench press',
          'barbell bench press',
          'flat bench press',
          'bb bench',
        ]),
        undefined,
        undefined,
      );
      expect(result.data.exerciseName).toBe('Barbell Bench Press');
      expect(result.data.muscleGroup).toBe('chest');
    });

    it('should gracefully handle unmapped custom exercises', async () => {
      exerciseMetadataMock.resolveMuscleGroup.mockReturnValue({
        muscleGroup: null,
      });

      workoutRepoMock.findPersonalRecords.mockResolvedValue([]);

      const result = await service.getPersonalRecords('user_123', {
        exerciseName: 'Custom Zercher Deadlift',
        unit: 'kg',
      });

      expect(workoutRepoMock.findPersonalRecords).toHaveBeenCalledWith(
        'user_123',
        ['custom zercher deadlift'],
        undefined,
        undefined,
      );
      expect(result.data.exerciseName).toBe('Custom Zercher Deadlift');
      expect(result.data.muscleGroup).toBeNull();
    });
  });

  describe('Empty Results Contract', () => {
    it('should return 200 OK shape with null records when no sets are found', async () => {
      exerciseMetadataMock.resolveMuscleGroup.mockReturnValue({
        canonicalName: 'barbell bench press',
        displayName: 'Barbell Bench Press',
        muscleGroup: 'chest',
      });
      exerciseMetadataMock.getExerciseByCanonicalName.mockReturnValue({
        canonicalName: 'barbell bench press',
        displayName: 'Barbell Bench Press',
        primaryMuscleGroup: 'chest',
        aliases: ['bench press'],
      });

      workoutRepoMock.findPersonalRecords.mockResolvedValue([]);

      const result = await service.getPersonalRecords('user_123', {
        exerciseName: 'Barbell Bench Press',
        unit: 'kg',
        from: '2026-10-01T00:00:00.000Z',
        to: '2026-10-31T23:59:59.000Z',
      });

      expect(result).toEqual({
        data: {
          userId: 'user_123',
          exerciseName: 'Barbell Bench Press',
          muscleGroup: 'chest',
          unit: 'kg',
          primaryPeriod: {
            range: {
              from: '2026-10-01T00:00:00.000Z',
              to: '2026-10-31T23:59:59.000Z',
            },
            records: {
              heaviestSet: null,
              highestVolumeSet: null,
              bestEstimated1RM: null,
            },
          },
          comparisonPeriod: null,
          comparison: null,
        },
        meta: {
          message:
            "No workout sets found for 'Barbell Bench Press' in the specified date range.",
        },
      });
    });
  });

  describe('Zero-Drift Return vs. Dynamic Unit Conversion', () => {
    it('should preserve original weight without conversion artifacts when target unit matches original unit (lb -> lb)', async () => {
      exerciseMetadataMock.resolveMuscleGroup.mockReturnValue({
        canonicalName: 'barbell bench press',
        displayName: 'Barbell Bench Press',
        muscleGroup: 'chest',
      });

      workoutRepoMock.findPersonalRecords.mockResolvedValue(samplePrimaryRows);

      const result = await service.getPersonalRecords('user_123', {
        exerciseName: 'Barbell Bench Press',
        unit: 'lb',
      });

      const { heaviestSet, highestVolumeSet, bestEstimated1RM } =
        result.data.primaryPeriod.records;

      // Heaviest set: 245 lb x 3
      expect(heaviestSet).toBeDefined();
      expect(heaviestSet?.weight).toBe(245);
      expect(heaviestSet?.reps).toBe(3);
      expect(heaviestSet?.unit).toBe('lb');

      // Highest volume set: 225 lb x 10 -> volume = 2250
      expect(highestVolumeSet).toBeDefined();
      expect(highestVolumeSet?.weight).toBe(225);
      expect(highestVolumeSet?.reps).toBe(10);
      expect(highestVolumeSet?.volume).toBe(2250);
      expect(highestVolumeSet?.unit).toBe('lb');

      // Best estimated 1RM: 225 lb x 8 -> 1RM = 225 * (1 + 8/30) = 285
      expect(bestEstimated1RM).toBeDefined();
      expect(bestEstimated1RM?.weight).toBe(225);
      expect(bestEstimated1RM?.reps).toBe(8);
      expect(bestEstimated1RM?.estimated1RM).toBe(285);
      expect(bestEstimated1RM?.unit).toBe('lb');
    });

    it('should convert weight to kg when requested unit is kg (lb -> kg)', async () => {
      exerciseMetadataMock.resolveMuscleGroup.mockReturnValue({
        canonicalName: 'barbell bench press',
        displayName: 'Barbell Bench Press',
        muscleGroup: 'chest',
      });

      workoutRepoMock.findPersonalRecords.mockResolvedValue(samplePrimaryRows);

      const result = await service.getPersonalRecords('user_123', {
        exerciseName: 'Barbell Bench Press',
        unit: 'kg',
      });

      const { heaviestSet, highestVolumeSet, bestEstimated1RM } =
        result.data.primaryPeriod.records;

      // 111.1301 kg -> rounded to 111.13 kg
      expect(heaviestSet?.weight).toBe(111.13);
      expect(heaviestSet?.unit).toBe('kg');

      // 102.0583 kg -> rounded to 102.06 kg; volume = 10 * 102.06 = 1020.6
      expect(highestVolumeSet?.weight).toBe(102.06);
      expect(highestVolumeSet?.volume).toBe(1020.6);
      expect(highestVolumeSet?.unit).toBe('kg');

      // 102.06 * (1 + 8/30) = 129.28
      expect(bestEstimated1RM?.weight).toBe(102.06);
      expect(bestEstimated1RM?.estimated1RM).toBe(129.28);
      expect(bestEstimated1RM?.unit).toBe('kg');
    });
  });

  describe('Period-over-Period Comparison', () => {
    it('should execute parallel queries and calculate deltas and improved flags', async () => {
      exerciseMetadataMock.resolveMuscleGroup.mockReturnValue({
        canonicalName: 'barbell bench press',
        displayName: 'Barbell Bench Press',
        muscleGroup: 'chest',
      });

      workoutRepoMock.findPersonalRecords
        .mockResolvedValueOnce(samplePrimaryRows)
        .mockResolvedValueOnce(sampleComparisonRows);

      const result = await service.getPersonalRecords('user_123', {
        exerciseName: 'Barbell Bench Press',
        unit: 'lb',
        from: '2026-10-01T00:00:00.000Z',
        to: '2026-10-31T23:59:59.000Z',
        compareFrom: '2026-09-01T00:00:00.000Z',
        compareTo: '2026-09-30T23:59:59.000Z',
      });

      expect(workoutRepoMock.findPersonalRecords).toHaveBeenCalledTimes(2);

      expect(result.data.comparisonPeriod).toBeDefined();
      expect(result.data.comparisonPeriod?.range).toEqual({
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-30T23:59:59.000Z',
      });

      const comp = result.data.comparison;
      expect(comp).toBeDefined();

      // Heaviest: Primary 245 lb vs Comp 235 lb -> diff +10, % +4.26, improved: true
      expect(comp?.heaviestSet).toEqual({
        absoluteDiff: 10,
        percentageDiff: 4.26,
        improved: true,
      });

      // Volume: Primary 2250 (225x10) vs Comp 2050 (205x10) -> diff +200, % +9.76, improved: true
      expect(comp?.highestVolumeSet).toEqual({
        absoluteDiff: 200,
        percentageDiff: 9.76,
        improved: true,
      });

      // 1RM: Primary 285 (225x8) vs Comp 270 (225x6) -> diff +15, % +5.56, improved: true
      expect(comp?.bestEstimated1RM).toEqual({
        absoluteDiff: 15,
        percentageDiff: 5.56,
        improved: true,
      });
    });

    it('should set improved to false and calculate negative deltas when performance dropped', async () => {
      exerciseMetadataMock.resolveMuscleGroup.mockReturnValue({
        canonicalName: 'barbell bench press',
        displayName: 'Barbell Bench Press',
        muscleGroup: 'chest',
      });

      // Primary is lighter than Comparison
      workoutRepoMock.findPersonalRecords
        .mockResolvedValueOnce(sampleComparisonRows) // Primary: 235 lb
        .mockResolvedValueOnce(samplePrimaryRows); // Comparison: 245 lb

      const result = await service.getPersonalRecords('user_123', {
        exerciseName: 'Barbell Bench Press',
        unit: 'lb',
        from: '2026-10-01T00:00:00.000Z',
        to: '2026-10-31T23:59:59.000Z',
        compareFrom: '2026-09-01T00:00:00.000Z',
        compareTo: '2026-09-30T23:59:59.000Z',
      });

      const comp = result.data.comparison;
      expect(comp?.heaviestSet?.absoluteDiff).toBe(-10);
      expect(comp?.heaviestSet?.percentageDiff).toBe(-4.08);
      expect(comp?.heaviestSet?.improved).toBe(false);
    });

    it('should return null metric comparison if comparison period has no records', async () => {
      exerciseMetadataMock.resolveMuscleGroup.mockReturnValue({
        canonicalName: 'barbell bench press',
        displayName: 'Barbell Bench Press',
        muscleGroup: 'chest',
      });

      workoutRepoMock.findPersonalRecords
        .mockResolvedValueOnce(samplePrimaryRows)
        .mockResolvedValueOnce([]);

      const result = await service.getPersonalRecords('user_123', {
        exerciseName: 'Barbell Bench Press',
        unit: 'lb',
        from: '2026-10-01T00:00:00.000Z',
        to: '2026-10-31T23:59:59.000Z',
        compareFrom: '2026-09-01T00:00:00.000Z',
        compareTo: '2026-09-30T23:59:59.000Z',
      });

      expect(result.data.comparisonPeriod).toBeDefined();
      expect(result.data.comparisonPeriod?.records).toEqual({
        heaviestSet: null,
        highestVolumeSet: null,
        bestEstimated1RM: null,
      });

      expect(result.data.comparison).toEqual({
        heaviestSet: null,
        highestVolumeSet: null,
        bestEstimated1RM: null,
      });
    });
  });
});
