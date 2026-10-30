import { UnitConversionService } from './unit-conversion.service';
import { UnsupportedUnitException } from '../exceptions';
import { UNIT_REGISTRY } from './unit.registry';

describe('UnitConversionService', () => {
  let service: UnitConversionService;

  beforeEach(() => {
    service = new UnitConversionService();
  });

  describe('isSupported', () => {
    it('should return true for supported units (kg, lb) regardless of case', () => {
      expect(service.isSupported('kg')).toBe(true);
      expect(service.isSupported('KG')).toBe(true);
      expect(service.isSupported('lb')).toBe(true);
      expect(service.isSupported('LB')).toBe(true);
      expect(service.isSupported('  lb  ')).toBe(true);
    });

    it('should return false for unsupported units', () => {
      expect(service.isSupported('oz')).toBe(false);
      expect(service.isSupported('grams')).toBe(false);
      expect(service.isSupported('')).toBe(false);
      expect(service.isSupported(null as unknown as string)).toBe(false);
    });
  });

  describe('getSupportedUnits', () => {
    it('should return all registered unit keys', () => {
      expect(service.getSupportedUnits()).toEqual(Object.keys(UNIT_REGISTRY));
    });
  });

  describe('toKg', () => {
    it('should convert 1 kg to 1 kg with default 4 decimal precision', () => {
      expect(service.toKg(1, 'kg')).toBe(1);
    });

    it('should convert lb to kg using 0.45359237 conversion factor', () => {
      // 225 lb * 0.45359237 = 102.05828325 -> 102.0583
      expect(service.toKg(225, 'lb', 4)).toBe(102.0583);
      // At 2 decimal places -> 102.06
      expect(service.toKg(225, 'lb', 2)).toBe(102.06);
    });

    it('should convert 235 lb to kg accurately', () => {
      // 235 lb * 0.45359237 = 106.59420695 -> 106.5942
      expect(service.toKg(235, 'lb', 4)).toBe(106.5942);
      expect(service.toKg(235, 'lb', 2)).toBe(106.59);
    });

    it('should throw UnsupportedUnitException for unregistered unit', () => {
      expect(() => service.toKg(100, 'grams')).toThrow(
        UnsupportedUnitException,
      );
      try {
        service.toKg(100, 'grams');
      } catch (err) {
        expect(err).toBeInstanceOf(UnsupportedUnitException);
        const exception = err as UnsupportedUnitException;
        expect(exception.message).toContain("Unsupported weight unit 'grams'");
      }
    });
  });

  describe('fromKg', () => {
    it('should convert kg to kg with specified precision', () => {
      expect(service.fromKg(102.0583, 'kg', 2)).toBe(102.06);
    });

    it('should convert kg to lb accurately', () => {
      // 102.05828325 kg / 0.45359237 = 225 lb
      expect(service.fromKg(102.05828325, 'lb', 2)).toBe(225);
    });

    it('should throw UnsupportedUnitException for unregistered unit', () => {
      expect(() => service.fromKg(100, 'stone')).toThrow(
        UnsupportedUnitException,
      );
    });
  });

  describe('convert (Zero-Drift Preservation)', () => {
    it('should return exact original weight without floating-point drift when source and target match', () => {
      expect(service.convert(225, 'lb', 'lb')).toBe(225);
      expect(service.convert(100, 'kg', 'kg')).toBe(100);
      expect(service.convert(225.5, 'lb', 'LB')).toBe(225.5);
    });

    it('should convert between different units', () => {
      expect(service.convert(225, 'lb', 'kg', 2)).toBe(102.06);
      expect(service.convert(102.05828325, 'kg', 'lb', 2)).toBe(225);
    });
  });

  describe('round', () => {
    it('should handle edge cases like EPSILON and non-finite numbers', () => {
      expect(service.round(1.005, 2)).toBe(1.01);
      expect(service.round(NaN)).toBe(0);
      expect(service.round(Infinity)).toBe(0);
    });
  });
});
