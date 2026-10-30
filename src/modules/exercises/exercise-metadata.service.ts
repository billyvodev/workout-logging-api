import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma';
import {
  CanonicalExerciseConfig,
  ExerciseMappingsConfig,
  ExerciseResolution,
  KeywordFallbackConfig,
} from './interfaces/exercise-mapping.interface';

@Injectable()
export class ExerciseMetadataService implements OnModuleInit {
  private readonly logger = new Logger(ExerciseMetadataService.name);

  private readonly canonicalMap = new Map<string, CanonicalExerciseConfig>();
  private readonly aliasMap = new Map<string, CanonicalExerciseConfig>();
  private readonly keywordFallbacks: KeywordFallbackConfig[] = [];
  private readonly catalogIdMap = new Map<string, string>();
  private readonly exercisesList: CanonicalExerciseConfig[] = [];
  private loaded = false;

  constructor(@Optional() private readonly prisma?: PrismaService) {
    try {
      this.loadConfig();
    } catch (error) {
      this.logger.warn(
        `Failed to load exercise mappings during instantiation: ${(error as Error).message}`,
      );
    }
  }

  async onModuleInit(): Promise<void> {
    if (!this.loaded) {
      this.loadConfig();
    }

    if (this.prisma) {
      await this.syncWithDatabase();
    }
  }

  /**
   * Resolves the primary muscle group and canonical metadata for a given exercise name.
   *
   * Resolution Order:
   * 1. Trim & Lowercase normalization
   * 2. Exact match on canonical exercise name
   * 3. Exact match on known aliases
   * 4. Sequential fallback keyword search
   * 5. Return null muscleGroup if unmatched (custom exercises are non-blocking)
   */
  resolveMuscleGroup(exerciseName: string): ExerciseResolution {
    if (!exerciseName || typeof exerciseName !== 'string') {
      return { muscleGroup: null };
    }

    const normalized = exerciseName.trim().toLowerCase();
    if (!normalized) {
      return { muscleGroup: null };
    }

    // 1. Exact canonical name match
    const canonicalMatch = this.canonicalMap.get(normalized);
    if (canonicalMatch) {
      return {
        canonicalName: canonicalMatch.canonicalName,
        displayName: canonicalMatch.displayName,
        muscleGroup: canonicalMatch.primaryMuscleGroup,
        catalogId: this.catalogIdMap.get(
          canonicalMatch.canonicalName.toLowerCase(),
        ),
      };
    }

    // 2. Alias match
    const aliasMatch = this.aliasMap.get(normalized);
    if (aliasMatch) {
      return {
        canonicalName: aliasMatch.canonicalName,
        displayName: aliasMatch.displayName,
        muscleGroup: aliasMatch.primaryMuscleGroup,
        catalogId: this.catalogIdMap.get(
          aliasMatch.canonicalName.toLowerCase(),
        ),
      };
    }

    // 3. Keyword fallback scan
    for (const fallback of this.keywordFallbacks) {
      if (normalized.includes(fallback.keyword)) {
        return {
          muscleGroup: fallback.muscleGroup,
        };
      }
    }

    // 4. Graceful fallback for unknown exercises
    return {
      muscleGroup: null,
    };
  }

  /**
   * Loads and caches the exercise catalog and fallback mappings.
   */
  loadConfig(customConfig?: ExerciseMappingsConfig, customPath?: string): void {
    const config = customConfig ?? this.readConfigFile(customPath);

    this.canonicalMap.clear();
    this.aliasMap.clear();
    this.keywordFallbacks.length = 0;
    this.exercisesList.length = 0;

    for (const exercise of config.exercises) {
      const normalizedCanonical = exercise.canonicalName.trim().toLowerCase();
      const canonicalEntry: CanonicalExerciseConfig = {
        canonicalName: normalizedCanonical,
        displayName: exercise.displayName.trim(),
        primaryMuscleGroup: exercise.primaryMuscleGroup.trim().toLowerCase(),
        aliases: exercise.aliases.map((a) => a.trim().toLowerCase()),
      };

      this.exercisesList.push(canonicalEntry);
      this.canonicalMap.set(normalizedCanonical, canonicalEntry);

      for (const alias of canonicalEntry.aliases) {
        this.aliasMap.set(alias, canonicalEntry);
      }
    }

    for (const fallback of config.keywordFallbacks) {
      this.keywordFallbacks.push({
        keyword: fallback.keyword.trim().toLowerCase(),
        muscleGroup: fallback.muscleGroup.trim().toLowerCase(),
      });
    }

    this.loaded = true;
    this.logger.log(
      `Loaded ${this.exercisesList.length} canonical exercises and ${this.keywordFallbacks.length} keyword fallbacks.`,
    );
  }

  /**
   * Synchronizes externalized configuration with the PostgreSQL exercises_catalog table.
   */
  async syncWithDatabase(): Promise<void> {
    if (!this.prisma) {
      return;
    }

    try {
      for (const exercise of this.exercisesList) {
        const record = await this.prisma.exerciseCatalog.upsert({
          where: { canonicalName: exercise.canonicalName },
          update: {
            displayName: exercise.displayName,
            primaryMuscleGroup: exercise.primaryMuscleGroup,
            aliases: [...exercise.aliases],
          },
          create: {
            canonicalName: exercise.canonicalName,
            displayName: exercise.displayName,
            primaryMuscleGroup: exercise.primaryMuscleGroup,
            aliases: [...exercise.aliases],
          },
        });
        this.catalogIdMap.set(exercise.canonicalName, record.id);
      }
      this.logger.log(
        `Synchronized ${this.exercisesList.length} exercises into exercises_catalog table.`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to sync exercise catalog with database: ${(error as Error).message}`,
      );
    }
  }

  getAllCanonicalExercises(): readonly CanonicalExerciseConfig[] {
    return this.exercisesList;
  }

  getKeywordFallbacks(): readonly KeywordFallbackConfig[] {
    return this.keywordFallbacks;
  }

  getExerciseByCanonicalName(
    canonicalName: string,
  ): CanonicalExerciseConfig | undefined {
    return this.canonicalMap.get(canonicalName.trim().toLowerCase());
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  private readConfigFile(customPath?: string): ExerciseMappingsConfig {
    const candidatePaths = [
      customPath,
      process.env.EXERCISE_MAPPINGS_PATH,
      path.resolve(process.cwd(), 'config', 'exercise-mappings.json'),
      path.resolve(__dirname, '../../../config/exercise-mappings.json'),
      path.resolve(__dirname, '../../config/exercise-mappings.json'),
    ].filter((p): p is string => Boolean(p));

    for (const targetPath of candidatePaths) {
      if (fs.existsSync(targetPath)) {
        const rawContent = fs.readFileSync(targetPath, 'utf8');
        return JSON.parse(rawContent) as ExerciseMappingsConfig;
      }
    }

    throw new Error(
      `Exercise mappings config file not found. Checked candidate paths: ${candidatePaths.join(', ')}`,
    );
  }
}
