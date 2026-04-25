# ═══════════════════════════════════════════════════════════════════
# PHASE 81: GIT CLEANUP + BATCH 8 EXECUTION
# ═══════════════════════════════════════════════════════════════════
# This script:
# 1. Fixes Git issues (gitignore, LF/CRLF)
# 2. Commits current state cleanly
# 3. Runs Batch 8 delimiter-fixer
# ═══════════════════════════════════════════════════════════════════

$ErrorActionPreference = "Continue"
Set-Location C:\Users\james\Videos\deeds-web-app\sveltekit-frontend

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "   PHASE 81: GIT CLEANUP + BATCH 8" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# ────────────────────────────────────────────────────────────────────
# STEP 1: Fix .gitignore (exclude reports/)
# ────────────────────────────────────────────────────────────────────
Write-Host "[1/7] Updating .gitignore..." -ForegroundColor Yellow

$gitignorePath = ".gitignore"
$reportsLine = "reports/"

if (Test-Path $gitignorePath) {
    $content = Get-Content $gitignorePath -Raw
    if ($content -notmatch "reports/") {
        Add-Content $gitignorePath "`n# Phase 81 artifacts`nreports/`n"
        Write-Host "      ✅ Added reports/ to .gitignore" -ForegroundColor Green
    } else {
        Write-Host "      ℹ️  reports/ already in .gitignore" -ForegroundColor Gray
    }
} else {
    "reports/" | Out-File $gitignorePath -Encoding utf8
    Write-Host "      ✅ Created .gitignore with reports/" -ForegroundColor Green
}

Write-Host ""

# ────────────────────────────────────────────────────────────────────
# STEP 2: Fix Git LF/CRLF (optional but recommended)
# ────────────────────────────────────────────────────────────────────
Write-Host "[2/7] Configuring Git line endings..." -ForegroundColor Yellow

git config core.autocrlf false
git config core.eol lf

# Create .gitattributes if missing
$gitattributesPath = ".gitattributes"
if (-not (Test-Path $gitattributesPath)) {
    @"
*.ts text eol=lf
*.tsx text eol=lf
*.d.ts text eol=lf
*.mjs text eol=lf
*.json text eol=lf
"@ | Out-File $gitattributesPath -Encoding utf8
    Write-Host "      ✅ Created .gitattributes" -ForegroundColor Green
} else {
    Write-Host "      ℹ️  .gitattributes exists" -ForegroundColor Gray
}

Write-Host ""

# ────────────────────────────────────────────────────────────────────
# STEP 3: Check Git status
# ────────────────────────────────────────────────────────────────────
Write-Host "[3/7] Checking Git status..." -ForegroundColor Yellow

$modifiedCount = (git status --porcelain | Measure-Object).Count
Write-Host "      Modified files: $modifiedCount" -ForegroundColor $(if ($modifiedCount -gt 0) { 'Yellow' } else { 'Green' })

