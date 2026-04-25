# Phase 89: Build Qdrant Error Chunks (EPIPE-Safe)
# This script builds the phase89_error_chunks collection without crashing

Write-Host "`n🚀 Phase 89: Building Qdrant Error Chunks Collection`n" -ForegroundColor Cyan

# Ensure reports directory exists
$reportsDir = "reports"
if (-not (Test-Path $reportsDir)) {
    New-Item -ItemType Directory -Path $reportsDir | Out-Null
    Write-Host "✅ Created reports directory" -ForegroundColor Green
}

$logFile = Join-Path $reportsDir "phase89-build-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"

Write-Host "📝 Log file: $logFile" -ForegroundColor Yellow
Write-Host "`n🔨 Starting build (this will take 2-3 hours)...`n" -ForegroundColor Yellow

# Run build with Tee-Object (preserves full logs, no EPIPE crash)
node scripts/phase89-cuda-rag-pipeline.mjs --build 2>&1 | Tee-Object -FilePath $logFile

Write-Host "`n📊 Build complete! Checking results...`n" -ForegroundColor Cyan

# Show last 20 lines of log
Write-Host "📋 Last 20 lines of output:" -ForegroundColor Yellow
Get-Content $logFile -Tail 20

# Verify Qdrant collection
Write-Host "`n🔍 Verifying Qdrant collection...`n" -ForegroundColor Cyan

try {
    $collection = Invoke-RestMethod -Uri "http://localhost:6333/collections/phase89_error_chunks" -TimeoutSec 5

    if ($collection.result) {
        Write-Host "✅ Collection: phase89_error_chunks" -ForegroundColor Green
        Write-Host "   Status: $($collection.result.status)" -ForegroundColor Gray
        Write-Host "   Points: $($collection.result.points_count)" -ForegroundColor Gray
        Write-Host "   Vectors: $($collection.result.vectors_count)" -ForegroundColor Gray

        if ($collection.result.points_count -gt 0) {
            Write-Host "`n🎉 Success! Collection built with $($collection.result.points_count) chunks" -ForegroundColor Green
        } else {
            Write-Host "`n⚠️  Collection exists but has 0 points. Check logs:" -ForegroundColor Yellow
            Write-Host "   $logFile" -ForegroundColor Gray
        }
    }
} catch {
    Write-Host "❌ Failed to query Qdrant: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   Is Qdrant running? Check: curl http://localhost:6333/collections" -ForegroundColor Gray
}

# Check FastAPI stats (if server is running)
Write-Host "`n🔍 Checking FastAPI stats...`n" -ForegroundColor Cyan

try {
    $stats = Invoke-RestMethod -Uri "http://localhost:8765/stats" -TimeoutSec 5

    Write-Host "✅ FastAPI Stats:" -ForegroundColor Green
    Write-Host "   Redis Keys: $($stats.redis.keys)" -ForegroundColor Gray
    Write-Host "   Embeddings: $($stats.redis.embeddings)" -ForegroundColor Gray
    Write-Host "   Qdrant Points: $($stats.qdrant.points)" -ForegroundColor Gray

    if ($stats.qdrant.points -gt 0) {
        Write-Host "`n🎉 FastAPI can now query the error chunks!" -ForegroundColor Green
    } else {
        Write-Host "`n⚠️  FastAPI shows 0 Qdrant points. Check namespace alignment:" -ForegroundColor Yellow
        Write-Host "   See: kb/phase89/redis-qdrant-namespace-diagnostic.md" -ForegroundColor Gray
    }
} catch {
    Write-Host "⚠️  FastAPI server not running or not accessible" -ForegroundColor Yellow
    Write-Host "   Start with: python -m uvicorn scripts.phase89-fastapi-server:app --port 8765" -ForegroundColor Gray
}

Write-Host "`n📚 Next Steps:`n" -ForegroundColor Cyan
Write-Host "  1. Review full log: notepad $logFile" -ForegroundColor Yellow
Write-Host "  2. Test query: node scripts/phase89-cuda-rag-pipeline.mjs --query 'TS1005' --top 10" -ForegroundColor Yellow
Write-Host "  3. Test streaming: node scripts/phase89-cuda-rag-pipeline.mjs --stream 'type errors'" -ForegroundColor Yellow
Write-Host "  4. Verify FastAPI: curl http://localhost:8765/query/stream -X POST -H 'Content-Type: application/json' -d '{\"query\":\"TS1005\"}'" -ForegroundColor Yellow

Write-Host "`n✅ Build script complete!`n" -ForegroundColor Green
