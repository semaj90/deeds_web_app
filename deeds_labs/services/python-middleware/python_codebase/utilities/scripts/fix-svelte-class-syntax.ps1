#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Fix Svelte class attribute syntax errors across the codebase

.DESCRIPTION
    Fixes pattern: class="foo" bar baz
    To correct: class="foo bar baz"
#>

param(
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

Write-Host "🔧 Fixing Svelte class attribute syntax errors..." -ForegroundColor Cyan

# Find all .svelte files
$svelteFiles = Get-ChildItem -Path "sveltekit-frontend\src" -Filter "*.svelte" -Recurse

$totalFixed = 0
$filesModified = @()

foreach ($file in $svelteFiles) {
    if (-not (Test-Path $file.FullName)) {
        Write-Host "  ⚠️  Skipping (not found): $($file.Name)" -ForegroundColor Yellow
        continue
    }

    try {
        $content = Get-Content $file.FullName -Raw -ErrorAction Stop
    } catch {
        Write-Host "  ⚠️  Skipping (read error): $($file.Name)" -ForegroundColor Yellow
        continue
    }

    $originalContent = $content

    # Pattern 1: class="..." word word {
    # Fix: merge word word into the class string
    $pattern1 = 'class="([^"]*)"(\s+)([a-z][a-z0-9-]*)(\s+)([a-z][a-z0-9-]*)'
    $replacement1 = 'class="$1 $3 $5"'
    $content = $content -replace $pattern1, $replacement1

    # Pattern 2: class="..." word {
    $pattern2 = 'class="([^"]*)"(\s+)([a-z][a-z0-9-]*)(\s+)\{'
    $replacement2 = 'class="$1 $3" {'
    $content = $content -replace $pattern2, $replacement2

    if ($content -ne $originalContent) {
        $totalFixed++
        $filesModified += $file.FullName

        if (-not $DryRun) {
            Set-Content -Path $file.FullName -Value $content -NoNewline
            Write-Host "  ✅ Fixed: $($file.Name)" -ForegroundColor Green
        } else {
            Write-Host "  📋 Would fix: $($file.Name)" -ForegroundColor Yellow
        }
    }
}

Write-Host "`n" + ("=" * 60) -ForegroundColor Cyan
if ($DryRun) {
    Write-Host "📊 DRY RUN: Would fix $totalFixed files" -ForegroundColor Yellow
} else {
    Write-Host "✅ Fixed $totalFixed files" -ForegroundColor Green
}

if ($filesModified.Count -gt 0) {
    Write-Host "`n📝 Modified files:" -ForegroundColor Cyan
    $filesModified | ForEach-Object { Write-Host "  - $_" -ForegroundColor White }
}
