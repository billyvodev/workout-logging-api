# Everfit Workout Logging API — System Architecture

## 1. Executive Summary & Architectural Goals

This document outlines the architecture for the **Everfit Workout Logging API**, a backend service enabling fitness coaches and clients to log workouts, filter historical performance, and track Personal Records (PRs) across time ranges.

The system is designed around six core engineering pillars:

1. **High Performance at Scale:** Sub-50ms query execution even when a single user exceeds **50,000+ workout entries** (~200,000+ individual sets).
2. **Open-Closed Extensibility:** Adding new weight units (e.g., `stone`) or updating Exercise $\rightarrow$ Muscle Group mappings requires configuration changes rather than business logic rewrites.
3. **Analytical Accuracy:** Exact PR identification (heaviest weight, highest volume, and best Epley 1RM) with deterministic tie-breaking and period-over-period comparisons.
4. **Concurrency Safety:** Idempotent bulk writes and lock-free analytical reads.
5. **Strict Boundary Validation:** Defensive input validation and standardized RFC 7807 error responses.
6. **Production Readiness:** Containerized execution (`docker compose up`), structured JSON logging, and automated health checks.

---

## 2. Technology Stack & Justifications

| Layer                   | Technology                         | Justification                                                                                                                                                                                      |
| :---------------------- | :--------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Runtime & Language**  | **Node.js (v22 LTS) + TypeScript** | Strict static typing prevents unit conversion and mathematical precision bugs at compile time.                                                                                                     |
| **Framework**           | **NestJS**                         | Provides first-class Dependency Injection (IoC), modular domain separation, declarative DTO validation (`class-validator`), and centralized exception filtering.                                   |
| **Database**            | **PostgreSQL 17**                  | Chosen over MongoDB due to ACID transactions for bulk workout logging, `pg_trgm` GIN indexing for fast partial text search (`ILIKE`), and Window Functions / CTEs for single-pass PR calculations. |
| **ORM / Query Builder** | **Prisma ORM**                     | Type-safe schema migrations and relational queries, combined with parameterized raw SQL support for optimized analytical PR queries.                                                               |
| **Logging**             | **Pino (`nestjs-pino`)**           | High-throughput, low-overhead structured JSON logging with automatic request correlation IDs.                                                                                                      |
| **Testing**             | **Jest + Supertest**               | Fast unit testing for domain math/conversions and full HTTP integration testing against an isolated test database.                                                                                 |

---

## 3. High-Level System Architecture

```
+-------------------------------------------------------------------------+
|                        Client / Coach Application                       |
+------------------------------------+------------------------------------+
                                     | HTTP / REST (JSON)
                                     v
+-------------------------------------------------------------------------+
|                        NestJS API Gateway Layer                         |
|  - Request Correlation ID Middleware & Pino Structured Logger           |
|  - Global ValidationPipe (DTO Schema & Custom Unit Validation)          |
|  - Global ExceptionFilter (Consistent RFC 7807 Error Envelopes)         |
+------------------------------------+------------------------------------+
                                     |
         +---------------------------+---------------------------+
         |                           |                           |
         v                           v                           v
+-----------------+         +-----------------+         +-----------------+
| Workouts Module |         | Exercises Mod.  |         | Units Module    |
| - Log Service   |-------->| - Muscle Group  |         | - Conversion    |
| - History Svc   |         |   Resolver      |         |   Registry      |
| - PR Calculator |         | - Config Loader |         | - Custom Val.   |
+--------+--------+         +--------+--------+         +-----------------+
         |                           |
         +-------------+-------------+
                       |
                       v
+-------------------------------------------------------------------------+
|                     Data Access / Repository Layer                      |
|     - Transactional Bulk Writes                                         |
|     - Keyset (Cursor) Pagination Builder                                |
|     - Parameterized SQL CTEs for PR Aggregation & Time Comparisons      |
+------------------------------------+------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                         PostgreSQL 17 Database                          |
|  - workout_entries (B-Tree Composite Indexes + pg_trgm GIN Index)       |
|  - workout_sets (Pre-computed normalized kg metrics for Index Scans)    |
|  - exercises_catalog (Seeded & configurable muscle group metadata)      |
+-------------------------------------------------------------------------+
```

---

## 4. Database Schema & Indexing Strategy

### 4.1 Core Design Decision: Write-Time Normalization & Pre-Computation

To ensure PR queries and history lookups remain fast at **50,000+ workout entries per user** (~200,000+ sets), the system **pre-computes and persists normalized metric columns (`weight_kg`, `volume_kg`, `estimated_1rm_kg`) on every set at write time**, alongside the user's original input (`original_weight`, `original_unit`).

