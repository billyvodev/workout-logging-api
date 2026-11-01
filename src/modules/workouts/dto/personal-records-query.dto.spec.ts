import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CustomValidationPipe,
  ErrorCode,
  ValidationException,
} from '../../../common';
import { PersonalRecordsQueryDto } from './personal-records-query.dto';

describe('PersonalRecordsQueryDto Validation', () => {
  let pipe: CustomValidationPipe;

  beforeEach(() => {
    pipe = new CustomValidationPipe();
  });

  describe('Default Values & Clean Input', () => {
    it('should validate minimal query with only exerciseName and set default unit to kg', async () => {
      const dto = plainToInstance(PersonalRecordsQueryDto, {
        exerciseName: 'Barbell Bench Press',
      });
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
      expect(dto.exerciseName).toBe('Barbell Bench Press');
      expect(dto.unit).toBe('kg');
      expect(dto.from).toBeUndefined();
      expect(dto.to).toBeUndefined();
      expect(dto.compareFrom).toBeUndefined();
      expect(dto.compareTo).toBeUndefined();
    });

    it('should accept valid query parameters for primary and comparison periods', async () => {
      const dto = plainToInstance(PersonalRecordsQueryDto, {
        exerciseName: 'Back Squat',
        unit: 'lb',
        from: '2026-10-01T00:00:00.000Z',
        to: '2026-10-31T23:59:59.999Z',
        compareFrom: '2026-09-01T00:00:00.000Z',
        compareTo: '2026-09-30T23:59:59.999Z',
      });
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
      expect(dto.exerciseName).toBe('Back Squat');
      expect(dto.unit).toBe('lb');
      expect(dto.from).toBe('2026-10-01T00:00:00.000Z');
      expect(dto.to).toBe('2026-10-31T23:59:59.999Z');
      expect(dto.compareFrom).toBe('2026-09-01T00:00:00.000Z');
      expect(dto.compareTo).toBe('2026-09-30T23:59:59.999Z');
    });
  });

  describe('Trimming and Transformations', () => {
    it('should trim string inputs and normalize unit to lowercase', async () => {
      const dto = plainToInstance(PersonalRecordsQueryDto, {
        exerciseName: '   Deadlift   ',
        unit: '  LB  ',
      });

      expect(dto.exerciseName).toBe('Deadlift');
      expect(dto.unit).toBe('lb');

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should expand date-only inputs to start-of-day and end-of-day UTC ISO strings', async () => {
      const dto = plainToInstance(PersonalRecordsQueryDto, {
        exerciseName: 'Overhead Press',
        from: '2026-10-01',
        to: '2026-10-31',
        compareFrom: '2026-09-01',
        compareTo: '2026-09-30',
      });

      expect(dto.from).toBe('2026-10-01T00:00:00.000Z');
      expect(dto.to).toBe('2026-10-31T23:59:59.999Z');
      expect(dto.compareFrom).toBe('2026-09-01T00:00:00.000Z');
      expect(dto.compareTo).toBe('2026-09-30T23:59:59.999Z');

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('Required Field Validation (exerciseName)', () => {
    it('should reject missing exerciseName', async () => {
      const dto = plainToInstance(PersonalRecordsQueryDto, {});
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
      const nameError = errors.find((e) => e.property === 'exerciseName');
      expect(nameError).toBeDefined();
    });

    it('should reject whitespace-only exerciseName', async () => {
      const dto = plainToInstance(PersonalRecordsQueryDto, {
        exerciseName: '    ',
      });
      const errors = await validate(dto);

      const nameError = errors.find((e) => e.property === 'exerciseName');
      expect(nameError).toBeDefined();
    });

    it('should reject exerciseName longer than 150 characters', async () => {
      const dto = plainToInstance(PersonalRecordsQueryDto, {
        exerciseName: 'A'.repeat(151),
      });
      const errors = await validate(dto);

      const nameError = errors.find((e) => e.property === 'exerciseName');
      expect(nameError).toBeDefined();
      expect(nameError?.constraints?.isLength).toBe(
        'exerciseName must be between 1 and 150 characters',
      );
    });
  });

  describe('Date Range Constraints', () => {
    it('should reject inverted primary date range (from > to)', async () => {
      const dto = plainToInstance(PersonalRecordsQueryDto, {
        exerciseName: 'Bench Press',
        from: '2026-10-31T00:00:00.000Z',
        to: '2026-10-01T23:59:59.999Z',
      });
      const errors = await validate(dto);

      const fromError = errors.find((e) => e.property === 'from');
      expect(fromError).toBeDefined();
      expect(fromError?.constraints?.isEarlierThanOrEqualTo).toBe(
        "'from' date must be earlier than or equal to 'to' date.",
      );
    });

    it('should reject inverted comparison date range (compareFrom > compareTo)', async () => {
      const dto = plainToInstance(PersonalRecordsQueryDto, {
        exerciseName: 'Bench Press',
        compareFrom: '2026-09-30T00:00:00.000Z',
        compareTo: '2026-09-01T23:59:59.999Z',
      });
      const errors = await validate(dto);

      const compFromError = errors.find((e) => e.property === 'compareFrom');
      expect(compFromError).toBeDefined();
      expect(compFromError?.constraints?.isEarlierThanOrEqualTo).toBe(
        "'compareFrom' date must be earlier than or equal to 'compareTo' date.",
      );
    });

    it('should reject invalid ISO date strings', async () => {
      const dto = plainToInstance(PersonalRecordsQueryDto, {
        exerciseName: 'Bench Press',
        from: 'not-a-valid-date',
      });
      const errors = await validate(dto);

      const fromError = errors.find((e) => e.property === 'from');
      expect(fromError).toBeDefined();
      expect(fromError?.constraints?.isIso8601).toBe(
        'from must be a valid ISO 8601 date string',
      );
    });
  });

  describe('Mutual Dependency Constraints (compareFrom & compareTo)', () => {
    it('should reject compareFrom when compareTo is missing', async () => {
      const dto = plainToInstance(PersonalRecordsQueryDto, {
        exerciseName: 'Bench Press',
        compareFrom: '2026-09-01T00:00:00.000Z',
      });
      const errors = await validate(dto);

      const compFromError = errors.find((e) => e.property === 'compareFrom');
      expect(compFromError).toBeDefined();
      expect(compFromError?.constraints?.isDefinedTogetherWith).toBe(
        "'compareFrom' requires 'compareTo' to also be specified.",
      );
    });

    it('should reject compareTo when compareFrom is missing', async () => {
      const dto = plainToInstance(PersonalRecordsQueryDto, {
        exerciseName: 'Bench Press',
        compareTo: '2026-09-30T23:59:59.999Z',
      });
      const errors = await validate(dto);

      const compToError = errors.find((e) => e.property === 'compareTo');
      expect(compToError).toBeDefined();
      expect(compToError?.constraints?.isDefinedTogetherWith).toBe(
        "'compareTo' requires 'compareFrom' to also be specified.",
      );
    });
  });

  describe('Unit Validation', () => {
    it('should reject unsupported unit', async () => {
      const dto = plainToInstance(PersonalRecordsQueryDto, {
        exerciseName: 'Bench Press',
        unit: 'grams',
      });
      const errors = await validate(dto);

      const unitError = errors.find((e) => e.property === 'unit');
      expect(unitError).toBeDefined();
      expect(unitError?.constraints?.isSupportedUnit).toContain(
        "Unsupported weight unit 'grams'",
      );
    });
  });

  describe('CustomValidationPipe Integration', () => {
    it('should throw ValidationException when exerciseName is missing', async () => {
      await expect(
        pipe.transform(
          {},
          { type: 'query', metatype: PersonalRecordsQueryDto },
        ),
      ).rejects.toThrow(ValidationException);
    });

    it('should throw ValidationException with UNSUPPORTED_UNIT code when unit is unsupported', async () => {
      try {
        await pipe.transform(
          { exerciseName: 'Bench Press', unit: 'oz' },
          { type: 'query', metatype: PersonalRecordsQueryDto },
        );
        fail('Expected transform to throw ValidationException');
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationException);
        const ex = err as ValidationException;
        expect(ex.getStatus()).toBe(400);
        expect(ex.code).toBe(ErrorCode.UNSUPPORTED_UNIT);
        expect(ex.message).toContain("Unsupported weight unit 'oz'");
      }
    });

    it('should throw ValidationException with 400 when comparison dates are incomplete', async () => {
      try {
        await pipe.transform(
          {
            exerciseName: 'Bench Press',
            compareFrom: '2026-09-01T00:00:00.000Z',
          },
          { type: 'query', metatype: PersonalRecordsQueryDto },
        );
        fail('Expected transform to throw ValidationException');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationException);
        const valEx = error as ValidationException;
        expect(valEx.getStatus()).toBe(400);
        expect(valEx.code).toBe(ErrorCode.VALIDATION_ERROR);
        expect(valEx.details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              field: 'compareFrom',
              issue: "'compareFrom' requires 'compareTo' to also be specified.",
            }),
          ]),
        );
      }
    });

    it('should successfully transform valid query payload', async () => {
      const result = (await pipe.transform(
        {
          exerciseName: '   Barbell Bench Press   ',
          unit: 'lb',
          from: '2026-10-01',
          to: '2026-10-31',
        },
        { type: 'query', metatype: PersonalRecordsQueryDto },
      )) as PersonalRecordsQueryDto;

      expect(result).toBeInstanceOf(PersonalRecordsQueryDto);
      expect(result.exerciseName).toBe('Barbell Bench Press');
      expect(result.unit).toBe('lb');
      expect(result.from).toBe('2026-10-01T00:00:00.000Z');
      expect(result.to).toBe('2026-10-31T23:59:59.999Z');
    });
  });
});
