#!/usr/bin/env pwsh
# Phase 78 Quick Start - Local Development Only
# Run this to start testing Error Brain immediately

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                                                           ║" -ForegroundColor Cyan
Write-Host "║         🧠 Phase 78 Error Brain - Local Testing          ║" -ForegroundColor Cyan
Write-Host "║                                                           ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check database tables
Write-Host "Step 1: Checking database tables..." -ForegroundColor Yellow
$env:PGPASSWORD = "123456"
$tableCount = psql -U postgres -h localhost -d legal_ai_db -t -A -c "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public' AND (tablename LIKE 'route_%' OR tablename LIKE 'error_%');"

Write-Host "  Found: $tableCount Error Brain tables" -ForegroundColor White

if ($tableCount -lt 7) {
    Write-Host ""
    Write-Host "⚠️  Missing tables detected ($tableCount/7)" -ForegroundColor Yellow
    Write-Host "  Expected: route_health, error_events, error_clusters, error_suggestions, route_error_patches, error_feedback, error_timeline" -ForegroundColor White
    Write-Host ""

    $createTables = Read-Host "Run migration to create missing tables? (yes/no)"
    if ($createTables -eq "yes") {
        Write-Host ""
        Write-Host "Running migration..." -ForegroundColor Cyan
        .\COMPLETE_PHASE78_MIGRATION.ps1

        if ($LASTEXITCODE -ne 0) {
            Write-Host ""
            Write-Host "❌ Migration failed - see errors above" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host ""
        Write-Host "⚠️  Skipping migration - Error Brain may not work fully" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ✅ All tables exist" -ForegroundColor Green
}

Write-Host ""
Write-Host "Step 2: Checking for route conflicts..." -ForegroundColor Yellow
if (Test-Path "scripts/fix-sveltekit-routes.mjs") {
    $fixRoutes = Read-Host "Fix route conflicts now? (yes/no)"
    if ($fixRoutes -eq "yes") {
        npm run phase78:routes:fix
    }
} else {
    Write-Host "  ⚠️  Route fixer script not found" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Step 3: Starting dev server..." -ForegroundColor Yellow
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "🚀 Dev Server Starting..." -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""
Write-Host "📍 URLs:" -ForegroundColor Yellow
Write-Host "   Home:           http://localhost:5173" -ForegroundColor White
Write-Host "   Command Center: http://localhost:5173/all-routes" -ForegroundColor White
Write-Host "   Error Brain:    Click 🧠 button on any route card" -ForegroundColor White
Write-Host ""
Write-Host "🧪 Test Steps:" -ForegroundColor Yellow
Write-Host "   1. Navigate to /all-routes" -ForegroundColor White
Write-Host "   2. Find routes with ❌ or ⚠️ badges" -ForegroundColor White
Write-Host "   3. Click the Error Brain button" -ForegroundColor White
Write-Host "   4. Review suggestions" -ForegroundColor White
Write-Host "   5. Apply a patch" -ForegroundColor White
Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Gray
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

npm run dev
