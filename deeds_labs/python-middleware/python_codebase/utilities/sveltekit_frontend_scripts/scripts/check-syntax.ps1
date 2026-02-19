#!/usr/bin/env pwsh
# Comprehensive syntax check script

param(
    [switch]$Fix,
    [switch]$Quick
)

$ErrorActionPreference = 'Continue'
$env:NODE_OPTIONS = "--max-old-space-size=6144"

Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║       Legal AI - Syntax Validation Suite            ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check if .svelte-kit exists
Write-Host "[1/5] Checking SvelteKit build artifacts..." -ForegroundColor Yellow
if (-not (Test-Path ".svelte-kit/tsconfig.json")) {
    Write-Host "  ⚠ .svelte-kit/tsconfig.json missing" -ForegroundColor Red
    Write-Host "  → Running sync to generate..." -ForegroundColor Cyan
    npm run sync-all 2>&1 | Out-Null
    if (Test-Path ".svelte-kit/tsconfig.json") {
        Write-Host "  ✓ Generated successfully" -ForegroundColor Green
    }
} else {
    Write-Host "  ✓ .svelte-kit exists" -ForegroundColor Green
}

# Step 2: Check for problematic config files
Write-Host "`n[2/5] Checking for conflicting configs..." -ForegroundColor Yellow
if (Test-Path "js_tests/svelte.config.js") {
    Write-Host "  ⚠ Found js_tests/svelte.config.js (may conflict)" -ForegroundColor Yellow
    if ($Fix) {
        Move-Item "js_tests/svelte.config.js" "js_tests/svelte.config.js.backup" -Force
        Write-Host "  ✓ Moved to .backup" -ForegroundColor Green
    }
} else {
    Write-Host "  ✓ No conflicting configs" -ForegroundColor Green
}

# Step 3: Run TypeScript check (faster than svelte-check)
Write-Host "`n[3/5] Running TypeScript check..." -ForegroundColor Yellow
$tscOutput = npx tsc --noEmit --skipLibCheck 2>&1 | Out-String
$errorCount = ([regex]::Matches($tscOutput, "error TS")).Count

if ($errorCount -eq 0) {
    Write-Host "  ✓ No TypeScript errors!" -ForegroundColor Green
} else {
    Write-Host "  ⚠ Found $errorCount TypeScript errors" -ForegroundColor Yellow
    
    # Show top errors
    $errors = $tscOutput | Select-String "error TS" | Select-Object -First 10
    foreach ($err in $errors) {
        Write-Host "    $err" -ForegroundColor Gray
    }
    
    if ($errorCount -gt 10) {
        Write-Host "    ... and $($errorCount - 10) more" -ForegroundColor Gray
    }
}

# Step 4: Check for common syntax issues
Write-Host "`n[4/5] Scanning for common syntax issues..." -ForegroundColor Yellow
$syntaxIssues = @{
    'return:' = 0
    'case:' = 0
    'import:' = 0
    'export:' = 0
}

Get-ChildItem -Path src -Recurse -Include *.ts,*.svelte,*.js -File | ForEach-Object {
    $content = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue
    if ($content) {
        if ($content -match '\breturn:\s+[''"`]') { $syntaxIssues['return:']++ }
        if ($content -match '\bcase:\s+[''"`]') { $syntaxIssues['case:']++ }
        if ($content -match '^\s*import:\s+') { $syntaxIssues['import:']++ }
        if ($content -match '^\s*export:\s+') { $syntaxIssues['export:']++ }
    }
}

$totalIssues = ($syntaxIssues.Values | Measure-Object -Sum).Sum
if ($totalIssues -eq 0) {
    Write-Host "  ✓ No stray colon syntax found" -ForegroundColor Green
} else {
    Write-Host "  ⚠ Found $totalIssues files with stray colons:" -ForegroundColor Yellow
    foreach ($issue in $syntaxIssues.GetEnumerator()) {
        if ($issue.Value -gt 0) {
            Write-Host "    - $($issue.Key): $($issue.Value) files" -ForegroundColor Gray
        }
    }
    
    if ($Fix) {
        Write-Host "`n  → Running fix script..." -ForegroundColor Cyan
        & .\scripts\fix-colon-syntax.ps1
    }
}

# Step 5: Test dev server startup
if (-not $Quick) {
    Write-Host "`n[5/5] Testing dev server startup..." -ForegroundColor Yellow
    
    $job = Start-Job -ScriptBlock {
        Set-Location $using:PWD
        npm run dev 2>&1
    }
    
    Start-Sleep -Seconds 10
    $output = Receive-Job $job
    Stop-Job $job -ErrorAction SilentlyContinue
    Remove-Job $job -Force -ErrorAction SilentlyContinue
    
    if ($output -match "Local:\s+http://localhost:\d+") {
        Write-Host "  ✓ Dev server starts successfully" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ Dev server may have issues" -ForegroundColor Yellow
        $output | Select-String "error|Error|ERROR" | Select-Object -First 3 | ForEach-Object {
            Write-Host "    $_" -ForegroundColor Gray
        }
    }
}

# Summary
Write-Host "`n╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                  VALIDATION SUMMARY                   ║" -ForegroundColor Cyan
Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "  TypeScript errors: $errorCount" -ForegroundColor $(if ($errorCount -eq 0) { 'Green' } else { 'Yellow' })
Write-Host "  Syntax issues: $totalIssues" -ForegroundColor $(if ($totalIssues -eq 0) { 'Green' } else { 'Yellow' })
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan

if ($Fix) {
    Write-Host "`n✓ Fixes applied. Run 'npm run dev' to test." -ForegroundColor Green
} elseif ($totalIssues -gt 0 -or $errorCount -gt 0) {
    Write-Host "`nℹ Run with -Fix to automatically fix syntax issues" -ForegroundColor Cyan
}
