#!/usr/bin/env pwsh
# Phase 78 - Complete End-to-End Test
# Tests Error Brain workflow from API to UI

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                                                           ║" -ForegroundColor Cyan
Write-Host "║    🧪 Phase 78 End-to-End Test Suite                     ║" -ForegroundColor Cyan
Write-Host "║                                                           ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$testsPassed = 0
$testsFailed = 0

# Test 1: Database Tables
Write-Host "Test 1: Verify Phase 78 tables exist..." -ForegroundColor Yellow
$env:PGPASSWORD = "123456"
$tableCount = psql -U postgres -h localhost -p 5432 -d legal_ai_db -t -A -c "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public' AND (tablename LIKE 'route_%' OR tablename LIKE 'error_%');"

if ($tableCount -eq 8) {
    Write-Host "  ✅ All 8 tables exist" -ForegroundColor Green
    $testsPassed++
} else {
    Write-Host "  ❌ Expected 8 tables, found $tableCount" -ForegroundColor Red
    $testsFailed++
}

# Test 2: Dev Server Running
Write-Host ""
Write-Host "Test 2: Check if dev server is running..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5173" -Method GET -TimeoutSec 5 -UseBasicParsing
    Write-Host "  ✅ Dev server responding on port 5173" -ForegroundColor Green
    $testsPassed++
} catch {
    Write-Host "  ⚠️  Dev server not running" -ForegroundColor Yellow
    Write-Host "     Run: npm run dev" -ForegroundColor Gray
    $testsFailed++
}

# Test 3: Error Events API Endpoint
Write-Host ""
Write-Host "Test 3: Test /api/phase78/error-events endpoint..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5173/api/phase78/error-events?limit=5" -Method GET -TimeoutSec 5 -UseBasicParsing
    $data = $response.Content | ConvertFrom-Json

    if ($data.PSObject.Properties.Name -contains 'items') {
        Write-Host "  ✅ Endpoint responding correctly" -ForegroundColor Green
        Write-Host "     Found: $($data.items.Count) error events" -ForegroundColor Gray
        $testsPassed++
    } else {
        Write-Host "  ❌ Unexpected response format" -ForegroundColor Red
        $testsFailed++
    }
} catch {
    Write-Host "  ⚠️  API endpoint not accessible" -ForegroundColor Yellow
    Write-Host "     Error: $($_.Exception.Message)" -ForegroundColor Gray
    $testsFailed++
}

# Test 4: Route Health API Endpoint
Write-Host ""
Write-Host "Test 4: Test /api/phase78/route-health endpoint..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5173/api/phase78/route-health" -Method GET -TimeoutSec 5 -UseBasicParsing
    $data = $response.Content | ConvertFrom-Json

    if ($data.PSObject.Properties.Name -contains 'items') {
        Write-Host "  ✅ Endpoint responding correctly" -ForegroundColor Green
        Write-Host "     Found: $($data.items.Count) route health records" -ForegroundColor Gray
        $testsPassed++
    } else {
        Write-Host "  ❌ Unexpected response format" -ForegroundColor Red
        $testsFailed++
    }
} catch {
    Write-Host "  ⚠️  API endpoint not accessible" -ForegroundColor Yellow
    Write-Host "     Error: $($_.Exception.Message)" -ForegroundColor Gray
    $testsFailed++
}

# Test 5: Command Center Route
Write-Host ""
Write-Host "Test 5: Check /all-routes page loads..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5173/all-routes" -Method GET -TimeoutSec 5 -UseBasicParsing

    if ($response.StatusCode -eq 200) {
        Write-Host "  ✅ Command Center page accessible" -ForegroundColor Green
        $testsPassed++
    } else {
        Write-Host "  ❌ Unexpected status code: $($response.StatusCode)" -ForegroundColor Red
        $testsFailed++
    }
} catch {
    Write-Host "  ⚠️  Command Center not accessible" -ForegroundColor Yellow
    Write-Host "     Error: $($_.Exception.Message)" -ForegroundColor Gray
    $testsFailed++
}

# Test 6: Insert Test Data
Write-Host ""
Write-Host "Test 6: Insert sample route health data..." -ForegroundColor Yellow
try {
    $testRoute = @{
        routePath = "/test/error-brain"
        state = "flaky"
        errorCount = 3
    } | ConvertTo-Json

    $response = Invoke-WebRequest `
        -Uri "http://localhost:5173/api/phase78/route-health" `
        -Method POST `
        -ContentType "application/json" `
        -Body $testRoute `
        -TimeoutSec 5 `
        -UseBasicParsing

    if ($response.StatusCode -eq 201) {
        Write-Host "  ✅ Test data inserted successfully" -ForegroundColor Green
        $testsPassed++
    } else {
        Write-Host "  ❌ Failed to insert test data" -ForegroundColor Red
        $testsFailed++
    }
} catch {
    Write-Host "  ⚠️  Could not insert test data" -ForegroundColor Yellow
    Write-Host "     Error: $($_.Exception.Message)" -ForegroundColor Gray
    $testsFailed++
}

# Summary
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Test Results" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "  ✅ Passed: $testsPassed" -ForegroundColor Green
Write-Host "  ❌ Failed: $testsFailed" -ForegroundColor Red
Write-Host ""

if ($testsFailed -eq 0) {
    Write-Host "🎉 All tests passed! Error Brain is ready to use." -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "  1. Open: http://localhost:5173/all-routes" -ForegroundColor Cyan
    Write-Host "  2. Look for the test route: /test/error-brain" -ForegroundColor Cyan
    Write-Host "  3. Click the Error Brain (🧠) button" -ForegroundColor Cyan
    Write-Host "  4. Verify modal opens with error data" -ForegroundColor Cyan
    Write-Host ""
} else {
    Write-Host "⚠️  Some tests failed. Review errors above." -ForegroundColor Yellow
    Write-Host ""

    if ($testsFailed -ge 2 -and $testsFailed -le 5) {
        Write-Host "💡 Tip: Make sure dev server is running:" -ForegroundColor Yellow
        Write-Host "   npm run dev" -ForegroundColor Cyan
    }
}
