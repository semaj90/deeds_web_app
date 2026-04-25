#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Phase 89: Deploy Event Sourcing Schema to Postgres
#>

Write-Host "🚀 Phase 89: Deploy Event Sourcing Schema" -ForegroundColor Cyan
Write-Host ("=" * 70)

# Check if schema file exists
$schemaFile = Join-Path $PSScriptRoot "phase89-qdrant-events-schema.sql"
if (-not (Test-Path $schemaFile)) {
    Write-Host "❌ Schema file not found: $schemaFile" -ForegroundColor Red
    exit 1
}

Write-Host "`n📂 Schema file: $schemaFile" -ForegroundColor Yellow

# Check if Postgres container is running
$pgContainer = docker ps --filter "name=phase66-postgres" --format "{{.Names}}" 2>$null
if (-not $pgContainer) {
    Write-Host "`n❌ Postgres container not running (expected: phase66-postgres)" -ForegroundColor Red
    Write-Host "   Start with: docker-compose up -d postgres" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Postgres container: $pgContainer" -ForegroundColor Green

# Deploy schema
Write-Host "`n🔨 Deploying schema to Postgres..." -ForegroundColor Yellow

$result = Get-Content $schemaFile | docker exec -i $pgContainer psql -U user -d legal 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Schema deployed successfully!" -ForegroundColor Green
    Write-Host "`n$result"
} else {
    Write-Host "❌ Schema deployment failed!" -ForegroundColor Red
    Write-Host "`n$result"
    exit 1
}

# Verify table exists
Write-Host "`n🔍 Verifying table structure..." -ForegroundColor Yellow

$verify = docker exec $pgContainer psql -U user -d legal -c "\d phase89_qdrant_events" 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Table verified!" -ForegroundColor Green
    Write-Host "`n$verify"
} else {
    Write-Host "⚠️  Could not verify table (but may exist)" -ForegroundColor Yellow
    Write-Host "`n$verify"
}

# Show indexes
Write-Host "`n📊 Indexes:" -ForegroundColor Yellow
$indexes = docker exec $pgContainer psql -U user -d legal -c "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'phase89_qdrant_events';" 2>&1
Write-Host $indexes

Write-Host "`n✅ Event sourcing schema ready!" -ForegroundColor Green
Write-Host "`n📝 Next steps:" -ForegroundColor Cyan
Write-Host "   1. Test event logging: python scripts/phase89_event_sourcing.py" -ForegroundColor White
Write-Host "   2. Create timeline collection: python scripts/phase89-timeline-collection.py" -ForegroundColor White
Write-Host "   3. Extract events with LangExtract: python scripts/phase89-extract-timeline-events.py" -ForegroundColor White
