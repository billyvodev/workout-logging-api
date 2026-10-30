import { Injectable } from '@nestjs/common';
import { BASE_WEIGHT_UNIT } from '../constants';
import {
  UNIT_REGISTRY,
  isSupportedUnit,
  getSupportedUnits,
  getUnitStrategy,
} from './unit.registry';
import { UnsupportedUnitException } from '../exceptions';

@Injectable()
export class UnitConversionService {
  /**
   * Accurate decimal rounding helper that avoids floating-point precision artifacts (e.g. 1.005 -> 1.01).
   */
  round(value: number, decimals = 2): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
    const factor = Math.pow(10, decimals);
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  /**
   * Converts a given weight in the specified unit to kilograms (kg).
   * Stored at 4 decimal places for internal database precision.
   */
  toKg(weight: number, fromUnit: string, precision = 4): number {
    const normalizedUnit = fromUnit?.trim().toLowerCase();
    const strategy = getUnitStrategy(normalizedUnit);

    if (!strategy) {
      throw new UnsupportedUnitException(fromUnit, getSupportedUnits());
    }

    if (normalizedUnit === BASE_WEIGHT_UNIT) {
      return this.round(weight, precision);
    }

    return this.round(weight * strategy.toKgFactor, precision);
  }

  /**
   * Converts a kilogram (kg) value to the target unit.
   * Rounded to 2 decimal places by default for API responses.
   */
  fromKg(weightKg: number, toUnit: string, precision = 2): number {
    const normalizedUnit = toUnit?.trim().toLowerCase();
    const strategy = getUnitStrategy(normalizedUnit);

    if (!strategy) {
      throw new UnsupportedUnitException(toUnit, getSupportedUnits());
    }

    if (normalizedUnit === BASE_WEIGHT_UNIT) {
      return this.round(weightKg, precision);
    }

    return this.round(weightKg / strategy.toKgFactor, precision);
  }

  /**
   * Converts weight from one unit to another.
   * If source and target units match, returns the exact original weight without round-trip drift.
   */
  convert(
    weight: number,
    fromUnit: string,
    toUnit: string,
    precision = 2,
  ): number {
    const normFrom = fromUnit?.trim().toLowerCase();
    const normTo = toUnit?.trim().toLowerCase();

    if (!isSupportedUnit(normFrom)) {
      throw new UnsupportedUnitException(fromUnit, getSupportedUnits());
    }

    if (!isSupportedUnit(normTo)) {
      throw new UnsupportedUnitException(toUnit, getSupportedUnits());
    }

    // Zero-drift preservation rule: return original weight directly if units match
    if (normFrom === normTo) {
      return this.round(weight, precision);
    }

    const inKg = weight * UNIT_REGISTRY[normFrom].toKgFactor;
    return this.round(inKg / UNIT_REGISTRY[normTo].toKgFactor, precision);
  }

  /**
   * Checks whether the specified unit is supported.
   */
  isSupported(unit: string): boolean {
    return isSupportedUnit(unit);
  }

  /**
   * Returns a list of all currently supported unit symbols.
   */
  getSupportedUnits(): string[] {
    return getSupportedUnits();
  }
}
