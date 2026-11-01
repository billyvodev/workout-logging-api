import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import {
  BASE_URL,
  USER_ID,
  generateUuid,
  generateSingleWorkoutPayload,
  generateBulkWorkoutPayload,
  getRandomInt,
  getRandomElement,
  SAMPLE_EXERCISES,
  handleBenchmarkSummary,
} from '../common.js';

// Granular operation metrics
const readHistoryTrend = new Trend('mixed_read_history_duration', true);
const readPrTrend = new Trend('mixed_read_pr_duration', true);
const writeWorkoutTrend = new Trend('mixed_write_workout_duration', true);
const writeReplayTrend = new Trend('mixed_write_replay_duration', true);
const readMetaTrend = new Trend('mixed_read_meta_duration', true);

const opsCounter = new Counter('mixed_operations_total');
const mixedErrorRate = new Rate('mixed_error_rate');

export const options = {
  stages: [
    { duration: '30s', target: 20 },   // Warm-up: 20 VUs
    { duration: '3m', target: 100 },   // Steady State: 100 VUs
    { duration: '1m', target: 250 },   // Spike / Stress: 250 VUs
    { duration: '30s', target: 20 },   // Cool-down: 20 VUs
  ],
  thresholds: {
    http_req_duration: ['p(95)<50', 'p(99)<100'],
    mixed_read_history_duration: ['p(95)<25'],
    mixed_read_pr_duration: ['p(95)<30'],
    mixed_write_workout_duration: ['p(95)<50'],
    mixed_write_replay_duration: ['p(95)<15'],
    http_req_failed: ['rate<0.0001'],
  },
};

export default function () {
  const roll = getRandomInt(1, 100);
  const jsonHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  opsCounter.add(1);

  if (roll <= 50) {
    // -----------------------------------------------------------------------
    // 50%: Keyset Pagination History Read
    // -----------------------------------------------------------------------
    const subRoll = getRandomInt(1, 10);
    let url = `${BASE_URL}/api/v1/users/${USER_ID}/workouts?limit=20`;

    if (subRoll <= 4) {
      // Standard first page
      url = `${BASE_URL}/api/v1/users/${USER_ID}/workouts?limit=20`;
    } else if (subRoll <= 7) {
      // Trigram exercise filter
      url = `${BASE_URL}/api/v1/users/${USER_ID}/workouts?exerciseName=bench&limit=20`;
    } else {
      // Muscle group filter
      url = `${BASE_URL}/api/v1/users/${USER_ID}/workouts?muscleGroup=chest&limit=20`;
    }

    const res = http.get(url, { headers: { Accept: 'application/json' } });
    readHistoryTrend.add(res.timings.duration);

    const ok = check(res, {
      'history read status is 200': (r) => r.status === 200,
      'history read returns data': (r) => {
        try {
          return Array.isArray(JSON.parse(r.body).data);
        } catch {
          return false;
        }
      },
    });

    if (!ok) mixedErrorRate.add(1);
    else mixedErrorRate.add(0);

    // Occasional cursor chaining (20% of history reads do 1 cursor step)
    if (ok && getRandomInt(1, 5) === 1) {
      try {
        const body = JSON.parse(res.body);
        if (body.pagination && body.pagination.nextCursor) {
          const nextCursor = body.pagination.nextCursor;
          const chainRes = http.get(
            `${BASE_URL}/api/v1/users/${USER_ID}/workouts?limit=20&cursor=${encodeURIComponent(
              nextCursor,
            )}`,
            { headers: { Accept: 'application/json' } },
          );
          readHistoryTrend.add(chainRes.timings.duration);
        }
      } catch {
        // silent parse safeguard
      }
    }
  } else if (roll <= 80) {
    // -----------------------------------------------------------------------
    // 30%: Personal Records Read
    // -----------------------------------------------------------------------
    const exercise = getRandomElement(SAMPLE_EXERCISES);
    const isComparison = getRandomInt(1, 2) === 1;

    let url = `${BASE_URL}/api/v1/users/${USER_ID}/personal-records?exerciseName=${encodeURIComponent(
      exercise,
    )}`;

    if (isComparison) {
      url +=
        '&from=2026-10-01T00:00:00.000Z&to=2026-10-31T23:59:59.000Z&compareFrom=2026-09-01T00:00:00.000Z&compareTo=2026-09-30T23:59:59.000Z';
    }

    const res = http.get(url, { headers: { Accept: 'application/json' } });
    readPrTrend.add(res.timings.duration);

    const ok = check(res, {
      'pr read status is 200': (r) => r.status === 200,
      'pr read returns data': (r) => {
        try {
          return Boolean(JSON.parse(r.body).data);
        } catch {
          return false;
        }
      },
    });

    if (!ok) mixedErrorRate.add(1);
    else mixedErrorRate.add(0);
  } else if (roll <= 95) {
    // -----------------------------------------------------------------------
    // 15%: Write Workout Entry (Single or Bulk)
    // -----------------------------------------------------------------------
    const isBulk = getRandomInt(1, 4) === 1; // 25% of writes are bulk
    const payload = isBulk
      ? JSON.stringify(generateBulkWorkoutPayload())
      : JSON.stringify(generateSingleWorkoutPayload());

    const res = http.post(
      `${BASE_URL}/api/v1/users/${USER_ID}/workouts`,
      payload,
      { headers: jsonHeaders },
    );
    writeWorkoutTrend.add(res.timings.duration);

    const ok = check(res, {
      'write workout status is 201': (r) => r.status === 201,
      'write workout returns data': (r) => {
        try {
          return Array.isArray(JSON.parse(r.body).data);
        } catch {
          return false;
        }
      },
    });

    if (!ok) mixedErrorRate.add(1);
    else mixedErrorRate.add(0);
  } else if (roll <= 98) {
    // -----------------------------------------------------------------------
    // 3%: Idempotent Write Replay
    // -----------------------------------------------------------------------
    const idempotencyKey = generateUuid();
    const replayHeaders = {
      ...jsonHeaders,
      'Idempotency-Key': idempotencyKey,
    };
    const payload = JSON.stringify(generateSingleWorkoutPayload());

    // 1. Initial write
    http.post(`${BASE_URL}/api/v1/users/${USER_ID}/workouts`, payload, {
      headers: replayHeaders,
    });

    // 2. Replay
    const replayRes = http.post(
      `${BASE_URL}/api/v1/users/${USER_ID}/workouts`,
      payload,
      { headers: replayHeaders },
    );
    writeReplayTrend.add(replayRes.timings.duration);

    const ok = check(replayRes, {
      'replay status is 200 or 201': (r) =>
        r.status === 200 || r.status === 201,
    });

    if (!ok) mixedErrorRate.add(1);
    else mixedErrorRate.add(0);
  } else {
    // -----------------------------------------------------------------------
    // 2%: System Metadata Configuration Read
    // -----------------------------------------------------------------------
    const res = http.get(`${BASE_URL}/api/v1/metadata/config`, {
      headers: { Accept: 'application/json' },
    });
    readMetaTrend.add(res.timings.duration);

    const ok = check(res, {
      'metadata read status is 200': (r) => r.status === 200,
    });

    if (!ok) mixedErrorRate.add(1);
    else mixedErrorRate.add(0);
  }

  sleep(0.05);
}

export function handleSummary(data) {
  return handleBenchmarkSummary(data, 'summary_05_mixed_workload');
}