Furthermore, `user_id`, `exercise_name_normalized`, and `performed_at` are intentionally denormalized onto `workout_sets`. This allows the Personal Records engine to execute **single-table index scans on `workout_sets` with zero JOIN overhead**.

### 4.2 Entity-Relationship Diagram (ERD)

```
+-----------------------------------+       +-----------------------------------+
|         exercises_catalog         |       |          workout_entries          |
+-----------------------------------+       +-----------------------------------+
| PK id (UUID)                      |<---+  | PK id (UUID)                      |
|    canonical_name (VARCHAR, UNIQ) |    |  |    user_id (VARCHAR)              |
|    display_name (VARCHAR)         |    |  |    exercise_name (VARCHAR)        |
|    primary_muscle_group (VARCHAR) |    |  |    exercise_name_norm (VARCHAR)   |
|    aliases (TEXT[])               |    +--| FK exercise_catalog_id (UUID,NULL)|
|    updated_at (TIMESTAMPTZ)       |       |    muscle_group (VARCHAR, NULL)   |
+-----------------------------------+       |    performed_at (TIMESTAMPTZ)     |
                                            |    idempotency_key (VARCHAR, NULL)|
                                            |    created_at (TIMESTAMPTZ)       |
                                            +-----------------+-----------------+
                                                              | 1
                                                              |
                                                              | 1..*
                                            +-----------------+-----------------+
                                            |           workout_sets            |
                                            +-----------------------------------+
                                            | PK id (UUID)                      |
                                            | FK workout_entry_id (UUID)        |
                                            |    user_id (VARCHAR)              |
                                            |    exercise_name_norm (VARCHAR)   |
                                            |    performed_at (TIMESTAMPTZ)     |
                                            |    set_number (INT)               |
                                            |    reps (INT)                     |
                                            |    original_weight (NUMERIC(8,2)) |
                                            |    original_unit (VARCHAR(10))    |
                                            |    weight_kg (NUMERIC(10,4))      |
                                            |    volume_kg (NUMERIC(12,4))      |
                                            |    estimated_1rm_kg (NUMERIC(10,4)|
                                            +-----------------------------------+
```

### 4.3 Mathematical Formulas Stored on Write

For each set with weight $w$ converted to kilograms ($w_{\text{kg}}$) and repetitions $r$:

- **Normalized Weight ($\text{kg}$):**
  $$w_{\text{kg}} = w \times \text{factor}_{\text{unit}\rightarrow\text{kg}}$$
- **Set Volume ($\text{kg}$):**
  $$\text{Volume}_{\text{kg}} = r \times w_{\text{kg}}$$
- **Estimated 1RM (Epley Formula, $\text{kg}$):**
  $$\text{1RM}_{\text{kg}} = w_{\text{kg}} \times \left(1 + \frac{r}{30}\right)$$

_(Note: Stored with 4 decimal places `NUMERIC(10,4)` to eliminate intermediate floating-point rounding drift during round-trip unit conversions)._

### 4.4 Indexing Strategy (Optimized for 50,000+ Entries/User)

| Table             | Index Name & Columns                                                           | Type            | Query Pattern Optimized                                                                             |
| :---------------- | :----------------------------------------------------------------------------- | :-------------- | :-------------------------------------------------------------------------------------------------- |
| `workout_entries` | `idx_entries_user_performed_id`<br>`(user_id, performed_at DESC, id DESC)`     | B-Tree          | Primary index for `GET /workouts` history, date range filtering, and $O(\log N)$ cursor pagination. |
| `workout_entries` | `idx_entries_user_muscle_date`<br>`(user_id, muscle_group, performed_at DESC)` | B-Tree          | Fast filtering when `muscleGroup` filter is provided in workout history.                            |
| `workout_entries` | `idx_entries_exercise_trgm`<br>`(exercise_name_norm gin_trgm_ops)`             | GIN (`pg_trgm`) | Accelerates partial, case-insensitive `ILIKE '%squat%'` filtering on `exerciseName`.                |
| `workout_entries` | `uniq_entries_user_idempotency`<br>`(user_id, idempotency_key)`                | UNIQUE B-Tree   | Prevents duplicate workout creation during concurrent network retries.                              |
| `workout_sets`    | `idx_sets_pr_lookup`<br>`(user_id, exercise_name_norm, performed_at DESC)`     | B-Tree          | Covers all time-bounded and all-time PR lookups for a user and exercise without table joins.        |
| `workout_sets`    | `idx_sets_entry_fk`<br>`(workout_entry_id, set_number ASC)`                    | B-Tree          | Fast eager loading of ordered sets when returning paginated workout history.                        |

---

## 5. Extensibility Patterns

### 5.1 Unit Conversion Abstraction (Registry + Strategy Pattern)

