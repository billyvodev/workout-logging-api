# AGENTS.md

## Critical Project Instructions: Reference Documentation

> [!IMPORTANT]
> **Source of Truth Rule:**
> Always refer to and strictly adhere to the following two architectural and specification documents before implementing, refactoring, or reviewing any code:
>
> 1. [docs/architecture.md] — System Architecture, High-Scale Indexing Strategy, Normalization/Pre-computation, Mathematical Formulas, Unit Conversion Abstraction, PR Query CTEs, Concurrency & Idempotency.
> 2. [docs/api_endpoints_specification.md] — REST API Endpoints (`/api/v1`), Request/Response JSON Schemas, RFC 7807 Error Envelope & Codes, Keyset Cursor Pagination, Deterministic PR Tie-Breaking Rules, and Edge Cases.
>
> **Do not deviate from the design decisions, SQL query patterns, data schemas, or error contracts defined in these documents.**

---

## Project Overview

**Everfit Workout Logging API** is a high-performance backend service built with **NestJS**, **TypeScript**, and **PostgreSQL 17** (via **Prisma ORM**). It allows fitness coaches and clients to log single or bulk workout sets, retrieve workout history with keyset pagination, and compute Personal Records (PRs) across arbitrary time periods with period-over-period comparisons.

### Core Goals & Architectural Pillars

- **High Performance at Scale:** Sub-50ms query execution even when a single user has **50,000+ workout entries** (~200,000+ sets), achieved through write-time metric pre-computation and composite indexing.
- **Open-Closed Extensibility:** Centralized `UnitRegistry` for weight units (e.g., adding `stone` without business logic edits) and externalized exercise-to-muscle group configuration (`config/exercise-mappings.json`).
- **Analytical Accuracy:** Exact calculation of heaviest weight, highest volume, and best Epley 1RM with deterministic tie-breaking.
- **Concurrency Safety & Idempotency:** Support for `Idempotency-Key` headers on bulk writes to safely handle network retries, and lock-free analytical reads.
- **Strict Boundary Validation:** Input validation via `ValidationPipe` / `class-validator` and standardized **RFC 7807** error envelopes.
- **Production Readiness:** Containerized execution (`docker compose up`), structured JSON logging (`nestjs-pino`) with correlation IDs, and operational health checks (`GET /api/v1/health`).

---

## Tech Stack

- **Runtime & Language:** Node.js (v22 LTS), TypeScript (v5.x, strict mode)
- **Framework:** NestJS (v11) with modular domain separation, dependency injection, and pipes/filters
- **Database:** PostgreSQL 17 (B-Tree composite indexes, `pg_trgm` GIN index, window functions, and CTEs)
- **ORM / Query Builder:** Prisma ORM for schema migrations, with parameterized raw SQL (`$queryRaw`) for optimized analytical PR queries
- **Validation & Transformation:** `class-validator`, `class-transformer`, custom unit decorators (`@IsSupportedUnit`)
- **Logging:** Pino (`nestjs-pino`) with correlation ID tracing
- **Testing:** Jest, Supertest
- **Infrastructure:** Docker, Docker Compose

---

## Project Structure

```text
src/
├── common/                     # Cross-cutting concerns & shared abstractions
│   ├── decorators/             # Custom parameter/validation decorators (e.g. @IsSupportedUnit)
│   ├── filters/                # Global exception filters (RFC 7807 AllExceptionsFilter)
│   ├── middleware/             # CorrelationIdMiddleware, RequestLoggerMiddleware
│   ├── units/                  # UnitRegistry, UnitStrategy, UnitConversionService
│   └── utils/                  # Math formulas (Epley 1RM, volume) & tie-breakers
├── config/                     # Configuration loaders & exercise-mappings.json
├── modules/
│   ├── exercises/              # Exercise catalog, alias resolution & muscle group mapping
│   ├── health/                 # Health & readiness endpoint (GET /api/v1/health)
│   ├── metadata/               # Configuration metadata endpoint (GET /api/v1/metadata/config)
│   ├── prisma/                 # PrismaService & database client management
│   └── workouts/               # Workouts core domain
│       ├── controllers/        # Thin HTTP controllers (WorkoutsController, PersonalRecordsController)
│       ├── dto/                # Request & response DTOs with validation rules
│       ├── repositories/       # Prisma access & parameterized raw SQL CTE queries
│       └── services/           # LogWorkoutService, WorkoutHistoryService, PersonalRecordsService
├── app.module.ts               # Root module registering domain & common modules
└── main.ts                     # NestJS application bootstrap
```

