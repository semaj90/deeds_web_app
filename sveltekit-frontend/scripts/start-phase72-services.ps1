#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Phase 72 Topology Brain - Complete Startup Script

.DESCRIPTION
    Starts all required services for Phase 72 error topology vectorization:
    - Go Phase 72 Ingest Service (port 8089)
    - Redis Cache (port 4005)
    - Qdrant Vector DB (port 6333)
    - SIMD JSON Accelerator (port 8103)
    - Postgres with pgvector

.PARAMETER SkipDocker
    Skip Docker-based services (Qdrant)

.PARAMETER QuickStart
    Start only essential services (skip SIMD, run minimal checks)
#>

param(
    [switch]$SkipDocker,
    [switch]$QuickStart
)

$ErrorActionPreference = "Continue"

Write-Host "`n╔══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Phase 72 Topology Brain - Startup Script               ║" -ForegroundColor Cyan
Write-Host "║  Error Knowledge Base with Vector Search               ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Set environment variables
$env:SIMD_JSON_ACCEL_PORT = "8103"
$env:SIMD_JSON_ACCEL_URL = "http://127.0.0.1:8103"
$env:GO_INGEST_URL = "http://127.0.0.1:8089"
$env:REDIS_URL = "redis://127.0.0.1:4005"
$env:QDRANT_URL = "http://localhost:6333"
$env:DATABASE_URL = "postgresql://legal_admin:123456@localhost:5434/legal_ai_db"

Write-Host "🔧 Environment variables set:" -ForegroundColor Yellow
Write-Host "   SIMD_JSON_ACCEL_URL: $env:SIMD_JSON_ACCEL_URL" -ForegroundColor Gray
Write-Host "   GO_INGEST_URL: $env:GO_INGEST_URL" -ForegroundColor Gray
Write-Host "   REDIS_URL: $env:REDIS_URL" -ForegroundColor Gray
Write-Host "   QDRANT_URL: $env:QDRANT_URL" -ForegroundColor Gray

# 1. Start Redis (Port 4005)
Write-Host "`n1️⃣  Starting Redis Cache (Port 4005)..." -ForegroundColor Yellow
$redisPath = "..\..\redis-latest\redis-server.exe"
if (Test-Path $redisPath) {
    $redisProcess = Get-Process -Name "redis-server" -ErrorAction SilentlyContinue
    if ($redisProcess) {
        Write-Host "   ✅ Redis already running (PID: $($redisProcess.Id))" -ForegroundColor Green
    } else {
        Start-Process -FilePath $redisPath -ArgumentList "--port 4005" -WindowStyle Hidden
        Start-Sleep -Seconds 2
        Write-Host "   ✅ Redis started on port 4005" -ForegroundColor Green
    }
} else {
    Write-Host "   ⚠️  Redis not found at $redisPath" -ForegroundColor Red
    Write-Host "   Download: https://github.com/tporadowski/redis/releases" -ForegroundColor Gray
}

# 2. Start Qdrant (Docker on port 6333)
if (-not $SkipDocker) {
    Write-Host "`n2️⃣  Starting Qdrant Vector Database (Port 6333)..." -ForegroundColor Yellow
    $qdrantContainer = docker ps -a --filter "name=qdrant-phase72" --format "{{.Names}}" 2>$null

    if ($qdrantContainer -eq "qdrant-phase72") {
        $qdrantRunning = docker ps --filter "name=qdrant-phase72" --format "{{.Names}}" 2>$null
        if ($qdrantRunning) {
            Write-Host "   ✅ Qdrant already running" -ForegroundColor Green
        } else {
            docker start qdrant-phase72 2>$null | Out-Null
            Start-Sleep -Seconds 3
            Write-Host "   ✅ Qdrant container started" -ForegroundColor Green
        }
    } else {
        docker run -d --name qdrant-phase72 -p 6333:6333 -p 6334:6334 `
            -v qdrant_storage:/qdrant/storage `
            qdrant/qdrant:latest 2>$null | Out-Null
        Start-Sleep -Seconds 5
        Write-Host "   ✅ Qdrant container created and started" -ForegroundColor Green
    }
} else {
    Write-Host "`n2️⃣  Skipping Qdrant (Docker)" -ForegroundColor Gray
}

# 3. Start Go Phase 72 Ingest Service (Port 8089)
Write-Host "`n3️⃣  Starting Go Phase 72 Ingest Service (Port 8089)..." -ForegroundColor Yellow
$goIngestPath = "..\..\go-services\phase72-ingest"
if (Test-Path "$goIngestPath\main.go") {
    $goProcess = Get-Process -Name "phase72-ingest" -ErrorAction SilentlyContinue
    if (-not $goProcess) {
        Start-Process -FilePath "powershell" -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"cd '$goIngestPath'; go run main.go`"" -WindowStyle Hidden
        Start-Sleep -Seconds 3
        Write-Host "   ✅ Go ingest service started on port 8089" -ForegroundColor Green
    } else {
        Write-Host "   ✅ Go ingest service already running" -ForegroundColor Green
    }
} else {
    Write-Host "   ⚠️  Go service not found at $goIngestPath" -ForegroundColor Red
}

