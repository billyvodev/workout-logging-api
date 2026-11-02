# Workout Logging API — Endpoint Requirements Specification

## 1. Overview & Global Conventions

### 1.1 Base URL & Versioning

All endpoints are prefixed with `/api/v1` and scoped to a specific user via the `:userId` path parameter (or accepted in the request payload/query where applicable).

* **Base Path:** `/api/v1`

* **Authentication:** None required per assignment constraints (`userId` is passed directly as a parameter).

### 1.2 Data Formats & Standards

* **Content-Type:** `application/json; charset=utf-8`

* **Timestamps & Dates:** Must adhere to **ISO 8601** format (`YYYY-MM-DDTHH:mm:ss.sssZ` or with explicit timezone offset like `2026-10-29T15:30:00+07:00`). All timestamps are normalized and persisted in **UTC**.

* **Numeric Precision:**

  * Internal storage maintains 4 decimal places (`NUMERIC(10,4)`) in kilograms (`kg`) to prevent floating-point drift.

  * API responses round converted weights, volumes, and estimated 1RM values to **2 decimal places** (e.g., `102.06`).

  * If the requested output `unit` matches the set's `originalUnit`, the exact `originalWeight` is returned without round-trip conversion drift.

### 1.3 Supported Weight Units

* **Default Supported Units:** `kg`, `lb`

* **Conversion Factors:**

  * $1\text{ kg} = 1.0\text{ kg}$

  * $1\text{ lb} = 0.45359237\text{ kg}$ ($1\text{ kg} \approx 2.20462262\text{ lb}$)

* **Extensibility:** Unit validation dynamically reads from the centralized `UnitConversionRegistry`. Adding a unit (e.g., `st` for stone) in the registry automatically enables it across all request validators and query converters.

## 2. Standard Error Response Contract

All validation, domain, and system errors must return a consistent JSON structure modeled after **RFC 7807 (Problem Details for HTTP APIs)** so clients can reliably parse failures.

### Error Response Schema

```
{
  "statusCode": 400,
  "error": "BAD_REQUEST",
  "message": "Validation failed for one or more fields.",
  "details": [
    {
      "field": "entries[0].sets[1].weight",
      "issue": "Weight must be a non-negative number (received: -50)."
    },
    {
      "field": "entries[0].sets[1].unit",
      "issue": "Unsupported weight unit 'oz'. Supported units are: kg, lb."
    }
  ],
  "timestamp": "2026-10-29T08:30:00.000Z",
  "path": "/api/v1/users/user_123/workouts",
  "correlationId": "req_9f8d7a6b5c4e"
}

```

### Standard Error Codes

| HTTP Status | Error Code | Trigger Condition | 
| ----- | ----- | ----- | 
| `400 Bad Request` | `VALIDATION_ERROR` | Missing required fields, null date, negative weight, `reps <= 0`, empty `sets` array, or malformed date ranges (`from > to`). | 
| `400 Bad Request` | `UNSUPPORTED_UNIT` | Weight unit provided in body or query parameter is not registered in the unit configuration. | 
| `400 Bad Request` | `INVALID_CURSOR` | Pagination cursor cannot be decoded or has been tampered with. | 
| `409 Conflict` | `IDEMPOTENCY_CONFLICT` | Same `Idempotency-Key` reused with a different request payload while a concurrent request is in flight. | 
| `422 Unprocessable Entity` | `BUSINESS_RULE_VIOLATION` | Semantic validation failure (e.g., bulk request exceeds max batch size of 100 exercises). | 
| `500 Internal Server Error` | `INTERNAL_SERVER_ERROR` | Unhandled database or runtime exception (stack traces are never leaked in production). | 

## 3. Endpoint Specifications

### 3.1 Log Workout Entry (Single & Bulk)

Logs one or multiple exercise entries for a user in a single atomic transaction. For every set, the system validates the input, resolves the muscle group from the configurable exercise catalog, normalizes the weight into `kg`, and pre-computes set volume and Epley 1RM.

* **Method & Path:** `POST /api/v1/users/:userId/workouts`

#### Request Headers

| Header | Required | Description | 
| ----- | ----- | ----- | 
| `Content-Type` | Yes | Must be `application/json`. | 
| `Idempotency-Key` | No | Optional unique string (e.g., UUID v4) to safely retry requests without duplicating logs during concurrent writes or network timeouts. | 

#### Request Body Schema

To support both **Single Entry** and **Bulk Logging** ergonomically, the endpoint accepts either a single workout object OR a bulk wrapper containing an `entries` array.

**Option A: Single Exercise Payload**

```
{
  "date": "2026-10-29T10:30:00Z",
  "exerciseName": "Barbell Bench Press",
  "sets": [
    { "reps": 8, "weight": 225, "unit": "lb" },
    { "reps": 6, "weight": 235, "unit": "lb" }
  ]
}

```

