import {
  calculateSetVolume,
  calculateEpley1Rm,
  roundToPrecision,
} from './workout-math.util';

describe('WorkoutMathUtil', () => {
  describe('roundToPrecision', () => {
    it('should round numbers to specified decimal places without floating drift', () => {
      expect(roundToPrecision(102.05828, 4)).toBe(102.0583);
      expect(roundToPrecision(102.05828, 2)).toBe(102.06);
      expect(roundToPrecision(1.005, 2)).toBe(1.01);
      expect(roundToPrecision(NaN)).toBe(0);
      expect(roundToPrecision(Infinity)).toBe(0);
    });
  });

  describe('calculateSetVolume', () => {
    it('should calculate volume = reps * weight', () => {
      // 8 reps at 102.05828325 kg = 816.466266 -> 816.4663 (4 decimals) or 816.47 (2 decimals)
      expect(calculateSetVolume(8, 102.05828325, 4)).toBe(816.4663);
      expect(calculateSetVolume(8, 102.05828325, 2)).toBe(816.47);
    });

    it('should match the spec example for Set 2: 6 reps at 235 lb (106.5942 kg)', () => {
      // 6 * 106.59420695 = 639.5652417 -> 639.57 at 2 decimals
      expect(calculateSetVolume(6, 106.59420695, 2)).toBe(639.57);
    });

    it('should return 0 for bodyweight exercises (weight = 0)', () => {
      expect(calculateSetVolume(15, 0)).toBe(0);
    });

    it('should return 0 for non-positive reps or negative weight', () => {
      expect(calculateSetVolume(0, 100)).toBe(0);
      expect(calculateSetVolume(-5, 100)).toBe(0);
      expect(calculateSetVolume(10, -50)).toBe(0);
    });
  });

  describe('calculateEpley1Rm', () => {
    it('should calculate Epley 1RM = weight * (1 + reps / 30)', () => {
      // Set 1 in spec: 8 reps at 225 lb (102.05828325 kg)
      // 1RM = 102.05828325 * (1 + 8/30) = 129.2738 -> 129.27 at 2 decimals
      expect(calculateEpley1Rm(8, 102.05828325, 2)).toBe(129.27);
    });

    it('should match the spec example for Set 2: 6 reps at 235 lb (106.5942 kg)', () => {
      // 1RM = 106.59420695 * (1 + 6/30) = 106.59420695 * 1.2 = 127.913 -> 127.91 at 2 decimals
      expect(calculateEpley1Rm(6, 106.59420695, 2)).toBe(127.91);
    });

    it('should return 0 for bodyweight exercises (weight = 0)', () => {
      expect(calculateEpley1Rm(10, 0)).toBe(0);
    });

    it('should return 0 for non-positive reps or negative weight', () => {
      expect(calculateEpley1Rm(0, 100)).toBe(0);
      expect(calculateEpley1Rm(-1, 100)).toBe(0);
      expect(calculateEpley1Rm(10, -10)).toBe(0);
    });
  });
});
