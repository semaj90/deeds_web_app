#Requires -Version 7.0

<#
.SYNOPSIS
    Offline Gemma4 summarization pipeline orchestrator

.DESCRIPTION
    Manages the complete flow:
    1. Export unsummarized packets from Postgres → NDJSON
    2. Run Python async worker → llama-server :8090
    3. Import summaries back into Postgres
    4. Embed summaries if requested

.PARAMETER Limit
    Maximum packets to process (default: 500)

.PARAMETER Concurrency
    Parallel requests to llama-server (default: 2, max: 3)

.PARAMETER MaxTokens
    Max tokens per summary (default: 256)

.PARAMETER Endpoint
    llama-server endpoint (default: http://127.0.0.1:8090/v1/completions)

.PARAMETER SkipExport
    Skip export phase (use existing backlog file)

.PARAMETER SkipImport
    Skip import phase (only run worker, don't update Postgres)

.PARAMETER DryRun
    Export and import in dry-run mode (no writes)

.EXAMPLE
    .\Invoke-OfflineSummarization.ps1 -Limit 50 -Concurrency 2

.EXAMPLE
    .\Invoke-OfflineSummarization.ps1 -Limit 500 -DryRun -Concurrency 1
#>

param(
    [int]$Limit = 500,
    [int]$Concurrency = 2,
    [int]$MaxTokens = 256,
    [string]$Endpoint = 'http://127.0.0.1:8090/v1/completions',
    [switch]$SkipExport,
    [switch]$SkipImport,
    [switch]$SkipEmbedding,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

# Configuration
$WorkDir = Get-Location
$BacklogFile = '.tmp/summary-backlog.ndjson'
$SummariesFile = '.tmp/gemma4-summaries.ndjson'
$VenvPath = '.venv-gemma4'
$ActivateScript = Join-Path $VenvPath 'Scripts' 'Activate.ps1'

Write-Host "`n🚀 Offline Gemma4 Summarization Pipeline" -ForegroundColor Cyan
Write-Host "$('=' * 60)" -ForegroundColor Cyan
Write-Host "  Limit:       $Limit"
Write-Host "  Concurrency: $Concurrency"
Write-Host "  Max tokens:  $MaxTokens"
Write-Host "  Endpoint:    $Endpoint"
Write-Host "  Skip embed:  $(if ($SkipEmbedding) { 'Yes' } else { 'No' })"
Write-Host "  Dry-run:     $(if ($DryRun) { 'Yes' } else { 'No' })"
Write-Host ""

# Validate aggressive settings
if ($Concurrency -gt 3 -or $MaxTokens -lt 128) {
    Write-Host "⚠️  Aggressive Settings Detected" -ForegroundColor Yellow
    Write-Host "  Concurrency > 3 or MaxTokens < 128 may increase VRAM pressure"
    Write-Host "  For RTX 3060 Ti 8GB: target peak < 7.5 GB"
    Write-Host "  Monitor with: nvidia-smi --loop-ms=500" -ForegroundColor Cyan
    Write-Host ""
}

# Phase 1: Check prerequisites
Write-Host "📋 Phase 1: Prerequisites" -ForegroundColor Green
Write-Host "  Checking llama-server..."

$llamaHealth = try {
    Invoke-RestMethod -Uri "$Endpoint".Replace('/v1/completions', '/health') -TimeoutSec 5 -ErrorAction Stop | Out-Null
    $true
} catch {
    $false
}

if (-not $llamaHealth) {
    Write-Host "  ✗ llama-server not responding at $Endpoint" -ForegroundColor Red
    Write-Host "    Start it with: scripts\launch-turboquant.ps1" -ForegroundColor Yellow
    exit 1
}
Write-Host "  ✓ llama-server is running"

# Phase 2: Export backlog
if (-not $SkipExport) {
    Write-Host "`n📤 Phase 2: Export Summary Backlog" -ForegroundColor Green

    if (Test-Path $BacklogFile) {
        $backlogSize = (Get-Item $BacklogFile).Length / 1KB
        Write-Host "  ⚠️  Backlog file already exists (${backlogSize} KB)"
        $confirm = Read-Host "  Overwrite? (y/n)"
        if ($confirm -ne 'y') {
            Write-Host "  Keeping existing backlog"
        } else {
            Remove-Item $BacklogFile -Force
            node scripts/atlas/export-summary-backlog.mjs --limit=$Limit --output=$BacklogFile
        }
    } else {
        node scripts/atlas/export-summary-backlog.mjs --limit=$Limit --output=$BacklogFile
    }
}

if (-not (Test-Path $BacklogFile)) {
    Write-Host "  ✗ Backlog file not found: $BacklogFile" -ForegroundColor Red
    exit 1
}

$backlogLines = @(Get-Content $BacklogFile | Where-Object { $_ -match '^\{' }).Count
Write-Host "  ✓ Backlog ready: $backlogLines packets"

# Phase 3: Check Python environment
Write-Host "`n🐍 Phase 3: Python Environment" -ForegroundColor Green

if (-not (Test-Path $VenvPath)) {
    Write-Host "  Creating Python venv..."
    python -m venv $VenvPath
    Write-Host "  Installing dependencies..."
    & $ActivateScript
    pip install -q aiohttp orjson tqdm
    Write-Host "  ✓ Venv ready"
} else {
    Write-Host "  ✓ Venv exists"
}

# Phase 4: Run offline worker
Write-Host "`n⚙️  Phase 4: Offline Gemma4 Worker" -ForegroundColor Green
Write-Host "  Starting worker (concurrency=$Concurrency, max_tokens=$MaxTokens)..."

& $ActivateScript

$workerCmd = @(
    'python scripts/gemma4/offline_summary_worker.py'
    "--input=$BacklogFile"
    "--output=$SummariesFile"
    "--endpoint=$Endpoint"
    "--concurrency=$Concurrency"
    "--max-tokens=$MaxTokens"
) -join ' '

Write-Host "  Command: $workerCmd`n"
Invoke-Expression $workerCmd

if (-not (Test-Path $SummariesFile)) {
    Write-Host "  ✗ Worker failed: no output file" -ForegroundColor Red
    exit 1
}

$summariesLines = @(Get-Content $SummariesFile | Where-Object { $_ -match '^\{' }).Count
Write-Host "  ✓ Generated: $summariesLines summaries"

# Phase 5: Import summaries (optional)
if (-not $SkipImport) {
    Write-Host "`n📥 Phase 5: Import into Postgres" -ForegroundColor Green

    if ($DryRun) {
        Write-Host "  Running in dry-run mode..."
        node scripts/atlas/import-gemma4-summaries.mjs --input=$SummariesFile --dry-run
    } else {
        Write-Host "  Importing summaries..."
        node scripts/atlas/import-gemma4-summaries.mjs --input=$SummariesFile --apply

        # Phase 6: Embed summaries (optional)
        if (-not $SkipEmbedding) {
            Write-Host "`n🔤 Phase 6: Embed Summaries" -ForegroundColor Green
            Write-Host "  Embedding newly imported summaries..."
            node scripts/atlas/embed-summaries.mjs --limit=$Limit
        } else {
            Write-Host "`n⏭️  Phase 6: Embed Summaries - Skipped" -ForegroundColor Yellow
        }
    }
}

Write-Host "`n✅ Pipeline complete!`n" -ForegroundColor Green
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "  Backlog: $backlogLines packets"
Write-Host "  Summaries: $summariesLines generated"
if (-not $DryRun) {
    Write-Host "  Status: ✓ Imported into Postgres"
}
Write-Host ""

# Cleanup
if (-not $DryRun) {
    $cleanup = Read-Host "Clean up temporary files? (y/n)"
    if ($cleanup -eq 'y') {
        Remove-Item $BacklogFile, $SummariesFile -Force -ErrorAction SilentlyContinue
        Write-Host "  ✓ Cleaned up temp files"
    }
}

Write-Host ""
