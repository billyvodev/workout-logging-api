import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Accurate rounding utility matching src/common/utils/workout-math.util.ts
function roundToPrecision(value: number, decimals = 4): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

interface ExerciseConfig {
  canonicalName: string;
  displayName: string;
  primaryMuscleGroup: string;
  aliases: string[];
}

interface ExerciseMappingFile {
  exercises: ExerciseConfig[];
}

interface SeedCatalogItem {
  id: string;
  canonicalName: string;
  displayName: string;
  primaryMuscleGroup: string;
  aliases: string[];
}

const POWER_USER_ID = 'benchmark_power_user';
const POWER_USER_ENTRIES_COUNT = 50_000;
const TENANT_USERS_COUNT = 100;
const TENANT_ENTRIES_PER_USER = 100;

const ENTRY_BATCH_SIZE = 2_000;
const SET_BATCH_SIZE = 4_000;

const LB_TO_KG_FACTOR = 0.45359237;

// Date range: 2024-01-01 to 2026-11-01 (approx 3 years)
const START_DATE = new Date('2024-01-01T00:00:00.000Z').getTime();
const END_DATE = new Date('2026-11-01T00:00:00.000Z').getTime();

/**
 * Generates an ISO timestamp evenly or pseudo-randomly distributed across the range.
 */
function getRandomPerformedAt(index: number, total: number): Date {
  const progressRatio = index / total;
  const baseTime = START_DATE + (END_DATE - START_DATE) * progressRatio;
  // Add jitter of +/- 12 hours
  const jitterMs = (Math.random() - 0.5) * 24 * 60 * 60 * 1000;
  const clampedTime = Math.max(
    START_DATE,
    Math.min(END_DATE, baseTime + jitterMs),
  );
  return new Date(clampedTime);
}

