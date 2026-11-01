import { Prisma } from '@prisma/client';

export interface PreparedWorkoutSet {
  readonly setNumber: number;
  readonly reps: number;
  readonly originalWeight: number;
  readonly originalUnit: string;
  readonly weightKg: number;
  readonly volumeKg: number;
  readonly estimated1rmKg: number;
}

export interface PreparedWorkoutEntry {
  readonly date: string | Date;
  readonly exerciseName: string;
  readonly exerciseNameNorm: string;
  readonly muscleGroup: string | null;
  readonly exerciseCatalogId?: string | null;
  readonly sets: readonly PreparedWorkoutSet[];
}

export type WorkoutEntryWithSets = Prisma.WorkoutEntryGetPayload<{
  include: { sets: true };
}>;

export interface FindHistoryFilter {
  readonly exerciseName?: string;
  readonly fromDate?: Date;
  readonly toDate?: Date;
  readonly muscleGroup?: string;
  readonly limit: number;
  readonly cursor?: { readonly performedAt: Date; readonly id: string };
}

export type PrType = 'heaviest_set' | 'highest_volume_set' | 'best_1rm_set';

export interface RawPersonalRecordRow {
  readonly pr_type: PrType;
  readonly id: string;
  readonly workout_entry_id: string;
  readonly reps: number;
  readonly original_weight: Prisma.Decimal | number;
  readonly original_unit: string;
  readonly weight_kg: Prisma.Decimal | number;
  readonly volume_kg: Prisma.Decimal | number;
  readonly estimated_1rm_kg: Prisma.Decimal | number;
  readonly performed_at: Date;
}
