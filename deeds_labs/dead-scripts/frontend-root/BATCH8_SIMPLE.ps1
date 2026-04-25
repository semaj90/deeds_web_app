# ═══════════════════════════════════════════════════════════════════
# PHASE 81 BATCH 8: DELIMITER-FIXER (FILES 351-400)
# ═══════════════════════════════════════════════════════════════════

$ErrorActionPreference = "Continue"
Set-Location C:\Users\james\Videos\deeds-web-app\sveltekit-frontend

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "   BATCH 8: DELIMITER-FIXER (FILES 351-400)" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# ────────────────────────────────────────────────────────────────────
# STEP 1: Quick Git cleanup (add reports/ to .gitignore)
# ────────────────────────────────────────────────────────────────────
Write-Host "[1/7] Quick Git fix..." -ForegroundColor Yellow

if (Test-Path .gitignore) {
    $content = Get-Content .gitignore -Raw
    if ($content -notmatch "reports/") {
        Add-Content .gitignore "`nreports/`n"
        Write-Host "      ✅ Added reports/ to .gitignore" -ForegroundColor Green
    }
} else {
    "reports/" | Out-File .gitignore -Encoding utf8
    Write-Host "      ✅ Created .gitignore" -ForegroundColor Green
}

Write-Host ""

# ────────────────────────────────────────────────────────────────────
# STEP 2: Create skiplist
# ────────────────────────────────────────────────────────────────────
Write-Host "[2/7] Creating skiplist..." -ForegroundColor Yellow

"src/lib/server/services/CaseScoringServiceGrpc.ts" | Set-Content .phase81-delimiter-skiplist.txt -Encoding utf8
Write-Host "      ✅ Blacklisted CaseScoringServiceGrpc.ts" -ForegroundColor Green
Write-Host ""

# ────────────────────────────────────────────────────────────────────
# STEP 3: Build Batch 8 file list (351-400, minus blacklist)
# ────────────────────────────────────────────────────────────────────
Write-Host "[3/7] Building Batch 8 file list..." -ForegroundColor Yellow

if (-not (Test-Path reports\phase81-hot-files.txt)) {
    Write-Host "      ❌ reports\phase81-hot-files.txt not found!" -ForegroundColor Red
    Write-Host "         Run: node scripts/phase81-tsc-summarize.mjs" -ForegroundColor Yellow
    exit 1
}

$all = Get-Content reports\phase81-hot-files.txt
$batch8 = $all[350..399]
$skip = @("src/lib/server/services/CaseScoringServiceGrpc.ts")
$batch8Filtered = $batch8 | Where-Object { $skip -notcontains $_ }

$batch8Filtered | Set-Content reports\hot-files-8.txt -Encoding utf8
Write-Host "      ✅ Created reports\hot-files-8.txt ($($batch8Filtered.Count) files)" -ForegroundColor Green
Write-Host ""

# ────────────────────────────────────────────────────────────────────
# STEP 4: Pre-snapshot
# ────────────────────────────────────────────────────────────────────
Write-Host "[4/7] Taking pre-snapshot..." -ForegroundColor Yellow

node scripts/phase81-tsc-summarize.mjs 2>&1 | Out-Null
Copy-Item reports\tsc-summary.json reports\batch8_pre_tsc-summary.json -Force

$pre = Get-Content reports\batch8_pre_tsc-summary.json | ConvertFrom-Json
Write-Host "      Baseline: $($pre.totalErrors) errors" -ForegroundColor White
Write-Host ""

# ────────────────────────────────────────────────────────────────────
# STEP 5: Dry-run delimiter-fixer
# ────────────────────────────────────────────────────────────────────
Write-Host "[5/7] Running delimiter-fixer DRY-RUN..." -ForegroundColor Yellow

node scripts/phase81-delimiter-fixer.mjs `
  --dry-run `
  --list=reports/hot-files-8.txt `
  --out=reports/batch8_delim_dryrun 2>&1 `
| Tee-Object reports\batch8_delim_dryrun_log.txt | Out-Null

Write-Host ""

