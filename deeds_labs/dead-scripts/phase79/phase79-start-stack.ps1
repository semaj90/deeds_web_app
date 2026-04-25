#!/usr/bin/env pwsh
<#
.SYNOPSIS
Phase 79: Start Agentic Error Fixing Stack

.DESCRIPTION
Starts all required services for Phase 79 agentic error fixing:
- SIMD JSON Accelerator (Go service on port 8103)
- Redis (cache)
- Qdrant (vector search)
- PostgreSQL (structured storage)
- Ollama (embeddinggemma + gemma3-legal)

.EXAMPLE
.\scripts\phase79-start-stack.ps1
#>

$ErrorActionPreference = "Continue"

Write-Host "🚀 Phase 79: Starting Agentic Error Fixing Stack" -ForegroundColor Cyan
Write-Host "━" * 70 -ForegroundColor DarkGray
Write-Host ""

# ============================================================================
# 1. Check SIMD JSON Accelerator
# ============================================================================

Write-Host "1. Checking SIMD JSON Accelerator..." -ForegroundColor Yellow

$simdExe = "..\go-services\simd-json-accelerator\simd-json-accelerator.exe"

if (-not (Test-Path $simdExe)) {
    Write-Host "   ❌ SIMD accelerator not found at: $simdExe" -ForegroundColor Red
    Write-Host "   Building from source..." -ForegroundColor Yellow

    Push-Location ..\go-services\simd-json-accelerator
    go build -o simd-json-accelerator.exe main.go
    Pop-Location

    if (-not (Test-Path $simdExe)) {
        Write-Host "   ❌ Build failed!" -ForegroundColor Red
        exit 1
    }
}

# Check if already running
$simdProcess = Get-Process -Name "simd-json-accelerator" -ErrorAction SilentlyContinue

if ($simdProcess) {
    Write-Host "   ✅ Already running (PID: $($simdProcess.Id))" -ForegroundColor Green
} else {
    Write-Host "   Starting SIMD JSON Accelerator..." -ForegroundColor Cyan

    $env:SIMD_JSON_ACCEL_PORT = "8103"
    Start-Process -FilePath $simdExe -WorkingDirectory (Split-Path $simdExe) -WindowStyle Hidden

    Start-Sleep -Seconds 2

    try {
        $health = Invoke-RestMethod -Uri "http://localhost:8103/health" -TimeoutSec 5
        Write-Host "   ✅ SIMD Accelerator healthy on port 8103" -ForegroundColor Green
        Write-Host "      Method: $($health.method)" -ForegroundColor DarkGray
    } catch {
        Write-Host "   ⚠️  Started but health check failed" -ForegroundColor Yellow
    }
}

# ============================================================================
# 2. Check Redis
# ============================================================================

Write-Host ""
Write-Host "2. Checking Redis..." -ForegroundColor Yellow

try {
    $redisTest = redis-cli ping 2>&1
    if ($redisTest -match "PONG") {
        Write-Host "   ✅ Redis running" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Redis may not be healthy" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Redis not found - install Redis or use Docker" -ForegroundColor Red
    Write-Host "      docker run -d -p 6379:6379 redis redis-server --requirepass redis" -ForegroundColor DarkGray
}

# ============================================================================
# 3. Check Qdrant
# ============================================================================

Write-Host ""
Write-Host "3. Checking Qdrant..." -ForegroundColor Yellow

try {
    $qdrant = Invoke-RestMethod -Uri "http://localhost:6333/health" -TimeoutSec 3
    Write-Host "   ✅ Qdrant running (version: $($qdrant.version))" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Qdrant not running" -ForegroundColor Red
    Write-Host "      docker run -d -p 6333:6333 qdrant/qdrant" -ForegroundColor DarkGray
}

# ============================================================================
# 4. Check PostgreSQL
# ============================================================================

Write-Host ""
Write-Host "4. Checking PostgreSQL..." -ForegroundColor Yellow

try {
    $pgTest = psql -U postgres -h localhost -p 5432 -c "SELECT version();" 2>&1
    if ($pgTest -match "PostgreSQL") {
        Write-Host "   ✅ PostgreSQL running" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  PostgreSQL may not be healthy" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ PostgreSQL not found" -ForegroundColor Red
    Write-Host "      docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=123456 postgres" -ForegroundColor DarkGray
}

# ============================================================================
# 5. Check Ollama
# ============================================================================

Write-Host ""
Write-Host "5. Checking Ollama..." -ForegroundColor Yellow

try {
    $ollama = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 3
    $models = $ollama.models | ForEach-Object { $_.name }

    Write-Host "   ✅ Ollama running" -ForegroundColor Green

    # Check for required models
    $hasEmbedding = $models -contains "embeddinggemma:latest"
    $hasGemma3 = $models -match "gemma3-legal"

    if ($hasEmbedding) {
        Write-Host "      ✅ embeddinggemma:latest" -ForegroundColor Green
    } else {
        Write-Host "      ❌ embeddinggemma:latest - run: ollama pull embeddinggemma" -ForegroundColor Yellow
    }

    if ($hasGemma3) {
        Write-Host "      ✅ gemma3-legal:latest" -ForegroundColor Green
    } else {
        Write-Host "      ⚠️  gemma3-legal:latest not found" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Ollama not running" -ForegroundColor Red
    Write-Host "      Start Ollama Desktop or run: ollama serve" -ForegroundColor DarkGray
}

# ============================================================================
# Summary
# ============================================================================

Write-Host ""
Write-Host "━" * 70 -ForegroundColor DarkGray
Write-Host "📊 Phase 79 Stack Status:" -ForegroundColor Cyan
Write-Host ""
Write-Host "   SIMD Accelerator:  http://localhost:8103" -ForegroundColor White
Write-Host "   Redis:             redis://localhost:6379" -ForegroundColor White
Write-Host "   Qdrant:            http://localhost:6333" -ForegroundColor White
Write-Host "   PostgreSQL:        postgresql://localhost:5432" -ForegroundColor White
Write-Host "   Ollama:            http://localhost:11434" -ForegroundColor White
Write-Host ""
Write-Host "🎯 Ready to run: npm run index:errors" -ForegroundColor Green
Write-Host "🎯 Demo workflow: npm run phase79:demo" -ForegroundColor Green
Write-Host ""
