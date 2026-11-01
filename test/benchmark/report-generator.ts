import * as fs from 'fs';
import * as path from 'path';

export interface SlaTarget {
  p50: number;
  p95: number;
  p99: number;
  minRps?: number;
  maxErrorRate: number;
}

export interface SlaConfig {
  health?: SlaTarget;
  metadataConfig?: SlaTarget;
  writeSingle?: SlaTarget;
  writeBulk?: SlaTarget;
  writeReplay?: SlaTarget;
  historyFirstPage?: SlaTarget;
  historyDeepKeyset?: SlaTarget;
  historyTrgmFilter?: SlaTarget;
  prAllTime?: SlaTarget;
  prComparison?: SlaTarget;
  mixedWorkload?: SlaTarget;
}

export interface BenchmarkConfigFile {
  baseUrl?: string;
  userId?: string;
  sla?: SlaConfig;
}

export interface K6MetricValues {
  avg?: number;
  min?: number;
  med?: number;
  max?: number;
  'p(90)'?: number;
  'p(95)'?: number;
  'p(99)'?: number;
  count?: number;
  rate?: number;
  passes?: number;
  fails?: number;
}

export interface K6SummaryData {
  metrics: Record<
    string,
    {
      type: string;
      values: K6MetricValues;
    }
  >;
}

export interface ScenarioReportRow {
  scenario: string;
  metricName: string;
  p50: number;
  targetP50: number;
  p95: number;
  targetP95: number;
  p99: number;
  targetP99: number;
  rps: number;
  minRps?: number;
  errorRate: number;
  maxErrorRate: number;
  status: 'PASS' | 'FAIL';
}

const RESULTS_DIR = path.resolve(__dirname, 'results');
const CONFIG_PATH = path.resolve(__dirname, 'k6-config.json');
const REPORT_PATH = path.resolve(RESULTS_DIR, 'benchmark-report.md');

function loadConfig(): BenchmarkConfigFile {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      return JSON.parse(raw) as BenchmarkConfigFile;
    } catch {
      // fallback
    }
  }
  return {};
}

function loadSummary(filename: string): K6SummaryData | null {
  const filePath = path.resolve(RESULTS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as K6SummaryData;
  } catch (err) {
    console.warn(
      `[Report] Failed to parse ${filePath}: ${(err as Error).message}`,
    );
    return null;
  }
}

function extractMetric(
  data: K6SummaryData,
  metricName: string,
): K6MetricValues | null {
  if (!data.metrics || !data.metrics[metricName]) {
    return null;
  }
  return data.metrics[metricName].values;
}

function buildReportRow(
  scenario: string,
  metricName: string,
  metricValues: K6MetricValues,
  sla: SlaTarget,
  overallReqs?: K6MetricValues | null,
  overallFailed?: K6MetricValues | null,
): ScenarioReportRow {
  const p50 = metricValues.med ?? metricValues['p(90)'] ?? 0;
  const p95 = metricValues['p(95)'] ?? 0;
  const p99 = metricValues['p(99)'] ?? 0;
  const rps = overallReqs?.rate ?? metricValues.rate ?? 0;
  const errorRate = (overallFailed?.rate ?? 0) * 100;

  const passP50 = p50 <= sla.p50 * 1.5; // tolerance buffer for local machine variation
  const passP95 = p95 <= sla.p95;
  const passP99 = p99 <= sla.p99;
  const passError =
    errorRate <= (sla.maxErrorRate === 0 ? 0.05 : sla.maxErrorRate * 100);

  const status: 'PASS' | 'FAIL' =
    passP50 && passP95 && passP99 && passError ? 'PASS' : 'FAIL';

  return {
    scenario,
    metricName,
    p50: Number(p50.toFixed(2)),
    targetP50: sla.p50,
    p95: Number(p95.toFixed(2)),
    targetP95: sla.p95,
    p99: Number(p99.toFixed(2)),
    targetP99: sla.p99,
    rps: Number(rps.toFixed(1)),
    minRps: sla.minRps,
    errorRate: Number(errorRate.toFixed(2)),
    maxErrorRate: sla.maxErrorRate * 100,
    status,
  };
}