**Option B: Bulk Exercises Payload (Multiple Exercises in One Request)**

```
{
  "entries": [
    {
      "date": "2026-10-29T10:30:00Z",
      "exerciseName": "Barbell Bench Press",
      "sets": [
        { "reps": 8, "weight": 225, "unit": "lb" },
        { "reps": 6, "weight": 235, "unit": "lb" }
      ]
    },
    {
      "date": "2026-10-29T10:55:00Z",
      "exerciseName": "Incline Dumbbell Press",
      "sets": [
        { "reps": 10, "weight": 35, "unit": "kg" },
        { "reps": 10, "weight": 35, "unit": "kg" }
      ]
    }
  ]
}

```

#### Field Validation Rules

| Field | Type | Constraints | 
| ----- | ----- | ----- | 
| `userId` | `string` | Non-empty string, max 128 chars. | 
| `entries` | `array` | If using bulk format: min 1 item, max 100 items per request. | 
| `date` | `string` | Required, non-null valid ISO 8601 date/timestamp string. | 
| `exerciseName` | `string` | Required, trimmed non-empty string (1–150 chars). | 
| `sets` | `array` | Required, non-empty array (`minItems: 1`, `maxItems: 100`). | 
| `sets[].reps` | `integer` | Required, positive integer (`reps >= 1`, `reps <= 1000`). Negative or zero reps rejected. | 
| `sets[].weight` | `number` | Required, finite number (`weight >= 0`, `weight <= 5000`). `0` is allowed for bodyweight sets; negative weights rejected. | 
| `sets[].unit` | `string` | Required, case-insensitive match against registered units (`kg`, `lb`). | 

#### Success Response (`201 Created`)

```
{
  "data": [
    {
      "id": "entry_01jcbe99z8x",
      "userId": "user_123",
      "date": "2026-10-29T10:30:00.000Z",
      "exerciseName": "Barbell Bench Press",
      "exerciseNameNormalized": "barbell bench press",
      "muscleGroup": "chest",
      "sets": [
        {
          "id": "set_01jcbe99z9a",
          "setNumber": 1,
          "reps": 8,
          "original": {
            "weight": 225,
            "unit": "lb"
          },
          "normalized": {
            "weightKg": 102.06,
            "volumeKg": 816.47,
            "estimated1RmKg": 129.27
          }
        },
        {
          "id": "set_01jcbe99z9b",
          "setNumber": 2,
          "reps": 6,
          "original": {
            "weight": 235,
            "unit": "lb"
          },
          "normalized": {
            "weightKg": 106.59,
            "volumeKg": 639.57,
            "estimated1RmKg": 127.91
          }
        }
      ],
      "createdAt": "2026-10-29T10:30:05.120Z"
    }
  ],
  "meta": {
    "entriesLogged": 1,
    "totalSetsLogged": 2
  }
}

```

### 3.2 Get Workout History

Retrieves a paginated list of workout entries for a user, ordered chronologically (`performed_at DESC, id DESC`). Supports partial exercise name matching, date range bounds, muscle group filtering, and dynamic unit conversion.

* **Method & Path:** `GET /api/v1/users/:userId/workouts`

#### Query Parameters

| Parameter | Type | Required | Default | Description & Validation Rules | 
| ----- | ----- | ----- | ----- | ----- | 
| `exerciseName` | `string` | No | — | Case-insensitive **partial match** (e.g., `bench` matches `"Barbell Bench Press"` and `"Incline Bench"`). | 
| `from` | `string` | No | — | Inclusive start date/timestamp (ISO 8601). If date-only (`2026-10-01`), defaults to `00:00:00.000Z`. | 
| `to` | `string` | No | — | Inclusive end date/timestamp (ISO 8601). If date-only (`2026-10-31`), defaults to `23:59:59.999Z`. Must be `>= from`. | 
| `muscleGroup` | `string` | No | — | Case-insensitive exact match on resolved muscle group (e.g., `chest`, `back`, `legs`, `shoulders`, `arms`, `core`). | 
| `unit` | `string` | No | `kg` | Target unit for returned weights (`kg`, `lb`). If omitted, values are returned in `kg` alongside original metadata. | 
| `limit` | `integer` | No | `20` | Number of entries per page (`min: 1`, `max: 100`). | 
| `cursor` | `string` | No | — | Opaque Base64-encoded cursor (`performed_at + id`) from previous response for $O(\log N)$ keyset pagination. | 

#### Success Response (`200 OK`)

