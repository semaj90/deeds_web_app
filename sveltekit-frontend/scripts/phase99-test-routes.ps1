# Phase 99: Core Route Testing Script
# Tests /cases and /evidence routes for functionality

Write-Host "`n🧪 Phase 99: Core Route Testing" -ForegroundColor Cyan
Write-Host "═" * 70
Write-Host ""

$baseUrl = "http://localhost:5175"
$passed = 0
$failed = 0

function Test-Route {
    param(
        [string]$Name,
        [string]$Url,
        [string]$Method = "GET",
        [hashtable]$Headers = @{},
        [object]$Body = $null
    )

    Write-Host "Testing: $Name" -ForegroundColor Yellow
    Write-Host "  URL: $Url" -ForegroundColor Gray

    try {
        $params = @{
            Uri = $Url
            Method = $Method
            Headers = $Headers
            TimeoutSec = 10
        }

        if ($Body) {
            $params.Body = ($Body | ConvertTo-Json)
            $params.ContentType = "application/json"
        }

        $response = Invoke-WebRequest @params -ErrorAction Stop

        if ($response.StatusCode -eq 200) {
            Write-Host "  ✅ PASS - Status: $($response.StatusCode)" -ForegroundColor Green
            $script:passed++
            return $true
        } else {
            Write-Host "  ⚠️  WARN - Status: $($response.StatusCode)" -ForegroundColor Yellow
            $script:passed++
            return $true
        }
    } catch {
        Write-Host "  ❌ FAIL - Error: $($_.Exception.Message)" -ForegroundColor Red
        $script:failed++
        return $false
    }
    Write-Host ""
}

# Wait for server to be ready
Write-Host "⏳ Waiting for dev server..." -ForegroundColor Gray
Start-Sleep -Seconds 3

Write-Host "`n📋 Test Suite 1: Cases Routes" -ForegroundColor Cyan
Write-Host "─" * 70
Write-Host ""

# Test 1: GET /cases (list)
Test-Route -Name "Cases List Page" -Url "$baseUrl/cases"

# Test 2: GET /cases?status=open
Test-Route -Name "Cases Filtered by Status" -Url "$baseUrl/cases?status=open"

# Test 3: GET /cases/new (create page)
Test-Route -Name "New Case Page" -Url "$baseUrl/cases/new"

# Test 4: API - GET /api/cases
Test-Route -Name "Cases API Endpoint" -Url "$baseUrl/api/cases"

Write-Host "`n📦 Test Suite 2: Evidence Routes" -ForegroundColor Cyan
Write-Host "─" * 70
Write-Host ""

# Test 5: GET /evidence (list)
Test-Route -Name "Evidence List Page" -Url "$baseUrl/evidence"

# Test 6: GET /evidence/upload
Test-Route -Name "Evidence Upload Page" -Url "$baseUrl/evidence/upload"

# Test 7: API - GET /api/evidence
Test-Route -Name "Evidence API Endpoint" -Url "$baseUrl/api/evidence"

Write-Host "`n🔍 Test Suite 3: SSR Verification" -ForegroundColor Cyan
Write-Host "─" * 70
Write-Host ""

# Test 8: Check SSR content in /cases
Write-Host "Testing: SSR Content in Cases Page" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/cases" -TimeoutSec 10
    $html = $response.Content

    if ($html -match '<html' -and $html -match 'Cases') {
        Write-Host "  ✅ PASS - SSR content detected" -ForegroundColor Green
        $script:passed++
    } else {
        Write-Host "  ❌ FAIL - No SSR content found" -ForegroundColor Red
        $script:failed++
    }
} catch {
    Write-Host "  ❌ FAIL - Error: $($_.Exception.Message)" -ForegroundColor Red
    $script:failed++
}
Write-Host ""

# Test 9: Check SSR content in /evidence
Write-Host "Testing: SSR Content in Evidence Page" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/evidence" -TimeoutSec 10
    $html = $response.Content

    if ($html -match '<html' -and $html -match 'Evidence') {
        Write-Host "  ✅ PASS - SSR content detected" -ForegroundColor Green
        $script:passed++
    } else {
        Write-Host "  ❌ FAIL - No SSR content found" -ForegroundColor Red
        $script:failed++
    }
} catch {
    Write-Host "  ❌ FAIL - Error: $($_.Exception.Message)" -ForegroundColor Red
    $script:failed++
}
Write-Host ""

Write-Host "`n🔌 Test Suite 4: API Health Checks" -ForegroundColor Cyan
Write-Host "─" * 70
Write-Host ""

# Test 10: Health check - Ollama
Test-Route -Name "Ollama Health Check" -Url "$baseUrl/api/health/ollama"

# Test 11: Health check - Redis
Test-Route -Name "Redis Health Check" -Url "$baseUrl/api/health/redis"

# Test 12: Health check - Qdrant
Test-Route -Name "Qdrant Health Check" -Url "$baseUrl/api/health/qdrant"

# Summary
Write-Host "`n" + ("═" * 70)
Write-Host "📊 Test Results Summary" -ForegroundColor Cyan
Write-Host ("═" * 70)
Write-Host ""
Write-Host "  ✅ Passed: $passed" -ForegroundColor Green
Write-Host "  ❌ Failed: $failed" -ForegroundColor Red
Write-Host "  📈 Success Rate: $([math]::Round(($passed / ($passed + $failed)) * 100, 2))%" -ForegroundColor Cyan
Write-Host ""

if ($failed -eq 0) {
    Write-Host "🎉 All tests passed! Routes are ready for production." -ForegroundColor Green
    exit 0
} else {
    Write-Host "⚠️  Some tests failed. Review errors above." -ForegroundColor Yellow
    exit 1
}
