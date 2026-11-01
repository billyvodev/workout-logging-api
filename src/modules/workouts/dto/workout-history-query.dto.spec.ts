import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CustomValidationPipe,
  ErrorCode,
  ValidationException,
} from '../../../common';
import {
  WorkoutHistoryQueryDto,
  normalizeFromDate,
  normalizeToDate,
} from './workout-history-query.dto';

describe('WorkoutHistoryQueryDto Validation', () => {
  let pipe: CustomValidationPipe;

  beforeEach(() => {
    pipe = new CustomValidationPipe();
  });

  describe('Default Values & Clean Input', () => {
    it('should validate an empty query and set default values', async () => {
      const dto = plainToInstance(WorkoutHistoryQueryDto, {});
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
      expect(dto.unit).toBe('kg');
      expect(dto.limit).toBe(20);
      expect(dto.exerciseName).toBeUndefined();
      expect(dto.from).toBeUndefined();
      expect(dto.to).toBeUndefined();
      expect(dto.muscleGroup).toBeUndefined();
      expect(dto.cursor).toBeUndefined();
    });

    it('should accept valid query parameters', async () => {
      const dto = plainToInstance(WorkoutHistoryQueryDto, {
        exerciseName: 'Barbell Bench Press',
        from: '2026-10-01T00:00:00.000Z',
        to: '2026-10-31T23:59:59.999Z',
        muscleGroup: 'chest',
        unit: 'lb',
        limit: '15',
        cursor:
          'eyJwZXJmb3JtZWRBdCI6IjIwMjYtMTAtMjlUMTA6MzA6MDAuMDAwWiIsImlkIjoiZW50cnlfMSJ9',
      });
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
      expect(dto.exerciseName).toBe('Barbell Bench Press');
      expect(dto.unit).toBe('lb');
      expect(dto.limit).toBe(15);
      expect(dto.cursor).toBe(
        'eyJwZXJmb3JtZWRBdCI6IjIwMjYtMTAtMjlUMTA6MzA6MDAuMDAwWiIsImlkIjoiZW50cnlfMSJ9',
      );
    });
  });

  describe('Trimming and Transformations', () => {
    it('should trim string inputs and normalize unit to lowercase', async () => {
      const dto = plainToInstance(WorkoutHistoryQueryDto, {
        exerciseName: '   Bench Press   ',
        muscleGroup: '  Chest  ',
        unit: '  LB  ',
        cursor: '  opaque_cursor_token  ',
      });

      expect(dto.exerciseName).toBe('Bench Press');
      expect(dto.muscleGroup).toBe('Chest');
      expect(dto.unit).toBe('lb');
      expect(dto.cursor).toBe('opaque_cursor_token');

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should transform limit from string to number', async () => {
      const dto = plainToInstance(WorkoutHistoryQueryDto, {
        limit: '50',
      });

      expect(typeof dto.limit).toBe('number');
      expect(dto.limit).toBe(50);

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('Date-Only Boundary Normalization', () => {
    it('should expand date-only "from" (YYYY-MM-DD) to 00:00:00.000Z', () => {
      expect(normalizeFromDate('2026-10-01')).toBe('2026-10-01T00:00:00.000Z');
      expect(normalizeFromDate('  2026-10-01  ')).toBe(
        '2026-10-01T00:00:00.000Z',
      );
    });

    it('should expand date-only "to" (YYYY-MM-DD) to 23:59:59.999Z', () => {
      expect(normalizeToDate('2026-10-31')).toBe('2026-10-31T23:59:59.999Z');
      expect(normalizeToDate('  2026-10-31  ')).toBe(
        '2026-10-31T23:59:59.999Z',
      );
    });

    it('should preserve full ISO timestamps without alteration', () => {
      const fullFrom = '2026-10-01T10:30:00.000Z';
      const fullTo = '2026-10-31T18:00:00.000Z';
      expect(normalizeFromDate(fullFrom)).toBe(fullFrom);
      expect(normalizeToDate(fullTo)).toBe(fullTo);
    });

    it('should normalize date-only query params in DTO instance and pass validation', async () => {
      const dto = plainToInstance(WorkoutHistoryQueryDto, {
        from: '2026-10-01',
        to: '2026-10-31',
      });

      expect(dto.from).toBe('2026-10-01T00:00:00.000Z');
      expect(dto.to).toBe('2026-10-31T23:59:59.999Z');

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should allow identical date-only from and to (encompassing single full day)', async () => {
      const dto = plainToInstance(WorkoutHistoryQueryDto, {
        from: '2026-10-15',
        to: '2026-10-15',
      });

      expect(dto.from).toBe('2026-10-15T00:00:00.000Z');
      expect(dto.to).toBe('2026-10-15T23:59:59.999Z');

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('Date Range Constraints (from <= to)', () => {
    it('should reject inverted date range when from is later than to', async () => {
      const dto = plainToInstance(WorkoutHistoryQueryDto, {
        from: '2026-11-01',
        to: '2026-10-01',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);

      const fromError = errors.find((e) => e.property === 'from');
      expect(fromError).toBeDefined();
      expect(fromError?.constraints?.isEarlierThanOrEqualTo).toBe(
        "'from' date must be earlier than or equal to 'to' date.",
      );
    });

    it('should reject inverted timestamps on same day when from is later than to', async () => {
      const dto = plainToInstance(WorkoutHistoryQueryDto, {
        from: '2026-10-15T18:00:00.000Z',
        to: '2026-10-15T09:00:00.000Z',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);

      const fromError = errors.find((e) => e.property === 'from');
      expect(fromError?.constraints?.isEarlierThanOrEqualTo).toBe(
        "'from' date must be earlier than or equal to 'to' date.",
      );
    });

    it('should fail with invalid ISO 8601 format when dates are malformed', async () => {
      const dto = plainToInstance(WorkoutHistoryQueryDto, {
        from: 'invalid-date',
        to: '2026/10/31',
      });

      const errors = await validate(dto);
      const properties = errors.map((e) => e.property);
      expect(properties).toContain('from');
      expect(properties).toContain('to');
    });
  });

  describe('Pagination & Bounds Constraints', () => {
    it('should reject limit less than 1', async () => {
      const dto = plainToInstance(WorkoutHistoryQueryDto, { limit: 0 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('limit');
      expect(errors[0].constraints?.min).toBeDefined();
    });

    it('should reject limit greater than 100', async () => {
      const dto = plainToInstance(WorkoutHistoryQueryDto, { limit: 101 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('limit');
      expect(errors[0].constraints?.max).toBeDefined();
    });

    it('should reject non-integer limit', async () => {
      const dto = plainToInstance(WorkoutHistoryQueryDto, { limit: 15.5 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('limit');
      expect(errors[0].constraints?.isInt).toBeDefined();
    });
  });

  describe('Unit and String Length Validation', () => {
    it('should reject unsupported weight units', async () => {
      const dto = plainToInstance(WorkoutHistoryQueryDto, { unit: 'ounces' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('unit');
      expect(errors[0].constraints?.isSupportedUnit).toContain(
        "Unsupported weight unit 'ounces'",
      );
    });

    it('should reject exerciseName exceeding 150 characters', async () => {
      const dto = plainToInstance(WorkoutHistoryQueryDto, {
        exerciseName: 'a'.repeat(151),
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('exerciseName');
    });

    it('should reject muscleGroup exceeding 50 characters', async () => {
      const dto = plainToInstance(WorkoutHistoryQueryDto, {
        muscleGroup: 'a'.repeat(51),
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('muscleGroup');
    });
  });

  describe('CustomValidationPipe Integration', () => {
    it('should transform and validate query correctly through pipe', async () => {
      const rawQuery = {
        exerciseName: 'bench',
        limit: '10',
        unit: 'lb',
        from: '2026-10-01',
        to: '2026-10-31',
      };

      const result = (await pipe.transform(rawQuery, {
        type: 'query',
        metatype: WorkoutHistoryQueryDto,
      })) as WorkoutHistoryQueryDto;

      expect(result).toBeInstanceOf(WorkoutHistoryQueryDto);
      expect(result.limit).toBe(10);
      expect(result.unit).toBe('lb');
      expect(result.from).toBe('2026-10-01T00:00:00.000Z');
      expect(result.to).toBe('2026-10-31T23:59:59.999Z');
    });

    it('should throw ValidationException with VALIDATION_ERROR on inverted dates', async () => {
      const rawQuery = {
        from: '2026-11-01',
        to: '2026-10-01',
      };

      try {
        await pipe.transform(rawQuery, {
          type: 'query',
          metatype: WorkoutHistoryQueryDto,
        });
        fail('Expected ValidationException to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationException);
        const ex = err as ValidationException;
        expect(ex.getStatus()).toBe(400);
        expect(ex.code).toBe(ErrorCode.VALIDATION_ERROR);
        expect(ex.details).toEqual(
          expect.arrayContaining([
            {
              field: 'from',
              issue: "'from' date must be earlier than or equal to 'to' date.",
            },
          ]),
        );
      }
    });

    it('should throw ValidationException with UNSUPPORTED_UNIT on invalid unit', async () => {
      const rawQuery = {
        unit: 'stones',
      };

      try {
        await pipe.transform(rawQuery, {
          type: 'query',
          metatype: WorkoutHistoryQueryDto,
        });
        fail('Expected ValidationException to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationException);
        const ex = err as ValidationException;
        expect(ex.getStatus()).toBe(400);
        expect(ex.code).toBe(ErrorCode.UNSUPPORTED_UNIT);
        expect(ex.message).toContain("Unsupported weight unit 'stones'");
      }
    });

    it('should reject unwhitelisted page query parameter', async () => {
      const rawQuery = {
        page: 2,
      };

      try {
        await pipe.transform(rawQuery, {
          type: 'query',
          metatype: WorkoutHistoryQueryDto,
        });
        fail('Expected ValidationException to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationException);
        const ex = err as ValidationException;
        expect(ex.getStatus()).toBe(400);
        expect(ex.code).toBe(ErrorCode.VALIDATION_ERROR);
        expect(ex.details?.[0].issue).toContain(
          'property page should not exist',
        );
      }
    });
  });
});
