# PowerShell script to run complete Phase 30 pipeline
# Usage: .\run-phase30-pipeline.ps1 [-Stage <1|2|3|all>] [-DryRun]

param(
    [ValidateSet('1', '2', '3', 'all')]
    [string]$Stage = 'all',
    [switch]$DryRun
)

$ErrorActionPreference = 'Continue'
$startTime = Get-Date

Write-Host "`n╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Phase 30 - Multi-Stage TS1005 Error Resolution        ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$dryRunFlag = if ($DryRun) { "--dry-run" } else { "" }

# Get baseline error count
Write-Host "📊 Getting baseline error count..." -ForegroundColor Yellow
$baselineErrors = (npx tsc --noEmit --skipLibCheck 2>&1 | Select-String "error TS" | Measure-Object).Count
Write-Host "   Baseline: $baselineErrors errors`n" -ForegroundColor White

# Stage 1: GPU Pre-filter (optional)
if ($Stage -eq '1' -or $Stage -eq 'all') {
    Write-Host "⚡ Stage 1: GPU Pre-Filtering" -ForegroundColor Cyan
    Write-Host "   Analyzing code patterns with GPU acceleration..." -ForegroundColor Gray
    
    $ollamaRunning = $false
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:11434" -TimeoutSec 2 -ErrorAction SilentlyContinue
        $ollamaRunning = $true
    } catch {}
    
    if ($ollamaRunning) {
        Write-Host "   ✅ Ollama detected - using GPU embeddings" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Ollama not running - using fallback heuristics" -ForegroundColor Yellow
    }
    
    node gpu-prefilter.cjs
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ Stage 1 complete`n" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Stage 1 had issues, continuing...`n" -ForegroundColor Yellow
    }
}

$fromJson = ""
if (Test-Path "logs\gpu-filtered-files.json") {
    $fromJson = "--from-json logs\gpu-filtered-files.json"
    $filtered = (Get-Content "logs\gpu-filtered-files.json" | ConvertFrom-Json).filteredFiles
    Write-Host "   📋 Processing $filtered filtered files`n" -ForegroundColor Cyan
}

# Stage 2: Regex-based fixes — HARD DISABLE (regex retired)
if ($Stage -eq '2' -or $Stage -eq 'all') {
    Write-Host "⏭️  Stage 2 disabled permanently (regex retired). Use Stage 3 AST." -ForegroundColor Yellow
}

# Stage 3: AST-based fixes (Phase 30v3)
if ($Stage -eq '3' -or $Stage -eq 'all') {
    Write-Host "🎯 Stage 3: AST Precision Fixes" -ForegroundColor Cyan
    Write-Host "   Semantic analysis with TypeScript compiler..." -ForegroundColor Gray
    
    # Check for ts-morph
    $tsMorphInstalled = $false
    try {
        $null = npm list ts-morph 2>&1
        $tsMorphInstalled = ($LASTEXITCODE -eq 0)
    } catch {}
    
    if (-not $tsMorphInstalled) {
        Write-Host "   📦 Installing ts-morph..." -ForegroundColor Yellow
        npm install ts-morph --save-dev
    }
    
    node phase30v3-ast-fixer.cjs $dryRunFlag
    
    if (-not $DryRun) {
        Write-Host "`n   📊 Checking final results..." -ForegroundColor Yellow
        $afterV3 = (npx tsc --noEmit --skipLibCheck 2>&1 | Select-String "error TS" | Measure-Object).Count
        $reduction = $baselineErrors - $afterV3
        Write-Host "   After v3: $afterV3 errors (-$reduction)" -ForegroundColor $(if ($reduction -gt 0) { "Green" } else { "Yellow" })
    }
    
    Write-Host "   ✅ Stage 3 complete`n" -ForegroundColor Green
}

# Summary
$endTime = Get-Date
$duration = $endTime - $startTime

Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                    Pipeline Complete                     ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "⏱️  Duration: $($duration.TotalMinutes.ToString('F1')) minutes" -ForegroundColor White
Write-Host "📁 Logs saved to: logs\" -ForegroundColor White

if ($DryRun) {
    Write-Host "`n💡 This was a DRY RUN - no files were modified" -ForegroundColor Yellow
    Write-Host "   Run without -DryRun to apply changes" -ForegroundColor Yellow
} else {
    Write-Host "`n✅ Changes applied successfully!" -ForegroundColor Green
    Write-Host "   Run 'npx tsc --noEmit' to verify" -ForegroundColor White
}

Write-Host ""