**Requirement:** _Adding a new unit type (e.g., `stone`) should require minimal code changes._

Instead of scattering `switch` or `if/else` statements across services and DTOs, unit conversion is centralized in a declarative **Unit Registry**:

```typescript
// src/common/units/unit.registry.ts
export interface UnitStrategy {
  readonly symbol: string;
  readonly toKgFactor: number;
}

export const UNIT_REGISTRY: Readonly<Record<string, UnitStrategy>> = {
  kg: { symbol: 'kg', toKgFactor: 1.0 },
  lb: { symbol: 'lb', toKgFactor: 0.45359237 },
  // Extensibility: Adding 'stone' requires adding a single entry here:
  // stone: { symbol: 'stone', toKgFactor: 6.35029318 },
};
```

- **Automatic Validation Integration:** A custom `@IsSupportedUnit()` decorator dynamically inspects `Object.keys(UNIT_REGISTRY)`. Adding `stone` to `UNIT_REGISTRY` immediately enables it across all request body DTOs, query parameters, error messages, and conversion methods without touching controller or service code.
- **Zero-Drift Original Unit Preservation:** When a client requests workout history in `lb` and a set was originally logged in `lb`, the serializer returns `original_weight` directly, avoiding unnecessary `lb -> kg -> lb` floating-point artifacts.

### 5.2 Configurable Exercise $\rightarrow$ Muscle Group Mapping

**Requirement:** _Exercise $\rightarrow$ muscle group mapping should be configurable (not hardcoded in business logic)._

Exercise metadata is externalized into `config/exercise-mappings.json` (and synchronized into the `exercises_catalog` database table at application startup):

```json
{
  "exercises": [
    {
      "canonicalName": "barbell bench press",
      "displayName": "Barbell Bench Press",
      "primaryMuscleGroup": "chest",
      "aliases": ["bench press", "flat bench press", "bb bench"]
    },
    {
      "canonicalName": "back squat",
      "displayName": "Back Squat",
      "primaryMuscleGroup": "legs",
      "aliases": ["squat", "barbell squat"]
    }
  ],
  "keywordFallbacks": [
    { "keyword": "bench", "muscleGroup": "chest" },
    { "keyword": "squat", "muscleGroup": "legs" },
    { "keyword": "deadlift", "muscleGroup": "back" },
    { "keyword": "curl", "muscleGroup": "arms" }
  ]
}
```

**Resolution Pipeline (`ExerciseMetadataService`):**

1. Normalize input `exerciseName` (`trim().toLowerCase()`).
2. Lookup exact match or alias match in the in-memory cached `exercises_catalog`.
3. If no exact/alias match is found, evaluate configurable `keywordFallbacks`.
4. If still unmatched, gracefully store `muscle_group = null` (allowing users to log custom exercises without blocking workout creation).

---

## 6. Core Workflows & Query Design

### 6.1 Bulk & Single Workout Logging

`POST /api/v1/users/:userId/workouts` accepts either a single workout object or a bulk `{ entries: [...] }` payload.

1. **Validation Boundary:** DTO pipe validates `date` (valid ISO-8601), `exerciseName` (non-empty string), and `sets` (non-empty array where `reps > 0`, `weight >= 0`, and `unit` is registered).
2. **Preparation:** Resolves `muscle_group` via `ExerciseMetadataService` and computes `weight_kg`, `volume_kg`, and `estimated_1rm_kg` for each set via `UnitConversionService` and `PrCalculatorUtil`.
3. **Atomic Transaction:** Executes a single PostgreSQL transaction inserting all `workout_entries` and batch-inserting all `workout_sets`. If any entry fails, the entire batch rolls back cleanly.

### 6.2 Workout History with Cursor & Offset Pagination

`GET /api/v1/users/:userId/workouts` supports filtering by `exerciseName` (partial match), `from`/`to` dates, `muscleGroup`, and target `unit`.

- **Dual Pagination Support:**
  - **Cursor Pagination (Recommended for scale):** Uses base64-encoded `(performed_at, id)` keyset cursor:
    ```sql
    WHERE user_id = $1
      AND (performed_at, id) < ($cursorDate, $cursorId)
    ORDER BY performed_at DESC, id DESC
    LIMIT $limit + 1
    ```
    This guarantees constant $O(\log N)$ latency even when paging to the 50,000th workout entry.
  - **Offset Pagination:** Also supported via `page` and `limit` query parameters for standard table UIs.

### 6.3 Personal Records (PRs) & Time-Range Comparison

`GET /api/v1/users/:userId/personal-records` calculates three distinct PRs for a given `userId` and `exerciseName`:

