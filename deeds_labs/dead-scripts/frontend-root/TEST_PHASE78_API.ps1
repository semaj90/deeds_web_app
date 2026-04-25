# ╔═══════════════════════════════════════════════════════════════════╗
# ║     🧪 PHASE 78 API ENDPOINT TESTING SCRIPT                       ║
# ║     Comprehensive validation of Error Brain endpoints             ║
# ╚═══════════════════════════════════════════════════════════════════╝

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  🧪 PHASE 78 API ENDPOINT TESTING" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

$baseUrl = "http://localhost:5173"
$testsPassed = 0
$testsFailed = 0

# ─────────────────────────────────────────────────────────────────────
# TEST 1: Check if dev server is running
# ─────────────────────────────────────────────────────────────────────
Write-Host "TEST 1: Dev Server Check" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri $baseUrl -Method GET -TimeoutSec 5 -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        Write-Host "  ✅ Dev server is running on $baseUrl" -ForegroundColor Green
        $testsPassed++
    }
} catch {
    Write-Host "  ❌ Dev server NOT running! Start with: npm run dev" -ForegroundColor Red
    Write-Host "     Error: $_" -ForegroundColor DarkGray
    $testsFailed++
    exit 1
}

Write-Host ""

# ─────────────────────────────────────────────────────────────────────
# TEST 2: GET /api/phase78/error-events (without routePath - should fail)
# ─────────────────────────────────────────────────────────────────────
Write-Host "TEST 2: GET /api/phase78/error-events (missing routePath)" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/phase78/error-events" -Method GET -ErrorAction Stop
    Write-Host "  ❌ Should have returned 400 error for missing routePath" -ForegroundColor Red
    $testsFailed++
} catch {
    if ($_.Exception.Response.StatusCode -eq 400) {
        Write-Host "  ✅ Correctly rejected request with 400 Bad Request" -ForegroundColor Green
        $testsPassed++
    } else {
        Write-Host "  ❌ Unexpected error: $_" -ForegroundColor Red
        $testsFailed++
    }
}

Write-Host ""

# ─────────────────────────────────────────────────────────────────────
# TEST 3: GET /api/phase78/error-events (with routePath)
# ─────────────────────────────────────────────────────────────────────
Write-Host "TEST 3: GET /api/phase78/error-events?routePath=/all-routes" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/phase78/error-events?routePath=/all-routes" -Method GET -ErrorAction Stop

    if ($response.events -ne $null -and $response.suggestions -ne $null) {
        Write-Host "  ✅ Endpoint returned valid response structure" -ForegroundColor Green
        Write-Host "     Events: $($response.events.Count)" -ForegroundColor Cyan
        Write-Host "     Suggestions: $($response.suggestions.Count)" -ForegroundColor Cyan
        Write-Host "     Health: $($response.health.errorState ?? 'null')" -ForegroundColor Cyan
        $testsPassed++

        # Show first event if exists
        if ($response.events.Count -gt 0) {
            Write-Host "     Sample Event:" -ForegroundColor DarkGray
            $firstEvent = $response.events[0]
            Write-Host "       - Kind: $($firstEvent.kind ?? 'N/A')" -ForegroundColor DarkGray
            Write-Host "       - Severity: $($firstEvent.severity ?? 'N/A')" -ForegroundColor DarkGray
            Write-Host "       - Message: $($firstEvent.message ?? 'N/A')" -ForegroundColor DarkGray
        }

        # Show first suggestion if exists
        if ($response.suggestions.Count -gt 0) {
            Write-Host "     Sample Suggestion:" -ForegroundColor DarkGray
            $firstSuggestion = $response.suggestions[0]
            Write-Host "       - Title: $($firstSuggestion.title ?? 'N/A')" -ForegroundColor DarkGray
            Write-Host "       - Confidence: $($firstSuggestion.confidence ?? 'N/A')" -ForegroundColor DarkGray
        }
    } else {
        Write-Host "  ❌ Invalid response structure" -ForegroundColor Red
        $testsFailed++
    }
} catch {
    Write-Host "  ❌ Request failed: $_" -ForegroundColor Red
    Write-Host "     Make sure database is running and Phase 78 tables exist" -ForegroundColor DarkGray
    $testsFailed++
}

Write-Host ""

# ─────────────────────────────────────────────────────────────────────
# TEST 4: POST /api/phase78/route-health (missing routePath)
# ─────────────────────────────────────────────────────────────────────
Write-Host "TEST 4: POST /api/phase78/route-health (missing routePath)" -ForegroundColor Yellow
try {
    $body = @{
        filePath = "test.svelte"
    } | ConvertTo-Json

    $response = Invoke-RestMethod `
        -Uri "$baseUrl/api/phase78/route-health" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body `
        -ErrorAction Stop

    Write-Host "  ❌ Should have returned 400 error for missing routePath" -ForegroundColor Red
    $testsFailed++
} catch {
    if ($_.Exception.Response.StatusCode -eq 400) {
        Write-Host "  ✅ Correctly rejected request with 400 Bad Request" -ForegroundColor Green
        $testsPassed++
    } else {
        Write-Host "  ❌ Unexpected error: $_" -ForegroundColor Red
        $testsFailed++
    }
}

Write-Host ""

