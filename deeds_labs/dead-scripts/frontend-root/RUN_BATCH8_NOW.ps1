# ═══════════════════════════════════════════════════════════════════
# PHASE 81 BATCH 8: SIMPLE ONE-COMMAND EXECUTION
# ═══════════════════════════════════════════════════════════════════
#
# Current: 39,076 errors
# Target: <35,000 errors
# Strategy: Delimiter-fixer on top 10 highest-error files
# ═══════════════════════════════════════════════════════════════════

$ErrorActionPreference = "Continue"
Set-Location C:\Users\james\Videos\deeds-web-app\sveltekit-frontend

Write-Host ""
Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "   BATCH 8: TOP 10 DELIMITER-FIXER" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Take baseline snapshot
Write-Host "[1/5] Taking baseline snapshot..." -ForegroundColor Yellow
node scripts/phase81-tsc-summarize.mjs 2>&1 | Out-Null
Copy-Item reports\tsc-summary.json reports\batch8_pre.json -Force
$pre = (Get-Content reports\batch8_pre.json | ConvertFrom-Json).tsErrorCount
Write-Host "      Baseline: $pre errors" -ForegroundColor White
Write-Host ""

# Dry-run
Write-Host "[2/5] Running delimiter-fixer DRY-RUN..." -ForegroundColor Yellow
node scripts/phase81-delimiter-fixer.mjs `
  --dry-run `
  --list=reports/top10-files.txt `
  --out=reports/batch8_delim_dryrun

Write-Host ""

# Check results
$dryrun = Get-Content reports\batch8_delim_dryrun\phase81-delimiter-summary.json -ErrorAction SilentlyContinue
if (-not $dryrun) {
    $dryrun = Get-Content reports\phase81-delimiter-summary.json -ErrorAction SilentlyContinue
}
$dryrun = $dryrun | ConvertFrom-Json

Write-Host "[3/5] Dry-run results:" -ForegroundColor Yellow
Write-Host "      Files to modify: $($dryrun.filesModified)" -ForegroundColor $(if ($dryrun.filesModified -gt 0) { 'Green' } else { 'Red' })
Write-Host "      Total fixes: $($dryrun.totalFixes)" -ForegroundColor $(if ($dryrun.totalFixes -gt 0) { 'Green' } else { 'Red' })
Write-Host ""

if ($dryrun.filesModified -eq 0) {
    Write-Host "❌ No files to modify - delimiter patterns exhausted!" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Next steps:" -ForegroundColor Yellow
    Write-Host "   • Try aggressive-fixer v2 on remaining files" -ForegroundColor White
    Write-Host "   • Consider manual inspection of top 3 files" -ForegroundColor White
    exit 1
}

# Apply fixes
Write-Host "[4/5] Applying delimiter fixes..." -ForegroundColor Yellow
node scripts/phase81-delimiter-fixer.mjs `
  --list=reports/top10-files.txt `
  --out=reports/batch8_delim_apply

Write-Host ""

# Measure impact
Write-Host "[5/5] Measuring impact..." -ForegroundColor Yellow
node scripts/phase81-tsc-summarize.mjs 2>&1 | Out-Null
Copy-Item reports\tsc-summary.json reports\batch8_post.json -Force
$post = (Get-Content reports\batch8_post.json | ConvertFrom-Json).tsErrorCount

Write-Host ""
Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "   BATCH 8 COMPLETE" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Pre errors : $pre" -ForegroundColor White
Write-Host "Post errors: $post" -ForegroundColor $(if ($post -lt $pre) { 'Green' } else { 'Red' })

$delta = $post - $pre
Write-Host "Delta      : $delta" -ForegroundColor $(if ($delta -lt 0) { 'Green' } elseif ($delta -eq 0) { 'Yellow' } else { 'Red' })
Write-Host ""

if ($post -lt 35000) {
    Write-Host "🎉 TARGET ACHIEVED! Errors < 35,000!" -ForegroundColor Green
} elseif ($delta -lt -500) {
    Write-Host "✅ Excellent progress! Consider Batch 9." -ForegroundColor Green
} elseif ($delta -lt -100) {
    Write-Host "✅ Good progress. Continue to Batch 9." -ForegroundColor Green
} elseif ($delta -lt 0) {
    Write-Host "⚠️ Modest progress. Consider directory sweep." -ForegroundColor Yellow
} else {
    Write-Host "❌ No progress. Review patches or try different strategy." -ForegroundColor Red
}

Write-Host ""
Write-Host "Distance to target: $($post - 35000) errors remaining" -ForegroundColor $(if ($post -lt 35000) { 'Green' } else { 'Yellow' })
Write-Host ""
