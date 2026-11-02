import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Types for PostgreSQL EXPLAIN JSON representation
interface PostgresPlanNode {
  'Node Type': string;
  'Relation Name'?: string;
  'Index Name'?: string;
  'Actual Rows'?: number;
  'Actual Total Time'?: number;
  'Shared Hit Blocks'?: number;
  'Shared Read Blocks'?: number;
  'Shared Dirtied Blocks'?: number;
  'Shared Written Blocks'?: number;
  Plans?: PostgresPlanNode[];
}

interface PostgresExplainResult {
  Plan: PostgresPlanNode;
  'Planning Time': number;
  'Execution Time': number;
}

interface PlanAnalysis {
  nodes: {
    nodeType: string;
    relationName?: string;
    indexName?: string;
    actualTime?: number;
  }[];
  usedIndexes: string[];
  seqScans: { relation: string }[];
  joins: string[];
  sharedHit: number;
  sharedRead: number;
  planningTimeMs: number;
  executionTimeMs: number;
}

interface ScenarioDefinition {
  id: string;
  name: string;
  endpoint: string;
  buildSql: (context: TestContext) => string;
  expectedIndexes: string[];
  maxExecutionTimeMs: number;
  assertNoJoins?: boolean;
  assertNoSeqScans?: boolean;
}

interface TestContext {
  powerUserId: string;
  sampleExerciseNorm: string;
  sampleMuscleGroup: string;
  midCursorDate: string;
  midCursorId: string;
  sampleEntryIds: string[];
}

interface ScenarioResult {
  id: string;
  name: string;
  endpoint: string;
  passed: boolean;
  usedIndexes: string[];
  seqScans: string[];
  planningTimeMs: number;
  executionTimeMs: number;
  targetExecutionTimeMs: number;
  bufferHitRatio: number;
  failureReasons: string[];
  textPlan: string;
}

/**
 * Recursively traverses a PostgreSQL JSON plan tree to extract nodes, indexes, buffer stats, and scan types.
 */
function analyzePlanTree(
  planNode: PostgresPlanNode,
  planningTime: number,
  executionTime: number,
): PlanAnalysis {
  const analysis: PlanAnalysis = {
    nodes: [],
    usedIndexes: [],
    seqScans: [],
    joins: [],
    sharedHit: 0,
    sharedRead: 0,
    planningTimeMs: planningTime,
    executionTimeMs: executionTime,
  };

  const walk = (node: PostgresPlanNode) => {
    analysis.nodes.push({
      nodeType: node['Node Type'],
      relationName: node['Relation Name'],
      indexName: node['Index Name'],
      actualTime: node['Actual Total Time'],
    });

    if (node['Shared Hit Blocks']) {
      analysis.sharedHit += node['Shared Hit Blocks'];
    }
    if (node['Shared Read Blocks']) {
      analysis.sharedRead += node['Shared Read Blocks'];
    }

    if (
      node['Index Name'] &&
      !analysis.usedIndexes.includes(node['Index Name'])
    ) {
      analysis.usedIndexes.push(node['Index Name']);
    }

    if (node['Node Type'] === 'Seq Scan') {
      analysis.seqScans.push({ relation: node['Relation Name'] ?? 'unknown' });
    }

    if (
      node['Node Type'].includes('Join') ||
      node['Node Type'] === 'Nested Loop' ||
      node['Node Type'] === 'Hash Join' ||
      node['Node Type'] === 'Merge Join'
    ) {
      analysis.joins.push(node['Node Type']);
    }

    if (node.Plans && Array.isArray(node.Plans)) {
      for (const child of node.Plans) {
        walk(child);
      }
    }
  };

  walk(planNode);
  return analysis;
}

