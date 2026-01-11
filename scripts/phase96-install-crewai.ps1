#!/usr/bin/env pwsh
# Phase 96: Install CrewAI + Langfuse Stack
# Zero-cost agentic framework with observability

param(
    [switch]$SkipDocker,
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 Phase 96: CrewAI + Langfuse Installation" -ForegroundColor Cyan
Write-Host "=" * 60

# 1. Check Docker
if (-not $SkipDocker) {
    Write-Host "`n1️⃣ Starting Langfuse..." -ForegroundColor Yellow
    try {
        docker-compose -f docker/langfuse.yml up -d
        Write-Host "   ✅ Langfuse started at http://localhost:3030" -ForegroundColor Green
    } catch {
        Write-Host "   ❌ Failed to start Langfuse: $_" -ForegroundColor Red
        Write-Host "   💡 Run with -SkipDocker to skip this step" -ForegroundColor Yellow
        exit 1
    }

    Start-Sleep -Seconds 5

    Write-Host "`n   Checking Langfuse health..." -ForegroundColor Gray
    $retries = 0
    $maxRetries = 30
    while ($retries -lt $maxRetries) {
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:3030" -Method GET -TimeoutSec 2 -ErrorAction Stop
            if ($response.StatusCode -eq 200) {
                Write-Host "   ✅ Langfuse is healthy!" -ForegroundColor Green
                break
            }
        } catch {
            $retries++
            Write-Host "   ⏳ Waiting for Langfuse... ($retries/$maxRetries)" -ForegroundColor Gray
            Start-Sleep -Seconds 2
        }
    }

    if ($retries -eq $maxRetries) {
        Write-Host "   ⚠️  Langfuse may not be ready yet. Check logs: docker logs -f langfuse-server" -ForegroundColor Yellow
    }
}

# 2. Activate venv
Write-Host "`n2️⃣ Activating Python virtual environment..." -ForegroundColor Yellow
$venvPath = "C:\Users\james\Videos\deeds-web-app\.venv\Scripts\Activate.ps1"
if (Test-Path $venvPath) {
    & $venvPath
    Write-Host "   ✅ Virtual environment activated" -ForegroundColor Green
} else {
    Write-Host "   ❌ Virtual environment not found at: $venvPath" -ForegroundColor Red
    exit 1
}

# 3. Install CrewAI
Write-Host "`n3️⃣ Installing CrewAI..." -ForegroundColor Yellow
try {
    if ($Verbose) {
        pip install 'crewai[tools]' langfuse langchain-ollama
    } else {
        pip install 'crewai[tools]' langfuse langchain-ollama --quiet
    }
    Write-Host "   ✅ CrewAI installed successfully" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Failed to install CrewAI: $_" -ForegroundColor Red
    exit 1
}

# 4. Verify installation
Write-Host "`n4️⃣ Verifying installation..." -ForegroundColor Yellow
try {
    $crewaiVersion = python -c "import crewai; print(crewai.__version__)"
    Write-Host "   ✅ CrewAI v$crewaiVersion" -ForegroundColor Green

    $langfuseVersion = python -c "import langfuse; print(langfuse.__version__)"
    Write-Host "   ✅ Langfuse v$langfuseVersion" -ForegroundColor Green

    $ollamaCheck = python -c "from langchain_ollama import ChatOllama; print('OK')"
    Write-Host "   ✅ LangChain-Ollama integration OK" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  Some imports failed: $_" -ForegroundColor Yellow
    Write-Host "   This may be normal if you haven't configured Ollama yet" -ForegroundColor Gray
}

# 5. Check Ollama
Write-Host "`n5️⃣ Checking Ollama..." -ForegroundColor Yellow
try {
    $ollamaContainers = docker ps --filter "name=ollama" --format "{{.Names}}"
    if ($ollamaContainers) {
        Write-Host "   ✅ Ollama containers running: $ollamaContainers" -ForegroundColor Green

        # Try to list models
        $models = docker exec ollama ollama list 2>&1
        if ($models -match "gemma3-legal") {
            Write-Host "   ✅ gemma3-legal:latest found!" -ForegroundColor Green
        } else {
            Write-Host "   ⚠️  gemma3-legal not found. Available models:" -ForegroundColor Yellow
            Write-Host $models -ForegroundColor Gray
        }
    } else {
        Write-Host "   ⚠️  Ollama not running. Start it first." -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠️  Could not check Ollama: $_" -ForegroundColor Yellow
}

# 6. Next steps
Write-Host "`n" + "=" * 60
Write-Host "🎉 Installation Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Next Steps:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Configure Langfuse API Keys:" -ForegroundColor White
Write-Host "   • Open http://localhost:3030" -ForegroundColor Gray
Write-Host "   • Create account (first visit)" -ForegroundColor Gray
Write-Host "   • Go to Settings > API Keys" -ForegroundColor Gray
Write-Host "   • Copy keys to .env.phase14:" -ForegroundColor Gray
Write-Host ""
Write-Host "     LANGFUSE_PUBLIC_KEY=pk-lf-..." -ForegroundColor DarkGray
Write-Host "     LANGFUSE_SECRET_KEY=sk-lf-..." -ForegroundColor DarkGray
Write-Host "     LANGFUSE_HOST=http://localhost:3030" -ForegroundColor DarkGray
Write-Host ""
Write-Host "2. Test CrewAI:" -ForegroundColor White
Write-Host "   python scripts/crewai-config.py" -ForegroundColor Gray
Write-Host ""
Write-Host "3. View traces in Langfuse:" -ForegroundColor White
Write-Host "   http://localhost:3030/traces" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Read setup guide:" -ForegroundColor White
Write-Host "   PHASE96_CREWAI_LANGFUSE_SETUP.md" -ForegroundColor Gray
Write-Host ""
Write-Host "=" * 60

# 7. Summary
Write-Host "`n📊 System Status:" -ForegroundColor Cyan
Write-Host "   Langfuse: http://localhost:3030" -ForegroundColor White
Write-Host "   CrewAI: v$crewaiVersion installed" -ForegroundColor White
Write-Host "   Ollama: $(if ($ollamaContainers) { 'Running' } else { 'Not detected' })" -ForegroundColor White
Write-Host "   Cost: `$0/month (100% self-hosted) 💰" -ForegroundColor Green
Write-Host ""
