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
