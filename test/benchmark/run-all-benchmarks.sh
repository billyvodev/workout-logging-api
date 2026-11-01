#!/usr/bin/env bash
# ==============================================================================
# Master Performance Benchmark Runner
# Everfit Workout Logging API
# ==============================================================================
set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"
USER_ID="${USER_ID:-benchmark_power_user}"
RESULTS_DIR="test/benchmark/results"
QUICK_MODE=false
FILTER_SCENARIO=""

# Parse flags
while [[ $# -gt 0 ]]; do
  case $1 in
    -q|--quick)
      QUICK_MODE=true
      shift
      ;;
    -s|--scenario)
      FILTER_SCENARIO="$2"
      shift 2
      ;;
    -u|--url)
      BASE_URL="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

echo "======================================================================"
echo " Everfit Workout Logging API — Benchmark Test Suite Execution"
echo " Target Base URL : ${BASE_URL}"
echo " Target User ID  : ${USER_ID}"
if [ "$QUICK_MODE" = true ]; then
  echo " Execution Mode  : QUICK SMOKE RUN (15s per scenario)"
else
  echo " Execution Mode  : FULL SLA BENCHMARK RUN"
fi
echo "======================================================================"

# Ensure results directory exists
mkdir -p "${RESULTS_DIR}"

# 1. Health check verification
echo "[1/6] Verifying API Server Connectivity..."
if command -v curl &> /dev/null; then
  HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/v1/health" || true)
  if [ "${HEALTH_STATUS}" != "200" ]; then
    echo "⚠️  WARNING: API health probe on ${BASE_URL}/api/v1/health returned ${HEALTH_STATUS} (expected 200)."
    echo "    Make sure the application server is running ('npm run start:prod' or 'docker compose up')."
  else
    echo "✅ API server is healthy and responding."
  fi
fi

# 2. Check k6 availability (local binary or docker)
USE_DOCKER_K6=false
if command -v k6 &> /dev/null; then
  echo "Using native local 'k6' binary."
elif command -v docker &> /dev/null; then
  echo "Native 'k6' not found; using 'grafana/k6' via Docker."
  USE_DOCKER_K6=true
else
  echo "❌ Error: Neither 'k6' nor 'docker' is found in PATH."
  echo "   Install k6: https://k6.io/docs/get-started/installation/"
  exit 1
fi

run_k6() {
  local scenario="$1"
  local extra_args=()
  if [ "$QUICK_MODE" = true ]; then
    extra_args=(--vus 10 --duration 15s)
  fi

  if [ "$USE_DOCKER_K6" = true ]; then
    local docker_url="${BASE_URL/localhost/host.docker.internal}"
    docker_url="${docker_url/127.0.0.1/host.docker.internal}"
    docker run --rm -v "${PWD}:/app" -w /app -e BASE_URL="${docker_url}" -e USER_ID="${USER_ID}" grafana/k6 run "${extra_args[@]}" "${scenario}"
  else
    k6 run "${extra_args[@]}" "${scenario}"
  fi
}

scenarios=(
  "test/benchmark/scenarios/01_health_and_meta.js"
  "test/benchmark/scenarios/02_workouts_history.js"
  "test/benchmark/scenarios/03_personal_records.js"
  "test/benchmark/scenarios/04_write_transactions.js"
  "test/benchmark/scenarios/05_mixed_workload.js"
)

for sc in "${scenarios[@]}"; do
  if [ -n "$FILTER_SCENARIO" ] && [[ "$sc" != *"$FILTER_SCENARIO"* ]]; then
    continue
  fi
  echo ""
  echo "Executing ${sc}..."
  run_k6 "${sc}"
done

echo ""
echo "======================================================================"
echo " Generating SLA Compliance & Percentile Markdown Report..."
echo "======================================================================"
npx ts-node test/benchmark/report-generator.ts

echo ""
echo "✅ Benchmark execution complete! View full report at: ${RESULTS_DIR}/benchmark-report.md"
