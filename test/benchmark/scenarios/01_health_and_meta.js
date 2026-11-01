import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';
import { BASE_URL, handleBenchmarkSummary } from '../common.js';

// Custom metrics for granular reporting
const healthTrend = new Trend('health_duration', true);
const metaTrend = new Trend('metadata_duration', true);
const errorRate = new Rate('health_meta_error_rate');

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  stages: [
    { duration: '5s', target: 50 },    // Fast ramp-up
    { duration: '15s', target: 200 },  // 200 VUs burst
    { duration: '5s', target: 0 },     // Ramp-down
  ],
  thresholds: {
    http_req_duration: ['p(95)<5', 'p(99)<10'],
    health_duration: ['p(95)<5', 'p(99)<10'],
    metadata_duration: ['p(95)<5', 'p(99)<10'],
    http_req_failed: ['rate<0.0001'],
  },
};

export default function () {
  const params = {
    headers: {
      Accept: 'application/json',
    },
  };

  // 1. Health & readiness probe
  const healthRes = http.get(`${BASE_URL}/api/v1/health`, params);
  healthTrend.add(healthRes.timings.duration);
  const healthOk = check(healthRes, {
    'health status is 200': (r) => r.status === 200,
    'health status property is ok': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.status === 'ok' && body.database === 'connected';
      } catch {
        return false;
      }
    },
  });
  if (!healthOk) {
    errorRate.add(1);
  } else {
    errorRate.add(0);
  }

  // 2. Metadata configuration lookup
  const metaRes = http.get(`${BASE_URL}/api/v1/metadata/config`, params);
  metaTrend.add(metaRes.timings.duration);
  const metaOk = check(metaRes, {
    'metadata status is 200': (r) => r.status === 200,
    'metadata contains supported units': (r) => {
      try {
        const body = JSON.parse(r.body);
        const data = body.data || body;
        return (
          Array.isArray(data.supportedUnits) &&
          data.supportedUnits.includes('kg') &&
          data.supportedUnits.includes('lb')
        );
      } catch {
        return false;
      }
    },
  });
  if (!metaOk) {
    errorRate.add(1);
  } else {
    errorRate.add(0);
  }

  sleep(0.1);
}

export function handleSummary(data) {
  return handleBenchmarkSummary(data, 'summary_01_health_and_meta');
}