1. **Heaviest Single Set** ($\max(\text{weight\_kg})$)
2. **Highest Volume Set** ($\max(\text{volume\_kg})$)
3. **Best Estimated 1RM** ($\max(\text{estimated\_1rm\_kg})$)

**Single-Pass SQL Query with Deterministic Tie-Breaking:**
Because each PR may have been achieved in a _different set on a different date_, a naive `GROUP BY` cannot accurately retrieve the corresponding `performed_at` timestamp and `reps` for each record. We use a parameterized CTE with `UNION ALL`:

```sql
WITH scoped_sets AS (
  SELECT id, reps, original_weight, original_unit, weight_kg, volume_kg, estimated_1rm_kg, performed_at
  FROM workout_sets
  WHERE user_id = $1
    AND exercise_name_norm = $2
    AND ($3::timestamptz IS NULL OR performed_at >= $3)
    AND ($4::timestamptz IS NULL OR performed_at <= $4)
)
(
  SELECT 'heaviest_set' AS pr_type, id, reps, original_weight, original_unit, weight_kg, volume_kg, estimated_1rm_kg, performed_at
  FROM scoped_sets
  ORDER BY weight_kg DESC, reps DESC, performed_at DESC
  LIMIT 1
)
UNION ALL
(
  SELECT 'highest_volume_set' AS pr_type, id, reps, original_weight, original_unit, weight_kg, volume_kg, estimated_1rm_kg, performed_at
  FROM scoped_sets
  ORDER BY volume_kg DESC, weight_kg DESC, performed_at DESC
  LIMIT 1
)
UNION ALL
(
  SELECT 'best_1rm_set' AS pr_type, id, reps, original_weight, original_unit, weight_kg, volume_kg, estimated_1rm_kg, performed_at
  FROM scoped_sets
  ORDER BY estimated_1rm_kg DESC, weight_kg DESC, performed_at DESC
  LIMIT 1
);
```

- **Period-over-Period Comparison (`compareFrom` / `compareTo`):** When comparison dates are provided (e.g., _"PR this month vs last month"_), the service runs the query for both windows in parallel (`Promise.all`) and calculates absolute and percentage deltas (`+10.0 kg (+4.5%)`).

---

## 7. Edge Cases, Concurrency & Error Handling

### 7.1 Timezone Strategy & Trade-offs

- **Storage Strategy:** All timestamps (`performed_at`, `created_at`) are normalized to and stored in **UTC (`TIMESTAMPTZ`)** in PostgreSQL.
- **Ingestion:** Clients may submit full ISO-8601 strings with offsets (e.g., `2026-10-29T18:30:00+07:00`) or UTC strings (`2026-10-29T11:30:00Z`). PostgreSQL automatically converts offset timestamps to UTC.
- **Trade-offs:**
  - _Pros:_ Eliminates Daylight Saving Time (DST) ambiguity, ensures monotonic chronological ordering when clients or coaches travel across timezones, and simplifies index range scans.
  - _Cons:_ Grouping workouts by a user's "local calendar month" requires the client to pass timezone-adjusted UTC start/end timestamps in `from` and `to` (or pass an IANA timezone parameter like `tz=America/New_York` so the server computes local month boundaries before querying UTC).

### 7.2 Concurrent Writes Strategy

When the same user logs the same exercise simultaneously (e.g., double-tap on mobile or poor network retry):

1. **Network Retry Idempotency:** Clients can pass an optional `Idempotency-Key` header. A unique constraint on `(user_id, idempotency_key)` ensures that concurrent duplicate requests safely return the already-created workout record instead of duplicating data.
2. **Lock-Free PR Calculation:** Because PRs are computed from immutable `workout_sets` rows via indexed reads rather than updating a shared mutable counter row on every write, two legitimate concurrent workout logs for the same exercise never suffer from row-lock contention or lost-update race conditions.

### 7.3 Boundary Validation & Standardized Error Responses

All errors are intercepted by a global `AllExceptionsFilter` and returned in a structured RFC 7807 format:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "code": "VALIDATION_ERROR",
  "message": "Request validation failed",
  "details": [
    {
      "field": "entries[0].sets[0].unit",
      "issue": "Unsupported weight unit 'grams'. Supported units are: kg, lb"
    },
    {
      "field": "entries[0].sets[0].reps",
      "issue": "reps must be a positive integer greater than 0"
    }
  ],
  "timestamp": "2026-10-29T07:20:00.000Z",
  "path": "/api/v1/users/user_123/workouts"
}
```

- **Empty Date Ranges:** Queries that match zero workouts or zero PRs in a date range do **not** throw `404` errors; they return `200 OK` with empty data (`data: []` or `records: null`) and a descriptive `meta.message`: `"No workout entries found for the specified date range."`

---
