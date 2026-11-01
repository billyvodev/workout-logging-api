import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { BASE_URL, USER_ID, handleBenchmarkSummary } from '../common.js';

// Custom metric trends for SLA tracking
const firstPageTrend = new Trend('history_first_page_duration', true);
const deepKeysetTrend = new Trend('history_deep_keyset_duration', true);
const trgmFilterTrend = new Trend('history_trgm_filter_duration', true);
const muscleFilterTrend = new Trend('history_muscle_filter_duration', true);
const cursorStepsCount = new Counter('history_cursor_steps_total');
const historyErrorRate = new Rate('history_error_rate');

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  stages: [
    { duration: '30s', target: 20 },
    { duration: '60s', target: 50 },
    { duration: '60s', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<25', 'p(99)<40'],
    history_first_page_duration: ['p(95)<18', 'p(99)<30'],
    history_deep_keyset_duration: ['p(95)<20', 'p(99)<35'],
    history_trgm_filter_duration: ['p(95)<35', 'p(99)<50'],
    history_muscle_filter_duration: ['p(95)<35', 'p(99)<50'],
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
  // Scenario A: First Page Query (limit=20)
  // -------------------------------------------------------------------------
  const firstPageRes = http.get(
    `${BASE_URL}/api/v1/users/${USER_ID}/workouts?limit=20`,
    params,
  );
  firstPageTrend.add(firstPageRes.timings.duration);

  let initialNextCursor = null;
  const firstPageOk = check(firstPageRes, {
    'first page status is 200': (r) => r.status === 200,
    'first page contains data array': (r) => {
      try {
        const body = JSON.parse(r.body);
        if (Array.isArray(body.data)) {
          if (body.pagination && body.pagination.nextCursor) {
            initialNextCursor = body.pagination.nextCursor;
          }
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
  });

  if (!firstPageOk) {
    historyErrorRate.add(1);
  } else {
    historyErrorRate.add(0);
  }

  // -------------------------------------------------------------------------
  // Scenario B: Consecutive Cursor Pagination Traversals (Simulating Infinite Scroll)
  // -------------------------------------------------------------------------
  let currentCursor = initialNextCursor;
  const maxTraversals = 50;
  let traversalsDone = 0;

  while (currentCursor && traversalsDone < maxTraversals) {
    const pageRes = http.get(
      `${BASE_URL}/api/v1/users/${USER_ID}/workouts?limit=20&cursor=${encodeURIComponent(
        currentCursor,
      )}`,
      params,
    );
    deepKeysetTrend.add(pageRes.timings.duration);
    cursorStepsCount.add(1);
    traversalsDone++;

    let hasNext = false;
    let nextCursor = null;

    const pageOk = check(pageRes, {
      'deep keyset page status is 200': (r) => r.status === 200,
      'deep keyset page returns items': (r) => {
        try {
          const body = JSON.parse(r.body);
          if (Array.isArray(body.data)) {
            hasNext = body.pagination && body.pagination.hasNextPage;
            nextCursor = body.pagination ? body.pagination.nextCursor : null;
            return true;
          }
          return false;
        } catch {
          return false;
        }
      },
    });

    if (!pageOk) {
      historyErrorRate.add(1);
      break;
    } else {
      historyErrorRate.add(0);
    }

    if (!hasNext || !nextCursor) {
      break;
    }
    currentCursor = nextCursor;
  }

  // -------------------------------------------------------------------------
  // Scenario C: Partial Trigram Filter (?exerciseName=bench)
  // -------------------------------------------------------------------------
  const trgmRes = http.get(
    `${BASE_URL}/api/v1/users/${USER_ID}/workouts?exerciseName=bench&limit=20`,
    params,
  );
  trgmFilterTrend.add(trgmRes.timings.duration);
  const trgmOk = check(trgmRes, {
    'trgm filter status is 200': (r) => r.status === 200,
    'trgm filter returns entries': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.data);
      } catch {
        return false;
      }
    },
  });
  if (!trgmOk) {
    historyErrorRate.add(1);
  } else {
    historyErrorRate.add(0);
  }

  // -------------------------------------------------------------------------
  // Scenario D: Filtered with muscleGroup and Date Range Bounds
  // -------------------------------------------------------------------------
  const muscleRes = http.get(
    `${BASE_URL}/api/v1/users/${USER_ID}/workouts?muscleGroup=chest&from=2025-01-01T00:00:00.000Z&to=2025-12-31T23:59:59.999Z&limit=20`,
    params,
  );
  muscleFilterTrend.add(muscleRes.timings.duration);
  const muscleOk = check(muscleRes, {
    'muscle filter status is 200': (r) => r.status === 200,
    'muscle filter returns entries': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.data);
      } catch {
        return false;
      }
    },
  });
  if (!muscleOk) {
    historyErrorRate.add(1);
  } else {
    historyErrorRate.add(0);
  }

  sleep(0.1);
}

export function handleSummary(data) {
  return handleBenchmarkSummary(data, 'summary_02_workouts_history');
}

