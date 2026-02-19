<#
.SYNOPSIS
  Phase 42 - Complete AST Repair and Linting Pipeline
.DESCRIPTION
  Orchestrates all Phase 42 repair scripts including:
  - Backup audit
  - Svelte brace repair
  - AST validation
  - ESLint/Prettier setup
  - Build verification
#>

param(
  [switch]$SkipBackupAudit,
  [switch]$SkipRepair,
  [switch]$SkipLint,
  [switch]$ApplyFixes
)

$ErrorActionPreference = "Continue"
$root = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend"
Push-Location $root

$startTime = Get-Date
Write-Host @"
╔════════════════════════════════════════════════════════════╗
║   Phase 42 - Complete AST Repair Pipeline                 ║
║   SvelteKit 2 + TypeScript + Svelte 5                     ║
╚════════════════════════════════════════════════════════════╝
"@ -ForegroundColor Cyan

# === STEP 1: Quick Backup Audit ===
if (-not $SkipBackupAudit) {
    Write-Host "`n[1/6] 🔍 Backup Directory Audit" -ForegroundColor Yellow
    $backupDirs = Get-ChildItem -Directory -Filter "*backup*"
    $totalBackupSize = 0
    $backupDirs | ForEach-Object {
        $size = (Get-ChildItem -Path $_.FullName -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        $totalBackupSize += $size
        Write-Host "  $($_.Name): $([math]::Round($size / 1MB, 2)) MB"
    }
    Write-Host "  Total backup space: $([math]::Round($totalBackupSize / 1MB, 2)) MB" -ForegroundColor Cyan
    if ($totalBackupSize -gt 500MB) {
        Write-Host "  ⚠️  Consider archiving backups (>500MB total)" -ForegroundColor Yellow
    }
} else {
    Write-Host "`n[1/6] ⏭️  Skipped backup audit" -ForegroundColor Gray
}

# === STEP 2: Check Dependencies ===
Write-Host "`n[2/6] 📦 Checking Dependencies" -ForegroundColor Yellow
$hasGlob = npm list glob --depth=0 2>$null
$hasBabel = npm list @babel/parser --depth=0 2>$null

if (-not $hasGlob -or -not $hasBabel) {
    Write-Host "  Installing required dependencies..." -ForegroundColor Cyan
    npm install --save-dev glob @babel/parser @babel/traverse @babel/generator 2>&1 | Out-Null
    Write-Host "  ✅ Dependencies installed" -ForegroundColor Green
} else {
    Write-Host "  ✅ Dependencies present" -ForegroundColor Green
}

# === STEP 3: Svelte Brace Repair ===
if (-not $SkipRepair) {
    Write-Host "`n[3/6] 🔧 Svelte Brace Repair" -ForegroundColor Yellow
    if (Test-Path scripts\fix-svelte-unbalanced-braces.mjs) {
        $repairOutput = node scripts\fix-svelte-unbalanced-braces.mjs 2>&1
        Write-Host "  $repairOutput"
        if (Test-Path phase42-svelte-brace-repair.log) {
            $repairStats = Get-Content phase42-svelte-brace-repair.log | Select-String "Files fixed:"
            if ($repairStats) {
                Write-Host "  $repairStats" -ForegroundColor Green
            }
        }
    } else {
        Write-Host "  ⚠️  Repair script not found" -ForegroundColor Yellow
    }
} else {
    Write-Host "`n[3/6] ⏭️  Skipped Svelte repair" -ForegroundColor Gray
}

# === STEP 4: AST Validation ===
Write-Host "`n[4/6] ✅ AST Validation" -ForegroundColor Yellow
if (Test-Path scripts\phase42-ast-validator.mjs) {
    $validationOutput = node scripts\phase42-ast-validator.mjs 2>&1
    Write-Host "  $validationOutput"
} else {
    Write-Host "  ⚠️  Validator script not found" -ForegroundColor Yellow
}

# === STEP 5: ESLint/Prettier Check ===
if (-not $SkipLint) {
    Write-Host "`n[5/6] 🎨 Linting Configuration" -ForegroundColor Yellow
    
    $hasEslint = Test-Path .eslintrc.cjs
    $hasPrettier = Test-Path .prettierrc
    
    if ($hasEslint -and $hasPrettier) {
        Write-Host "  ✅ ESLint and Prettier configs present" -ForegroundColor Green
        
        if ($ApplyFixes) {
            Write-Host "  Applying lint fixes..." -ForegroundColor Cyan
            npm run lint:fix 2>&1 | Select-Object -Last 10
        } else {
            Write-Host "  ℹ️  Run with -ApplyFixes to auto-fix linting issues" -ForegroundColor Cyan
        }
    } else {
        Write-Host "  ⚠️  ESLint/Prettier not fully configured" -ForegroundColor Yellow
    }
} else {
    Write-Host "`n[5/6] ⏭️  Skipped linting" -ForegroundColor Gray
}

# === STEP 6: Build Verification ===
Write-Host "`n[6/6] 🏗️  Build Verification" -ForegroundColor Yellow
Write-Host "  Running TypeScript check..." -ForegroundColor Cyan
$tscOutput = npx tsc --noEmit --skipLibCheck 2>&1 | Select-String "error TS" | Measure-Object
Write-Host "  TypeScript errors: $($tscOutput.Count)" -ForegroundColor $(if ($tscOutput.Count -lt 100) { "Green" } else { "Yellow" })

# === Summary Report ===
$endTime = Get-Date
$duration = $endTime - $startTime

Write-Host @"

╔════════════════════════════════════════════════════════════╗
║   Phase 42 Pipeline Complete                               ║
╚════════════════════════════════════════════════════════════╝
"@ -ForegroundColor Green

Write-Host "⏱️  Duration: $($duration.TotalSeconds) seconds" -ForegroundColor Cyan
Write-Host "`n📊 Generated Reports:" -ForegroundColor Yellow
Get-ChildItem -Filter "phase42*.log" -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "  - $($_.Name) ($([math]::Round($_.Length / 1KB, 2)) KB)"
}

Write-Host "`n🎯 Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Review phase42-*.log files for details"
Write-Host "  2. Run: npm run lint:fix (to apply ESLint fixes)"
Write-Host "  3. Run: npm run format (to apply Prettier formatting)"
Write-Host "  4. Run: npm run build (to verify production build)"
Write-Host "  5. Commit changes with: git commit -am 'fix: Phase 42 AST repairs'"

Pop-Location