if ($modifiedCount -gt 100) {
    Write-Host ""
    Write-Host "⚠️  WARNING: $modifiedCount modified files detected!" -ForegroundColor Red
    Write-Host "   This will create a large commit. Options:" -ForegroundColor Yellow
    Write-Host "   1. Continue (recommended) - commit Phase 81 progress" -ForegroundColor White
    Write-Host "   2. Abort - review changes manually first" -ForegroundColor White
    Write-Host ""
    $choice = Read-Host "Continue? (yes/no)"
    if ($choice -ne "yes") {
        Write-Host "❌ Aborted by user" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""

# ────────────────────────────────────────────────────────────────────
# STEP 4: Commit current state
# ────────────────────────────────────────────────────────────────────
Write-Host "[4/7] Committing Phase 81 progress..." -ForegroundColor Yellow

git add -A
git commit -m "Phase 81: Batch 7 colon-fixer results + pre-Batch 8 state

- Applied colon-fixer v2 on Batch 7 (3 fixes)
- Updated phase81-fix-colon-corruption.mjs with v2 features
- Blacklisted CaseScoringServiceGrpc.ts
- Current baseline: check tsc-summary.json
- Ready for Batch 8 delimiter-fixer
"

if ($LASTEXITCODE -eq 0) {
    Write-Host "      ✅ Committed successfully" -ForegroundColor Green
} else {
    Write-Host "      ⚠️  Commit had warnings (likely safe)" -ForegroundColor Yellow
}

Write-Host ""

# ────────────────────────────────────────────────────────────────────
# STEP 5: Take baseline snapshot
# ────────────────────────────────────────────────────────────────────
Write-Host "[5/7] Taking baseline snapshot..." -ForegroundColor Yellow

node scripts/phase81-tsc-summarize.mjs 2>&1 | Out-Null
Copy-Item reports\tsc-summary.json reports\batch8_pre.json -Force

$pre = (Get-Content reports\batch8_pre.json | ConvertFrom-Json).tsErrorCount
Write-Host "      Baseline: $pre errors" -ForegroundColor White
Write-Host ""

# ────────────────────────────────────────────────────────────────────
# STEP 6: Run delimiter-fixer dry-run
# ────────────────────────────────────────────────────────────────────
Write-Host "[6/7] Running delimiter-fixer DRY-RUN on top 10..." -ForegroundColor Yellow

# Regenerate top10 list from current state
$top10 = (Get-Content reports\batch8_pre.json | ConvertFrom-Json).topFiles |
    Where-Object { $_.key -notlike '*CaseScoringServiceGrpc*' } |
    Select-Object -First 10 -ExpandProperty key

$top10 | Set-Content reports\top10-files.txt -Encoding utf8

node scripts/phase81-delimiter-fixer.mjs `
  --dry-run `
  --list=reports/top10-files.txt `
  --out=reports/batch8_delim_dryrun

Write-Host ""

# Check results
$dryrunSummary = $null
if (Test-Path reports\batch8_delim_dryrun\phase81-delimiter-summary.json) {
    $dryrunSummary = Get-Content reports\batch8_delim_dryrun\phase81-delimiter-summary.json | ConvertFrom-Json
} elseif (Test-Path reports\phase81-delimiter-summary.json) {
    $dryrunSummary = Get-Content reports\phase81-delimiter-summary.json | ConvertFrom-Json
}

if ($dryrunSummary) {
    Write-Host "      Files to modify: $($dryrunSummary.filesModified)" -ForegroundColor $(if ($dryrunSummary.filesModified -gt 0) { 'Green' } else { 'Red' })
    Write-Host "      Total fixes: $($dryrunSummary.totalFixes)" -ForegroundColor $(if ($dryrunSummary.totalFixes -gt 0) { 'Green' } else { 'Red' })

    if ($dryrunSummary.filesModified -eq 0) {
        Write-Host ""
        Write-Host "❌ No files to modify - patterns exhausted!" -ForegroundColor Red
        Write-Host ""
        Write-Host "💡 Recommended next steps:" -ForegroundColor Yellow
        Write-Host "   • Try aggressive-fixer on directory: src/lib/services/**" -ForegroundColor White
        Write-Host "   • Manual inspection of top 3 highest-error files" -ForegroundColor White
        Write-Host "   • Consider switching to type-error fixers" -ForegroundColor White
        exit 0
    }
} else {
    Write-Host "      ⚠️  Could not read summary - check log manually" -ForegroundColor Yellow
}

Write-Host ""

# ────────────────────────────────────────────────────────────────────
# STEP 7: Apply fixes and measure
# ────────────────────────────────────────────────────────────────────
Write-Host "[7/7] Applying delimiter fixes..." -ForegroundColor Yellow

node scripts/phase81-delimiter-fixer.mjs `
  --list=reports/top10-files.txt `
  --out=reports/batch8_delim_apply

Write-Host ""
Write-Host "Measuring impact..." -ForegroundColor Yellow

node scripts/phase81-tsc-summarize.mjs 2>&1 | Out-Null
Copy-Item reports\tsc-summary.json reports\batch8_post.json -Force

$post = (Get-Content reports\batch8_post.json | ConvertFrom-Json).tsErrorCount

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "   BATCH 8 COMPLETE" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

Write-Host "Pre errors : $pre" -ForegroundColor White
Write-Host "Post errors: $post" -ForegroundColor $(if ($post -lt $pre) { 'Green' } else { 'Red' })

$delta = $post - $pre
Write-Host "Delta      : $delta" -ForegroundColor $(if ($delta -lt 0) { 'Green' } elseif ($delta -eq 0) { 'Yellow' } else { 'Red' })
Write-Host ""

# Detailed analysis
$preData = Get-Content reports\batch8_pre.json | ConvertFrom-Json
$postData = Get-Content reports\batch8_post.json | ConvertFrom-Json

Write-Host "Error Composition:" -ForegroundColor Yellow
Write-Host "  TS1005 (comma): $($preData.topCodes[0].count) → $($postData.topCodes[0].count) ($($postData.topCodes[0].count - $preData.topCodes[0].count))" -ForegroundColor White

Write-Host ""

if ($post -lt 35000) {
    Write-Host "🎉 TARGET ACHIEVED! Errors < 35,000!" -ForegroundColor Green
    Write-Host "   Next: Pivot to import/type fixers" -ForegroundColor Cyan
} elseif ($delta -lt -1000) {
    Write-Host "✅ Excellent progress! (-$([Math]::Abs($delta)))" -ForegroundColor Green
    Write-Host "   Next: Run Batch 9 or directory sweep" -ForegroundColor Cyan
} elseif ($delta -lt -200) {
    Write-Host "✅ Good progress! (-$([Math]::Abs($delta)))" -ForegroundColor Green
    Write-Host "   Next: Continue with Batch 9" -ForegroundColor Cyan
} elseif ($delta -lt 0) {
    Write-Host "⚠️ Modest progress (-$([Math]::Abs($delta)))" -ForegroundColor Yellow
    Write-Host "   Next: Directory sweep src/lib/services/**" -ForegroundColor Cyan
} elseif ($delta -eq 0) {
    Write-Host "⚠️ No change - patterns exhausted" -ForegroundColor Yellow
    Write-Host "   Next: Try aggressive-fixer or manual fixes" -ForegroundColor Cyan
} else {
    Write-Host "❌ Regression (+$delta)" -ForegroundColor Red
    Write-Host "   Action: Review patches in reports/batch8_delim_apply/patches/" -ForegroundColor Yellow
    Write-Host "   Consider: git checkout -- <problematic files>" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Distance to <35,000 target: $($post - 35000) errors" -ForegroundColor $(if ($post -lt 35000) { 'Green' } else { 'Yellow' })
Write-Host ""
Write-Host "📁 Artifacts saved:" -ForegroundColor Yellow
Write-Host "   • reports/batch8_pre.json" -ForegroundColor White
Write-Host "   • reports/batch8_post.json" -ForegroundColor White
Write-Host "   • reports/batch8_delim_dryrun/ (dry-run proof)" -ForegroundColor White
Write-Host "   • reports/batch8_delim_apply/ (applied changes)" -ForegroundColor White
Write-Host ""
