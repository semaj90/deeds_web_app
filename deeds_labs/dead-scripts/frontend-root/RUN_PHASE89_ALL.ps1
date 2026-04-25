# Phase 89: Run All - Complete Setup
# Executes: Schema → Build → Sync → Verify → Query

$ErrorActionPreference = "Stop"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host " Phase 89: Complete System Setup" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Step 1: Create PostgreSQL Schema
Write-Host "Step 1: Creating PostgreSQL schema..." -ForegroundColor Yellow
docker exec -i phase66-postgres psql -U user -d legal < scripts/phase89-error-graph-schema.sql

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ Schema creation failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Schema created`n" -ForegroundColor Green

# Step 2: Build Error Graph
Write-Host "Step 2: Building error graph (2-5 min)..." -ForegroundColor Yellow
node scripts/phase89-error-graph-builder.mjs

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ Graph build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Graph built`n" -ForegroundColor Green

# Step 3: Sync to CouchDB + Qdrant
Write-Host "Step 3: Syncing to CouchDB + Qdrant (3-10 min)..." -ForegroundColor Yellow
node scripts/phase89-couchdb-graph-sync.mjs --sync-all

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ Sync failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Sync complete`n" -ForegroundColor Green

# Step 4: Verify
Write-Host "Step 4: Verifying system..." -ForegroundColor Yellow
node scripts/phase89-couchdb-graph-sync.mjs --verify

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ Verification failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Verified`n" -ForegroundColor Green

# Step 5: Test Query
Write-Host "Step 5: Testing query interface..." -ForegroundColor Yellow
node scripts/phase89-error-map-query.mjs "TS1005"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host " Phase 89: Setup Complete!" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  - Query errors: node scripts/phase89-error-map-query.mjs `"<query>`"" -ForegroundColor Gray
Write-Host "  - CouchDB views: curl -u admin:password http://localhost:5984/error_graph/_design/graph/_view/errors_by_severity?group=true" -ForegroundColor Gray
Write-Host "  - Postgres functions: SELECT * FROM get_error_density();" -ForegroundColor Gray