async function prepareTestContext(
  prisma: PrismaClient,
  powerUserId: string,
): Promise<TestContext> {
  // Find a middle entry (~25,000th) to get a realistic cursor point for deep keyset traversal
  const midEntries = await prisma.workoutEntry.findMany({
    where: { userId: powerUserId },
    orderBy: [{ performedAt: 'desc' }, { id: 'desc' }],
    skip: 25_000,
    take: 1,
    select: {
      id: true,
      performedAt: true,
      muscleGroup: true,
      exerciseNameNorm: true,
    },
  });

  if (midEntries.length === 0) {
    throw new Error(
      `No workout entries found for user "${powerUserId}". Please run "npm run seed:benchmark" first.`,
    );
  }

  const sampleEntry = midEntries[0];

  // Fetch 20 entry IDs to simulate eager loading sets
  const recentEntries = await prisma.workoutEntry.findMany({
    where: { userId: powerUserId },
    orderBy: [{ performedAt: 'desc' }, { id: 'desc' }],
    take: 20,
    select: { id: true },
  });

  return {
    powerUserId,
    sampleExerciseNorm: 'barbell bench press',
    sampleMuscleGroup: sampleEntry.muscleGroup ?? 'chest',
    midCursorDate: sampleEntry.performedAt.toISOString(),
    midCursorId: sampleEntry.id,
    sampleEntryIds: recentEntries.map((e) => e.id),
  };
}

