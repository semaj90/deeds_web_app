#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Phase 89: RTX 3060 Ti Tensor Analysis + ACE Contextual Engineering
.DESCRIPTION
    Run comprehensive tensor analysis and ACE synthesis test
#>

$ErrorActionPreference = "Stop"
$env:PHASE89_PYTHON = "C:\Users\james\Videos\deeds-web-app\.venv\Scripts\python.exe"

Write-Host "`n╔═══════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     Phase 89: RTX 3060 Ti Tensor Analysis + ACE Synthesis        ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Pre-flight checks
Write-Host "🔍 Pre-flight Checks`n" -ForegroundColor Yellow

Write-Host "1️⃣ Python Environment..." -ForegroundColor White
if (Test-Path $env:PHASE89_PYTHON) {
    $pythonVersion = & $env:PHASE89_PYTHON --version 2>&1
    Write-Host "   ✅ $pythonVersion" -ForegroundColor Green
} else {
    Write-Host "   ❌ Python not found at: $env:PHASE89_PYTHON" -ForegroundColor Red
    exit 1
}

Write-Host "`n2️⃣ PyTorch Installation..." -ForegroundColor White
$torchCheck = & $env:PHASE89_PYTHON -c "import torch; print(f'PyTorch {torch.__version__}, CUDA {torch.cuda.is_available()}')" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ $torchCheck" -ForegroundColor Green
} else {
    Write-Host "   ❌ PyTorch not installed or CUDA not available" -ForegroundColor Red
    Write-Host "   Install: pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu130" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n3️⃣ GPU Status..." -ForegroundColor White
try {
    $gpu = nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader 2>&1
    Write-Host "   ✅ $gpu" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  nvidia-smi not available (driver issue?)" -ForegroundColor Yellow
}

Write-Host "`n4️⃣ Infrastructure Status..." -ForegroundColor White

# Redis
try {
    $redisKeys = docker exec phase66-redis redis-cli DBSIZE 2>&1
    Write-Host "   ✅ Redis: $redisKeys keys" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  Redis not accessible" -ForegroundColor Yellow
}

# Qdrant
try {
    $qdrant = Invoke-RestMethod -Uri "http://localhost:6333/collections" -Method GET -TimeoutSec 3 -ErrorAction Stop
    $collections = $qdrant.result.collections.Count
    Write-Host "   ✅ Qdrant: $collections collections" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  Qdrant not accessible" -ForegroundColor Yellow
}

# Ollama
try {
    $ollama = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -Method GET -TimeoutSec 3 -ErrorAction Stop
    $models = $ollama.models | Where-Object { $_.name -like '*embedding*' }
    if ($models) {
        Write-Host "   ✅ Ollama: $($models[0].name)" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Ollama: No embedding models found" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠️  Ollama not accessible" -ForegroundColor Yellow
}

Write-Host "`n" + ("═" * 70)
Write-Host "`n🚀 Running Tensor Analysis...`n" -ForegroundColor Green

# Run analysis
& $env:PHASE89_PYTHON scripts/phase89-tensor-analysis.py

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Analysis complete! Check reports/phase89-tensor-analysis.json`n" -ForegroundColor Green
} else {
    Write-Host "`n❌ Analysis failed with exit code: $LASTEXITCODE`n" -ForegroundColor Red
    exit 1
}

# Show results
Write-Host ("═" * 70)
Write-Host "`n📊 Quick Results Summary`n" -ForegroundColor Cyan

$resultsPath = "reports/phase89-tensor-analysis.json"
if (Test-Path $resultsPath) {
    $results = Get-Content $resultsPath | ConvertFrom-Json

    Write-Host "GPU: $($results.gpu.name)" -ForegroundColor White
    Write-Host "Memory: $($results.gpu.memory_gb) GB" -ForegroundColor White
    Write-Host "Tensor Cores: $($results.gpu.tensor_cores)" -ForegroundColor White
    Write-Host ""
    Write-Host "ACE Pipeline Performance:" -ForegroundColor Yellow
    Write-Host "   • Search: $($results.ace_synthesis.search_time_ms)ms" -ForegroundColor White
    Write-Host "   • Synthesis: $($results.ace_synthesis.synthesis_time_ms)ms" -ForegroundColor White
    Write-Host "   • Total: $($results.ace_synthesis.total_time_ms)ms" -ForegroundColor White
    Write-Host "   • Throughput: $($results.ace_synthesis.throughput_docs_per_sec) docs/sec" -ForegroundColor White
    Write-Host "   • Status: $($results.ace_synthesis.performance)" -ForegroundColor $(
        if ($results.ace_synthesis.performance -eq 'EXCELLENT') { 'Green' }
        elseif ($results.ace_synthesis.performance -eq 'GOOD') { 'Yellow' }
        else { 'Red' }
    )
}

Write-Host "`n" + ("═" * 70)
Write-Host "`n🎯 Next Steps:`n" -ForegroundColor Cyan
Write-Host "   1. Review detailed results: reports/phase89-tensor-analysis.json" -ForegroundColor White
Write-Host "   2. Run full indexer: python scripts/phase89-pytorch-multicore.py index --root ./src" -ForegroundColor White
Write-Host "   3. Test ACE prompting: npm run phase76:ace" -ForegroundColor White
Write-Host ""