# 4. Start SIMD JSON Accelerator (Optional, Port 8103)
if (-not $QuickStart) {
    Write-Host "`n4️⃣  Starting SIMD JSON Accelerator (Port 8103)..." -ForegroundColor Yellow
    $simdPath = "..\..\go-services\simd-json-accelerator"
    if (Test-Path "$simdPath\simd-json-accelerator.exe") {
        $simdProcess = Get-Process -Name "simd-json-accelerator" -ErrorAction SilentlyContinue
        if (-not $simdProcess) {
            Start-Process -FilePath "$simdPath\simd-json-accelerator.exe" -WindowStyle Hidden
            Start-Sleep -Seconds 2
            Write-Host "   ✅ SIMD accelerator started on port 8103" -ForegroundColor Green
        } else {
            Write-Host "   ✅ SIMD accelerator already running" -ForegroundColor Green
        }
    } else {
        Write-Host "   ⚠️  SIMD accelerator not built" -ForegroundColor Yellow
        Write-Host "   Build with: cd $simdPath && go build" -ForegroundColor Gray
    }
} else {
    Write-Host "`n4️⃣  Skipping SIMD accelerator (QuickStart mode)" -ForegroundColor Gray
}

# 5. Health Checks
Write-Host "`n5️⃣  Running Health Checks..." -ForegroundColor Yellow

# Redis
try {
    $redisTest = & "..\..\redis-latest\redis-cli.exe" -p 4005 PING 2>$null
    if ($redisTest -match "PONG") {
        Write-Host "   ✅ Redis: OK" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Redis: Not responding" -ForegroundColor Red
    }
} catch {
    Write-Host "   ❌ Redis: Error - $_" -ForegroundColor Red
}

# Qdrant
if (-not $SkipDocker) {
    try {
        $qdrantHealth = Invoke-RestMethod -Uri "http://localhost:6333/health" -TimeoutSec 2
        if ($qdrantHealth.status -eq "ok") {
            Write-Host "   ✅ Qdrant: OK" -ForegroundColor Green
        } else {
            Write-Host "   ⚠️  Qdrant: Unhealthy" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "   ❌ Qdrant: Not responding" -ForegroundColor Red
    }
}

# Go Ingest
try {
    $goHealth = Invoke-RestMethod -Uri "http://127.0.0.1:8089/health" -TimeoutSec 2
    if ($goHealth.status -eq "ok") {
        Write-Host "   ✅ Go Ingest: OK" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Go Ingest: Unhealthy" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Go Ingest: Not responding" -ForegroundColor Red
    Write-Host "   Tip: Check go-services/phase72-ingest/main.go" -ForegroundColor Gray
}

# SIMD Accelerator
if (-not $QuickStart) {
    try {
        $simdHealth = Invoke-RestMethod -Uri "http://127.0.0.1:8103/health" -TimeoutSec 2
        Write-Host "   ✅ SIMD Accelerator: OK" -ForegroundColor Green
    } catch {
        Write-Host "   ⚠️  SIMD Accelerator: Optional (not required)" -ForegroundColor Gray
    }
}

# Postgres
try {
    $pgVersion = & psql -U legal_admin -d legal_ai_db -c "SELECT version();" -t 2>$null
    if ($pgVersion) {
        Write-Host "   ✅ Postgres: OK" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Postgres: Connection failed" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Postgres: Not available" -ForegroundColor Red
}

# 6. Summary
Write-Host "`n╔══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Phase 72 Topology Brain - Ready to Run                 ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

Write-Host "📚 Next Steps:" -ForegroundColor Yellow
Write-Host "   1. Initialize Postgres schema:" -ForegroundColor Gray
Write-Host "      psql -U legal_admin -d legal_ai_db -f ../backend/sql/phase72_topology_schema.sql`n" -ForegroundColor Cyan

Write-Host "   2. Run Phase 72 topology pipeline:" -ForegroundColor Gray
Write-Host "      cd sveltekit-frontend" -ForegroundColor Cyan
Write-Host "      npx tsx scripts/phase72-topology-vectorize.mjs`n" -ForegroundColor Cyan

Write-Host "   3. Generate AI summaries:" -ForegroundColor Gray
Write-Host "      npx tsx scripts/phase72-cluster-generate.mjs`n" -ForegroundColor Cyan

Write-Host "✅ Phase 72 infrastructure is ready!" -ForegroundColor Green
