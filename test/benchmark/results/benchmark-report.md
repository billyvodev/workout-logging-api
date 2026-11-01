# Benchmark Performance Report: Everfit Workout Logging API

**Generated At:** 2026-11-01T16:54:37.440Z
**Target Scale Target:** 50,000+ Entries (~200,000 sets) on `benchmark_power_user`

### Performance SLA Verification Table

| Scenario / Operation | Metric | p50 (Act/Tgt) | p95 (Act/Tgt) | p99 (Act/Tgt) | RPS | Error % | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 01: Health Probe | GET /api/v1/health | 3.66ms / <2ms | 9.63ms / <5ms | 15.81ms / <10ms | 184.4 | 0% | ❌ **FAIL** |
| 01: Metadata Config | GET /api/v1/metadata/config | 2.29ms / <2ms | 5.53ms / <5ms | 8.58ms / <10ms | 184.4 | 0% | ❌ **FAIL** |
| 02: History (First Page) | GET /workouts (First Page) | 23.4ms / <8ms | 46.85ms / <18ms | 114.01ms / <30ms | 335.8 | 0% | ❌ **FAIL** |
| 02: History (Deep Keyset) | GET /workouts (Cursor Seek) | 26.09ms / <10ms | 37.43ms / <20ms | 47.29ms / <35ms | 335.8 | 0% | ❌ **FAIL** |
| 02: History (Trgm Filter) | GET /workouts (?exerciseName=) | 23.93ms / <15ms | 33.42ms / <35ms | 39.69ms / <50ms | 335.8 | 0% | ✅ **PASS** |
| 03: PR (All-Time) | GET /personal-records | 25.85ms / <12ms | 38.19ms / <25ms | 47.56ms / <40ms | 209.2 | 0% | ❌ **FAIL** |
| 03: PR (Comparison) | GET /personal-records (Compare) | 6.93ms / <15ms | 13.76ms / <30ms | 23.19ms / <50ms | 209.2 | 0% | ✅ **PASS** |
| 04: Write (Single) | POST /workouts (1 Entry, 3 Sets) | 14.35ms / <15ms | 40.44ms / <35ms | 55.53ms / <50ms | 114.1 | 0% | ❌ **FAIL** |
| 04: Write (Bulk) | POST /workouts (10 Entries, 40 Sets) | 69.28ms / <40ms | 148.24ms / <80ms | 167.42ms / <120ms | 114.1 | 0% | ❌ **FAIL** |
| 04: Write (Replay) | POST /workouts (Idempotency Replay) | 13.31ms / <5ms | 22.84ms / <15ms | 29.09ms / <25ms | 114.1 | 0% | ❌ **FAIL** |
| 05: Mixed Workload | Production 80/20 Distribution | 9.63ms / <20ms | 32.58ms / <50ms | 80.99ms / <100ms | 167.7 | 0% | ✅ **PASS** |

### SLA Compliance Summary

- **Total Checked Operations:** 11
- **Passed:** 3 / 11 (27%)
- **System Latency SLA:** Needs inspection or tuning
