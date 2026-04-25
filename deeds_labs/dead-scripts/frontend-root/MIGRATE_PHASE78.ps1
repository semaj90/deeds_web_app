#!/usr/bin/env pwsh
# Phase 78 Migration Runner
# Applies pre-cleanup then runs Drizzle push with postgres superuser

$ErrorActionPreference = "Stop"

Write-Host "🔧 Phase 78 Database Migration" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Check if we're in the right directory
if (-not (Test-Path "drizzle.config.ts")) {
    Write-Host "❌ Error: Must run from sveltekit-frontend directory" -ForegroundColor Red
    exit 1
}

Write-Host "📋 Migration Plan:" -ForegroundColor Yellow
Write-Host "  1. Run pre-cleanup SQL (fix legal_documents.evidence_id, truncate user_embeddings)" -ForegroundColor White
Write-Host "  2. Run Drizzle push with postgres superuser to bypass permissions" -ForegroundColor White
Write-Host "  3. Verify Error Brain tables exist" -ForegroundColor White
Write-Host ""

$confirmation = Read-Host "⚠️  This will TRUNCATE evidence, users, and user_embeddings tables. Continue? (yes/no)"
if ($confirmation -ne "yes") {
    Write-Host "❌ Cancelled" -ForegroundColor Red
    exit 0
}

Write-Host ""
Write-Host "Step 1: Running pre-cleanup..." -ForegroundColor Cyan

# Run pre-cleanup SQL
$env:PGPASSWORD = "123456"
$preSql = Get-Content "drizzle\migrations\20251207_pre_phase78_cleanup.sql" -Raw

try {
    $preSql | & psql -h localhost -U postgres -d legal_ai_db -f -
    Write-Host "✅ Pre-cleanup complete" -ForegroundColor Green
} catch {
    Write-Host "❌ Pre-cleanup failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Step 2: Running Drizzle push..." -ForegroundColor Cyan

# Set DATABASE_URL to postgres superuser
$env:DATABASE_URL = "postgresql://postgres:123456@localhost:5432/legal_ai_db"

try {
    npx drizzle-kit push --config=drizzle.config.ts
    Write-Host "✅ Drizzle push complete" -ForegroundColor Green
} catch {
    Write-Host "❌ Drizzle push failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Step 3: Verifying Error Brain tables..." -ForegroundColor Cyan

$verifyQuery = @"
SELECT
    COUNT(*) FILTER (WHERE table_name = 'route_health') as route_health,
    COUNT(*) FILTER (WHERE table_name = 'error_events') as error_events,
    COUNT(*) FILTER (WHERE table_name = 'error_clusters') as error_clusters,
    COUNT(*) FILTER (WHERE table_name = 'route_error_patches') as patches
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('route_health', 'error_events', 'error_clusters', 'route_error_patches');
"@

try {
    $result = $verifyQuery | & psql -h localhost -U postgres -d legal_ai_db -t -A -F ',' -f -
    $counts = $result.Split(',')

    Write-Host ""
    Write-Host "📊 Table Verification:" -ForegroundColor Cyan
    Write-Host "  route_health: $($counts[0])" -ForegroundColor White
    Write-Host "  error_events: $($counts[1])" -ForegroundColor White
    Write-Host "  error_clusters: $($counts[2])" -ForegroundColor White
    Write-Host "  route_error_patches: $($counts[3])" -ForegroundColor White

    if ($counts[0] -eq "1" -and $counts[1] -eq "1" -and $counts[2] -eq "1" -and $counts[3] -eq "1") {
        Write-Host ""
        Write-Host "✅ All Error Brain tables created successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "🎉 Phase 78 migration complete!" -ForegroundColor Cyan
        Write-Host "   You can now start using the Error Brain to persist patches." -ForegroundColor White
    } else {
        Write-Host ""
        Write-Host "⚠️  Some tables may be missing. Check the schema." -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  Could not verify tables: $_" -ForegroundColor Yellow
}

Write-Host ""
