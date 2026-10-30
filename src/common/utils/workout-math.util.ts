/**
 * Accurate decimal rounding helper that avoids floating-point precision artifacts.
 */
export function roundToPrecision(value: number, decimals = 4): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Calculates set volume: volume = reps * weight.
 *
 * @param reps Positive number of repetitions completed.
 * @param weight Normalized weight lifted (e.g. In kg). 0 for bodyweight exercises.
 * @param precision Decimal places to round the result (default: 4 for database storage).
 */
export function calculateSetVolume(
  reps: number,
  weight: number,
  precision = 4,
): number {
  if (
    reps <= 0 ||
    weight <= 0 ||
    !Number.isFinite(reps) ||
    !Number.isFinite(weight)
  ) {
    return 0;
  }
  return roundToPrecision(reps * weight, precision);
}

/**
 * Calculates estimated One-Rep Maximum (1RM) using the standard Epley formula:
 * 1RM = weight * (1 + reps / 30)
 *
 * For bodyweight exercises (weight = 0) or non-positive reps, returns 0.
 *
 * @param reps Positive number of repetitions completed.
 * @param weight Normalized weight lifted (e.g. In kg).
 * @param precision Decimal places to round the result (default: 4 for database storage).
 */
export function calculateEpley1Rm(
  reps: number,
  weight: number,
  precision = 4,
): number {
  if (
    reps <= 0 ||
    weight <= 0 ||
    !Number.isFinite(reps) ||
    !Number.isFinite(weight)
  ) {
    return 0;
  }
  const epley = weight * (1 + reps / 30);
  return roundToPrecision(epley, precision);
}
