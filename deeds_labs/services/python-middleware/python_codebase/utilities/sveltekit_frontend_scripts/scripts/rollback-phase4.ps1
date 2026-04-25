#!/usr/bin/env pwsh
# Rollback Phase 4 - Restore to Phase 3 Success State

Write-Host "🔄 Rolling back Phase 4 changes..." -ForegroundColor Yellow

# Check if we're in git repo
if (-not (Test-Path ".git")) {
    Write-Host "❌ Not in git repository root!" -ForegroundColor Red
    exit 1
}

Write-Host "`n📊 Current status:" -ForegroundColor Cyan
git status --short | Select-Object -First 20

Write-Host "`n⚠️  This will rollback all changes in src/" -ForegroundColor Yellow
$confirm = Read-Host "Continue? (y/N)"

if ($confirm -ne 'y' -and $confirm -ne 'Y') {
    Write-Host "Cancelled." -ForegroundColor Gray
    exit 0
}

Write-Host "`n🔄 Restoring src/ directory..." -ForegroundColor Cyan
git checkout -- src/

Write-Host "✅ Rollback complete!" -ForegroundColor Green
Write-Host "`n📊 New status:" -ForegroundColor Cyan
git status --short

Write-Host "`n✨ Restored to Phase 1-3 state (508 files with errors)" -ForegroundColor Green
Write-Host "`n📝 Next steps:" -ForegroundColor Cyan
Write-Host "   1. Re-run Phases 1-3:" -ForegroundColor White
Write-Host "      .\scripts\fix-syntax-errors.ps1" -ForegroundColor Gray
Write-Host "   2. Verify error count:" -ForegroundColor White
Write-Host "      node scripts\prioritize-error-fixes.mjs | head -50" -ForegroundColor Gray
Write-Host "   3. Manual fixes for top files:" -ForegroundColor White
Write-Host "      code src\lib\types\external-services.ts`n" -ForegroundColor Gray

exit 0
