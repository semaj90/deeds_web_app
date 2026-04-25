# Phase 89: Comprehensive Verification Script
# Verifies: PostgreSQL schema, CouchDB database, Qdrant collection, pgvector embeddings

Write-Host "`n🔍 Phase 89: Comprehensive System Verification`n" -ForegroundColor Cyan

# ============================================================
# 1. Check Docker Containers
# ============================================================
Write-Host "1️⃣  Checking Docker containers..." -ForegroundColor Yellow

$containers = @(
    @{Name="phase66-postgres"; Port=5434; Service="PostgreSQL (legal DB)"},
    @{Name="phase66-couchdb"; Port=5984; Service="CouchDB (graph store)"},
    @{Name="phase66-redis"; Port=6379; Service="Redis (cache)"},
    @{Name="ollama-gemma"; Port=11434; Service="Ollama (LLMs)"}
)

foreach ($container in $containers) {
    $status = docker ps --filter "name=$($container.Name)" --format "{{.Status}}"
    if ($status) {
        Write-Host "   ✅ $($container.Service) - $status" -ForegroundColor Green
    } else {
        Write-Host "   ❌ $($container.Service) - NOT RUNNING" -ForegroundColor Red
        Write-Host "      Start with: docker start $($container.Name)" -ForegroundColor Gray
    }
}

# ============================================================
# 2. Check PostgreSQL Schema
# ============================================================
Write-Host "`n2️⃣  Checking PostgreSQL schema (legal @ 5434)..." -ForegroundColor Yellow

try {
    $tables = docker exec phase66-postgres psql -U user -d legal -t -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('kg_nodes', 'kg_edges', 'file_index', 'error_embeddings') ORDER BY tablename;" 2>&1

    if ($tables -match "kg_nodes") {
        Write-Host "   ✅ kg_nodes table exists" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  kg_nodes table NOT FOUND - run schema SQL" -ForegroundColor Yellow
    }

    if ($tables -match "kg_edges") {
        Write-Host "   ✅ kg_edges table exists" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  kg_edges table NOT FOUND - run schema SQL" -ForegroundColor Yellow
    }

    if ($tables -match "file_index") {
        Write-Host "   ✅ file_index table exists" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  file_index table NOT FOUND - run schema SQL" -ForegroundColor Yellow
    }

    if ($tables -match "error_embeddings") {
        $count = docker exec phase66-postgres psql -U user -d legal -t -c "SELECT COUNT(*) FROM error_embeddings;" 2>&1 | Select-String "\d+" | ForEach-Object { $_.Matches.Value }
        Write-Host "   ✅ error_embeddings table exists ($count vectors)" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  error_embeddings table NOT FOUND" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Failed to query Postgres: $_" -ForegroundColor Red
}

# ============================================================
# 3. Check CouchDB Database
# ============================================================
Write-Host "`n3️⃣  Checking CouchDB database (error_graph @ 5984)..." -ForegroundColor Yellow

try {
    $couchAuth = "admin:password"
    $couchAuthB64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($couchAuth))

    $dbs = Invoke-RestMethod -Uri "http://localhost:5984/_all_dbs" -Headers @{Authorization="Basic $couchAuthB64"} -TimeoutSec 5

    if ($dbs -contains "error_graph") {
        Write-Host "   ✅ error_graph database exists" -ForegroundColor Green

        $dbInfo = Invoke-RestMethod -Uri "http://localhost:5984/error_graph" -Headers @{Authorization="Basic $couchAuthB64"} -TimeoutSec 5
        Write-Host "      doc_count: $($dbInfo.doc_count)" -ForegroundColor Gray
        Write-Host "      disk_size: $([math]::Round($dbInfo.sizes.file / 1MB, 2)) MB" -ForegroundColor Gray
    } else {
        Write-Host "   ⚠️  error_graph database NOT FOUND" -ForegroundColor Yellow
        Write-Host "      Create with: node scripts/phase89-couchdb-graph-sync.mjs --sync-all" -ForegroundColor Gray
    }
} catch {
    Write-Host "   ❌ Failed to query CouchDB: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "      Is CouchDB running? Check: docker ps --filter name=couchdb" -ForegroundColor Gray
}

