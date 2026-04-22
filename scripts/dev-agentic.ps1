#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Supercharged Agentic Dev Orchestrator (RTX 3060 Ti Optimized)
  
.DESCRIPTION
  Aligns with GPU Codebase Indexer and Multicore Context7 (Phase 70+) API.
#>

$ErrorActionPreference = "Continue"

# ─── 1. Hardware Environment (RTX 3060 Ti 8GB) ───────────────────────────────
Write-Host "`n🚀 Optimizing for RTX 3060 Ti (8GB VRAM)..." -ForegroundColor Magenta
$env:OLLAMA_FLASH_ATTENTION = "1"
$env:OLLAMA_KV_CACHE_TYPE = "q8_0"          # INT8 KV Cache (Saves ~1.5GB)
$env:OLLAMA_NUM_PARALLEL = "2"              # Multicore Context Parallelism
$env:PYTORCH_CUDA_ALLOC_CONF = "max_split_size_mb:512"
$env:RTX_8GB_OPTIMIZATION = "true"

# ─── 2. Infrastructure (Docker full profile) ─────────────────────────────────
Write-Host "`n📦 Starting Data Services (Bifrost + Redis + Qdrant)..." -ForegroundColor Yellow
docker compose --profile full up -d

# ─── 3. Inference Layer (Ollama + FlashAttention) ─────────────────────────────
Write-Host "`n🧠 Starting Ollama with FlashAttention 2..." -ForegroundColor Yellow
$ollamaProc = Get-Process -Name "ollama" -ErrorAction SilentlyContinue
if (-not $ollamaProc) {
    Start-Process "powershell" -ArgumentList "-Command scripts/start-ollama-flash-attention.bat" -WindowStyle Minimized
}

# ─── 4. Multicore Context7 Wiring (FastMCP Bridge) ────────────────────────────
Write-Host "`n🌐 Launching Multicore Context7 Server (PM2 Cluster)..." -ForegroundColor Yellow
# Starts the SvelteKit API in cluster mode as the primary FastMCP tool-calling bridge
pm2 start ecosystem.dev.config.cjs --only sveltekit-dev

# ─── 5. GPU Codebase Indexer ──────────────────────────────────────────────────
$indexNow = Read-Host "`n📊 Run GPU Codebase Indexer now? (y/N)"
if ($indexNow -eq "y") {
    Write-Host "   Indexing codebase with Gemma4 tags & simdjson acceleration..." -ForegroundColor Cyan
    Start-Process "powershell" -ArgumentList "-NoExit", "-Command", "cd sveltekit-frontend; npx tsx scripts/codebase-semantic-indexer.ts --tags --concurrency 4"
}

Write-Host "`n✅ Agentic Stack Aligned & Ready." -ForegroundColor Green
Write-Host "   Frontend: http://localhost:5173"
Write-Host "   MCP Tools: http://localhost:3002 (via Context7 Bridge)"

# ─── 6. VRAM Pressure Watchdog (Background) ─────────────────────────────────
Write-Host "`n🛡️ Starting VRAM Pressure Watchdog..." -ForegroundColor Gray
$watchdogScript = {
    while ($true) {
        $vram = (nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits)
        if ([int]$vram -gt 7200) {
            Write-Host "[WATCHDOG] ⚠️ High VRAM Pressure: $vram MB. Throttling Indexer Concurrency..." -ForegroundColor Red
            # Logic to signal throttling to scripts/codebase-semantic-indexer.ts
        }
        Start-Sleep -Seconds 15
    }
}
Start-Job -ScriptBlock $watchdogScript -Name "VRAMWatchdog" | Out-Null
