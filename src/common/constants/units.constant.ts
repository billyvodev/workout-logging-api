export const WeightUnit = {
  KG: 'kg',
  LB: 'lb',
} as const;

export type WeightUnitType = (typeof WeightUnit)[keyof typeof WeightUnit];

/**
 * The canonical internal unit used for database normalization, storage, and cross-set comparisons.
 */
export const BASE_WEIGHT_UNIT = WeightUnit.KG;

/**
 * The default unit used for API response conversions when no specific unit is requested.
 */
export const DEFAULT_WEIGHT_UNIT = WeightUnit.KG;
