#!/usr/bin/env bash
# ==============================================================================
# Master Performance Benchmark Runner
# Everfit Workout Logging API
# ==============================================================================
set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"
USER_ID="${USER_ID:-benchmark_power_user}"
RESULTS_DIR="test/benchmark/results"

echo "======================================================================"
echo " Everfit Workout Logging API — Benchmark Test Suite Execution"
echo " Target Base URL : ${BASE_URL}"
echo " Target User ID  : ${USER_ID}"
echo "======================================================================"

# Ensure results directory exists
mkdir -p "${RESULTS_DIR}"

# 1. Health check verification
echo "[1/6] Verifying API Server Connectivity..."
if command -v curl &> /dev/null; then
  HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/v1/health" || true)
  if [ "${HEALTH_STATUS}" != "200" ]; then
    echo "⚠️  WARNING: API health probe on ${BASE_URL}/api/v1/health returned ${HEALTH_STATUS} (expected 200)."
    echo "    Make sure the application server is running ('npm run start:dev' or 'docker compose up')."
  else
    echo "✅ API server is healthy and responding."
  fi
fi

# 2. Check k6 availability
if ! command -v k6 &> /dev/null; then
  echo "❌ Error: 'k6' binary is not installed or not in PATH."
  echo "   Install k6: https://k6.io/docs/get-started/installation/"
  exit 1
fi

echo ""
echo "[2/6] Executing Scenario 01: Health & Metadata Probe..."
k6 run test/benchmark/scenarios/01_health_and_meta.js

echo ""
echo "[3/6] Executing Scenario 02: Workouts History & Keyset Pagination..."
k6 run test/benchmark/scenarios/02_workouts_history.js

echo ""
echo "[4/6] Executing Scenario 03: Personal Records CTE Engine..."
k6 run test/benchmark/scenarios/03_personal_records.js

echo ""
echo "[5/6] Executing Scenario 04: Write Transactions & Idempotency..."
k6 run test/benchmark/scenarios/04_write_transactions.js

echo ""
echo "[6/6] Executing Scenario 05: Mixed Production Workload..."
k6 run test/benchmark/scenarios/05_mixed_workload.js

echo ""
echo "======================================================================"
echo " Generating SLA Compliance & Percentile Markdown Report..."
echo "======================================================================"
npx ts-node test/benchmark/report-generator.ts

echo ""
echo "✅ Benchmark execution complete! View full report at: ${RESULTS_DIR}/benchmark-report.md"

