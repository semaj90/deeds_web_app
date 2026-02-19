#!/usr/bin/env pwsh
# Master syntax fixer - runs all fixes in sequence

param(
    [switch]$DryRun,
    [switch]$Quick
)

$ErrorActionPreference = 'Continue'

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     Legal AI - Master Syntax Fixer Suite            ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

if ($DryRun) {
    Write-Host "🔍 DRY RUN MODE - No changes will be made" -ForegroundColor Yellow
    Write-Host ""
}

$startTime = Get-Date
$totalFixed = 0

# Step 1: Fix stray colon syntax
Write-Host "[1/3] Fixing stray colon syntax (return:, case:, import:)..." -ForegroundColor Cyan
if ($DryRun) {
    & .\scripts\fix-colon-syntax.ps1 -DryRun | Out-Null
} else {
    $count1 = 0
    Get-ChildItem -Path src -Recurse -Include *.svelte,*.ts,*.js -File | 
        Where-Object { 
            $_.FullName -notmatch '[\\/](node_modules|\.svelte-kit|build|dist)[\\/]'
        } | ForEach-Object {
        $content = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue
        if ($content) {
            $original = $content
            $content = $content -replace '(?<![:\w])\breturn:\s+(?=[''"`])', 'return '
            $content = $content -replace '(?<=^\s*)case:\s+(?=[''"`])', 'case '
            $content = $content -replace '^\s*import:\s+', 'import '
            $content = $content -replace '^\s*export:\s+', 'export '
            
            if ($content -ne $original) {
                Set-Content -Path $_.FullName -Value $content -NoNewline -Force
                $count1++
            }
        }
    }
    $totalFixed += $count1
    Write-Host "  ✓ Fixed $count1 files" -ForegroundColor Green
}

# Step 2: Fix module declarations
Write-Host "`n[2/3] Fixing TypeScript module declarations..." -ForegroundColor Cyan
if ($DryRun) {
    & .\scripts\fix-dts-syntax.ps1 -DryRun | Out-Null
} else {
    $count2 = 0
    Get-ChildItem -Path src -Recurse -Include *.d.ts,*.ts -File | ForEach-Object {
        $content = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue
        if ($content -and $content -match 'declare\s+module:') {
            $original = $content
            $content = $content -replace 'declare\s+module:\s+', 'declare module '
            
            if ($content -ne $original) {
                Set-Content -Path $_.FullName -Value $content -NoNewline -Force
                $count2++
            }
        }
    }
    $totalFixed += $count2
    Write-Host "  ✓ Fixed $count2 files" -ForegroundColor Green
}

# Step 3: Clear cache
if (-not $DryRun) {
    Write-Host "`n[3/3] Clearing build caches..." -ForegroundColor Cyan
    Remove-Item -Path "node_modules/.vite" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path ".svelte-kit" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "  ✓ Cache cleared" -ForegroundColor Green
}

$elapsed = ((Get-Date) - $startTime).TotalSeconds

# Summary
Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                   SUMMARY                             ║" -ForegroundColor Cyan
Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Cyan
if ($DryRun) {
    Write-Host "  Mode: DRY RUN (no changes made)" -ForegroundColor Yellow
} else {
    Write-Host "  Total files fixed: $totalFixed" -ForegroundColor Green
    Write-Host "  Time elapsed: $([Math]::Round($elapsed, 2))s" -ForegroundColor White
}
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

if (-not $DryRun -and $totalFixed -gt 0) {
    Write-Host "✅ All fixes applied successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. npm run dev" -ForegroundColor White
    Write-Host "  2. Test at http://localhost:5173" -ForegroundColor White
    Write-Host ""
} elseif ($DryRun) {
    Write-Host "ℹ Run without -DryRun to apply fixes" -ForegroundColor Cyan
}
