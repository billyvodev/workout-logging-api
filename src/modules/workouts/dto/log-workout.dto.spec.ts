import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LogSetDto } from './log-set.dto';
import { LogWorkoutEntryDto } from './log-workout-entry.dto';
import { LogWorkoutDto } from './log-workout.dto';

describe('Workout DTOs Validation', () => {
  describe('LogSetDto', () => {
    it('should validate a valid set successfully', async () => {
      const dto = plainToInstance(LogSetDto, {
        reps: 8,
        weight: 225,
        unit: 'lb',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should allow weight 0 for bodyweight exercises', async () => {
      const dto = plainToInstance(LogSetDto, {
        reps: 10,
        weight: 0,
        unit: 'kg',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject negative weights', async () => {
      const dto = plainToInstance(LogSetDto, {
        reps: 10,
        weight: -5,
        unit: 'kg',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints?.min).toBeDefined();
    });

    it('should reject non-integer reps or reps <= 0', async () => {
      const dtoZero = plainToInstance(LogSetDto, {
        reps: 0,
        weight: 100,
        unit: 'kg',
      });
      const errorsZero = await validate(dtoZero);
      expect(errorsZero.length).toBeGreaterThan(0);

      const dtoDecimal = plainToInstance(LogSetDto, {
        reps: 5.5,
        weight: 100,
        unit: 'kg',
      });
      const errorsDecimal = await validate(dtoDecimal);
      expect(errorsDecimal.length).toBeGreaterThan(0);
    });

    it('should reject reps exceeding 1000', async () => {
      const dto = plainToInstance(LogSetDto, {
        reps: 1001,
        weight: 100,
        unit: 'kg',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject unsupported weight units', async () => {
      const dto = plainToInstance(LogSetDto, {
        reps: 8,
        weight: 100,
        unit: 'oz',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints?.isSupportedUnit).toContain(
        "Unsupported weight unit 'oz'",
      );
    });

    it('should reject weight with more than 2 decimal places', async () => {
      const dto = plainToInstance(LogSetDto, {
        reps: 8,
        weight: 100.123,
        unit: 'kg',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('LogWorkoutEntryDto', () => {
    it('should validate a valid workout entry', async () => {
      const dto = plainToInstance(LogWorkoutEntryDto, {
        date: '2026-10-29T10:30:00Z',
        exerciseName: 'Barbell Bench Press',
        sets: [{ reps: 8, weight: 100, unit: 'kg' }],
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject invalid date format', async () => {
      const dto = plainToInstance(LogWorkoutEntryDto, {
        date: 'not-a-date',
        exerciseName: 'Barbell Bench Press',
        sets: [{ reps: 8, weight: 100, unit: 'kg' }],
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('date');
    });

    it('should reject empty or whitespace exerciseName', async () => {
      const dto = plainToInstance(LogWorkoutEntryDto, {
        date: '2026-10-29T10:30:00Z',
        exerciseName: '   ',
        sets: [{ reps: 8, weight: 100, unit: 'kg' }],
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('exerciseName');
    });

    it('should reject empty sets array', async () => {
      const dto = plainToInstance(LogWorkoutEntryDto, {
        date: '2026-10-29T10:30:00Z',
        exerciseName: 'Barbell Bench Press',
        sets: [],
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('sets');
    });
  });

  describe('LogWorkoutDto (Single & Bulk modes)', () => {
    it('should accept and normalize single exercise payload', async () => {
      const dto = plainToInstance(LogWorkoutDto, {
        date: '2026-10-29T10:30:00Z',
        exerciseName: 'Barbell Bench Press',
        sets: [
          { reps: 8, weight: 225, unit: 'lb' },
          { reps: 6, weight: 235, unit: 'lb' },
        ],
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.isBulk()).toBe(false);

      const entries = dto.toEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].exerciseName).toBe('Barbell Bench Press');
      expect(entries[0].sets).toHaveLength(2);
    });

    it('should accept and normalize bulk exercise payload', async () => {
      const dto = plainToInstance(LogWorkoutDto, {
        entries: [
          {
            date: '2026-10-29T10:30:00Z',
            exerciseName: 'Barbell Bench Press',
            sets: [{ reps: 8, weight: 225, unit: 'lb' }],
          },
          {
            date: '2026-10-29T10:55:00Z',
            exerciseName: 'Incline Dumbbell Press',
            sets: [{ reps: 10, weight: 35, unit: 'kg' }],
          },
        ],
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.isBulk()).toBe(true);

      const entries = dto.toEntries();
      expect(entries).toHaveLength(2);
      expect(entries[0].exerciseName).toBe('Barbell Bench Press');
      expect(entries[1].exerciseName).toBe('Incline Dumbbell Press');
    });

    it('should reject empty object payload', async () => {
      const dto = plainToInstance(LogWorkoutDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject empty bulk entries array', async () => {
      const dto = plainToInstance(LogWorkoutDto, {
        entries: [],
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'entries')).toBe(true);
    });

    it('should propagate nested set validation errors in bulk mode', async () => {
      const dto = plainToInstance(LogWorkoutDto, {
        entries: [
          {
            date: '2026-10-29T10:30:00Z',
            exerciseName: 'Barbell Bench Press',
            sets: [{ reps: 0, weight: -50, unit: 'invalid' }],
          },
        ],
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