```
{
  "data": [
    {
      "id": "entry_01jcbe99z8x",
      "userId": "user_123",
      "date": "2026-10-29T10:30:00.000Z",
      "exerciseName": "Barbell Bench Press",
      "muscleGroup": "chest",
      "sets": [
        {
          "setNumber": 1,
          "reps": 8,
          "weight": 225,
          "unit": "lb",
          "volume": 1800,
          "estimated1RM": 285,
          "original": {
            "weight": 225,
            "unit": "lb"
          },
          "normalizedKg": 102.06
        }
      ]
    }
  ],
  "pagination": {
    "limit": 20,
    "hasNextPage": true,
    "nextCursor": "eyJwZXJmb3JtZWRBdCI6IjIwMjYtMTAtMjlUMTA6MzA6MDAuMDAwWiIsImlkIjoiZW50cnlfMDFqY2JlOTl6OHgifQ=="
  },
  "meta": {
    "requestedUnit": "lb",
    "message": "Workout entries retrieved successfully."
  }
}

```

#### Edge Case: Date Range or Filter With No Data (`200 OK`)

Per assignment requirements, empty results **must not** throw a `404` error. They must return an empty array with a clear informational message:

```
{
  "data": [],
  "pagination": {
    "limit": 20,
    "hasNextPage": false,
    "nextCursor": null
  },
  "meta": {
    "requestedUnit": "kg",
    "message": "No workout entries found for the specified filter criteria and date range."
  }
}

```

### 3.3 Get Personal Records (PRs) & Time-Range Comparison

Calculates and returns the user's Personal Records for a specific exercise:

1. **Heaviest Single Set:** Maximum single-set weight lifted.

2. **Highest Volume Set:** Maximum single-set volume ($\text{reps} \times \text{weight}$).

3. **Best Estimated 1RM:** Maximum single-set Epley 1RM:
   

   $$
   \text{1RM} = \text{weight} \times \left(1 + \frac{\text{reps}}{30}\right)
   $$

Also supports comparing PRs across two arbitrary time windows (e.g., *"this month vs last month"*).

* **Method & Path:** `GET /api/v1/users/:userId/personal-records`

#### Query Parameters

| Parameter | Type | Required | Default | Description & Validation Rules | 
| ----- | ----- | ----- | ----- | ----- | 
| `exerciseName` | `string` | **Yes** | — | Target exercise name (case-insensitive trimmed match, or canonical alias match). | 
| `unit` | `string` | No | `kg` | Target unit for all returned PR weights, volumes, and 1RMs (`kg`, `lb`). | 
| `from` | `string` | No | — | Start of primary period (ISO 8601). If both `from` and `to` are omitted, calculates **All-Time PRs**. | 
| `to` | `string` | No | — | End of primary period (ISO 8601). Must be `>= from`. | 
| `compareFrom` | `string` | No | — | Start of comparison period (ISO 8601). Requires `compareTo` if provided. | 
| `compareTo` | `string` | No | — | End of comparison period (ISO 8601). Requires `compareFrom` if provided. Must be `>= compareFrom`. | 

#### Deterministic Tie-Breaking Rules

If a user achieves the exact same PR weight, volume, or 1RM on multiple sets:

1. **Primary Sort:** Metric value `DESC` (`weight_kg`, `volume_kg`, or `estimated_1rm_kg`).

2. **Secondary Tie-Breaker:** For `heaviestSet`, higher `reps` wins (`reps DESC`). For `bestEstimated1RM` and `highestVolumeSet`, heavier actual weight wins (`weight_kg DESC`).

3. **Tertiary Tie-Breaker:** Most recent timestamp wins (`performed_at DESC`).

#### Success Response — With Time-Range Comparison (`200 OK`)

Example request:
`GET /api/v1/users/user_123/personal-records?exerciseName=Barbell%20Bench%20Press&unit=lb&from=2026-10-01T00:00:00Z&to=2026-10-31T23:59:59Z&compareFrom=2026-09-01T00:00:00Z&compareTo=2026-09-30T23:59:59Z`

