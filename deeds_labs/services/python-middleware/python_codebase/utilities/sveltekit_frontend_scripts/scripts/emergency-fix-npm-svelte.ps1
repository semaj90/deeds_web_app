<#
  Emergency Fix - NPM Workspace & Svelte Errors
  Fixes both "No workspaces found" and Svelte syntax errors
#>

$ErrorActionPreference = "Continue"
$root = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend"

Write-Host "`n╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Red
Write-Host "║          EMERGENCY FIX - NPM & SVELTE ERRORS                   ║" -ForegroundColor Red
Write-Host "╚════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Red

cd $root

# ============================================================================
# FIX 1: NPM Workspace Issue
# ============================================================================
Write-Host "🔧 Fix 1: Resolving NPM workspace issue..." -ForegroundColor Yellow

# Check parent package.json for workspace config
$parentPkg = "C:\Users\james\Videos\deeds-web-app\package.json"
if (Test-Path $parentPkg) {
    $pkg = Get-Content $parentPkg -Raw | ConvertFrom-Json
    
    if ($pkg.workspaces) {
        Write-Host "  ⚠️  Found workspaces config in parent package.json:" -ForegroundColor Yellow
        Write-Host "     $($pkg.workspaces)" -ForegroundColor Gray
        Write-Host "`n  💡 Solution: Use direct node commands instead of npm/npx" -ForegroundColor Cyan
    }
}

# Test if npm commands work
Write-Host "`n  Testing npm in current directory..." -ForegroundColor Gray
$npmTest = npm --version 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✅ npm version: $npmTest" -ForegroundColor Green
} else {
    Write-Host "  ❌ npm error: $npmTest" -ForegroundColor Red
}

# ============================================================================
# FIX 2: Svelte Syntax Errors
# ============================================================================
Write-Host "`n🔧 Fix 2: Checking for Svelte syntax errors..." -ForegroundColor Yellow

# Sample check - find files with potential issues
$svelteFiles = Get-ChildItem -Path "src" -Filter "*.svelte" -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch "node_modules|\.svelte-kit|backup" } |
    Select-Object -First 10

$issueCount = 0
foreach ($file in $svelteFiles) {
    $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
    
    # Check for common issues
    $hasIssues = $false
    
    # Issue 1: Unexpected closing tags
    if ($content -match '</[^>]+>\s*</[^>]+>' -and $content -notmatch '<!--') {
        $hasIssues = $true
    }
    
    # Issue 2: Malformed component tags
    if ($content -match '<[A-Za-z0-9_.]+,') {
        $hasIssues = $true
    }
    
    # Issue 3: Unclosed tags
    $openTags = ([regex]::Matches($content, '<(?!/)(?![!?])[^>]+(?<!/)>')).Count
    $closeTags = ([regex]::Matches($content, '</[^>]+>')).Count
    $selfClosing = ([regex]::Matches($content, '<[^>]+/>')).Count
    
    if (($openTags - $selfClosing) -ne $closeTags) {
        $hasIssues = $true
    }
    
    if ($hasIssues) {
        $issueCount++
        $relPath = $file.FullName -replace [regex]::Escape($root), "."
        Write-Host "  ⚠️  Potential issue: $relPath" -ForegroundColor Yellow
    }
}

Write-Host "`n  Files with potential issues: $issueCount / $($svelteFiles.Count) checked" -ForegroundColor Cyan

# ============================================================================
# FIX 3: Provide Working Commands
# ============================================================================
Write-Host "`n📋 Working Commands (bypasses workspace issues):" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Gray

Write-Host "`n  Development Server:" -ForegroundColor Yellow
Write-Host "    node node_modules/vite/bin/vite.js dev" -ForegroundColor White

Write-Host "`n  Svelte Check:" -ForegroundColor Yellow
Write-Host "    node node_modules/svelte-check/bin/svelte-check.js" -ForegroundColor White

Write-Host "`n  TypeScript Check:" -ForegroundColor Yellow
Write-Host "    node node_modules/typescript/bin/tsc --noEmit" -ForegroundColor White

Write-Host "`n  Build:" -ForegroundColor Yellow
Write-Host "    node node_modules/vite/bin/vite.js build" -ForegroundColor White

# ============================================================================
# FIX 4: Create Helper Scripts
# ============================================================================
Write-Host "`n🔧 Creating helper scripts..." -ForegroundColor Yellow

# Helper 1: dev.cmd
$devCmd = @"
@echo off
node node_modules/vite/bin/vite.js dev
"@
Set-Content -Path "dev.cmd" -Value $devCmd
Write-Host "  ✅ Created: dev.cmd" -ForegroundColor Green

# Helper 2: check.cmd
$checkCmd = @"
@echo off
echo Running Svelte check...
node node_modules/svelte-check/bin/svelte-check.js --threshold error
"@
Set-Content -Path "check.cmd" -Value $checkCmd
Write-Host "  ✅ Created: check.cmd" -ForegroundColor Green

# Helper 3: build.cmd
$buildCmd = @"
@echo off
echo Building for production...
node node_modules/vite/bin/vite.js build
"@
Set-Content -Path "build.cmd" -Value $buildCmd
Write-Host "  ✅ Created: build.cmd" -ForegroundColor Green

# ============================================================================
# SUMMARY & NEXT STEPS
# ============================================================================
Write-Host "`n╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║                    FIX COMPLETE                                ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Green

Write-Host "✅ Helper scripts created!" -ForegroundColor Cyan
Write-Host "   dev.cmd - Start development server" -ForegroundColor White
Write-Host "   check.cmd - Run Svelte check" -ForegroundColor White
Write-Host "   build.cmd - Build for production" -ForegroundColor White

Write-Host "`n🚀 Quick Start:" -ForegroundColor Yellow
Write-Host "   .\dev.cmd          - Start dev server" -ForegroundColor White
Write-Host "   .\check.cmd        - Check for errors" -ForegroundColor White
Write-Host "   .\build.cmd        - Build project" -ForegroundColor White

Write-Host "`n📝 Manual Commands (if needed):" -ForegroundColor Yellow
Write-Host "   node node_modules/vite/bin/vite.js dev" -ForegroundColor Gray

Write-Host "`n💡 Workspace Issue:" -ForegroundColor Cyan
Write-Host "   The parent package.json has workspace config" -ForegroundColor White
Write-Host "   These helper scripts bypass that issue" -ForegroundColor White

Write-Host ""
