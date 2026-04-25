#!/usr/bin/env pwsh
# run-phase5.ps1
# Complete Phase 5 Protected Cleanup Pipeline
# Runs: Fix → Report → Validation

$ErrorActionPreference = "Stop"

Write-Host "$('═' * 60)" -ForegroundColor Cyan
Write-Host "🚀 Phase 5: Protected Cleanup Pipeline" -ForegroundColor Cyan
Write-Host "$('═' * 60)`n" -ForegroundColor Cyan

$ROOT = "C:\Users\james\Videos\deeds-web-app"
cd $ROOT

# Pre-flight check
Write-Host "📋 Pre-flight Check..." -ForegroundColor Yellow
if (-not (Test-Path "sveltekit-frontend\src")) {
    Write-Host "❌ Source directory not found!" -ForegroundColor Red
    exit 1
}

# Optional: Create git commit before phase
Write-Host "`n💾 Creating pre-phase5 backup commit..." -ForegroundColor Cyan
git add -A 2>&1 | Out-Null
$commitResult = git commit -m "pre-phase5-backup: protected cleanup" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Backup commit created" -ForegroundColor Green
} else {
    Write-Host "⚠️  No changes to commit (already backed up)" -ForegroundColor Yellow
}

# Phase 5A: Protected Cleanup
Write-Host "`n$('═' * 60)" -ForegroundColor Cyan
Write-Host "🔧 Phase 5A: Running Protected Cleanup" -ForegroundColor Cyan
Write-Host "$('═' * 60)`n" -ForegroundColor Cyan

node scripts/fix-svelte-phase5-protected.mjs

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Phase 5A Complete" -ForegroundColor Green
} else {
    Write-Host "`n❌ Phase 5A had errors" -ForegroundColor Red
    exit 1
}

# Phase 5B: Generate Report
Write-Host "`n$('═' * 60)" -ForegroundColor Cyan
Write-Host "📊 Phase 5B: Generating Report Dashboard" -ForegroundColor Cyan
Write-Host "$('═' * 60)`n" -ForegroundColor Cyan

node scripts/phase5-report.mjs

# Phase 5C: Validation
Write-Host "`n$('═' * 60)" -ForegroundColor Cyan
Write-Host "🔍 Phase 5C: Running Validation" -ForegroundColor Cyan
Write-Host "$('═' * 60)`n" -ForegroundColor Cyan

Write-Host "Running Svelte check..." -ForegroundColor Yellow
cd sveltekit-frontend

# Run svelte-check and capture output
$svelteCheckOutput = npm run check:svelte 2>&1 | Select-Object -Last 20

Write-Host "`nSvelte Check Results (last 20 lines):" -ForegroundColor Cyan
$svelteCheckOutput

# Count errors
$errorCount = ($svelteCheckOutput | Select-String "error" | Measure-Object).Count

if ($errorCount -eq 0) {
    Write-Host "`n✅ No Svelte syntax errors detected!" -ForegroundColor Green
} else {
    Write-Host "`n⚠️  $errorCount error lines found (may include false positives)" -ForegroundColor Yellow
}

# Phase 5D: Error Scanner
Write-Host "`n$('═' * 60)" -ForegroundColor Cyan
Write-Host "🔍 Phase 5D: Running Error Scanner" -ForegroundColor Cyan
Write-Host "$('═' * 60)`n" -ForegroundColor Cyan

cd ..
node scripts/prioritize-error-fixes.mjs 2>&1 | Select-Object -First 40

# Final Summary
Write-Host "`n$('═' * 60)" -ForegroundColor Cyan
Write-Host "✨ Phase 5 Pipeline Complete!" -ForegroundColor Green
Write-Host "$('═' * 60)`n" -ForegroundColor Cyan

Write-Host "📝 Generated Artifacts:" -ForegroundColor Cyan
Write-Host "   • Backups: scripts/backups/phase5/" -ForegroundColor White
Write-Host "   • Logs: scripts/logs/phase5-protected-*.json" -ForegroundColor White
Write-Host "   • Cache: scripts/cache/phase5-hashes.json" -ForegroundColor White

Write-Host "`n🔍 Review Changes:" -ForegroundColor Cyan
Write-Host "   git diff --stat" -ForegroundColor White
Write-Host "   git diff sveltekit-frontend/src" -ForegroundColor White

Write-Host "`n💾 Commit Changes:" -ForegroundColor Cyan
Write-Host "   git add -A" -ForegroundColor White
Write-Host "   git commit -m 'fix: Phase 5 protected Svelte/TS/WASM cleanup'" -ForegroundColor White

Write-Host "`n📊 View Full Report:" -ForegroundColor Cyan
Write-Host "   node scripts/phase5-report.mjs" -ForegroundColor White

Write-Host "`n🔄 Re-run Phase 5:" -ForegroundColor Cyan
Write-Host "   .\scripts\run-phase5.ps1" -ForegroundColor White
Write-Host "   (Will skip already-clean files automatically)" -ForegroundColor Gray

Write-Host ""
exit 0