```
{
  "data": {
    "userId": "user_123",
    "exerciseName": "Barbell Bench Press",
    "muscleGroup": "chest",
    "unit": "lb",
    "primaryPeriod": {
      "range": {
        "from": "2026-10-01T00:00:00.000Z",
        "to": "2026-10-31T23:59:59.000Z"
      },
      "records": {
        "heaviestSet": {
          "weight": 245,
          "reps": 3,
          "unit": "lb",
          "achievedAt": "2026-10-18T14:20:00.000Z",
          "workoutEntryId": "entry_01j9abc",
          "setId": "set_01j9abd"
        },
        "highestVolumeSet": {
          "volume": 2250,
          "weight": 225,
          "reps": 10,
          "unit": "lb",
          "achievedAt": "2026-10-12T11:00:00.000Z",
          "workoutEntryId": "entry_01j8xyz",
          "setId": "set_01j8xy0"
        },
        "bestEstimated1RM": {
          "estimated1RM": 285,
          "weight": 225,
          "reps": 8,
          "unit": "lb",
          "achievedAt": "2026-10-25T16:00:00.000Z",
          "workoutEntryId": "entry_01j9def",
          "setId": "set_01j9deg"
        }
      }
    },
    "comparisonPeriod": {
      "range": {
        "from": "2026-09-01T00:00:00.000Z",
        "to": "2026-09-30T23:59:59.000Z"
      },
      "records": {
        "heaviestSet": {
          "weight": 235,
          "reps": 3,
          "unit": "lb",
          "achievedAt": "2026-09-20T14:20:00.000Z",
          "workoutEntryId": "entry_01j7aaa",
          "setId": "set_01j7aab"
        },
        "highestVolumeSet": {
          "volume": 2050,
          "weight": 205,
          "reps": 10,
          "unit": "lb",
          "achievedAt": "2026-09-10T11:00:00.000Z",
          "workoutEntryId": "entry_01j7bbb",
          "setId": "set_01j7bbc"
        },
        "bestEstimated1RM": {
          "estimated1RM": 270,
          "weight": 225,
          "reps": 6,
          "unit": "lb",
          "achievedAt": "2026-09-28T16:00:00.000Z",
          "workoutEntryId": "entry_01j7ccc",
          "setId": "set_01j7ccd"
        }
      }
    },
    "comparison": {
      "heaviestSet": {
        "absoluteDiff": 10,
        "percentageDiff": 4.26,
        "improved": true
      },
      "highestVolumeSet": {
        "absoluteDiff": 200,
        "percentageDiff": 9.76,
        "improved": true
      },
      "bestEstimated1RM": {
        "absoluteDiff": 15,
        "percentageDiff": 5.56,
        "improved": true
      }
    }
  },
  "meta": {
    "message": "Personal records calculated successfully."
  }
}

```

#### Edge Case: No PR Data Found in Time Range (`200 OK`)

If the user has no logged sets for the exercise in the requested period, `records` fields return `null` with a descriptive message rather than throwing an error:

```
{
  "data": {
    "userId": "user_123",
    "exerciseName": "Barbell Bench Press",
    "muscleGroup": "chest",
    "unit": "kg",
    "primaryPeriod": {
      "range": {
        "from": "2026-10-01T00:00:00.000Z",
        "to": "2026-10-31T23:59:59.000Z"
      },
      "records": {
        "heaviestSet": null,
        "highestVolumeSet": null,
        "bestEstimated1RM": null
      }
    },
    "comparisonPeriod": null,
    "comparison": null
  },
  "meta": {
    "message": "No workout sets found for 'Barbell Bench Press' in the specified date range."
  }
}

```

### 3.4 Operational & Extensibility Endpoints (Bonus / Production Readiness)

To demonstrate production readiness and configurable metadata without code changes:

#### 1. Health & Readiness Check

* **Endpoint:** `GET /api/v1/health`

* **Purpose:** Used by Docker Compose and load balancers to verify API and PostgreSQL connectivity.

* **Response (`200 OK`):**

  ```
  {
    "status": "ok",
    "database": "connected",
    "uptimeSeconds": 342.5,
    "timestamp": "2026-10-29T08:35:00.000Z"
  }
  
  ```

#### 2. List Supported Units & Exercise Muscle Mappings

* **Endpoint:** `GET /api/v1/metadata/config`

* **Purpose:** Allows clients/coaches to inspect currently registered weight units and configured Exercise $\rightarrow$ Muscle Group mappings.

## 4. Non-Functional & Edge Case Requirements Matrix

| Scenario | Expected API Behavior | 
| ----- | ----- | 
| **Unsupported Weight Unit** (e.g., `"unit": "grams"`) | Reject immediately at DTO boundary with `400 Bad Request` (`UNSUPPORTED_UNIT`) and list valid units dynamically. | 
| **Negative Weight or Zero/Negative Reps** | Reject with `400 Bad Request` (`VALIDATION_ERROR`) specifying the exact array index (`sets[0].reps`). | 
| **Empty `sets: []` Array** | Reject with `400 Bad Request` (`sets must contain at least 1 item`). | 
| **Null or Invalid `date`** | Reject with `400 Bad Request` (`date must be a valid ISO 8601 date string`). | 
| **Inverted Date Range (`from > to`)** | Reject with `400 Bad Request` (`'from' date must be earlier than or equal to 'to' date`). | 
| **Concurrent Identical POSTs** | If `Idempotency-Key` is provided, return the original `201/200` response without creating duplicate rows. Without key, both insert cleanly via non-blocking row inserts. | 
| **50,000+ Workout Entries per User** | `GET /workouts` uses composite B-Tree index `(user_id, performed_at DESC, id DESC)` with cursor pagination ($< 20\text{ms}$). `GET /personal-records` uses denormalized `workout_sets` composite index `(user_id, exercise_name_normalized, performed_at)` ($< 30\text{ms}$). | 
