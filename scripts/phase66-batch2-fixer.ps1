#!/usr/bin/env pwsh
<#
.SYNOPSIS
Phase 66 Batch 2: Automated CSS Error Fixer
Fixes: box-shadow comma issues, missing semicolons, and other CSS patterns
#>

function Get-ErrorCount {
    Write-Host "📊 Running svelte-check..." -ForegroundColor Yellow
    $result = npx svelte-check --threshold error 2>&1 | Out-String
    if ($result -match 'found (\d+) errors') {
        return [int]$matches[1]
    }
    return 0
}

function Apply-FixPattern {
    param(
        [string]$Pattern,
        [string]$Replacement,
        [string]$Description
    )

    Write-Host "`n🔧 Applying: $Description" -ForegroundColor Cyan

    # Find files with pattern
    $files = rg $Pattern sveltekit-frontend/src/ -g '*.svelte' -g '*.css' -l 2>$null

    if (-not $files) {
        Write-Host "   ℹ️  No files found with this pattern" -ForegroundColor Gray
        return 0
    }

    $count = @($files).Count
    Write-Host "   Found $count files" -ForegroundColor Green

    $fixed = 0
    foreach ($file in $files) {
        $content = Get-Content $file -Raw -ErrorAction SilentlyContinue
        if (-not $content) { continue }

        $newContent = $content -replace $Pattern, $Replacement

        if ($content -ne $newContent) {
            Set-Content $file $newContent -NoNewline
            Write-Host "     ✓ $($file.Replace('sveltekit-frontend/', ''))" -ForegroundColor Green
            $fixed++
        }
    }

    Write-Host "   Modified: $fixed files" -ForegroundColor Green
    return $fixed
}

function Commit-Fixes {
    param([string]$Message)

    git add sveltekit-frontend/src/ 2>&1 | Out-Null
    $result = git commit -m $Message 2>&1

    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Committed: $Message" -ForegroundColor Green
    } else {
        Write-Host "ℹ️  No changes to commit" -ForegroundColor Gray
    }
}

# Main script
Write-Host "`n🚀 Phase 66 Batch 2: Automated CSS Fixer" -ForegroundColor Cyan
Write-Host ("=" * 60) -ForegroundColor Cyan

$baseline = Get-ErrorCount
Write-Host "`n📊 Baseline: $($baseline.ToString('N0')) errors`n" -ForegroundColor Yellow

# Pattern 1: box-shadow comma issues
# box-shadow: 0, 0 30px -> box-shadow: 0 0 30px
$fixed1 = Apply-FixPattern `
    -Pattern 'box-shadow:\s*0,\s*0\s+' `
    -Replacement 'box-shadow: 0 0 ' `
    -Description 'Fix box-shadow: 0, 0 Xpx → 0 0 Xpx'

$errorsAfterBatch1 = Get-ErrorCount
$totalFixed1 = $baseline - $errorsAfterBatch1

if ($totalFixed1 -gt 0) {
    Write-Host "`n✨ Batch 1 Results: $totalFixed1 errors fixed ($baseline → $errorsAfterBatch1)" -ForegroundColor Green
    Commit-Fixes "fix(css): Batch 2 - Fix box-shadow comma syntax"
} else {
    Write-Host "`nℹ️  Batch 1: No error reduction (pattern may already be fixed)" -ForegroundColor Gray
}

# Pattern 2: Missing semicolons before properties (common CSS error)
# background:red}color:blue -> background:red}; color:blue
$fixed2 = Apply-FixPattern `
    -Pattern '}\s*([a-z-]+)\s*:' `
    -Replacement '}; $1:' `
    -Description 'Fix missing semicolons after closing braces'

$errorsAfterBatch2 = Get-ErrorCount
$totalFixed2 = $errorsAfterBatch1 - $errorsAfterBatch2

if ($totalFixed2 -gt 0) {
    Write-Host "`n✨ Batch 2 Results: $totalFixed2 errors fixed ($errorsAfterBatch1 → $errorsAfterBatch2)" -ForegroundColor Green
    Commit-Fixes "fix(css): Batch 2 - Add missing semicolons after braces"
} else {
    Write-Host "`nℹ️  Batch 2: No error reduction" -ForegroundColor Gray
}

# Pattern 3: Malformed transition shorthand
# transition: left: 0.5s -> transition: left 0.5s
$fixed3 = Apply-FixPattern `
    -Pattern 'transition:\s*([a-z-]+):\s*' `
    -Replacement 'transition: $1 ' `
    -Description 'Fix transition property colon syntax'

$errorsAfterBatch3 = Get-ErrorCount
$totalFixed3 = $errorsAfterBatch2 - $errorsAfterBatch3

if ($totalFixed3 -gt 0) {
    Write-Host "`n✨ Batch 3 Results: $totalFixed3 errors fixed ($errorsAfterBatch2 → $errorsAfterBatch3)" -ForegroundColor Green
    Commit-Fixes "fix(css): Batch 2 - Fix transition property syntax"
} else {
    Write-Host "`nℹ️  Batch 3: No error reduction" -ForegroundColor Gray
}

# Final summary
$totalFixed = $baseline - $errorsAfterBatch3
$percentFixed = if ($baseline -gt 0) { ($totalFixed / $baseline) * 100 } else { 0 }

Write-Host "`n" -NoNewline
Write-Host ("=" * 60) -ForegroundColor Cyan
Write-Host "📊 FINAL SUMMARY:" -ForegroundColor Cyan
Write-Host ("=" * 60) -ForegroundColor Cyan
Write-Host "   Baseline:     $($baseline.ToString('N0')) errors" -ForegroundColor White
Write-Host "   Final:        $($errorsAfterBatch3.ToString('N0')) errors" -ForegroundColor White
Write-Host "   Total Fixed:  $($totalFixed.ToString('N0')) errors ($($percentFixed.ToString('F2'))%)" -ForegroundColor Green
Write-Host ("=" * 60) -ForegroundColor Cyan

# Update knowledge base
$kbUpdate = @"

## Batch 2 Fixes - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

### Patterns Fixed:
1. **box-shadow comma syntax**: ``box-shadow: 0, 0 30px`` → ``box-shadow: 0 0 30px`` ($fixed1 files)
2. **Missing semicolons**: ``}property:`` → ``}; property:`` ($fixed2 files)
3. **Transition colon syntax**: ``transition: left:`` → ``transition: left`` ($fixed3 files)

### Results:
- **Errors Fixed**: $totalFixed ($($percentFixed.ToString('F2'))%)
- **Before**: $($baseline.ToString('N0')) errors
- **After**: $($errorsAfterBatch3.ToString('N0')) errors

### Git Commits:
``````
git log --oneline -3
``````

"@

$kbPath = "sveltekit-frontend/ACE_PHASE66_CSS_FIXES.md"
if (Test-Path $kbPath) {
    Add-Content $kbPath $kbUpdate
} else {
    Set-Content $kbPath "# ACE Phase 66: CSS Automated Fixes`n$kbUpdate"
}

Write-Host "`n✅ Updated knowledge base: $kbPath" -ForegroundColor Green
