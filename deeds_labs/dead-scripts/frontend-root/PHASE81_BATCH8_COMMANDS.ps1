# ═══════════════════════════════════════════════════════════════════
# Phase 81: Batch 8 - Delimiter-Fixer on Top 10 High-Impact Files
# ═══════════════════════════════════════════════════════════════════
#
# CURRENT STATE:
#   Total Errors: 36,758
#   Target: <35,000 (need -1,758 more)
#   Progress: 95.2% to target
#
# BATCH 7 RESULTS:
#   Colon-fixer: 3 fixes only (patterns exhausted)
#   Conclusion: Pivot to delimiter-fixer
#
# BATCH 8 STRATEGY:
#   Tool: delimiter-fixer (proven 2,810 fixes, 0% regression)
#   Target: Top 10 broken files (2,222 total errors)
#   Expected: -200 to -1,200 error reduction
# ═══════════════════════════════════════════════════════════════════

Set-Location C:\Users\james\Videos\deeds-web-app\sveltekit-frontend

Write-Host "═══════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "📋 Phase 81 Batch 8: Delimiter-Fixer on Top 10 Files" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# ───────────────────────────────────────────────────────────────────
# STEP 1: Pre-snapshot (baseline before Batch 8)
# ───────────────────────────────────────────────────────────────────
Write-Host "1️⃣ Taking pre-snapshot..." -ForegroundColor Yellow
node scripts/phase81-tsc-summarize.mjs 2>&1 | Out-Null
Copy-Item reports\tsc-summary.json reports\batch8_pre_tsc-summary.json -Force

$pre = Get-Content reports\batch8_pre_tsc-summary.json | ConvertFrom-Json
Write-Host "   ✅ Baseline: $($pre.tsErrorCount) errors" -ForegroundColor Green
Write-Host ""

# ───────────────────────────────────────────────────────────────────
# STEP 2: Dry-run delimiter-fixer (single invocation, v2 workflow)
# ───────────────────────────────────────────────────────────────────
Write-Host "2️⃣ Running delimiter-fixer dry-run..." -ForegroundColor Yellow
node scripts/phase81-delimiter-fixer.mjs `
  --dry-run `
  --list=reports/top10-files.txt `
  --out=reports/batch8_delimiter_dryrun 2>&1 `
| Tee-Object reports\batch8_delimiter_dryrun_log.txt | Out-Null

# ───────────────────────────────────────────────────────────────────
# STEP 3: "Safe to apply?" gate
# ───────────────────────────────────────────────────────────────────
Write-Host "3️⃣ Checking dry-run results..." -ForegroundColor Yellow
$dryrun = Get-Content reports\batch8_delimiter_dryrun\phase81-delimiter-summary.json -ErrorAction SilentlyContinue | ConvertFrom-Json

if (-not $dryrun) {
    Write-Host "   ❌ No summary found - delimiter-fixer may not support --out yet" -ForegroundColor Red
    Write-Host "   💡 Fallback: Check reports\phase81-delimiter-summary.json" -ForegroundColor Yellow
    $dryrun = Get-Content reports\phase81-delimiter-summary.json -ErrorAction SilentlyContinue | ConvertFrom-Json
}

Write-Host ""
Write-Host "   📊 Dry-Run Results:" -ForegroundColor Cyan
Write-Host "      Files Processed: $($dryrun.filesProcessed)" -ForegroundColor White
Write-Host "      Files Modified: $($dryrun.filesModified)" -ForegroundColor $(if ($dryrun.filesModified -gt 0) { 'Green' } else { 'Yellow' })
Write-Host "      Total Fixes: $($dryrun.totalFixes)" -ForegroundColor $(if ($dryrun.totalFixes -gt 50) { 'Green' } elseif ($dryrun.totalFixes -gt 0) { 'Yellow' } else { 'Red' })
Write-Host ""

# ───────────────────────────────────────────────────────────────────
# STEP 4: Apply decision gate
# ───────────────────────────────────────────────────────────────────
if ($dryrun.filesModified -eq 0) {
    Write-Host "⚠️ WARNING: 0 files would be modified" -ForegroundColor Yellow
    Write-Host "   Delimiter patterns may be exhausted on these files too." -ForegroundColor Yellow
    Write-Host ""
    $continue = Read-Host "Continue anyway? (yes/no)"
    if ($continue -ne "yes") {
        Write-Host "❌ Aborted - consider broader directory sweep instead" -ForegroundColor Red
        exit 0
    }
}

Write-Host "4️⃣ Applying delimiter-fixer..." -ForegroundColor Yellow
node scripts/phase81-delimiter-fixer.mjs `
  --list=reports/top10-files.txt `
  --out=reports/batch8_delimiter_apply 2>&1 `
| Tee-Object reports\batch8_delimiter_apply_log.txt | Out-Null

# ───────────────────────────────────────────────────────────────────
# STEP 5: Post-snapshot + impact analysis
# ───────────────────────────────────────────────────────────────────
Write-Host "5️⃣ Measuring impact..." -ForegroundColor Yellow
node scripts/phase81-tsc-summarize.mjs 2>&1 | Out-Null
Copy-Item reports\tsc-summary.json reports\batch8_post_tsc-summary.json -Force

$post = Get-Content reports\batch8_post_tsc-summary.json | ConvertFrom-Json

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "📊 BATCH 8 FINAL RESULTS" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Pre errors  : $($pre.tsErrorCount)" -ForegroundColor White
Write-Host "Post errors : $($post.tsErrorCount)" -ForegroundColor White

$delta = $post.tsErrorCount - $pre.tsErrorCount
$deltaColor = if ($delta -lt 0) { 'Green' } elseif ($delta -eq 0) { 'Yellow' } else { 'Red' }
Write-Host "Delta       : $delta" -ForegroundColor $deltaColor
Write-Host ""

Write-Host "Distance to <35,000 target: $($post.tsErrorCount - 35000)" -ForegroundColor $(if ($post.tsErrorCount -lt 35000) { 'Green' } else { 'Yellow' })
Write-Host ""

# ───────────────────────────────────────────────────────────────────
# STEP 6: Next recommendation
# ───────────────────────────────────────────────────────────────────
if ($post.tsErrorCount -lt 35000) {
    Write-Host "🎉 TARGET ACHIEVED! Errors < 35,000!" -ForegroundColor Green
    Write-Host "   Next: Consider pivoting to import/type fixers" -ForegroundColor Cyan
} elseif ($delta -lt -100) {
    Write-Host "✅ Strong progress! Consider:" -ForegroundColor Green
    Write-Host "   - Batch 9: Next 50 files OR" -ForegroundColor White
    Write-Host "   - Directory sweep: src/lib/services/** OR" -ForegroundColor White
    Write-Host "   - Aggressive-fixer v2 on remaining TS1005" -ForegroundColor White
} elseif ($delta -lt 0) {
    Write-Host "⚠️ Modest progress. Consider:" -ForegroundColor Yellow
    Write-Host "   - Directory sweep: src/lib/server/ai/** OR" -ForegroundColor White
    Write-Host "   - Manual inspection of top 3 files" -ForegroundColor White
} else {
    Write-Host "❌ No progress or regression. Options:" -ForegroundColor Red
    Write-Host "   - Review patches in reports/batch8_delimiter_apply/patches/" -ForegroundColor White
    Write-Host "   - Git revert if needed: git checkout -- <files>" -ForegroundColor White
    Write-Host "   - Switch to manual fixes on highest-error files" -ForegroundColor White
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
