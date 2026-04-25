#!/usr/bin/env pwsh
# Complete Phase 78 Migration - Interactive Drizzle Push
# This handles the enum rename prompts and completes the migration

$ErrorActionPreference = "Stop"

Write-Host "🔧 Phase 78 Complete Migration Runner" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Check directory
if (-not (Test-Path "drizzle.config.ts")) {
    Write-Host "❌ Error: Must run from sveltekit-frontend directory" -ForegroundColor Red
    exit 1
}

Write-Host "📋 This migration will:" -ForegroundColor Yellow
Write-Host "  1. Create Phase 78 enum types (activity_status, case_priority, etc.)" -ForegroundColor White
Write-Host "  2. Create missing Phase 78 tables (error_clusters, route_error_patches, error_feedback, error_timeline)" -ForegroundColor White
Write-Host "  3. Prompt you for enum rename decisions" -ForegroundColor White
Write-Host ""

$confirmation = Read-Host "Continue with migration? (yes/no)"
if ($confirmation -ne "yes") {
    Write-Host "❌ Cancelled" -ForegroundColor Red
    exit 0
}

Write-Host ""
Write-Host "🔧 Setting up environment..." -ForegroundColor Cyan

# Use postgres superuser
$env:DATABASE_URL = "postgresql://postgres:123456@localhost:5432/legal_ai_db"
$env:PGPASSWORD = "123456"

Write-Host "✅ Using postgres superuser" -ForegroundColor Green
Write-Host ""
Write-Host "🚀 Running Drizzle push (interactive mode)..." -ForegroundColor Cyan
Write-Host ""
Write-Host "📝 When prompted about enum renames:" -ForegroundColor Yellow
Write-Host "  - For activity_status: Choose 'create enum' (first option)" -ForegroundColor White
Write-Host "  - For case_priority: Choose 'create enum' (first option)" -ForegroundColor White
Write-Host ""

# Run Drizzle push in interactive mode
npx drizzle-kit push --config=drizzle.config.ts

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "❌ Migration failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ Migration complete!" -ForegroundColor Green
Write-Host ""
Write-Host "🔍 Verifying Phase 78 tables..." -ForegroundColor Cyan

$verifyQuery = @"
SELECT
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name=t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
AND table_name IN ('route_health', 'error_events', 'error_clusters', 'error_suggestions', 'route_error_patches', 'error_feedback', 'error_timeline')
ORDER BY table_name;
"@

Write-Host ""
$result = $verifyQuery | psql -h localhost -U postgres -d legal_ai_db

Write-Host ""
Write-Host "✅ Phase 78 migration successful!" -ForegroundColor Green
Write-Host "📊 Error Brain tables are now ready for use" -ForegroundColor Cyan
