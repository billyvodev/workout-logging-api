import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';
import { BASE_URL, USER_ID, handleBenchmarkSummary } from '../common.js';

// Custom metric trends for PR analysis
const allTimeTrend = new Trend('pr_all_time_duration', true);
const comparisonTrend = new Trend('pr_comparison_duration', true);
const emptyTrend = new Trend('pr_empty_duration', true);
const prErrorRate = new Rate('pr_error_rate');

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '60s', target: 50 },
    { duration: '60s', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<30', 'p(99)<50'],
    pr_all_time_duration: ['p(95)<25', 'p(99)<40'],
    pr_comparison_duration: ['p(95)<30', 'p(99)<50'],
    pr_empty_duration: ['p(95)<25', 'p(99)<40'],
    http_req_failed: ['rate<0.0001'],
  },
};

export default function () {
  const params = {
    headers: {
      Accept: 'application/json',
    },
  };

  // -------------------------------------------------------------------------
  // Scenario A: All-Time PRs for Heavy Exercise (Single CTE scan on workout_sets)
  // -------------------------------------------------------------------------
  const allTimeRes = http.get(
    `${BASE_URL}/api/v1/users/${USER_ID}/personal-records?exerciseName=Barbell%20Bench%20Press`,
    params,
  );
  allTimeTrend.add(allTimeRes.timings.duration);
  const allTimeOk = check(allTimeRes, {
    'all-time PR status is 200': (r) => r.status === 200,
    'all-time PR contains records': (r) => {
      try {
        const body = JSON.parse(r.body);
        const data = body.data;
        return (
          data &&
          data.primaryPeriod &&
          data.primaryPeriod.records &&
          data.primaryPeriod.records.heaviestSet !== undefined &&
          data.primaryPeriod.records.highestVolumeSet !== undefined &&
          data.primaryPeriod.records.bestEstimated1RM !== undefined
        );
      } catch {
        return false;
      }
    },
  });
  if (!allTimeOk) {
    prErrorRate.add(1);
  } else {
    prErrorRate.add(0);
  }

  // -------------------------------------------------------------------------
  // Scenario B: Period-over-Period PR Comparison (Dual CTE queries via Promise.all)
  // -------------------------------------------------------------------------
  const comparisonRes = http.get(
    `${BASE_URL}/api/v1/users/${USER_ID}/personal-records?exerciseName=Barbell%20Bench%20Press&from=2026-10-01T00:00:00.000Z&to=2026-10-31T23:59:59.000Z&compareFrom=2026-09-01T00:00:00.000Z&compareTo=2026-09-30T23:59:59.000Z&unit=lb`,
    params,
  );
  comparisonTrend.add(comparisonRes.timings.duration);
  const comparisonOk = check(comparisonRes, {
    'comparison PR status is 200': (r) => r.status === 200,
    'comparison PR contains comparison object': (r) => {
      try {
        const body = JSON.parse(r.body);
        const data = body.data;
        return (
          data &&
          data.primaryPeriod &&
          data.comparisonPeriod &&
          data.comparison !== undefined
        );
      } catch {
        return false;
      }
    },
  });
  if (!comparisonOk) {
    prErrorRate.add(1);
  } else {
    prErrorRate.add(0);
  }

  // -------------------------------------------------------------------------
  // Scenario C: Empty Exercise (0 Logged Sets) - Fast Index Scan Verification
  // -------------------------------------------------------------------------
  const emptyRes = http.get(
    `${BASE_URL}/api/v1/users/${USER_ID}/personal-records?exerciseName=NonExistentBenchPress999`,
    params,
  );
  emptyTrend.add(emptyRes.timings.duration);
  const emptyOk = check(emptyRes, {
    'empty exercise status is 200': (r) => r.status === 200,
    'empty exercise returns null records': (r) => {
      try {
        const body = JSON.parse(r.body);
        const data = body.data;
        return (
          data &&
          data.primaryPeriod &&
          data.primaryPeriod.records &&
          data.primaryPeriod.records.heaviestSet === null
        );
      } catch {
        return false;
      }
    },
  });
  if (!emptyOk) {
    prErrorRate.add(1);
  } else {
    prErrorRate.add(0);
  }

  sleep(0.1);
}

export function handleSummary(data) {
  return handleBenchmarkSummary(data, 'summary_03_personal_records');
}

