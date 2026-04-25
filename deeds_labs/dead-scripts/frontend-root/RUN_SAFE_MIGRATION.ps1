#!/usr/bin/env pwsh
# Safe Additive Migration - Creates missing Phase 78 tables without data loss

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                                                           ║" -ForegroundColor Cyan
Write-Host "║    🛡️  Phase 78 Safe Migration (No Data Loss)            ║" -ForegroundColor Cyan
Write-Host "║                                                           ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check if we're in the right directory
if (-not (Test-Path "drizzle.config.ts")) {
    Write-Host "❌ Error: Must run from sveltekit-frontend directory" -ForegroundColor Red
    exit 1
}

Write-Host "📋 This migration will:" -ForegroundColor Yellow
Write-Host "  ✅ Create missing Error Brain tables (if they don't exist)" -ForegroundColor Green
Write-Host "  ✅ Preserve all existing data in route_health, error_events, etc." -ForegroundColor Green
Write-Host "  ✅ Add required enums (patch_status, error_kind, etc.)" -ForegroundColor Green
Write-Host "  ✅ Create indexes for performance" -ForegroundColor Green
Write-Host ""
Write-Host "  ℹ️  This is ADDITIVE ONLY - no data will be deleted" -ForegroundColor Blue
Write-Host ""

# Show current table count
$env:PGPASSWORD = "123456"
Write-Host "📊 Current database status:" -ForegroundColor Cyan
$currentTables = psql -U postgres -h localhost -p 5432 -d legal_ai_db -t -A -c "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public' AND (tablename LIKE 'route_%' OR tablename LIKE 'error_%');"

Write-Host "  Current Error Brain tables: $currentTables/7" -ForegroundColor White
Write-Host ""

$confirmation = Read-Host "Continue with safe migration? (yes/no)"
if ($confirmation -ne "yes") {
    Write-Host "❌ Cancelled" -ForegroundColor Red
    exit 0
}

Write-Host ""
Write-Host "🔄 Running additive migration..." -ForegroundColor Cyan

# Run the additive migration
try {
    $result = Get-Content "drizzle\migrations\20251207_additive_phase78_tables.sql" -Raw |
              psql -U postgres -h localhost -p 5432 -d legal_ai_db -f -

    Write-Host ""
    Write-Host "✅ Migration complete!" -ForegroundColor Green
} catch {
    Write-Host ""
    Write-Host "❌ Migration failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🔍 Verifying tables..." -ForegroundColor Cyan

# Show final table count
$finalTables = psql -U postgres -h localhost -p 5432 -d legal_ai_db -t -A -c "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public' AND (tablename LIKE 'route_%' OR tablename LIKE 'error_%');"

Write-Host ""
Write-Host "📊 Updated database status:" -ForegroundColor Cyan
Write-Host "  Error Brain tables: $finalTables/7" -ForegroundColor White
Write-Host ""

# Show table details
Write-Host "📋 Error Brain tables:" -ForegroundColor Cyan
psql -U postgres -h localhost -p 5432 -d legal_ai_db -c "
SELECT
    tablename,
    (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema='public' AND table_name=t.tablename) as columns,
    COALESCE((
        SELECT COUNT(*)
        FROM information_schema.tables it
        JOIN information_schema.columns ic ON ic.table_name = it.table_name
        WHERE it.table_schema='public' AND it.table_name=t.tablename
    ), 0) as rows
FROM pg_tables t
WHERE schemaname='public'
  AND (tablename LIKE 'route_%' OR tablename LIKE 'error_%')
ORDER BY tablename;
"

Write-Host ""
if ($finalTables -eq 7) {
    Write-Host "✅ SUCCESS! All 7 Error Brain tables are now ready" -ForegroundColor Green
    Write-Host ""
    Write-Host "🚀 Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Start dev server:  npm run dev" -ForegroundColor White
    Write-Host "  2. Open Command Center: http://localhost:5173/all-routes" -ForegroundColor White
    Write-Host "  3. Test Error Brain: Click 🧠 button on a route" -ForegroundColor White
} else {
    Write-Host "⚠️  Expected 7 tables, found $finalTables" -ForegroundColor Yellow
    Write-Host "  Check the output above for any errors" -ForegroundColor White
}

Write-Host ""
