# Phase 89: Safe Build Script
# Avoids broken pipe errors from Select-Object -First truncation
# Uses Tee-Object to capture full output while displaying head

Write-Host "🔨 Phase 89: Safe CUDA RAG Pipeline Build`n" -ForegroundColor Cyan

# Ensure reports directory exists
New-Item -ItemType Directory -Force -Path ".\reports" | Out-Null

# Build with full logging
Write-Host "Building index (tee to reports/phase89-build.log)..." -ForegroundColor Yellow
node scripts/phase89-cuda-rag-pipeline.mjs --build 2>&1 | Tee-Object -FilePath .\reports\phase89-build.log

Write-Host "`n📊 Build complete! Viewing first 50 lines:`n" -ForegroundColor Green
Get-Content .\reports\phase89-build.log -TotalCount 50

Write-Host "`n💡 View full log: Get-Content .\reports\phase89-build.log`n" -ForegroundColor Cyan
Write-Host "💡 Tail follow:    Get-Content .\reports\phase89-build.log -Wait -Tail 50`n" -ForegroundColor Cyan
