#!/usr/bin/env pwsh
# run-phase38-eslint-ai.ps1
# Phase 38: ESLint + AI-Assisted Autofix Pipeline

$ErrorActionPreference = "Stop"

Write-Host "$('═' * 60)" -ForegroundColor Cyan
Write-Host "🤖 Phase 38: ESLint + AI-Assisted Autofix" -ForegroundColor Cyan
Write-Host "$('═' * 60)`n" -ForegroundColor Cyan

$ROOT = "C:\Users\james\Videos\deeds-web-app"
cd $ROOT

# Pre-flight check
Write-Host "📋 Pre-flight Check..." -ForegroundColor Yellow

# Check if Phase 34-37 completed
if (-not (Test-Path "scripts\logs\phase36-typescript-validation.log")) {
    Write-Host "❌ Run Phase 34-37 first: .\scripts\run-phase34-37-protected.ps1" -ForegroundColor Red
    exit 1
}

# Check error count
$tsErrors = (Get-Content "scripts\logs\phase36-typescript-validation.log" | Select-String "error TS" | Measure-Object).Count

if ($tsErrors -gt 8000) {
    Write-Host "⚠️  Warning: $tsErrors TypeScript errors detected" -ForegroundColor Yellow
    Write-Host "   Recommended: < 8,000 errors for Phase 38" -ForegroundColor Yellow
    Write-Host "   Continue anyway? (y/N): " -NoNewline -ForegroundColor Yellow
    $confirm = Read-Host
    if ($confirm -ne 'y' -and $confirm -ne 'Y') {
        Write-Host "   Cancelled. Run Phase 34-37 again or fix top files manually.`n" -ForegroundColor Gray
        exit 0
    }
}

Write-Host "✅ Pre-flight checks passed`n" -ForegroundColor Green

# Git backup
Write-Host "💾 Creating pre-phase38 backup commit..." -ForegroundColor Cyan
git add -A 2>&1 | Out-Null
$commitResult = git commit -m "pre-phase38-backup: ESLint + AI autofix" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Backup commit created`n" -ForegroundColor Green
} else {
    Write-Host "⚠️  No changes to commit`n" -ForegroundColor Yellow
}

# Run Phase 38
Write-Host "$('═' * 60)" -ForegroundColor Cyan
Write-Host "🚀 Running Phase 38..." -ForegroundColor Cyan
Write-Host "$('═' * 60)`n" -ForegroundColor Cyan

$startTime = Get-Date
node scripts\fix-phase38-eslint-ai.mjs
$duration = (Get-Date) - $startTime

Write-Host "`n✨ Phase 38 completed in $([math]::Round($duration.TotalMinutes, 1)) minutes" -ForegroundColor Green

# Final validation
Write-Host "`n$('═' * 60)" -ForegroundColor Cyan
Write-Host "🔍 Final Validation" -ForegroundColor Cyan
Write-Host "$('═' * 60)`n" -ForegroundColor Cyan

Write-Host "Running error scanner..." -ForegroundColor Yellow
node scripts\prioritize-error-fixes.mjs 2>&1 | Select-Object -First 30

Write-Host "`n📝 Review artifacts:" -ForegroundColor Cyan
Write-Host "   • ESLint log:     scripts\logs\phase38-eslint.log" -ForegroundColor White
Write-Host "   • Prettier log:   scripts\logs\phase38-prettier.log" -ForegroundColor White
Write-Host "   • Validation log: scripts\logs\phase38-validation.log" -ForegroundColor White
Write-Host "   • Report:         scripts\phase38-report.json" -ForegroundColor White

Write-Host "`n💾 Commit changes:" -ForegroundColor Cyan
Write-Host "   git diff --stat" -ForegroundColor White
Write-Host "   git add -A" -ForegroundColor White
Write-Host "   git commit -m 'fix: Phase 38 ESLint + AI autofix'" -ForegroundColor White

Write-Host ""
exit 0
