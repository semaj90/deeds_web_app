#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Phase 34C+34D Integration - Complete AST repair workflow
.DESCRIPTION
    Runs both Phase 34C (object-literal repair) and Phase 34D (AI pattern detection)
    in sequence with error checking and validation
#>

param(
    [switch]$Apply34C,
    [switch]$Verbose,
    [switch]$SkipValidation
)

$ErrorActionPreference = "Stop"
$root = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend"
Push-Location $root

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "   Phase 34C+34D: Complete AST Repair Pipeline" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Cyan

# Step 1: Run Phase 34C (Object-Literal Repair)
Write-Host "🔧 Step 1: Phase 34C - Object-Literal Repair" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor DarkGray

$phase34cArgs = @()
if ($Apply34C) {
    $phase34cArgs += "--apply"
    Write-Host "  Mode: APPLY ✏️ (will modify files)" -ForegroundColor Yellow
} else {
    Write-Host "  Mode: DRY-RUN 👁️ (read-only)" -ForegroundColor Cyan
}
if ($Verbose) {
    $phase34cArgs += "--verbose"
}

$phase34cStart = Get-Date
try {
    if ($phase34cArgs.Count -gt 0) {
        node scripts/fix-object-literal-colons.mjs $phase34cArgs
    } else {
        node scripts/fix-object-literal-colons.mjs
    }
    $phase34cEnd = Get-Date
    $phase34cDuration = ($phase34cEnd - $phase34cStart).TotalSeconds
    Write-Host "`n  ✓ Phase 34C completed in $([math]::Round($phase34cDuration, 2))s" -ForegroundColor Green
} catch {
    Write-Host "`n  ✗ Phase 34C failed: $_" -ForegroundColor Red
    Pop-Location
    exit 1
}

# Step 2: Run Phase 34D (AI Pattern Detection)
Write-Host "`n🤖 Step 2: Phase 34D - AI Pattern Detection" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor DarkGray

$phase34dStart = Get-Date
try {
    node --max-old-space-size=8192 scripts/fix-phase34d-ai-patterns.mjs | Out-Null
    $phase34dEnd = Get-Date
    $phase34dDuration = ($phase34dEnd - $phase34dStart).TotalSeconds
    Write-Host "  ✓ Phase 34D completed in $([math]::Round($phase34dDuration, 2))s" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Phase 34D failed: $_" -ForegroundColor Red
    Pop-Location
    exit 1
}

# Step 3: Error Checking
Write-Host "`n🔍 Step 3: Error Validation" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor DarkGray

try {
    .\scripts\check-phase34d-errors.ps1 -ExportJson | Out-Null
    
    # Parse results
    if (Test-Path "phase34d-error-check.json") {
        $errorData = Get-Content "phase34d-error-check.json" | ConvertFrom-Json
        Write-Host "  Parse errors:       $($errorData.summary.parseErrors)" -ForegroundColor White
        Write-Host "  Traverse errors:    $($errorData.summary.traverseErrors)" -ForegroundColor White
        Write-Host "  Shorthand patterns: $($errorData.summary.shorthandPatterns)" -ForegroundColor Cyan
        Write-Host "  Missing values:     $($errorData.summary.missingValues)" -ForegroundColor $(if ($errorData.summary.missingValues -gt 0) { "Red" } else { "Green" })
        
        if ($errorData.hasCritical) {
            Write-Host "`n  ⚠️ Critical issues found!" -ForegroundColor Yellow
        } else {
            Write-Host "`n  ✓ No critical issues" -ForegroundColor Green
        }
    }
} catch {
    Write-Host "  ⚠️ Error checking failed: $_" -ForegroundColor Yellow
}

# Step 4: Optional TypeScript Validation
if (!$SkipValidation) {
    Write-Host "`n📊 Step 4: TypeScript Validation (optional)" -ForegroundColor Yellow
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor DarkGray
    Write-Host "  Run manually: npx tsc --noEmit --skipLibCheck" -ForegroundColor DarkGray
    Write-Host "  Run manually: npm run check" -ForegroundColor DarkGray
}

# Summary
Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "   ✅ Phase 34C+34D Pipeline Complete!" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Green

$totalDuration = $phase34cDuration + $phase34dDuration
Write-Host "📊 Results:" -ForegroundColor Cyan
Write-Host "  Phase 34C duration: $([math]::Round($phase34cDuration, 2))s" -ForegroundColor White
Write-Host "  Phase 34D duration: $([math]::Round($phase34dDuration, 2))s" -ForegroundColor White
Write-Host "  Total time:         $([math]::Round($totalDuration, 2))s" -ForegroundColor White

Write-Host "`n📁 Generated Files:" -ForegroundColor Cyan
if (Test-Path "phase34c-object-literal-report.log") {
    $size = (Get-Item "phase34c-object-literal-report.log").Length
    Write-Host "  ✓ phase34c-object-literal-report.log ($size bytes)" -ForegroundColor Green
}
if (Test-Path "phase34d-ai-report.log") {
    $size = (Get-Item "phase34d-ai-report.log").Length
    Write-Host "  ✓ phase34d-ai-report.log ($size bytes)" -ForegroundColor Green
}
if (Test-Path "phase34d-error-check.json") {
    Write-Host "  ✓ phase34d-error-check.json" -ForegroundColor Green
}

if (!$Apply34C) {
    Write-Host "`n💡 To apply Phase 34C fixes, run:" -ForegroundColor Yellow
    Write-Host "   .\scripts\run-phase34c-34d-pipeline.ps1 -Apply34C" -ForegroundColor Cyan
}

Write-Host "`n🚀 Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Review: code phase34c-object-literal-report.log" -ForegroundColor Yellow
Write-Host "  2. Review: code phase34d-ai-report.log" -ForegroundColor Yellow
Write-Host "  3. Validate: npx tsc --noEmit --skipLibCheck" -ForegroundColor Yellow
if ($Apply34C) {
    Write-Host "  4. Commit: git add -A && git commit -m 'fix: Phase 34C+34D AST repairs'" -ForegroundColor Yellow
}

Write-Host ""
Pop-Location
