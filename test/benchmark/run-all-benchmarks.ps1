<#
.SYNOPSIS
    Master Performance Benchmark Runner (Windows PowerShell)
    Everfit Workout Logging API
#>

param(
    [string]$BaseUrl = $env:BASE_URL,
    [string]$UserId = $env:USER_ID
)

if (-not $BaseUrl) { $BaseUrl = "http://localhost:3000" }
if (-not $UserId) { $UserId = "benchmark_power_user" }

$env:BASE_URL = $BaseUrl
$env:USER_ID = $UserId
$ResultsDir = "test/benchmark/results"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " Everfit Workout Logging API — Benchmark Test Suite Execution" -ForegroundColor Cyan
Write-Host " Target Base URL : $BaseUrl" -ForegroundColor Cyan
Write-Host " Target User ID  : $UserId" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

if (-not (Test-Path $ResultsDir)) {
    New-Item -ItemType Directory -Force -Path $ResultsDir | Out-Null
}

# 1. Health check verification
Write-Host "`n[1/6] Verifying API Server Connectivity..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$BaseUrl/api/v1/health" -Method Get -TimeoutSec 5
    if ($health.status -eq "ok") {
        Write-Host "API server is healthy and responding (Database: $($health.database))." -ForegroundColor Green
    } else {
        Write-Host "WARNING: Unexpected health status: $($health.status)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "WARNING: Failed to connect to $BaseUrl/api/v1/health. Ensure server is running ('npm run start:dev' or 'docker compose up')." -ForegroundColor Yellow
}

# 2. Check k6 availability
if (-not (Get-Command k6 -ErrorAction SilentlyContinue)) {
    Write-Host "Error: 'k6' binary is not found in PATH." -ForegroundColor Red
    Write-Host "Install k6 via winget: 'winget install k6 --source winget' or choco: 'choco install k6'" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n[2/6] Executing Scenario 01: Health & Metadata Probe..." -ForegroundColor Cyan
k6 run test/benchmark/scenarios/01_health_and_meta.js

Write-Host "`n[3/6] Executing Scenario 02: Workouts History & Keyset Pagination..." -ForegroundColor Cyan
k6 run test/benchmark/scenarios/02_workouts_history.js

Write-Host "`n[4/6] Executing Scenario 03: Personal Records CTE Engine..." -ForegroundColor Cyan
k6 run test/benchmark/scenarios/03_personal_records.js

Write-Host "`n[5/6] Executing Scenario 04: Write Transactions & Idempotency..." -ForegroundColor Cyan
k6 run test/benchmark/scenarios/04_write_transactions.js

Write-Host "`n[6/6] Executing Scenario 05: Mixed Production Workload..." -ForegroundColor Cyan
k6 run test/benchmark/scenarios/05_mixed_workload.js

Write-Host "`n======================================================================" -ForegroundColor Cyan
Write-Host " Generating SLA Compliance & Percentile Markdown Report..." -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
npx ts-node test/benchmark/report-generator.ts

Write-Host "`nBenchmark execution complete! View full report at: $ResultsDir/benchmark-report.md" -ForegroundColor Green