### Architectural Rules

- **Controllers remain thin:** Validate HTTP input via DTOs, delegate directly to services, and return standardized responses. No business logic in controllers.
- **Business logic belongs in Services:** Unit normalization, Epley 1RM calculations, period comparisons, and muscle group resolution must reside in domain services or utility helpers.
- **Repositories encapsulate Data Access:** All Prisma queries and parameterized raw SQL CTEs live in repository classes.
- **No Direct Mutation of Read Models:** Analytical metrics (`weight_kg`, `volume_kg`, `estimated_1rm_kg`) are pre-computed on write and denormalized onto `workout_sets` to allow single-table index scans without table joins.

---

## Coding Standards

### TypeScript

- Use strict typing (`strict: true` in `tsconfig.json`).
- Avoid `any` under all circumstances. Use `unknown` with type guards if dynamic typing is required.
- Use `readonly` for immutable domain properties, registries, and configuration dictionaries.
- Use explicit DTO classes with `class-validator` decorators for external API contracts.

```ts
// GOOD: Type-safe, decorated DTO
export class LogSetDto {
  @IsInt()
  @Min(1)
  @Max(1000)
  readonly reps!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(5000)
  readonly weight!: number;

  @IsSupportedUnit()
  readonly unit!: string;
}

// BAD: Untyped or using any
export function processSet(set: any) { ... }
```

---

### Functions

- Keep functions small, focused, and testable.
- Prefer early returns over nested `if/else` logic.
- Avoid deep conditional nesting.

```ts
// GOOD
if (!userId) {
  throw new BadRequestException('User ID is required');
}
if (entries.length === 0) {
  return [];
}
return this.workoutRepo.bulkInsert(userId, entries);

// BAD
if (userId) {
  if (entries.length > 0) {
    ...
  }
}
```

---

### Naming Conventions

- **Variables & Functions:** `camelCase` (e.g., `calculateEpley1Rm`, `resolveMuscleGroup`, `performedAt`)
- **Classes, Interfaces, Types:** `PascalCase` (e.g., `WorkoutRepository`, `UnitStrategy`, `PersonalRecordResult`)
- **Constants & Enums:** `UPPER_SNAKE_CASE` (e.g., `UNIT_REGISTRY`, `DEFAULT_PAGE_LIMIT`)
- **Database Columns & Tables:** `snake_case` (e.g., `workout_entries`, `workout_sets`, `estimated_1rm_kg`)
- **Files:** `kebab-case.type.ts` (e.g., `workouts.controller.ts`, `unit.registry.ts`, `epley.util.ts`)

---

## Database & Query Guidelines

Refer to Section 4 & 6 of `docs/architecture.md`.

- **Write-Time Normalization:** Always store `weight_kg`, `volume_kg`, and `estimated_1rm_kg` alongside `original_weight` and `original_unit` in `workout_sets`.
- **Zero-Drift Return:** If the requested display unit matches the set's `original_unit`, return `original_weight` without conversion.
- **Parameterized SQL Only:** For complex PR CTE queries and full-text search, always use parameterized queries (`Prisma.sql` or parameterized `$queryRaw`). Never concatenate raw strings.
- **Transactions for Bulk Writes:** All multi-entry or multi-set workout logs must be wrapped in atomic Prisma transactions (`prisma.$transaction`).
- **Keyset (Cursor) Pagination:** For high-volume workout history queries, use composite keyset pagination `(performed_at, id) < ($cursorDate, $cursorId)` to guarantee $O(\log N)$ scan times.
- **Timezones:** Normalize all dates/timestamps to UTC (`TIMESTAMPTZ`) before saving.

---

## API Standards & Error Handling

Refer to `docs/api_endpoints_specification.md`.

- **Base Path:** `/api/v1`
- **RFC 7807 Error Envelope:** Handled globally by `AllExceptionsFilter`.
  ```json
  {
    "statusCode": 400,
    "error": "BAD_REQUEST",
    "code": "VALIDATION_ERROR",
    "message": "Validation failed for one or more fields.",
    "details": [
      {
        "field": "entries[0].sets[0].unit",
        "issue": "Unsupported weight unit 'oz'. Supported units are: kg, lb."
      }
    ],
    "timestamp": "2026-10-29T08:30:00.000Z",
    "path": "/api/v1/users/user_123/workouts",
    "correlationId": "req_9f8d7a6b5c4e"
  }
  ```
