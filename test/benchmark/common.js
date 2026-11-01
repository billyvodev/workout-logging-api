/**
 * Shared utility functions and configuration helpers for k6 benchmark suites.
 */

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
export const USER_ID = __ENV.USER_ID || 'benchmark_power_user';

/**
 * Generates a pseudo-random UUID v4 string compliant with RFC 4122.
 */
export function generateUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Returns a random integer between min and max (inclusive).
 */
export function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Returns a random element from the provided array.
 */
export function getRandomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export const SAMPLE_EXERCISES = [
  'Barbell Bench Press',
  'Back Squat',
  'Deadlift',
  'Overhead Press',
  'Barbell Row',
  'Incline Dumbbell Press',
  'Dumbbell Bench Press',
  'Front Squat',
  'Romanian Deadlift',
  'Pull-Up',
  'Dumbbell Curl',
  'Tricep Pushdown',
  'Leg Press',
  'Lat Pulldown',
  'Lateral Raise',
];

export const SAMPLE_UNITS = ['kg', 'lb'];

/**
 * Generates a single workout entry payload.
 */
export function generateSingleWorkoutPayload(exerciseName) {
  const chosenExercise = exerciseName || getRandomElement(SAMPLE_EXERCISES);
  const chosenUnit = getRandomElement(SAMPLE_UNITS);
  const baseWeight = chosenUnit === 'kg' ? getRandomInt(40, 140) : getRandomInt(90, 310);

  return {
    date: new Date().toISOString(),
    exerciseName: chosenExercise,
    sets: [
      { reps: 10, weight: baseWeight, unit: chosenUnit },
      { reps: 8, weight: baseWeight + 5, unit: chosenUnit },
      { reps: 6, weight: baseWeight + 10, unit: chosenUnit },
    ],
  };
}

/**
 * Generates a bulk workout payload with 10 exercises, 4 sets each (40 sets total).
 */
export function generateBulkWorkoutPayload() {
  const entries = [];
  const exercisesPool = [...SAMPLE_EXERCISES].slice(0, 10);

  for (let i = 0; i < exercisesPool.length; i++) {
    const exName = exercisesPool[i];
    const unit = i % 2 === 0 ? 'kg' : 'lb';
    const baseWeight = unit === 'kg' ? getRandomInt(50, 150) : getRandomInt(110, 330);

    entries.push({
      date: new Date(Date.now() - i * 60000).toISOString(),
      exerciseName: exName,
      sets: [
        { reps: 12, weight: baseWeight, unit },
        { reps: 10, weight: baseWeight + 5, unit },
        { reps: 8, weight: baseWeight + 10, unit },
        { reps: 6, weight: baseWeight + 15, unit },
      ],
    });
  }

  return { entries };
}

/**
 * Custom summary handler exporting structured JSON summary to results directory
 * and printing clean console output without external CDN dependencies.
 */
export function handleBenchmarkSummary(data, defaultFilename) {
  const summaryPath =
    __ENV.SUMMARY_PATH || `test/benchmark/results/${defaultFilename}.json`;

  const metrics = data.metrics || {};
  const duration = metrics.http_req_duration ? metrics.http_req_duration.values : {};
  const reqs = metrics.http_reqs ? metrics.http_reqs.values : {};
  const failed = metrics.http_req_failed ? metrics.http_req_failed.values : {};

  const p50 = (duration['p(50)'] || 0).toFixed(2);
  const p95 = (duration['p(95)'] || 0).toFixed(2);
  const p99 = (duration['p(99)'] || 0).toFixed(2);
  const avg = (duration.avg || 0).toFixed(2);
  const max = (duration.max || 0).toFixed(2);
  const count = reqs.count || 0;
  const rate = (reqs.rate || 0).toFixed(2);
  const errorRate = ((failed.rate || 0) * 100).toFixed(2);

  const stdout = `
================================================================================
                    BENCHMARK EXECUTION SUMMARY
================================================================================
  Target Scenario    : ${defaultFilename}
  Total Requests     : ${count} (${rate} req/s)
  Error Rate         : ${errorRate}% (${failed.passes || 0} failed / ${count} total)
  Latency Statistics :
    - p50 (Median)   : ${p50} ms
    - p95 (Target)   : ${p95} ms
    - p99 (Tail)     : ${p99} ms
    - Average        : ${avg} ms
    - Maximum        : ${max} ms
  Summary Output     : ${summaryPath}
================================================================================
`;

  return {
    stdout: stdout,
    [summaryPath]: JSON.stringify(data, null, 2),
  };
}

