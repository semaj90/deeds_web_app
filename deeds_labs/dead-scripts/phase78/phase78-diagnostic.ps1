# Phase 78 Error Intelligence Platform - Quick Diagnostic
# Usage: .\scripts\phase78-diagnostic.ps1

Write-Host "`n📊 Phase 78 Error Intelligence Platform Status`n" -ForegroundColor Cyan

# 1. Database Services
Write-Host "1️⃣ PostgreSQL Database" -ForegroundColor Yellow
try {
    $env:PGPASSWORD='123456'
    $tables = psql -U legal_admin -h localhost -p 5432 -d legal_ai_db -t -c "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'error_%' ORDER BY tablename;"
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ PostgreSQL connected" -ForegroundColor Green
        Write-Host "   Tables: $($tables.Trim() -replace "`n", ', ')"
    }
} catch {
    Write-Host "   ❌ PostgreSQL connection failed" -ForegroundColor Red
}

# 2. Qdrant Vector Database
Write-Host "`n2️⃣ Qdrant Vector Search" -ForegroundColor Yellow
try {
    $qdrant = Invoke-RestMethod -Uri 'http://localhost:6333/' -Method GET -TimeoutSec 5
    Write-Host "   ✅ Qdrant v$($qdrant.version) running" -ForegroundColor Green

    $collections = Invoke-RestMethod -Uri 'http://localhost:6333/collections' -Method GET
    Write-Host "   Collections: $($collections.result.collections.Count) active"
} catch {
    Write-Host "   ❌ Qdrant not responding" -ForegroundColor Red
}

# 3. Ollama Embedding Service
Write-Host "`n3️⃣ Ollama Embedding Service" -ForegroundColor Yellow
try {
    $ollama = Invoke-RestMethod -Uri 'http://localhost:11434/api/tags' -Method GET -TimeoutSec 5
    Write-Host "   ✅ Ollama running" -ForegroundColor Green
    $models = $ollama.models | Where-Object { $_.name -like '*embed*' }
    if ($models) {
        Write-Host "   Embedding models: $($models.name -join ', ')"
    }
} catch {
    Write-Host "   ❌ Ollama not responding" -ForegroundColor Red
}

# 4. Phase 78 Data Status
Write-Host "`n4️⃣ Phase 78 Pipeline Data" -ForegroundColor Yellow
try {
    $env:PGPASSWORD='123456'
    $stats = psql -U legal_admin -h localhost -p 5432 -d legal_ai_db -t -c "
    SELECT
        (SELECT COUNT(*) FROM error_events) as errors,
        (SELECT COUNT(*) FROM error_clusters) as clusters,
        (SELECT COUNT(*) FROM error_cluster_embeddings) as embeddings,
        (SELECT COUNT(*) FROM error_suggestions) as suggestions;"

    if ($LASTEXITCODE -eq 0) {
        $data = $stats.Trim() -split '\|'
        Write-Host "   Error Events: $($data[0].Trim())" -ForegroundColor White
        Write-Host "   Error Clusters: $($data[1].Trim())" -ForegroundColor White
        Write-Host "   Embeddings: $($data[2].Trim())" -ForegroundColor White
        Write-Host "   Suggestions: $($data[3].Trim())" -ForegroundColor White
    }
} catch {
    Write-Host "   ❌ Could not query database" -ForegroundColor Red
}

# 5. Next Steps
Write-Host "`n📋 Available Commands" -ForegroundColor Yellow
Write-Host "   npm run phase78:collect-errors  - Collect TypeScript errors"
Write-Host "   npm run phase78:cluster         - Cluster similar errors"
Write-Host "   npm run phase78:embed-clusters  - Generate embeddings"
Write-Host "   npm run phase78:suggest         - Generate AI suggestions"
Write-Host "   npm run phase78:full            - Run complete pipeline"

Write-Host "`n✅ Diagnostic complete`n" -ForegroundColor Green