- **Standard Error Codes:** `VALIDATION_ERROR`, `UNSUPPORTED_UNIT`, `INVALID_CURSOR`, `IDEMPOTENCY_CONFLICT`, `BUSINESS_RULE_VIOLATION`, `INTERNAL_SERVER_ERROR`.
- **Empty Query Rule:** When queries match zero workouts or sets for a date range, return `200 OK` with an empty array (`data: []`) or null records with an informational message. **Do NOT throw 404**.
- **Idempotency:** Support `Idempotency-Key` header on `POST /api/v1/users/:userId/workouts` to prevent duplicate records on concurrent network retries.

---

## Testing Requirements

For every domain module and service:

- **Unit Tests:**
  - `UnitConversionService` & `UNIT_REGISTRY` (factor precision and round-trips)
  - Mathematical formulas (Epley formula: $w \times (1 + r / 30)$, volume: $r \times w$)
  - Deterministic PR tie-breaker sorting logic
  - DTO validation constraints (negative weights, zero reps, invalid date strings)
- **Integration / E2E Tests:**
  - Single and bulk workout creation within transactions
  - Idempotency replay with identical and conflicting payloads
  - Keyset cursor pagination navigation
  - PR calculations across all three metrics (heaviest set, highest volume, best 1RM)
  - Period-over-period comparison calculations (`compareFrom` / `compareTo`)
- **Agent Rules for Tests:**
  1. Add tests when modifying or introducing business logic.
  2. Maintain broken tests immediately.
  3. Never remove or skip tests without explicit rationale.

---

## Security & Concurrency Rules

- **Input Sanitization & Validation:** Never trust client input. Use `class-validator` with `whitelist: true, forbidNonWhitelisted: true`.
- **SQL Injection Prevention:** Never format dynamic variables into raw SQL strings. Always use Prisma parameterized placeholders.
- **Lock-Free Concurrency:** Calculate PRs from immutable `workout_sets` records via read queries; never maintain mutable counter records that trigger database row locking during concurrent writes.
- **Secrets Management:** Never commit `.env` or credentials. Use `@nestjs/config` for environment variable access.

---

## Logging Guidelines

- Use `nestjs-pino` for high-throughput, structured JSON logging.
- Automatically attach `correlationId` to every log entry via middleware.
- Log meaningful context: `userId`, `exerciseName`, `entriesCount`, `durationMs`.
- **Do not log:** Sensitive user data, authorization headers, or full payloads containing PII.

```ts
this.logger.log({
  msg: 'Workout entry created successfully',
  userId,
  exerciseName,
  setsCount: sets.length,
  durationMs,
});
```

---

## Workflow Rules

### Before Implementing

1. **Always read `docs/architecture.md` and `docs/api_endpoints_specification.md` first.**
2. Inspect affected files and understand existing module structures.
3. Check for existing utilities in `common/` or `config/` before writing new helper functions.

### When Implementing

1. Keep changes modular and adhere to NestJS architectural patterns (Module $\rightarrow$ Controller $\rightarrow$ Service $\rightarrow$ Repository).
2. Follow the mathematical formulas and data types defined in the specs.
3. Write or update tests to verify behavior changes.

### Before Finishing

1. Run `npm run lint` and `npm run format`.
2. Run `npm run test` and `npm run test:e2e`.
3. Verify that `npm run build` succeeds without TypeScript compilation errors.

---

## Pull Request & Commit Expectations

Every change should document:

- **What changed:** Clear summary of modules, services, or DTOs touched.
- **Why it changed:** How the change aligns with `docs/architecture.md` and `docs/api_endpoints_specification.md`.
- **Risks & Edge Cases:** Performance impact on large datasets (50,000+ entries), floating-point precision, or concurrency.
- **Test Coverage:** Description of unit and integration tests added or executed.

---

## Common Commands

```bash
# Install dependencies
npm install

# Start development server
npm run start:dev

# Run unit tests
npm run test

# Run e2e integration tests
npm run test:e2e

# Code formatting and linting
npm run format
npm run lint

# Compile and build
npm run build

# Database migrations & Prisma client generation
npx prisma migrate dev
npx prisma generate

# Docker Compose startup (PostgreSQL & API)
docker compose up -d
```

---

## Definition of Done

A task is complete only when:

- Architectural and API requirements from `docs/architecture.md` and `docs/api_endpoints_specification.md` are satisfied.
- Code compiles cleanly with zero TypeScript errors (`npm run build`).
- All unit and integration tests pass (`npm run test`).
- Code complies with ESLint and Prettier rules (`npm run lint`).
- Standard RFC 7807 error envelopes and proper HTTP status codes are verified.
- No security vulnerabilities or unparameterized database queries are introduced.
