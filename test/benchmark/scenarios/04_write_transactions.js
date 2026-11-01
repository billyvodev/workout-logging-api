import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';
import {
  BASE_URL,
  USER_ID,
  generateUuid,
  generateSingleWorkoutPayload,
  generateBulkWorkoutPayload,
  handleBenchmarkSummary,
} from '../common.js';

// Custom metric trends for write operations
const singleWriteTrend = new Trend('write_single_duration', true);
const bulkWriteTrend = new Trend('write_bulk_duration', true);
const replayTrend = new Trend('write_replay_duration', true);
const writeErrorRate = new Rate('write_error_rate');

export const options = {
  stages: [
    { duration: '20s', target: 10 },
    { duration: '60s', target: 30 },
    { duration: '60s', target: 50 },
    { duration: '20s', target: 0 },
  ],
  thresholds: {
    write_single_duration: ['p(95)<35', 'p(99)<50'],
    write_bulk_duration: ['p(95)<80', 'p(99)<120'],
    write_replay_duration: ['p(95)<15', 'p(99)<25'],
    http_req_failed: ['rate<0.0001'],
  },
};

export default function () {
  const baseHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  // -------------------------------------------------------------------------
  // Scenario A: Single Workout Entry (3 sets with write-time pre-computation)
  // -------------------------------------------------------------------------
  const singlePayload = JSON.stringify(generateSingleWorkoutPayload());
  const singleRes = http.post(
    `${BASE_URL}/api/v1/users/${USER_ID}/workouts`,
    singlePayload,
    { headers: baseHeaders },
  );
  singleWriteTrend.add(singleRes.timings.duration);
  const singleOk = check(singleRes, {
    'single write status is 201': (r) => r.status === 201,
    'single write returns logged entry': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.data) && body.data.length === 1;
      } catch {
        return false;
      }
    },
  });
  if (!singleOk) {
    writeErrorRate.add(1);
  } else {
    writeErrorRate.add(0);
  }

  // -------------------------------------------------------------------------
  // Scenario B: Bulk Workout Payload (10 exercises x 4 sets = 40 sets total)
  // -------------------------------------------------------------------------
  const bulkPayload = JSON.stringify(generateBulkWorkoutPayload());
  const bulkRes = http.post(
    `${BASE_URL}/api/v1/users/${USER_ID}/workouts`,
    bulkPayload,
    { headers: baseHeaders },
  );
  bulkWriteTrend.add(bulkRes.timings.duration);
  const bulkOk = check(bulkRes, {
    'bulk write status is 201': (r) => r.status === 201,
    'bulk write returns 10 entries': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.data) && body.data.length === 10;
      } catch {
        return false;
      }
    },
  });
  if (!bulkOk) {
    writeErrorRate.add(1);
  } else {
    writeErrorRate.add(0);
  }

  // -------------------------------------------------------------------------
  // Scenario C: Idempotent Replay Simulation (Network retry with Idempotency-Key)
  // -------------------------------------------------------------------------
  const idempotencyKey = generateUuid();
  const replayHeaders = {
    ...baseHeaders,
    'Idempotency-Key': idempotencyKey,
  };
  const idempotentPayload = JSON.stringify(generateSingleWorkoutPayload());

  // 1. Initial execution
  const initialPostRes = http.post(
    `${BASE_URL}/api/v1/users/${USER_ID}/workouts`,
    idempotentPayload,
    { headers: replayHeaders },
  );
  check(initialPostRes, {
    'initial idempotent post is 201': (r) => r.status === 201,
  });

  // 2. Immediate replay (< 100ms) with identical key and payload
  const replayRes = http.post(
    `${BASE_URL}/api/v1/users/${USER_ID}/workouts`,
    idempotentPayload,
    { headers: replayHeaders },
  );
  replayTrend.add(replayRes.timings.duration);
  const replayOk = check(replayRes, {
    'replay status is 200 or 201': (r) => r.status === 200 || r.status === 201,
    'replay returns original data': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.data) && body.data.length > 0;
      } catch {
        return false;
      }
    },
  });
  if (!replayOk) {
    writeErrorRate.add(1);
  } else {
    writeErrorRate.add(0);
  }

  sleep(0.2);
}

export function handleSummary(data) {
  return handleBenchmarkSummary(data, 'summary_04_write_transactions');
}

