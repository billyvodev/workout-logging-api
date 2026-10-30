export interface CanonicalExerciseConfig {
  readonly canonicalName: string;
  readonly displayName: string;
  readonly primaryMuscleGroup: string;
  readonly aliases: readonly string[];
}

export interface KeywordFallbackConfig {
  readonly keyword: string;
  readonly muscleGroup: string;
}

export interface ExerciseMappingsConfig {
  readonly exercises: readonly CanonicalExerciseConfig[];
  readonly keywordFallbacks: readonly KeywordFallbackConfig[];
}

export interface ExerciseResolution {
  readonly canonicalName?: string;
  readonly displayName?: string;
  readonly muscleGroup: string | null;
  readonly catalogId?: string;
}
