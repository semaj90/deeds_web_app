#!/usr/bin/env pwsh
# Phase 88: Streamlined Launch Script
# Runs all 6 steps with progress tracking and validation

$ErrorActionPreference = "Stop"

Write-Host "🚀 Phase 88: KB-First Retrieval Launch" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Pre-flight checks
Write-Host "🔍 Pre-flight checks..." -ForegroundColor Yellow

# Check Docker services
$services = @("phase66-postgres", "phase66-redis", "phase66-qdrant")
foreach ($svc in $services) {
    $status = docker ps --filter "name=$svc" --format "{{.Status}}" 2>$null
    if ($status) {
        Write-Host "   ✅ $svc is running" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  $svc is not running, starting..." -ForegroundColor Yellow
        docker start $svc | Out-Null
        Start-Sleep -Seconds 2
    }
}

# Check Ollama
try {
    $models = curl -s http://localhost:11434/api/tags 2>$null | ConvertFrom-Json | Select-Object -ExpandProperty models
    $hasEmbedding = $models.name -contains "embeddinggemma:latest"
    $hasLLM = $models.name -contains "gemma3-legal:latest"

    if ($hasEmbedding -and $hasLLM) {
        Write-Host "   ✅ Ollama models ready" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Missing Ollama models" -ForegroundColor Red
        Write-Host "      Run: ollama pull embeddinggemma; ollama pull gemma:latest" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "   ❌ Ollama not reachable at localhost:11434" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

# Step 1: Ingest Documentation
Write-Host ""
Write-Host "📚 Step 1/6: Ingest Documentation" -ForegroundColor Cyan
Write-Host "   This will take 10-30 minutes..." -ForegroundColor Gray
Write-Host ""

$answer = Read-Host "   Continue with ingestion? (y/n)"
if ($answer -ne 'y') {
    Write-Host "   Skipped. Run manually: .\scripts\phase88-docs-ingestion.ps1" -ForegroundColor Yellow
} else {
    & ".\scripts\phase88-docs-ingestion.ps1"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "   ❌ Ingestion failed" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

# Step 2: Check Knowledge Plane
Write-Host ""
Write-Host "🔧 Step 2/6: Knowledge Plane Service" -ForegroundColor Cyan

# Check if already running
$kpRunning = $false
try {
    $health = curl -s http://127.0.0.1:8792/health 2>$null | ConvertFrom-Json
    if ($health.status -eq "healthy") {
        Write-Host "   ✅ Knowledge Plane already running (v$($health.version))" -ForegroundColor Green
        $kpRunning = $true
    }
} catch {}

if (-not $kpRunning) {
    Write-Host "   ℹ️  Knowledge Plane not running" -ForegroundColor Gray
    Write-Host "   Starting service..." -ForegroundColor Yellow

    # Check if binary exists
    if (-not (Test-Path "..\go-services\knowledge-plane\knowledge-plane.exe")) {
        Write-Host "   ⚠️  Binary not found, building..." -ForegroundColor Yellow
        Push-Location ..\go-services\knowledge-plane
        go build -o knowledge-plane.exe ./cmd/server
        Pop-Location
    }

    Write-Host "   ℹ️  Start manually: cd ..\go-services\knowledge-plane; .\run.ps1" -ForegroundColor Gray
    Write-Host "   Or run in background (this script will continue)" -ForegroundColor Gray

    $answer = Read-Host "   Start Knowledge Plane in background? (y/n)"
    if ($answer -eq 'y') {
        $kpJob = Start-Job -ScriptBlock {
            Set-Location "C:\Users\james\Videos\deeds-web-app\go-services\knowledge-plane"
            & ".\run.ps1"
        }
        Write-Host "   ✅ Started in background (Job ID: $($kpJob.Id))" -ForegroundColor Green
        Start-Sleep -Seconds 5
    }
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

# Step 3: Test Svelte Docs Search
Write-Host ""
Write-Host "🧪 Step 3/6: Test Svelte Docs Search" -ForegroundColor Cyan

try {
    $testQuery = @{
        query = "Svelte 5 runes state"
        topK = 3
    } | ConvertTo-Json -Compress

    $result = curl -s http://127.0.0.1:8792/svelte/docs/search `
        -Method POST `
        -Body $testQuery `
        -ContentType "application/json" 2>$null | ConvertFrom-Json

    if ($result.results.Count -gt 0) {
        Write-Host "   ✅ Svelte docs search working ($($result.results.Count) results)" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  No results (docs may not be ingested yet)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠️  Cannot test - Knowledge Plane not responding" -ForegroundColor Yellow
    Write-Host "      Make sure it's running on port 8792" -ForegroundColor Gray
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

# Step 4: Test KB Grounding
Write-Host ""
Write-Host "🔍 Step 4/6: Test KB Grounding" -ForegroundColor Cyan

if (Test-Path ".\scripts\test-kb-grounding.ps1") {
    $answer = Read-Host "   Run comprehensive KB tests? (y/n)"
    if ($answer -eq 'y') {
        & ".\scripts\test-kb-grounding.ps1"
    } else {
        Write-Host "   Skipped. Run manually: .\scripts\test-kb-grounding.ps1" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ⚠️  Test script not found" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

# Step 5: Check FastMCP
Write-Host ""
Write-Host "🔌 Step 5/6: FastMCP Status" -ForegroundColor Cyan

$fastmcpRunning = Get-Process -Name node -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*fastmcp*" }

if ($fastmcpRunning) {
    Write-Host "   ✅ FastMCP is running (PID: $($fastmcpRunning.Id))" -ForegroundColor Green
    Write-Host "   ℹ️  Restart to load knowledge_retrieve tool if just added" -ForegroundColor Gray

    $answer = Read-Host "   Restart FastMCP? (y/n)"
    if ($answer -eq 'y') {
        $fastmcpRunning | Stop-Process -Force
        Start-Sleep -Seconds 2
        Write-Host "   Starting FastMCP..." -ForegroundColor Yellow
        Start-Process node -ArgumentList "scripts\fastmcp-server.mjs" -NoNewWindow
        Start-Sleep -Seconds 3
        Write-Host "   ✅ FastMCP restarted" -ForegroundColor Green
    }
} else {
    Write-Host "   ℹ️  FastMCP not running" -ForegroundColor Gray
    $answer = Read-Host "   Start FastMCP? (y/n)"
    if ($answer -eq 'y') {
        Start-Process node -ArgumentList "scripts\fastmcp-server.mjs" -NoNewWindow
        Start-Sleep -Seconds 3
        Write-Host "   ✅ FastMCP started" -ForegroundColor Green
    } else {
        Write-Host "   Run manually: node scripts\fastmcp-server.mjs" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

# Step 6: Launch Autonomous Agent
Write-Host ""
Write-Host "🤖 Step 6/6: Autonomous Agent" -ForegroundColor Cyan
Write-Host "   This will run the agent with KB-first retrieval" -ForegroundColor Gray
Write-Host ""

$answer = Read-Host "   Launch autonomous agent now? (y/n)"
if ($answer -eq 'y') {
    Write-Host ""
    Write-Host "🚀 Launching agent..." -ForegroundColor Green
    Write-Host "   Monitor for:" -ForegroundColor Yellow
    Write-Host "   - knowledge_retrieve calls before write_file" -ForegroundColor Gray
    Write-Host "   - Svelte 5 syntax ($state, $derived, $effect)" -ForegroundColor Gray
    Write-Host "   - Code citations (// Source: chunk-xxx)" -ForegroundColor Gray
    Write-Host ""

    node scripts\phase87-autonomous-loop.mjs
} else {
    Write-Host "   Run manually: node scripts\phase87-autonomous-loop.mjs" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""
Write-Host "✅ Phase 88 Launch Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Quick Status Check:" -ForegroundColor Yellow
Write-Host "   - Qdrant collection: curl http://localhost:6333/collections/phase76_knowledge_base" -ForegroundColor Gray
Write-Host "   - Knowledge Plane: curl http://127.0.0.1:8792/health" -ForegroundColor Gray
Write-Host "   - Check docs: PHASE88_QUICK_REFERENCE.md" -ForegroundColor Gray
Write-Host ""