# ============================================================
# 4. Check Qdrant Collection
# ============================================================
Write-Host "`n4️⃣  Checking Qdrant collection (phase76_knowledge_base @ 6333)..." -ForegroundColor Yellow

try {
    $collection = Invoke-RestMethod -Uri "http://localhost:6333/collections/phase76_knowledge_base" -TimeoutSec 5

    if ($collection.result) {
        Write-Host "   ✅ phase76_knowledge_base collection exists" -ForegroundColor Green
        Write-Host "      status: $($collection.result.status)" -ForegroundColor Gray
        Write-Host "      points_count: $($collection.result.points_count)" -ForegroundColor Gray
        Write-Host "      vectors_count: $($collection.result.vectors_count)" -ForegroundColor Gray
    }

    # Check Phase 89 collections
    $phase89Collections = @("phase89_ast_embeddings", "phase89_error_clusters", "phase89_recommendations")
    foreach ($col in $phase89Collections) {
        try {
            $colInfo = Invoke-RestMethod -Uri "http://localhost:6333/collections/$col" -TimeoutSec 5
            if ($colInfo.result) {
                Write-Host "   ✅ $col collection exists ($($colInfo.result.points_count) points)" -ForegroundColor Green
            }
        } catch {
            Write-Host "   ⏳ $col collection not created yet" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "   ❌ Failed to query Qdrant: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "      Is Qdrant running? Check: curl http://localhost:6333/collections" -ForegroundColor Gray
}

# ============================================================
# 5. Check File Deliverables
# ============================================================
Write-Host "`n5️⃣  Checking file deliverables..." -ForegroundColor Yellow

$files = @(
    @{Path="scripts/phase89-error-graph-schema.sql"; Description="PostgreSQL schema"},
    @{Path="scripts/phase89-couchdb-graph-sync.mjs"; Description="CouchDB sync script"},
    @{Path="scripts/phase89-error-graph-builder.mjs"; Description="Graph builder"},
    @{Path="scripts/phase89-error-map-query.mjs"; Description="Query interface"},
    @{Path="../go-services/knowledge-plane/run-safe.ps1"; Description="Hardened startup"}
)

foreach ($file in $files) {
    if (Test-Path $file.Path) {
        $lines = (Get-Content $file.Path).Count
        Write-Host "   ✅ $($file.Description) ($lines lines)" -ForegroundColor Green
    } else {
        Write-Host "   ❌ $($file.Description) NOT FOUND" -ForegroundColor Red
        Write-Host "      Expected: $($file.Path)" -ForegroundColor Gray
    }
}

# ============================================================
# Summary
# ============================================================
Write-Host "`n📈 Verification Summary`n" -ForegroundColor Cyan

Write-Host "If all checks passed:" -ForegroundColor Green
Write-Host "  1. Run: docker exec -i phase66-postgres psql -U user -d legal < scripts/phase89-error-graph-schema.sql" -ForegroundColor Yellow
Write-Host "  2. Run: node scripts/phase89-error-graph-builder.mjs" -ForegroundColor Yellow
Write-Host "  3. Run: node scripts/phase89-couchdb-graph-sync.mjs --sync-all" -ForegroundColor Yellow
Write-Host "  4. Run: node scripts/phase89-couchdb-graph-sync.mjs --verify" -ForegroundColor Yellow

Write-Host "`nIf checks failed:" -ForegroundColor Red
Write-Host "  1. Start dependencies: cd ../go-services/knowledge-plane && .\run-safe.ps1" -ForegroundColor Yellow
Write-Host "  2. Re-run this verification script" -ForegroundColor Yellow

Write-Host "`n✅ Verification complete!`n" -ForegroundColor Green