# Check summary
$sumPath = "reports/batch8_delim_dryrun/phase81-delimiter-summary.json"
if (Test-Path $sumPath) {
    $sum = Get-Content $sumPath | ConvertFrom-Json
    Write-Host "      Files processed: $($sum.filesProcessed)" -ForegroundColor White
    Write-Host "      Files modified:  $($sum.filesModified)" -ForegroundColor $(if ($sum.filesModified -gt 0) { 'Green' } else { 'Red' })
    Write-Host "      Total fixes:     $($sum.totalFixes)" -ForegroundColor $(if ($sum.totalFixes -gt 0) { 'Green' } else { 'Red' })

    if ($sum.filesModified -eq 0) {
        Write-Host ""
        Write-Host "❌ NO FIXES FOUND - Delimiter patterns exhausted!" -ForegroundColor Red
        Write-Host ""
        Write-Host "💡 Next steps:" -ForegroundColor Yellow
        Write-Host "   • Try top 10 files instead: use top10-files.txt" -ForegroundColor White
        Write-Host "   • Or run directory sweep: src/lib/services/**" -ForegroundColor White
        exit 0
    }
} else {
    Write-Host "      ⚠️  Summary not found at expected location" -ForegroundColor Yellow
    Write-Host "         Check: reports\batch8_delim_dryrun_log.txt" -ForegroundColor White
}

Write-Host ""

# ────────────────────────────────────────────────────────────────────
# STEP 6: Apply fixes
# ────────────────────────────────────────────────────────────────────
Write-Host "[6/7] Applying delimiter fixes..." -ForegroundColor Yellow

node scripts/phase81-delimiter-fixer.mjs `
  --list=reports/hot-files-8.txt `
  --out=reports/batch8_delim_apply 2>&1 `
| Tee-Object reports\batch8_delim_apply_log.txt | Out-Null

Write-Host "      ✅ Applied" -ForegroundColor Green
Write-Host ""

# ────────────────────────────────────────────────────────────────────
# STEP 7: Post-snapshot + delta
# ────────────────────────────────────────────────────────────────────
Write-Host "[7/7] Measuring impact..." -ForegroundColor Yellow

node scripts/phase81-tsc-summarize.mjs 2>&1 | Out-Null
Copy-Item reports\tsc-summary.json reports\batch8_post_tsc-summary.json -Force

$post = Get-Content reports\batch8_post_tsc-summary.json | ConvertFrom-Json

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "   BATCH 8 RESULTS" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

Write-Host "Pre errors :  $($pre.totalErrors)" -ForegroundColor White
Write-Host "Post errors:  $($post.totalErrors)" -ForegroundColor $(if ($post.totalErrors -lt $pre.totalErrors) { 'Green' } else { 'Red' })

$delta = $post.totalErrors - $pre.totalErrors
$deltaStr = if ($delta -lt 0) { "$delta" } else { "+$delta" }
Write-Host "Delta      :  $deltaStr" -ForegroundColor $(if ($delta -lt 0) { 'Green' } elseif ($delta -eq 0) { 'Yellow' } else { 'Red' })

Write-Host ""
Write-Host "Top 5 Error Codes:" -ForegroundColor Yellow
$post.topCodes | Select-Object -First 5 | ForEach-Object {
    Write-Host "  $($_.code): $($_.count)" -ForegroundColor White
}

Write-Host ""

# Recommendation
if ($post.totalErrors -lt 35000) {
    Write-Host "🎉 TARGET ACHIEVED! Errors < 35,000" -ForegroundColor Green
} elseif ($delta -lt -500) {
    Write-Host "✅ Excellent progress! Continue with Batch 9" -ForegroundColor Green
} elseif ($delta -lt -100) {
    Write-Host "✅ Good progress! Try top 10 or Batch 9" -ForegroundColor Green
} elseif ($delta -lt 0) {
    Write-Host "⚠️ Modest progress. Try top 10 sweep next" -ForegroundColor Yellow
} else {
    Write-Host "❌ No progress or regression" -ForegroundColor Red
}

Write-Host ""
Write-Host "Distance to target: $($post.totalErrors - 35000) errors" -ForegroundColor Yellow
Write-Host ""