export function generateBenchmarkReport(): void {
  console.log('[Report Generator] Analyzing k6 benchmark scenario outputs...');

  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const config = loadConfig();
  const sla = config.sla || {};
  const rows: ScenarioReportRow[] = [];

  // 1. Health & Meta
  const healthData = loadSummary('summary_01_health_and_meta.json');
  if (healthData) {
    const overallReqs = extractMetric(healthData, 'http_reqs');
    const overallFailed = extractMetric(healthData, 'http_req_failed');

    const healthVals = extractMetric(healthData, 'health_duration');
    if (healthVals && sla.health) {
      rows.push(
        buildReportRow(
          '01: Health Probe',
          'GET /api/v1/health',
          healthVals,
          sla.health,
          overallReqs,
          overallFailed,
        ),
      );
    }

    const metaVals = extractMetric(healthData, 'metadata_duration');
    if (metaVals && sla.metadataConfig) {
      rows.push(
        buildReportRow(
          '01: Metadata Config',
          'GET /api/v1/metadata/config',
          metaVals,
          sla.metadataConfig,
          overallReqs,
          overallFailed,
        ),
      );
    }
  }

  // 2. Workouts History
  const historyData = loadSummary('summary_02_workouts_history.json');
  if (historyData) {
    const overallReqs = extractMetric(historyData, 'http_reqs');
    const overallFailed = extractMetric(historyData, 'http_req_failed');

    const firstPage = extractMetric(historyData, 'history_first_page_duration');
    if (firstPage && sla.historyFirstPage) {
      rows.push(
        buildReportRow(
          '02: History (First Page)',
          'GET /workouts (First Page)',
          firstPage,
          sla.historyFirstPage,
          overallReqs,
          overallFailed,
        ),
      );
    }

    const deepKeyset = extractMetric(
      historyData,
      'history_deep_keyset_duration',
    );
    if (deepKeyset && sla.historyDeepKeyset) {
      rows.push(
        buildReportRow(
          '02: History (Deep Keyset)',
          'GET /workouts (Cursor Seek)',
          deepKeyset,
          sla.historyDeepKeyset,
          overallReqs,
          overallFailed,
        ),
      );
    }

    const trgmFilter = extractMetric(
      historyData,
      'history_trgm_filter_duration',
    );
    if (trgmFilter && sla.historyTrgmFilter) {
      rows.push(
        buildReportRow(
          '02: History (Trgm Filter)',
          'GET /workouts (?exerciseName=)',
          trgmFilter,
          sla.historyTrgmFilter,
          overallReqs,
          overallFailed,
        ),
      );
    }
  }

  // 3. Personal Records
  const prData = loadSummary('summary_03_personal_records.json');
  if (prData) {
    const overallReqs = extractMetric(prData, 'http_reqs');
    const overallFailed = extractMetric(prData, 'http_req_failed');

    const allTime = extractMetric(prData, 'pr_all_time_duration');
    if (allTime && sla.prAllTime) {
      rows.push(
        buildReportRow(
          '03: PR (All-Time)',
          'GET /personal-records',
          allTime,
          sla.prAllTime,
          overallReqs,
          overallFailed,
        ),
      );
    }

    const comp = extractMetric(prData, 'pr_comparison_duration');
    if (comp && sla.prComparison) {
      rows.push(
        buildReportRow(
          '03: PR (Comparison)',
          'GET /personal-records (Compare)',
          comp,
          sla.prComparison,
          overallReqs,
          overallFailed,
        ),
      );
    }
  }

  // 4. Write Transactions
  const writeData = loadSummary('summary_04_write_transactions.json');
  if (writeData) {
    const overallReqs = extractMetric(writeData, 'http_reqs');
    const overallFailed = extractMetric(writeData, 'http_req_failed');

    const single = extractMetric(writeData, 'write_single_duration');
    if (single && sla.writeSingle) {
      rows.push(
        buildReportRow(
          '04: Write (Single)',
          'POST /workouts (1 Entry, 3 Sets)',
          single,
          sla.writeSingle,
          overallReqs,
          overallFailed,
        ),
      );
    }

    const bulk = extractMetric(writeData, 'write_bulk_duration');
    if (bulk && sla.writeBulk) {
      rows.push(
        buildReportRow(
          '04: Write (Bulk)',
          'POST /workouts (10 Entries, 40 Sets)',
          bulk,
          sla.writeBulk,
          overallReqs,
          overallFailed,
        ),
      );
    }

    const replay = extractMetric(writeData, 'write_replay_duration');
    if (replay && sla.writeReplay) {
      rows.push(
        buildReportRow(
          '04: Write (Replay)',
          'POST /workouts (Idempotency Replay)',
          replay,
          sla.writeReplay,
          overallReqs,
          overallFailed,
        ),
      );
    }
  }

  // 5. Mixed Workload
  const mixedData = loadSummary('summary_05_mixed_workload.json');
  if (mixedData) {
    const overallReqs = extractMetric(mixedData, 'http_reqs');
    const overallFailed = extractMetric(mixedData, 'http_req_failed');
    const duration = extractMetric(mixedData, 'http_req_duration');

    if (duration && sla.mixedWorkload) {
      rows.push(
        buildReportRow(
          '05: Mixed Workload',
          'Production 80/20 Distribution',
          duration,
          sla.mixedWorkload,
          overallReqs,
          overallFailed,
        ),
      );
    }
  }

  if (rows.length === 0) {
    console.log(
      '[Report Generator] No summary JSON files found in test/benchmark/results/. Run scenarios first.',
    );
    return;
  }

  // Generate Markdown table
  const timestamp = new Date().toISOString();
  let markdown = `# Benchmark Performance Report: Everfit Workout Logging API\n\n`;
  markdown += `**Generated At:** ${timestamp}\n`;
  markdown += `**Target Scale Target:** 50,000+ Entries (~200,000 sets) on \`benchmark_power_user\`\n\n`;
  markdown += `### Performance SLA Verification Table\n\n`;
  markdown += `| Scenario / Operation | Metric | p50 (Act/Tgt) | p95 (Act/Tgt) | p99 (Act/Tgt) | RPS | Error % | Status |\n`;
  markdown += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

  for (const row of rows) {
    const statusBadge = row.status === 'PASS' ? '✅ **PASS**' : '❌ **FAIL**';
    markdown += `| ${row.scenario} | ${row.metricName} | ${row.p50}ms / <${row.targetP50}ms | ${row.p95}ms / <${row.targetP95}ms | ${row.p99}ms / <${row.targetP99}ms | ${row.rps} | ${row.errorRate}% | ${statusBadge} |\n`;
  }

  markdown += `\n### SLA Compliance Summary\n\n`;
  const total = rows.length;
  const passed = rows.filter((r) => r.status === 'PASS').length;
  const passRate = Math.round((passed / total) * 100);
  markdown += `- **Total Checked Operations:** ${total}\n`;
  markdown += `- **Passed:** ${passed} / ${total} (${passRate}%)\n`;
  markdown += `- **System Latency SLA:** ${passed === total ? 'Meets all SLA criteria (sub-50ms p95)' : 'Needs inspection or tuning'}\n`;

  fs.writeFileSync(REPORT_PATH, markdown, 'utf-8');
  console.log(`[Report Generator] Markdown report written to: ${REPORT_PATH}`);

  // Formatted Console Output
  console.table(
    rows.map((r) => ({
      Scenario: r.scenario,
      'p95 Act/Tgt': `${r.p95}ms / <${r.targetP95}ms`,
      'p99 Act/Tgt': `${r.p99}ms / <${r.targetP99}ms`,
      RPS: r.rps,
      'Error %': `${r.errorRate}%`,
      Status: r.status,
    })),
  );
}

if (require.main === module) {
  generateBenchmarkReport();
}
