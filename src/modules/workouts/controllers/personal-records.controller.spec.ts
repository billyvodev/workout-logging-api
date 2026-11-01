import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { PersonalRecordsQueryDto, PersonalRecordsResponseDto } from '../dto';
import { PersonalRecordsService } from '../services';
import { PersonalRecordsController } from './personal-records.controller';
import { UnsupportedUnitException, ValidationException } from '../../../common';

describe('PersonalRecordsController', () => {
  let controller: PersonalRecordsController;
  let personalRecordsServiceMock: {
    getPersonalRecords: jest.Mock;
  };
  let loggerSpy: jest.SpyInstance;

  const mockResponse: PersonalRecordsResponseDto = {
    data: {
      userId: 'user_123',
      exerciseName: 'Barbell Bench Press',
      muscleGroup: 'chest',
      unit: 'lb',
      primaryPeriod: {
        range: {
          from: '2026-10-01T00:00:00.000Z',
          to: '2026-10-31T23:59:59.000Z',
        },
        records: {
          heaviestSet: {
            weight: 245,
            reps: 3,
            unit: 'lb',
            achievedAt: '2026-10-18T14:20:00.000Z',
            workoutEntryId: 'entry_01j9abc',
            setId: 'set_01j9abd',
          },
          highestVolumeSet: {
            volume: 2250,
            weight: 225,
            reps: 10,
            unit: 'lb',
            achievedAt: '2026-10-12T11:00:00.000Z',
            workoutEntryId: 'entry_01j8xyz',
            setId: 'set_01j8xy0',
          },
          bestEstimated1RM: {
            estimated1RM: 285,
            weight: 225,
            reps: 8,
            unit: 'lb',
            achievedAt: '2026-10-25T16:00:00.000Z',
            workoutEntryId: 'entry_01j9def',
            setId: 'set_01j9deg',
          },
        },
      },
      comparisonPeriod: null,
      comparison: null,
    },
    meta: {
      message: 'Personal records calculated successfully.',
    },
  };

  beforeEach(async () => {
    personalRecordsServiceMock = {
      getPersonalRecords: jest.fn(),
    };

    loggerSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PersonalRecordsController],
      providers: [
        {
          provide: PersonalRecordsService,
          useValue: personalRecordsServiceMock,
        },
      ],
    }).compile();

    controller = module.get<PersonalRecordsController>(
      PersonalRecordsController,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getPersonalRecords', () => {
    it('should delegate to personalRecordsService with trimmed userId and query', async () => {
      personalRecordsServiceMock.getPersonalRecords.mockResolvedValue(
        mockResponse,
      );

      const query: PersonalRecordsQueryDto = {
        exerciseName: 'Barbell Bench Press',
        unit: 'lb',
        from: '2026-10-01T00:00:00.000Z',
        to: '2026-10-31T23:59:59.000Z',
      };

      const result = await controller.getPersonalRecords('  user_123  ', query);

      expect(
        personalRecordsServiceMock.getPersonalRecords,
      ).toHaveBeenCalledWith('user_123', query);
      expect(result).toEqual(mockResponse);

      const expectedDuration = expect.any(Number) as unknown as number;
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Personal records retrieved successfully',
          userId: 'user_123',
          exerciseName: 'Barbell Bench Press',
          hasComparison: false,
          durationMs: expectedDuration,
        }),
      );
    });

    it('should log hasComparison as true when compareFrom and compareTo are present', async () => {
      personalRecordsServiceMock.getPersonalRecords.mockResolvedValue(
        mockResponse,
      );

      const query: PersonalRecordsQueryDto = {
        exerciseName: 'Barbell Bench Press',
        unit: 'lb',
        from: '2026-10-01T00:00:00.000Z',
        to: '2026-10-31T23:59:59.000Z',
        compareFrom: '2026-09-01T00:00:00.000Z',
        compareTo: '2026-09-30T23:59:59.000Z',
      };

      await controller.getPersonalRecords('user_123', query);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          hasComparison: true,
        }),
      );
    });

    it('should propagate ValidationException from service without suppression', async () => {
      personalRecordsServiceMock.getPersonalRecords.mockRejectedValue(
        new ValidationException('Validation failed for one or more fields.', [
          { field: 'exerciseName', issue: 'exerciseName must not be empty' },
        ]),
      );

      const query: PersonalRecordsQueryDto = {
        exerciseName: '',
        unit: 'lb',
      };

      await expect(
        controller.getPersonalRecords('user_123', query),
      ).rejects.toThrow(ValidationException);
    });

    it('should propagate UnsupportedUnitException from service', async () => {
      personalRecordsServiceMock.getPersonalRecords.mockRejectedValue(
        new UnsupportedUnitException('stone', ['kg', 'lb']),
      );

      const query: PersonalRecordsQueryDto = {
        exerciseName: 'Squat',
        unit: 'stone',
      };

      await expect(
        controller.getPersonalRecords('user_123', query),
      ).rejects.toThrow(UnsupportedUnitException);
    });
  });
});
