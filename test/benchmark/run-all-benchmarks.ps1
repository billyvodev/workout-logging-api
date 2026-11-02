param(
    [string]$BaseUrl = $env:BASE_URL,
    [string]$UserId = $env:USER_ID,
    [string]$Scenario = "",
    [switch]$Quick
)

if (-not $BaseUrl) { $BaseUrl = "http://localhost:3000" }
if (-not $UserId) { $UserId = "benchmark_power_user" }

$env:BASE_URL = $BaseUrl
$env:USER_ID = $UserId
$ResultsDir = "test/benchmark/results"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " Workout Logging API - Benchmark Test Suite Execution" -ForegroundColor Cyan
Write-Host " Target Base URL : $BaseUrl" -ForegroundColor Cyan
Write-Host " Target User ID  : $UserId" -ForegroundColor Cyan
if ($Quick) {
    Write-Host " Execution Mode  : QUICK SMOKE RUN (15s per scenario)" -ForegroundColor Magenta
} else {
    Write-Host " Execution Mode  : FULL SLA BENCHMARK RUN" -ForegroundColor Green
}
Write-Host "======================================================================" -ForegroundColor Cyan

if (-not (Test-Path $ResultsDir)) {
    New-Item -ItemType Directory -Force -Path $ResultsDir | Out-Null
}

# 1. Health check verification
Write-Host ""
Write-Host "[1/6] Verifying API Server Connectivity..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$BaseUrl/api/v1/health" -Method Get -TimeoutSec 5
    if ($health.status -eq "ok") {
        Write-Host "API server is healthy and responding (Database: $($health.database), Uptime: $($health.uptimeSeconds)s)." -ForegroundColor Green
    } else {
        Write-Host "WARNING: Unexpected health status: $($health.status)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "WARNING: Failed to connect to $BaseUrl/api/v1/health. Ensure server is running." -ForegroundColor Yellow
}

# 2. Check k6 availability (native binary or Docker container)
$UseDockerK6 = $false
if (Get-Command k6 -ErrorAction SilentlyContinue) {
    Write-Host "Using native local 'k6' binary." -ForegroundColor Green
} elseif (Get-Command docker -ErrorAction SilentlyContinue) {
    Write-Host "Native 'k6' not found in PATH; utilizing grafana/k6 via Docker." -ForegroundColor Yellow
    $UseDockerK6 = $true
} else {
    Write-Host "Error: Neither 'k6' nor 'docker' is found in PATH." -ForegroundColor Red
    Write-Host "Install k6 via winget: 'winget install k6 --source winget' or install Docker Desktop." -ForegroundColor Yellow
    exit 1
}

function Invoke-BenchmarkScript {
    param([string]$ScriptPath)

    if ($UseDockerK6) {
        $dockerBaseUrl = $BaseUrl.Replace("localhost", "host.docker.internal").Replace("127.0.0.1", "host.docker.internal")
        if ($Quick) {
            docker run --rm -v "${PWD}:/app" -w /app -e BASE_URL="$dockerBaseUrl" -e USER_ID="$UserId" grafana/k6 run --vus 10 --duration 15s $ScriptPath
        } else {
            docker run --rm -v "${PWD}:/app" -w /app -e BASE_URL="$dockerBaseUrl" -e USER_ID="$UserId" grafana/k6 run $ScriptPath
        }
    } else {
        if ($Quick) {
            k6 run --vus 10 --duration 15s $ScriptPath
        } else {
            k6 run $ScriptPath
        }
    }
}

$scenarios = @(
    @{ Name = "01: Health and Metadata Probe"; Script = "test/benchmark/scenarios/01_health_and_meta.js"; Id = "01" },
    @{ Name = "02: Workouts History and Keyset Pagination"; Script = "test/benchmark/scenarios/02_workouts_history.js"; Id = "02" },
    @{ Name = "03: Personal Records CTE Engine"; Script = "test/benchmark/scenarios/03_personal_records.js"; Id = "03" },
    @{ Name = "04: Write Transactions and Idempotency"; Script = "test/benchmark/scenarios/04_write_transactions.js"; Id = "04" },
    @{ Name = "05: Mixed Production Workload"; Script = "test/benchmark/scenarios/05_mixed_workload.js"; Id = "05" }
)

foreach ($sc in $scenarios) {
    if ($Scenario -ne "" -and ($Scenario -ne $sc.Id -and -not $sc.Script.Contains($Scenario))) {
        continue
    }

    Write-Host ""
    Write-Host "Executing $($sc.Name)..." -ForegroundColor Cyan
    Invoke-BenchmarkScript $sc.Script
}

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " Generating SLA Compliance and Percentile Markdown Report..." -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
npx ts-node test/benchmark/report-generator.ts

Write-Host ""
Write-Host "Benchmark execution complete! View full report at: $ResultsDir/benchmark-report.md" -ForegroundColor Green
