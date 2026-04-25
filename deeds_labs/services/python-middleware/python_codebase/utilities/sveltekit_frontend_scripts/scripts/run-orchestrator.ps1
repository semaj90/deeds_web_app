#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Phase 34C+34D GPU-Enhanced Orchestrator Wrapper
.DESCRIPTION
    Runs the complete orchestration pipeline with optional GPU acceleration,
    Redis queueing, vector storage, and agentic analysis
.PARAMETER Apply
    Apply fixes (default is dry-run)
.PARAMETER GPU
    Enable GPU-accelerated Ollama analysis
.PARAMETER Workers
    Number of parallel worker threads (default: 4)
.PARAMETER FullStack
    Enable all integrations (Redis, Qdrant, Neo4j, MCP)
#>

param(
    [switch]$Apply,
    [switch]$GPU,
    [int]$Workers = 4,
    [switch]$FullStack
)

$ErrorActionPreference = "Stop"
$root = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend"
Push-Location $root

Write-Host "╔════════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                                                                    ║" -ForegroundColor Cyan
Write-Host "║     Phase 34C+34D GPU-Enhanced Orchestrator                       ║" -ForegroundColor Cyan
Write-Host "║                                                                    ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Build arguments
$args = @()
if ($Apply) { $args += "--apply" }
if ($GPU) { $args += "--gpu" }
if ($Workers -gt 0) { $args += "--workers=$Workers" }

Write-Host "⚙️  Configuration:" -ForegroundColor Yellow
Write-Host "   Apply mode:      $(if ($Apply) { '✏️ YES' } else { '👁️ DRY-RUN' })" -ForegroundColor White
Write-Host "   GPU acceleration: $(if ($GPU) { '✅ Enabled' } else { '❌ Disabled' })" -ForegroundColor White
Write-Host "   Worker threads:   $Workers" -ForegroundColor White
Write-Host "   Full stack:       $(if ($FullStack) { '✅ Yes' } else { '❌ No' })`n" -ForegroundColor White

# Check prerequisites
Write-Host "🔍 Checking prerequisites..." -ForegroundColor Yellow

# Check if Ollama is running (if GPU enabled)
if ($GPU) {
    try {
        $ollamaCheck = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -Method GET -TimeoutSec 3 -ErrorAction Stop
        Write-Host "   ✓ Ollama running" -ForegroundColor Green
    } catch {
        Write-Host "   ✗ Ollama not running (required for GPU mode)" -ForegroundColor Red
        Write-Host "     Start Ollama: ollama serve" -ForegroundColor Yellow
        if (!$Apply) {
            Write-Host "     Continuing without GPU analysis..." -ForegroundColor Yellow
            $GPU = $false
        } else {
            Pop-Location
            exit 1
        }
    }
}

# Check if error-patterns.json exists
$errorPatternsPath = Join-Path (Split-Path $root -Parent) "error-analysis\error-patterns.json"
if (!(Test-Path $errorPatternsPath)) {
    Write-Host "   ⚠  error-patterns.json not found at: $errorPatternsPath" -ForegroundColor Yellow
} else {
    $size = (Get-Item $errorPatternsPath).Length
    Write-Host "   ✓ error-patterns.json found ($([math]::Round($size/1MB, 2)) MB)" -ForegroundColor Green
}

# Run orchestrator
Write-Host "`n🚀 Starting orchestration...`n" -ForegroundColor Cyan

$startTime = Get-Date

try {
    $argsString = $args -join " "
    node --max-old-space-size=8192 scripts/phase34c-34d-orchestrator.mjs $argsString
    
    $endTime = Get-Date
    $duration = ($endTime - $startTime).TotalSeconds
    
    Write-Host "`n✅ Orchestration completed in $([math]::Round($duration, 2))s" -ForegroundColor Green
    
    # Check for dashboard
    if (Test-Path "orchestrator-results\dashboard.html") {
        Write-Host "`n📊 Dashboard generated:" -ForegroundColor Cyan
        Write-Host "   HTML: orchestrator-results\dashboard.html" -ForegroundColor White
        Write-Host "   JSON: orchestrator-results\phase34c-34d-dashboard.json" -ForegroundColor White
        Write-Host "   TODO: orchestrator-results\TODO.md" -ForegroundColor White
        
        Write-Host "`n💡 View dashboard:" -ForegroundColor Yellow
        Write-Host "   code orchestrator-results\dashboard.html" -ForegroundColor Cyan
    }
    
} catch {
    Write-Host "`n❌ Orchestration failed: $_" -ForegroundColor Red
    Pop-Location
    exit 1
}

Pop-Location
Write-Host ""
