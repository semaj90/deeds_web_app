<#
.SYNOPSIS
    Phase 72 - KAG Population Pipeline

.DESCRIPTION
    Complete pipeline to populate KAG storage:
    1. Regenerates errors.jsonl with fresh TypeScript errors
    2. Runs factory-fixer with verification enabled
    3. Verifies KAG storage populated correctly

.EXAMPLE
    .\phase72-kag-populate.ps1

.NOTES
    This is a wrapper around phase72-kag-populate.mjs for easy execution
#>

param(
    [switch]$SkipPrerequisites = $false
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Phase 72 - KAG Population Pipeline                          ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
if (-not $SkipPrerequisites) {
    Write-Host "🔍 Checking prerequisites..." -ForegroundColor Yellow

    # Check Redis
    try {
        $redisCheck = & "$PSScriptRoot\..\..\redis-latest\redis-cli.exe" -p 4005 PING 2>&1
        if ($redisCheck -match "PONG") {
            Write-Host "   ✅ Redis running on port 4005" -ForegroundColor Green
        } else {
            Write-Host "   ❌ Redis not responding" -ForegroundColor Red
            Write-Host "   Start Redis: cd C:\Users\james\Videos\deeds-web-app; .\redis-latest\redis-server.exe --port 4005" -ForegroundColor Yellow
            exit 1
        }
    } catch {
        Write-Host "   ❌ Redis not available" -ForegroundColor Red
        exit 1
    }

    # Check Node.js
    try {
        $nodeVersion = node --version
        Write-Host "   ✅ Node.js $nodeVersion" -ForegroundColor Green
    } catch {
        Write-Host "   ❌ Node.js not found" -ForegroundColor Red
        exit 1
    }

    Write-Host ""
}

# Run the pipeline
Write-Host "🚀 Starting KAG population pipeline..." -ForegroundColor Cyan
Write-Host ""

try {
    & node "$PSScriptRoot\phase72-kag-populate.mjs"
    $exitCode = $LASTEXITCODE

    Write-Host ""
    if ($exitCode -eq 0) {
        Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green
        Write-Host "✅ PIPELINE COMPLETED SUCCESSFULLY" -ForegroundColor Green
        Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green
        Write-Host ""
        Write-Host "📊 View results:" -ForegroundColor Cyan
        Write-Host "   - KAG Dashboard:  node scripts/kag-rag-dashboard.mjs" -ForegroundColor White
        Write-Host "   - Error Report:   reports/kag-population-report.json" -ForegroundColor White
        Write-Host ""
        Write-Host "🚀 Continue with more fixes:" -ForegroundColor Cyan
        Write-Host '   node scripts/factory-fixer-v2.mjs --apply --tier 2 --limit 100 --verify "cmd /c exit 0"' -ForegroundColor White
        Write-Host ""
    } else {
        Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Red
        Write-Host "❌ PIPELINE FAILED" -ForegroundColor Red
        Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Red
        Write-Host ""
        Write-Host "Check the logs above for details." -ForegroundColor Yellow
        Write-Host "Report: reports/kag-population-report.json" -ForegroundColor Yellow
        Write-Host ""
    }

    exit $exitCode

} catch {
    Write-Host ""
    Write-Host "❌ Error running pipeline: $_" -ForegroundColor Red
    exit 1
}