async function runPlanVerification(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@127.0.0.1:5432/workout_db?schema=public';

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  console.log(
    '================================================================================',
  );
  console.log(
    'WORKOUT LOGGING API — DATABASE INDEX & EXECUTION PLAN PROFILING (PHASE 2)',
  );
  console.log(
    '================================================================================',
  );
  console.log(`Connecting to: ${connectionString}\n`);

  try {
    await prisma.$connect();

    // 1. Refresh PostgreSQL planner statistics to ensure index decisions are optimal
    console.log('[Phase 2] Updating PostgreSQL table statistics (ANALYZE)...');
    await prisma.$executeRawUnsafe('ANALYZE workout_entries;');
    await prisma.$executeRawUnsafe('ANALYZE workout_sets;');
    await prisma.$executeRawUnsafe('ANALYZE exercises_catalog;');
    console.log('[Phase 2] Statistics updated successfully.\n');

    const powerUserId = 'benchmark_power_user';
    const context = await prepareTestContext(prisma, powerUserId);

    console.log('[Phase 2] Benchmark Context Prepared:');
    console.log(`- Target User:       ${context.powerUserId}`);
    console.log(`- Sample Exercise:   ${context.sampleExerciseNorm}`);
    console.log(
      `- Mid Keyset Cursor: Date=${context.midCursorDate}, ID=${context.midCursorId}`,
    );
    console.log(
      `- Sample Batch Size: ${context.sampleEntryIds.length} entry UUIDs\n`,
    );

    // Define test suites aligned with docs/plans/performance_benchmark_plan.md Suite 1
    const scenarios: ScenarioDefinition[] = [
      {
        id: 'SCENARIO-1A',
        name: 'Workout History — First Page Keyset (user_id, performed_at DESC, id DESC)',
        endpoint: 'GET /api/v1/users/:userId/workouts (First Page)',
        maxExecutionTimeMs: 10.0,
        assertNoSeqScans: true,
        expectedIndexes: ['idx_entries_user_performed_id'],
        buildSql: (ctx) => `
          SELECT id, user_id, exercise_name, exercise_name_norm, muscle_group, performed_at, created_at
          FROM workout_entries
          WHERE user_id = '${ctx.powerUserId}'
          ORDER BY performed_at DESC, id DESC
          LIMIT 21;
        `,
      },
      {
        id: 'SCENARIO-1B',
        name: 'Workout History — Deep Keyset Cursor Seek (performed_at, id) < ($cDate, $cId)',
        endpoint: 'GET /api/v1/users/:userId/workouts (Deep Keyset)',
        maxExecutionTimeMs: 15.0,
        assertNoSeqScans: true,
        expectedIndexes: ['idx_entries_user_performed_id'],
        buildSql: (ctx) => `
          SELECT id, user_id, exercise_name, exercise_name_norm, muscle_group, performed_at, created_at
          FROM workout_entries
          WHERE user_id = '${ctx.powerUserId}'
            AND (performed_at < '${ctx.midCursorDate}'::timestamptz 
                 OR (performed_at = '${ctx.midCursorDate}'::timestamptz AND id < '${ctx.midCursorId}'::uuid))
          ORDER BY performed_at DESC, id DESC
          LIMIT 21;
        `,
      },
      {
        id: 'SCENARIO-1C',
        name: 'Workout History — Filtered by Muscle Group',
        endpoint: 'GET /api/v1/users/:userId/workouts?muscleGroup=...',
        maxExecutionTimeMs: 15.0,
        assertNoSeqScans: true,
        expectedIndexes: [
          'idx_entries_user_muscle_date',
          'idx_entries_user_performed_id',
        ],
        buildSql: (ctx) => `
          SELECT id, user_id, exercise_name, exercise_name_norm, muscle_group, performed_at, created_at
          FROM workout_entries
          WHERE user_id = '${ctx.powerUserId}'
            AND muscle_group = '${ctx.sampleMuscleGroup}'
          ORDER BY performed_at DESC, id DESC
          LIMIT 21;
        `,
      },
      {
        id: 'SCENARIO-1D',
        name: 'Workout History — Partial Text Search (pg_trgm GIN scan)',
        endpoint: 'GET /api/v1/users/:userId/workouts?exerciseName=bench',
        maxExecutionTimeMs: 25.0,
        assertNoSeqScans: true,
        expectedIndexes: [
          'idx_entries_exercise_trgm',
          'idx_entries_user_performed_id',
        ],
        buildSql: (ctx) => `
          SELECT id, user_id, exercise_name, exercise_name_norm, muscle_group, performed_at, created_at
          FROM workout_entries
          WHERE user_id = '${ctx.powerUserId}'
            AND exercise_name_norm LIKE '%bench%'
          ORDER BY performed_at DESC, id DESC
          LIMIT 21;
        `,
      },
      {
        id: 'SCENARIO-1E',
        name: 'Workout Sets — Eager Load Sets by Entry IDs (Foreign Key Batch Index Scan)',
        endpoint: 'Eager loading sets for GET /workouts page',
        maxExecutionTimeMs: 10.0,
        assertNoSeqScans: true,
        expectedIndexes: ['idx_sets_entry_fk'],
        buildSql: (ctx) => {
          const idsSql = ctx.sampleEntryIds
            .map((id) => `'${id}'::uuid`)
            .join(', ');
          return `
            SELECT id, workout_entry_id, set_number, reps, original_weight, original_unit, weight_kg, volume_kg, estimated_1rm_kg
            FROM workout_sets
            WHERE workout_entry_id IN (${idsSql})
            ORDER BY set_number ASC;
          `;
        },
      },
      {
        id: 'SCENARIO-2A',
        name: 'Personal Records — Production Scoped CTE (Single-Table Scan on workout_sets)',
        endpoint: 'GET /api/v1/users/:userId/personal-records',
        maxExecutionTimeMs: 25.0,
        assertNoSeqScans: true,
        assertNoJoins: true,
        expectedIndexes: ['idx_sets_pr_lookup'],
        buildSql: (ctx) => `
          WITH scoped_sets AS (
            SELECT 
              id, 
              workout_entry_id, 
              reps, 
              original_weight, 
              original_unit, 
              weight_kg, 
              volume_kg, 
              estimated_1rm_kg, 
              performed_at
            FROM workout_sets
            WHERE user_id = '${ctx.powerUserId}'
              AND exercise_name_norm = ANY(ARRAY['${ctx.sampleExerciseNorm}', 'bench press', 'flat bench press'])
              AND ('2024-01-01T00:00:00Z'::timestamptz IS NULL OR performed_at >= '2024-01-01T00:00:00Z'::timestamptz)
              AND ('2026-11-01T00:00:00Z'::timestamptz IS NULL OR performed_at <= '2026-11-01T00:00:00Z'::timestamptz)
          )
          (
            SELECT 'heaviest_set' AS pr_type, id, workout_entry_id, reps, original_weight, original_unit, weight_kg, volume_kg, estimated_1rm_kg, performed_at
            FROM scoped_sets
            ORDER BY weight_kg DESC, reps DESC, performed_at DESC, id DESC
            LIMIT 1
          )
          UNION ALL
          (
            SELECT 'highest_volume_set' AS pr_type, id, workout_entry_id, reps, original_weight, original_unit, weight_kg, volume_kg, estimated_1rm_kg, performed_at
            FROM scoped_sets
            ORDER BY volume_kg DESC, weight_kg DESC, performed_at DESC, id DESC
            LIMIT 1
          )
          UNION ALL
          (
            SELECT 'best_1rm_set' AS pr_type, id, workout_entry_id, reps, original_weight, original_unit, weight_kg, volume_kg, estimated_1rm_kg, performed_at
            FROM scoped_sets
            ORDER BY estimated_1rm_kg DESC, weight_kg DESC, performed_at DESC, id DESC
            LIMIT 1
          );
        `,
      },
      {
        id: 'SCENARIO-2B',
        name: 'Personal Records — Window Function CTE Scan (Suite 1 Query 2 Spec)',
        endpoint:
          'GET /api/v1/users/:userId/personal-records (Window Function)',
        maxExecutionTimeMs: 50.0,
        assertNoSeqScans: true,
        assertNoJoins: true,
        expectedIndexes: ['idx_sets_pr_lookup'],
        buildSql: (ctx) => `
          WITH ranked_sets AS (
            SELECT id, reps, original_weight, weight_kg, volume_kg, estimated_1rm_kg, performed_at,
                   ROW_NUMBER() OVER (ORDER BY weight_kg DESC, reps DESC, performed_at DESC, id DESC) AS rank_heaviest,
                   ROW_NUMBER() OVER (ORDER BY volume_kg DESC, weight_kg DESC, performed_at DESC, id DESC) AS rank_volume,
                   ROW_NUMBER() OVER (ORDER BY estimated_1rm_kg DESC, weight_kg DESC, performed_at DESC, id DESC) AS rank_1rm
            FROM workout_sets
            WHERE user_id = '${ctx.powerUserId}'
              AND exercise_name_norm = '${ctx.sampleExerciseNorm}'
          )
          SELECT * FROM ranked_sets WHERE rank_heaviest = 1 OR rank_volume = 1 OR rank_1rm = 1;
        `,
      },
      {
        id: 'SCENARIO-3A',
        name: 'Keyset History with JOIN (Suite 1 Query 1 Spec)',
        endpoint: 'GET /api/v1/users/:userId/workouts (Join Plan Spec)',
        maxExecutionTimeMs: 20.0,
        assertNoSeqScans: true,
        expectedIndexes: ['idx_entries_user_performed_id', 'idx_sets_entry_fk'],
        buildSql: (ctx) => `
          SELECT e.id, e.performed_at, e.exercise_name, s.reps, s.weight_kg
          FROM workout_entries e
          JOIN workout_sets s ON s.workout_entry_id = e.id
          WHERE e.user_id = '${ctx.powerUserId}'
            AND (e.performed_at, e.id) < ('${ctx.midCursorDate}'::timestamptz, '${ctx.midCursorId}'::uuid)
          ORDER BY e.performed_at DESC, e.id DESC
          LIMIT 21;
        `,
      },
    ];

    const results: ScenarioResult[] = [];

    for (const scenario of scenarios) {
      const sql = scenario.buildSql(context);

      // Warm-up execution to ensure database buffer cache is primed
      await prisma.$queryRawUnsafe(`EXPLAIN (ANALYZE, BUFFERS) ${sql}`);

      // Execute EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      const jsonExplainSql = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`;
      const jsonRaw =
        await prisma.$queryRawUnsafe<
          [{ 'QUERY PLAN': PostgresExplainResult[] }]
        >(jsonExplainSql);
      const explainResult = jsonRaw[0]['QUERY PLAN'][0];
      const analysis = analyzePlanTree(
        explainResult.Plan,
        explainResult['Planning Time'],
        explainResult['Execution Time'],
      );

      // Execute EXPLAIN (ANALYZE, BUFFERS) for readable text plan
      const textExplainSql = `EXPLAIN (ANALYZE, BUFFERS) ${sql}`;
      const textRaw =
        await prisma.$queryRawUnsafe<{ 'QUERY PLAN': string }[]>(
          textExplainSql,
        );
      const textPlan = textRaw.map((r) => r['QUERY PLAN']).join('\n');

      // Assertions
      const failureReasons: string[] = [];

      // 1. Zero sequential scans on workout_entries or workout_sets
      const benchmarkSeqScans = analysis.seqScans.filter(
        (s) =>
          s.relation === 'workout_entries' || s.relation === 'workout_sets',
      );
      if (scenario.assertNoSeqScans && benchmarkSeqScans.length > 0) {
        failureReasons.push(
          `Sequential scan detected on table(s): ${benchmarkSeqScans.map((s) => s.relation).join(', ')}`,
        );
      }

      // 2. Expected index used
      const matchedExpectedIndex = scenario.expectedIndexes.some((expected) =>
        analysis.usedIndexes.includes(expected),
      );
      if (!matchedExpectedIndex) {
        failureReasons.push(
          `None of the expected indexes [${scenario.expectedIndexes.join(', ')}] were used. Used: [${analysis.usedIndexes.join(', ')}]`,
        );
      }

      // 3. Zero joins assertion
      if (scenario.assertNoJoins && analysis.joins.length > 0) {
        failureReasons.push(
          `Table joins detected: ${analysis.joins.join(', ')} (expected 0 joins)`,
        );
      }

      // 4. Execution time SLA
      if (analysis.executionTimeMs > scenario.maxExecutionTimeMs) {
        failureReasons.push(
          `Execution time (${analysis.executionTimeMs.toFixed(2)}ms) exceeded SLA limit (${scenario.maxExecutionTimeMs}ms)`,
        );
      }

      const totalBuffers = analysis.sharedHit + analysis.sharedRead;
      const bufferHitRatio =
        totalBuffers > 0 ? (analysis.sharedHit / totalBuffers) * 100 : 100;

      const passed = failureReasons.length === 0;

      results.push({
        id: scenario.id,
        name: scenario.name,
        endpoint: scenario.endpoint,
        passed,
        usedIndexes: analysis.usedIndexes,
        seqScans: benchmarkSeqScans.map((s) => s.relation),
        planningTimeMs: analysis.planningTimeMs,
        executionTimeMs: analysis.executionTimeMs,
        targetExecutionTimeMs: scenario.maxExecutionTimeMs,
        bufferHitRatio,
        failureReasons,
        textPlan,
      });

      console.log(
        `--------------------------------------------------------------------------------`,
      );
      console.log(
        `[${passed ? 'PASS' : 'FAIL'}] ${scenario.id}: ${scenario.name}`,
      );
      console.log(`  Endpoint:       ${scenario.endpoint}`);
      console.log(
        `  Used Indexes:   [${analysis.usedIndexes.join(', ') || 'NONE'}]`,
      );
      console.log(
        `  Seq Scans:      ${benchmarkSeqScans.length} (${benchmarkSeqScans.map((s) => s.relation).join(', ') || '0'})`,
      );
      console.log(`  Planning Time:  ${analysis.planningTimeMs.toFixed(3)} ms`);
      console.log(
        `  Execution Time: ${analysis.executionTimeMs.toFixed(3)} ms (Target: < ${scenario.maxExecutionTimeMs} ms)`,
      );
      console.log(
        `  Shared Hit/Read:${analysis.sharedHit} / ${analysis.sharedRead} (Hit Ratio: ${bufferHitRatio.toFixed(1)}%)`,
      );

      if (!passed) {
        console.log(`  Failures:`);
        for (const reason of failureReasons) {
          console.log(`    - ${reason}`);
        }
      }

      console.log(`\n  Execution Plan:`);
      console.log(textPlan.replace(/^/gm, '    '));
      console.log('');
    }

    // Consolidated Results Summary Table
    console.log(
      '================================================================================',
    );
    console.log('PHASE 2 QUERY PLAN VERIFICATION SUMMARY:');
    console.log(
      '================================================================================',
    );

    const tableRows = results.map((r) => ({
      Scenario: r.id,
      Status: r.passed ? 'PASS' : 'FAIL',
      'Index Used': r.usedIndexes.join(', ') || 'NONE',
      'Seq Scans': r.seqScans.length,
      'Exec (ms)': r.executionTimeMs.toFixed(2),
      'Target (ms)': `< ${r.targetExecutionTimeMs}`,
      'Hit %': `${r.bufferHitRatio.toFixed(1)}%`,
    }));

    console.table(tableRows);

    const allPassed = results.every((r) => r.passed);
    if (allPassed) {
      console.log(
        '\n>>> SUCCESS: All database index and query plan assertions passed! Zero sequential scans detected.',
      );
    } else {
      console.error(
        '\n>>> FAILURE: One or more query plan assertions failed. See details above.',
      );
      process.exit(1);
    }
  } catch (error) {
    console.error('[Phase 2] Error during query plan verification:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void runPlanVerification();
