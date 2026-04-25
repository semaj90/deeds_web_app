#!/usr/bin/env pwsh
# Phase 89: Full Pipeline Test Script
# Tests: PostgreSQL → GPU Clustering → LLM Summarization → Copilot.md → FastMCP

param(
    [switch]$SkipClustering,
    [switch]$SkipCopilot,
    [switch]$FastMCP,
    [int]$BatchSize = 5000
)

$ErrorActionPreference = "Stop"

Write-Host "🧪 Phase 89: Full Pipeline Test" -ForegroundColor Cyan
Write-Host "═" * 60
Write-Host ""

# Environment setup
$env:PHASE72_PYTHON = "C:\Users\james\Videos\deeds-web-app\.venv\Scripts\python.exe"
$env:NODE_OPTIONS = "--max-old-space-size=8192"

# Step 1: Health Check
Write-Host "1️⃣ Health Check" -ForegroundColor Yellow
Write-Host "   Checking PostgreSQL..." -NoNewline
try {
    $pg = docker exec phase66-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM phase89_error_instances;" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host " ✅" -ForegroundColor Green
    } else {
        throw "PostgreSQL not responding"
    }
} catch {
    Write-Host " ❌" -ForegroundColor Red
    Write-Host "   Error: $_" -ForegroundColor Red
    exit 1
}

Write-Host "   Checking Redis..." -NoNewline
try {
    $redis = docker exec phase66-redis redis-cli PING 2>&1
    if ($redis -eq "PONG") {
        Write-Host " ✅" -ForegroundColor Green
    } else {
        throw "Redis not responding"
    }
} catch {
    Write-Host " ❌" -ForegroundColor Red
    exit 1
}

Write-Host "   Checking Qdrant..." -NoNewline
try {
    $qdrant = Invoke-RestMethod -Uri "http://localhost:6333/collections" -TimeoutSec 5
    if ($qdrant.result.collections.Count -gt 0) {
        Write-Host " ✅ ($($qdrant.result.collections.Count) collections)" -ForegroundColor Green
    } else {
        throw "Qdrant not healthy"
    }
} catch {
    Write-Host " ❌" -ForegroundColor Red
    Write-Host "   Error: $_" -ForegroundColor Red
    exit 1
}

Write-Host "   Checking Ollama..." -NoNewline
try {
    $ollama = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 5
    $hasGemma3 = $ollama.models | Where-Object { $_.name -like "*gemma3-legal*" }
    if ($hasGemma3) {
        Write-Host " ✅" -ForegroundColor Green
    } else {
        Write-Host " ⚠️  gemma3-legal not found" -ForegroundColor Yellow
    }
} catch {
    Write-Host " ❌" -ForegroundColor Red
    Write-Host "   Run: ollama run gemma3-legal:latest" -ForegroundColor Yellow
}

Write-Host "   Checking CUDA..." -NoNewline
try {
    $cuda = & $env:PHASE72_PYTHON -c "import torch; print(torch.cuda.is_available())" 2>&1
    if ($cuda -eq "True") {
        $gpu = & $env:PHASE72_PYTHON -c "import torch; print(torch.cuda.get_device_name(0))" 2>&1
        Write-Host " ✅ ($gpu)" -ForegroundColor Green
    } else {
        Write-Host " ⚠️  Not available (will use CPU)" -ForegroundColor Yellow
    }
} catch {
    Write-Host " ❌" -ForegroundColor Red
}

Write-Host ""

# Step 2: GPU Clustering
if (-not $SkipClustering) {
    Write-Host "2️⃣ GPU Clustering (batch_size=$BatchSize)" -ForegroundColor Yellow
    try {
        & $env:PHASE72_PYTHON scripts/phase89-gpu-streaming-cluster.py --batch-size $BatchSize
        if ($LASTEXITCODE -ne 0) {
            throw "Clustering failed"
        }
        Write-Host "   ✅ Clustering complete" -ForegroundColor Green
    } catch {
        Write-Host "   ❌ Clustering error: $_" -ForegroundColor Red
        exit 1
    }
    Write-Host ""
} else {
    Write-Host "2️⃣ GPU Clustering (SKIPPED)" -ForegroundColor Gray
    Write-Host ""
}

# Step 3: Copilot.md Integration
if (-not $SkipCopilot) {
    Write-Host "3️⃣ Copilot.md Integration" -ForegroundColor Yellow
    try {
        if ($FastMCP) {
            node scripts/phase89-copilot-integrator.mjs --fastmcp
        } else {
            node scripts/phase89-copilot-integrator.mjs
        }
        if ($LASTEXITCODE -ne 0) {
            throw "Copilot integration failed"
        }
        Write-Host "   ✅ Copilot.md updated" -ForegroundColor Green
    } catch {
        Write-Host "   ❌ Integration error: $_" -ForegroundColor Red
        exit 1
    }
    Write-Host ""
} else {
    Write-Host "3️⃣ Copilot.md Integration (SKIPPED)" -ForegroundColor Gray
    Write-Host ""
}

# Step 4: Verify Results
Write-Host "4️⃣ Verification" -ForegroundColor Yellow

Write-Host "   Redis clusters..." -NoNewline
$clusterKeys = docker exec phase66-redis redis-cli KEYS "phase89:cluster:*" 2>&1 | Measure-Object -Line
Write-Host " $($clusterKeys.Lines) found" -ForegroundColor Green

Write-Host "   Qdrant clusters..." -NoNewline
try {
    $qdrantClusters = Invoke-RestMethod -Uri "http://localhost:6333/collections/phase89_error_clusters" 2>&1
    Write-Host " $($qdrantClusters.result.points_count) points" -ForegroundColor Green
} catch {
    Write-Host " Collection not found (may be created on first run)" -ForegroundColor Yellow
}

Write-Host "   copilot.md..." -NoNewline
if (Test-Path "copilot.md") {
    $copilotContent = Get-Content "copilot.md" -Raw
    if ($copilotContent -match "Phase 89: Error Cluster Knowledge Base") {
        Write-Host " ✅ Section found" -ForegroundColor Green
    } else {
        Write-Host " ⚠️  Section not found" -ForegroundColor Yellow
    }
} else {
    Write-Host " ⚠️  File not found" -ForegroundColor Yellow
}

Write-Host ""

# Step 5: Summary
Write-Host "5️⃣ Summary" -ForegroundColor Yellow
try {
    $status = Invoke-RestMethod -Uri "http://localhost:5175/api/phase89/status" -TimeoutSec 10
    Write-Host "   PostgreSQL errors: $($status.postgres.legal_ai.error_instances)" -ForegroundColor Cyan
    Write-Host "   Redis total keys: $($status.redis.total_keys)" -ForegroundColor Cyan
    Write-Host "   Qdrant total points: $($status.qdrant.total_points)" -ForegroundColor Cyan
    Write-Host "   Wiring score: $($status.integration.wiring_score)" -ForegroundColor Cyan

    if ($status.integration.healthy) {
        Write-Host ""
        Write-Host "✅ Phase 89 Pipeline HEALTHY" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "⚠️  Phase 89 Pipeline has issues" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠️  Status endpoint not available (start dev server)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🎉 Test Complete!" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  - View copilot.md for cluster summaries" -ForegroundColor Gray
Write-Host "  - Use 'rg svelte5-runes copilot.md' to search tags" -ForegroundColor Gray
Write-Host "  - Start Context7: npm run phase89:context7" -ForegroundColor Gray
Write-Host "  - Check status: npm run phase89:status" -ForegroundColor Gray
