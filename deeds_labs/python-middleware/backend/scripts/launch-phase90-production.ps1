# Phase 90 - Production Pipeline Launcher
# Run this to start the 3-hour embedding + clustering pipeline

Write-Host "`n" -NoNewline
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "Phase 90: PRODUCTION PIPELINE LAUNCHER" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan

Write-Host "`nThis will:"
Write-Host "  1. Embed ALL 73,313 TypeScript errors (~3 hours)" -ForegroundColor Yellow
Write-Host "  2. Run GPU clustering (12 patterns)" -ForegroundColor Yellow
Write-Host "  3. Store in Qdrant with enhanced tags" -ForegroundColor Yellow
Write-Host "  4. Generate cluster summaries" -ForegroundColor Yellow

Write-Host "`nEstimated Time: 3 hours" -ForegroundColor Magenta
Write-Host "Rate: ~7 embeddings/second`n" -ForegroundColor Gray

$confirm = Read-Host "Start overnight run? (y/n)"

if ($confirm -ne 'y') {
    Write-Host "`nCancelled." -ForegroundColor Red
    exit
}

Write-Host "`nStarting production pipeline..." -ForegroundColor Green
Write-Host "Keep this window open or minimize it.`n" -ForegroundColor Yellow

$PYTHON = "C:\Users\james\Videos\deeds-web-app\.venv\Scripts\python.exe"
$SCRIPT = "C:\Users\james\Videos\deeds-web-app\backend\scripts\phase90_full_production.py"

& $PYTHON $SCRIPT

Write-Host "`n`nPipeline finished! Check output above for results.`n" -ForegroundColor Green
