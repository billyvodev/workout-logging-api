import { WeightUnit } from '../constants';

export interface UnitStrategy {
  readonly symbol: string;
  readonly toKgFactor: number;
  readonly name?: string;
}

/**
 * Centralized, extensible registry of supported weight units and their conversion factors to kg.
 *
 * To support a new weight unit (e.g. 'stone'), add a single entry here:
 * stone: { symbol: 'stone', toKgFactor: 6.35029318 }
 */
export const UNIT_REGISTRY: Readonly<Record<string, UnitStrategy>> = {
  [WeightUnit.KG]: {
    symbol: WeightUnit.KG,
    toKgFactor: 1.0,
    name: 'Kilogram',
  },
  [WeightUnit.LB]: {
    symbol: WeightUnit.LB,
    toKgFactor: 0.45359237,
    name: 'Pound',
  },
};

/**
 * Returns whether a given string is a supported weight unit (case-insensitive).
 */
export function isSupportedUnit(unit: string): boolean {
  if (!unit || typeof unit !== 'string') {
    return false;
  }
  const normalized = unit.trim().toLowerCase();
  return normalized in UNIT_REGISTRY;
}

/**
 * Returns an array of supported unit symbols.
 */
export function getSupportedUnits(): string[] {
  return Object.keys(UNIT_REGISTRY);
}

/**
 * Retrieves the UnitStrategy for the specified unit, or undefined if unsupported.
 */
export function getUnitStrategy(unit: string): UnitStrategy | undefined {
  if (!unit || typeof unit !== 'string') {
    return undefined;
  }
  return UNIT_REGISTRY[unit.trim().toLowerCase()];
}