# ─────────────────────────────────────────────────────────────────────
# TEST 5: POST /api/phase78/route-health (valid request)
# ─────────────────────────────────────────────────────────────────────
Write-Host "TEST 5: POST /api/phase78/route-health (valid request)" -ForegroundColor Yellow
try {
    $testRoutePath = "/test/error-brain-api-test"
    $body = @{
        routePath = $testRoutePath
        filePath = "src/routes/test/error-brain-api-test/+page.svelte"
        errorState = "flaky"
        recentErrorCount = 5
        lastErrorMessageShort = "API test error"
    } | ConvertTo-Json

    $response = Invoke-RestMethod `
        -Uri "$baseUrl/api/phase78/route-health" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body `
        -ErrorAction Stop

    if ($response.success -eq $true) {
        Write-Host "  ✅ Successfully created/updated route health record" -ForegroundColor Green
        Write-Host "     Route: $testRoutePath" -ForegroundColor Cyan
        Write-Host "     State: flaky" -ForegroundColor Cyan
        Write-Host "     Error Count: 5" -ForegroundColor Cyan
        $testsPassed++
    } else {
        Write-Host "  ❌ Response did not indicate success" -ForegroundColor Red
        $testsFailed++
    }
} catch {
    Write-Host "  ❌ Request failed: $_" -ForegroundColor Red
    Write-Host "     Make sure database is running and route_health table exists" -ForegroundColor DarkGray
    $testsFailed++
}

Write-Host ""

# ─────────────────────────────────────────────────────────────────────
# TEST 6: Verify the POST created database record (via GET)
# ─────────────────────────────────────────────────────────────────────
Write-Host "TEST 6: Verify POST created database record" -ForegroundColor Yellow
try {
    $testRoutePath = "/test/error-brain-api-test"
    $response = Invoke-RestMethod `
        -Uri "$baseUrl/api/phase78/error-events?routePath=$([uri]::EscapeDataString($testRoutePath))" `
        -Method GET `
        -ErrorAction Stop

    if ($response.health -ne $null -and $response.health.errorState -eq "flaky") {
        Write-Host "  ✅ Database record verified via GET endpoint" -ForegroundColor Green
        Write-Host "     Health State: $($response.health.errorState)" -ForegroundColor Cyan
        Write-Host "     Error Count: $($response.health.recentErrorCount)" -ForegroundColor Cyan
        $testsPassed++
    } else {
        Write-Host "  ❌ Could not verify database record" -ForegroundColor Red
        Write-Host "     Response: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor DarkGray
        $testsFailed++
    }
} catch {
    Write-Host "  ❌ Verification failed: $_" -ForegroundColor Red
    $testsFailed++
}

Write-Host ""

# ─────────────────────────────────────────────────────────────────────
# TEST 7: GET /api/phase78/error-events with pagination
# ─────────────────────────────────────────────────────────────────────
Write-Host "TEST 7: GET /api/phase78/error-events (pagination)" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod `
        -Uri "$baseUrl/api/phase78/error-events?routePath=/all-routes&limit=5&offset=0" `
        -Method GET `
        -ErrorAction Stop

    Write-Host "  ✅ Pagination parameters accepted" -ForegroundColor Green
    Write-Host "     Returned events: $($response.events.Count)" -ForegroundColor Cyan
    Write-Host "     Returned suggestions: $($response.suggestions.Count)" -ForegroundColor Cyan
    $testsPassed++
} catch {
    Write-Host "  ❌ Request failed: $_" -ForegroundColor Red
    $testsFailed++
}

Write-Host ""

# ─────────────────────────────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────────────────────────────
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  TEST SUMMARY" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Total Tests: $($testsPassed + $testsFailed)" -ForegroundColor White
Write-Host "  ✅ Passed: $testsPassed" -ForegroundColor Green
Write-Host "  ❌ Failed: $testsFailed" -ForegroundColor Red
Write-Host ""

if ($testsFailed -eq 0) {
    Write-Host "╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║  🎉 ALL TESTS PASSED - API ENDPOINTS WORKING PERFECTLY! 🎉   ║" -ForegroundColor Green
    Write-Host "╚═══════════════════════════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""
    Write-Host "🚀 NEXT STEPS:" -ForegroundColor Yellow
    Write-Host "   1. Open: http://localhost:5173/all-routes" -ForegroundColor Cyan
    Write-Host "   2. Find a route with errors (⚠️ or ❌ badge)" -ForegroundColor Cyan
    Write-Host "   3. Click the 🧠 Error Brain button" -ForegroundColor Cyan
    Write-Host "   4. View real error data from Phase 78 database!" -ForegroundColor Cyan
    Write-Host ""
} else {
    Write-Host "╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor Red
    Write-Host "║  ⚠️  SOME TESTS FAILED - CHECK ERRORS ABOVE                  ║" -ForegroundColor Red
    Write-Host "╚═══════════════════════════════════════════════════════════════╝" -ForegroundColor Red
    Write-Host ""
    Write-Host "🔧 TROUBLESHOOTING:" -ForegroundColor Yellow
    Write-Host "   • Ensure dev server is running: npm run dev" -ForegroundColor DarkGray
    Write-Host "   • Verify database is accessible: psql -U postgres -h localhost" -ForegroundColor DarkGray
    Write-Host "   • Check Phase 78 tables exist: Run PHASE78_VERIFY.ps1" -ForegroundColor DarkGray
    Write-Host "   • Review database migrations in drizzle/migrations/" -ForegroundColor DarkGray
    Write-Host ""
    exit 1
}

Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