async function loadAndSyncExerciseCatalog(
  prisma: PrismaClient,
): Promise<SeedCatalogItem[]> {
  const configPath = path.resolve(
    __dirname,
    '../config/exercise-mappings.json',
  );
  if (!fs.existsSync(configPath)) {
    throw new Error(`Exercise mapping file not found at: ${configPath}`);
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = JSON.parse(raw) as ExerciseMappingFile;

  console.log(
    `[Seed] Syncing ${parsed.exercises.length} exercises into exercise_catalog...`,
  );

  const catalogItems: SeedCatalogItem[] = [];

  for (const ex of parsed.exercises) {
    const record = await prisma.exerciseCatalog.upsert({
      where: { canonicalName: ex.canonicalName.toLowerCase() },
      update: {
        displayName: ex.displayName,
        primaryMuscleGroup: ex.primaryMuscleGroup.toLowerCase(),
        aliases: ex.aliases.map((a) => a.toLowerCase()),
      },
      create: {
        canonicalName: ex.canonicalName.toLowerCase(),
        displayName: ex.displayName,
        primaryMuscleGroup: ex.primaryMuscleGroup.toLowerCase(),
        aliases: ex.aliases.map((a) => a.toLowerCase()),
      },
    });

    catalogItems.push({
      id: record.id,
      canonicalName: record.canonicalName,
      displayName: record.displayName,
      primaryMuscleGroup: record.primaryMuscleGroup,
      aliases: record.aliases,
    });
  }

  return catalogItems;
}

async function cleanBenchmarkData(prisma: PrismaClient): Promise<void> {
  console.log('[Seed] Cleaning existing benchmark data...');
  const deletedEntries = await prisma.$executeRawUnsafe(`
    DELETE FROM workout_entries 
    WHERE user_id = '${POWER_USER_ID}' 
       OR user_id LIKE 'benchmark_tenant_%'
  `);
  console.log(
    `[Seed] Cleaned ${deletedEntries} existing benchmark workout entries.`,
  );
}

interface RawEntryData {
  id: string;
  userId: string;
  exerciseName: string;
  exerciseNameNorm: string;
  exerciseCatalogId: string;
  muscleGroup: string;
  performedAt: Date;
  idempotencyKey: string | null;
  createdAt: Date;
}

interface RawSetData {
  id: string;
  workoutEntryId: string;
  userId: string;
  exerciseNameNorm: string;
  performedAt: Date;
  setNumber: number;
  reps: number;
  originalWeight: Prisma.Decimal;
  originalUnit: string;
  weightKg: Prisma.Decimal;
  volumeKg: Prisma.Decimal;
  estimated1rmKg: Prisma.Decimal;
}

async function flushBatches(
  prisma: PrismaClient,
  entries: RawEntryData[],
  sets: RawSetData[],
): Promise<void> {
  if (entries.length === 0) return;

  // Insert workout_entries in chunks
  for (let i = 0; i < entries.length; i += ENTRY_BATCH_SIZE) {
    const chunk = entries.slice(i, i + ENTRY_BATCH_SIZE);
    await prisma.workoutEntry.createMany({
      data: chunk,
    });
  }

  // Insert workout_sets in chunks
  for (let j = 0; j < sets.length; j += SET_BATCH_SIZE) {
    const chunk = sets.slice(j, j + SET_BATCH_SIZE);
    await prisma.workoutSet.createMany({
      data: chunk,
    });
  }
}

async function seedUserEntries(
  prisma: PrismaClient,
  catalog: SeedCatalogItem[],
  userId: string,
  totalEntries: number,
  label: string,
): Promise<{ totalEntries: number; totalSets: number }> {
  console.log(
    `\n[Seed] Generating ${totalEntries.toLocaleString()} entries for ${label} (${userId})...`,
  );
  const startTime = Date.now();

  let entryBuffer: RawEntryData[] = [];
  let setBuffer: RawSetData[] = [];
  let totalSetsCount = 0;

  for (let i = 0; i < totalEntries; i++) {
    const entryId = crypto.randomUUID();
    const performedAt = getRandomPerformedAt(i, totalEntries);

    // Pick random catalog exercise
    const catalogItem = catalog[Math.floor(Math.random() * catalog.length)];

    // Randomly use display name or one of its aliases
    const namePool = [catalogItem.displayName, ...catalogItem.aliases];
    const exerciseName = namePool[Math.floor(Math.random() * namePool.length)];

    entryBuffer.push({
      id: entryId,
      userId,
      exerciseName,
      exerciseNameNorm: catalogItem.canonicalName,
      exerciseCatalogId: catalogItem.id,
      muscleGroup: catalogItem.primaryMuscleGroup,
      performedAt,
      idempotencyKey: null,
      createdAt: performedAt,
    });

    // Generate 3 to 5 sets per entry (average 4 sets)
    const setsCount = 3 + Math.floor(Math.random() * 3); // 3, 4, or 5
    const useLb = Math.random() > 0.5;
    const unit = useLb ? 'lb' : 'kg';

    // Base weight progression for the exercise
    const baseWeight = useLb
      ? 95 + Math.floor(Math.random() * 25) * 5 // 95 - 220 lb
      : 40 + Math.floor(Math.random() * 20) * 2.5; // 40 - 90 kg

    for (let s = 1; s <= setsCount; s++) {
      const setId = crypto.randomUUID();
      const reps = Math.floor(Math.random() * 10) + 3; // 3 to 12 reps
      // Sets get progressively heavier or vary slightly
      const weightDelta = (s - 1) * (useLb ? 5 : 2.5);
      const originalWeight = roundToPrecision(baseWeight + weightDelta, 2);

      const weightKg = useLb
        ? roundToPrecision(originalWeight * LB_TO_KG_FACTOR, 4)
        : roundToPrecision(originalWeight, 4);

      const volumeKg = roundToPrecision(reps * weightKg, 4);
      const estimated1rmKg = roundToPrecision(weightKg * (1 + reps / 30), 4);

      setBuffer.push({
        id: setId,
        workoutEntryId: entryId,
        userId,
        exerciseNameNorm: catalogItem.canonicalName,
        performedAt,
        setNumber: s,
        reps,
        originalWeight: new Prisma.Decimal(originalWeight),
        originalUnit: unit,
        weightKg: new Prisma.Decimal(weightKg),
        volumeKg: new Prisma.Decimal(volumeKg),
        estimated1rmKg: new Prisma.Decimal(estimated1rmKg),
      });

      totalSetsCount++;
    }

    // Flush to DB when buffer exceeds threshold
    if (entryBuffer.length >= ENTRY_BATCH_SIZE) {
      await flushBatches(prisma, entryBuffer, setBuffer);
      entryBuffer = [];
      setBuffer = [];

      const progress = (((i + 1) / totalEntries) * 100).toFixed(1);
      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stdout.write(
        `\r[Seed] Progress: ${progress}% (${(i + 1).toLocaleString()} / ${totalEntries.toLocaleString()} entries) - ${elapsedSec}s elapsed`,
      );
    }
  }

  // Flush remaining records
  if (entryBuffer.length > 0) {
    await flushBatches(prisma, entryBuffer, setBuffer);
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(
    `\n[Seed] Finished ${label}: ${totalEntries.toLocaleString()} entries, ${totalSetsCount.toLocaleString()} sets in ${durationSec}s.`,
  );

  return { totalEntries, totalSets: totalSetsCount };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cleanOnly = args.includes('--clean-only');
  const noClean = args.includes('--no-clean');
  const scaleOnly = args.includes('--scale-only');
  const tenantsOnly = args.includes('--tenants-only');

  const connectionString =
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@127.0.0.1:5432/workout_db?schema=public';
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    await prisma.$connect();
    console.log('[Seed] Connected to database:', connectionString);

    if (cleanOnly) {
      await cleanBenchmarkData(prisma);
      console.log('[Seed] Clean completed. Exiting.');
      return;
    }

    if (!noClean) {
      await cleanBenchmarkData(prisma);
    }

    const catalog = await loadAndSyncExerciseCatalog(prisma);

    const overallStart = Date.now();
    let totalEntries = 0;
    let totalSets = 0;

    // 1. Seed Power User (50,000 entries)
    if (!tenantsOnly) {
      const powerStats = await seedUserEntries(
        prisma,
        catalog,
        POWER_USER_ID,
        POWER_USER_ENTRIES_COUNT,
        'Power User',
      );
      totalEntries += powerStats.totalEntries;
      totalSets += powerStats.totalSets;
    }

    // 2. Seed 100 Multi-tenant Users (100 entries each = 10,000 entries)
    if (!scaleOnly) {
      console.log(
        `\n[Seed] Generating baseline data for ${TENANT_USERS_COUNT} multi-tenant users...`,
      );
      for (let t = 1; t <= TENANT_USERS_COUNT; t++) {
        const tenantId = `benchmark_tenant_${t}`;
        const stats = await seedUserEntries(
          prisma,
          catalog,
          tenantId,
          TENANT_ENTRIES_PER_USER,
          `Tenant ${t}/${TENANT_USERS_COUNT}`,
        );
        totalEntries += stats.totalEntries;
        totalSets += stats.totalSets;
      }
    }

    // Verification summary
    console.log('\n========================================');
    console.log('[Seed] VERIFICATION SUMMARY:');
    const powerEntriesInDb = await prisma.workoutEntry.count({
      where: { userId: POWER_USER_ID },
    });
    const powerSetsInDb = await prisma.workoutSet.count({
      where: { userId: POWER_USER_ID },
    });
    const totalEntriesInDb = await prisma.workoutEntry.count();
    const totalSetsInDb = await prisma.workoutSet.count();

    console.log(
      `- Seeded In-Memory:       ${totalEntries.toLocaleString()} entries, ${totalSets.toLocaleString()} sets`,
    );
    console.log(
      `- Power User Entries in DB: ${powerEntriesInDb.toLocaleString()}`,
    );
    console.log(
      `- Power User Sets in DB:    ${powerSetsInDb.toLocaleString()}`,
    );
    console.log(
      `- Total Entries in DB:     ${totalEntriesInDb.toLocaleString()}`,
    );
    console.log(`- Total Sets in DB:        ${totalSetsInDb.toLocaleString()}`);
    console.log(
      `- Total Time:              ${((Date.now() - overallStart) / 1000).toFixed(2)}s`,
    );
    console.log('========================================\n');
  } catch (error) {
    console.error('[Seed] Error during seeding:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
