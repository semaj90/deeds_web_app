#!/usr/bin/env pwsh
# Phase 34-37 Complete Pipeline
# AST Repair → WASM Fix → Validation

$ErrorActionPreference = "Stop"

Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "🚀 Phase 34-37: Complete AST & WASM Repair Pipeline" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════`n" -ForegroundColor Cyan

$ROOT = "C:\Users\james\Videos\deeds-web-app"
cd $ROOT

# Pre-flight check
Write-Host "📋 Pre-flight Check..." -ForegroundColor Yellow
if (-not (Test-Path ".git")) {
    Write-Host "❌ Not in git repository!" -ForegroundColor Red
    exit 1
}

# Create pre-phase backup commit
Write-Host "`n💾 Creating pre-phase backup commit..." -ForegroundColor Cyan
git add -A
git commit -m "pre-phase34-37-backup: AST and WASM repair" -q
Write-Host "✅ Backup commit created" -ForegroundColor Green

# Phase 34: AST-Aware Token Reconstruction
Write-Host "`n$('═' * 50)" -ForegroundColor Cyan
Write-Host "🔧 Phase 34: AST-Aware Token Reconstruction" -ForegroundColor Cyan
Write-Host "$('═' * 50)`n" -ForegroundColor Cyan

node scripts/fix-phase34-ast.mjs

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Phase 34 Complete" -ForegroundColor Green
} else {
    Write-Host "`n⚠️  Phase 34 had issues but continuing..." -ForegroundColor Yellow
}

# Phase 35: WASM AssemblyScript Repair
Write-Host "`n$('═' * 50)" -ForegroundColor Cyan
Write-Host "🔧 Phase 35: WASM AssemblyScript Repair" -ForegroundColor Cyan
Write-Host "$('═' * 50)`n" -ForegroundColor Cyan

node scripts/fix-phase35-wasm.mjs

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Phase 35 Complete" -ForegroundColor Green
} else {
    Write-Host "`n⚠️  Phase 35 had issues but continuing..." -ForegroundColor Yellow
}

# Phase 36: Validation
Write-Host "`n$('═' * 50)" -ForegroundColor Cyan
Write-Host "🔍 Phase 36: TypeScript Validation" -ForegroundColor Cyan
Write-Host "$('═' * 50)`n" -ForegroundColor Cyan

cd sveltekit-frontend

Write-Host "Running TypeScript check..." -ForegroundColor Yellow
npm run check 2>&1 | Select-Object -Last 30

Write-Host "`n📊 Running error scanner..." -ForegroundColor Yellow
cd ..
node scripts/prioritize-error-fixes.mjs 2>&1 | Select-Object -First 50

# Phase 37: Summary Report
Write-Host "`n$('═' * 50)" -ForegroundColor Cyan
Write-Host "📊 Phase 37: Final Summary" -ForegroundColor Cyan
Write-Host "$('═' * 50)`n" -ForegroundColor Cyan

# Read reports
$phase34 = Get-Content "scripts/phase34-report.json" -Raw | ConvertFrom-Json
$phase35 = Get-Content "scripts/phase35-report.json" -Raw | ConvertFrom-Json

Write-Host "Phase 34 (AST Repair):" -ForegroundColor Cyan
Write-Host "  Scanned: $($phase34.scanned) files" -ForegroundColor White
Write-Host "  Changed: $($phase34.changed) files" -ForegroundColor Green

Write-Host "`nPhase 35 (WASM Repair):" -ForegroundColor Cyan
Write-Host "  Scanned: $($phase35.scanned) files" -ForegroundColor White
Write-Host "  Changed: $($phase35.changed) files" -ForegroundColor Green

Write-Host "`n✨ Pipeline Complete!" -ForegroundColor Green
Write-Host "`n📝 Next steps:" -ForegroundColor Cyan
Write-Host "  1. Review changes: git diff --stat" -ForegroundColor White
Write-Host "  2. Test WASM build: npm run build:wasm" -ForegroundColor White
Write-Host "  3. Commit if satisfied: git commit -am 'fix: Phase 34-35 AST and WASM repair'" -ForegroundColor White

exit 0
