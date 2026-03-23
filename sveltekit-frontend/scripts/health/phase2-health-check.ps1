# Phase 2 Health Check Script
# Comprehensive testing after store consolidation

Write-Host "`n" + ("="*80) -ForegroundColor Cyan
Write-Host "🏥 PHASE 2 HEALTH CHECK - Store Consolidation Validation" -ForegroundColor Magenta
Write-Host ("="*80) + "`n" -ForegroundColor Cyan

$healthStatus = @{
    TypeScript = $false
    Playwright = $false
    DevServer = $false
    Imports = $false
    Overall = $false
}

# Test 1: TypeScript Validation
Write-Host "📊 Test 1: TypeScript Error Count..." -ForegroundColor Cyan
$errors = npx tsc --noEmit --skipLibCheck 2>&1 | Select-String "error TS"
$errorCount = ($errors | Measure-Object).Count

Write-Host "  TypeScript Errors: $errorCount" -ForegroundColor $(if ($errorCount -le 54428) { 'Green' } else { 'Red' })

if ($errorCount -le 54428) {
    $delta = 54480 - $errorCount
    Write-Host "  ✅ PASS: $delta errors reduced from baseline (54,480)" -ForegroundColor Green
    $healthStatus.TypeScript = $true
} else {
    $increase = $errorCount - 54428
    Write-Host "  ❌ FAIL: $increase new errors detected" -ForegroundColor Red
}

# Test 2: Check for Import Errors
Write-Host "`n🔍 Test 2: Import Resolution Check..." -ForegroundColor Cyan
$importErrors = $errors | Select-String "Cannot find module|Module not found"
$importCount = ($importErrors | Measure-Object).Count

if ($importCount -eq 0) {
    Write-Host "  ✅ PASS: No import resolution errors" -ForegroundColor Green
    $healthStatus.Imports = $true
} else {
    Write-Host "  ❌ FAIL: $importCount import errors found" -ForegroundColor Red
    Write-Host "  Sample errors:" -ForegroundColor Yellow
    $importErrors | Select-Object -First 3 | ForEach-Object {
        Write-Host "    - $_" -ForegroundColor Gray
    }
}

# Test 3: Verify Canonical Stores Exist
Write-Host "`n📁 Test 3: Canonical Store Files..." -ForegroundColor Cyan
$canonicalStores = @(
    "src\lib\stores\auth.svelte.ts",
    "src\lib\stores\ai-assistant.svelte.ts",
    "src\lib\stores\chat.svelte.ts",
    "src\lib\stores\chatMachine.ts",
    "src\lib\stores\index.ts"
)

$allExist = $true
foreach ($store in $canonicalStores) {
    if (Test-Path $store) {
        $size = (Get-Item $store).Length
        Write-Host "  ✅ $store ($size bytes)" -ForegroundColor Green
    } else {
        Write-Host "  ❌ MISSING: $store" -ForegroundColor Red
        $allExist = $false
    }
}

# Test 4: Check Dev Server Status
Write-Host "`n🚀 Test 4: Dev Server Status..." -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5173" -Method Head -TimeoutSec 2 -ErrorAction Stop
    Write-Host "  ✅ PASS: Dev server responding on port 5173" -ForegroundColor Green
    $healthStatus.DevServer = $true
} catch {
    Write-Host "  ⚠️  Dev server not running (start with 'npm run dev')" -ForegroundColor Yellow
}

# Test 5: Playwright Smoke Tests
Write-Host "`n🧪 Test 5: Playwright Smoke Tests..." -ForegroundColor Cyan
if (Test-Path "tests\stores-smoke-test.spec.ts") {
    Write-Host "  Running smoke tests..." -ForegroundColor Gray
    $testResult = npx playwright test stores-smoke-test.spec.ts --reporter=list 2>&1

    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✅ PASS: All Playwright tests passed" -ForegroundColor Green
        $healthStatus.Playwright = $true
    } else {
        Write-Host "  ❌ FAIL: Some Playwright tests failed" -ForegroundColor Red
        Write-Host "  Run 'npx playwright test stores-smoke-test.spec.ts' for details" -ForegroundColor Gray
    }
} else {
    Write-Host "  ⚠️  Smoke test file not found" -ForegroundColor Yellow
}

# Test 6: Real-time Functionality Check
Write-Host "`n🔄 Test 6: Real-time Store Verification..." -ForegroundColor Cyan
$realtimeStores = @(
    "src\lib\stores\websocket-store.svelte.ts",
    "src\lib\stores\redis-state.svelte.ts"
)

foreach ($store in $realtimeStores) {
    if (Test-Path $store) {
        Write-Host "  ✅ $([System.IO.Path]::GetFileName($store))" -ForegroundColor Green
    } else {
        Write-Host "  ❌ MISSING: $store" -ForegroundColor Red
    }
}

# Overall Health Assessment
Write-Host "`n" + ("="*80) -ForegroundColor Cyan
Write-Host "📋 HEALTH CHECK SUMMARY" -ForegroundColor Magenta
Write-Host ("="*80) -ForegroundColor Cyan

$passedTests = ($healthStatus.Values | Where-Object { $_ -eq $true }).Count
$totalTests = $healthStatus.Count

Write-Host "`n  Tests Passed: $passedTests/$totalTests" -ForegroundColor Cyan

foreach ($test in $healthStatus.Keys) {
    $status = if ($healthStatus[$test]) { "✅ PASS" } else { "❌ FAIL" }
    $color = if ($healthStatus[$test]) { "Green" } else { "Red" }
    Write-Host "  $status - $test" -ForegroundColor $color
}

if ($passedTests -eq $totalTests) {
    Write-Host "`n🎉 ALL TESTS PASSED - Store consolidation is healthy!" -ForegroundColor Green
    $healthStatus.Overall = $true
} elseif ($passedTests -ge ($totalTests * 0.7)) {
    Write-Host "`n⚠️  PARTIAL SUCCESS - Review failed tests" -ForegroundColor Yellow
} else {
    Write-Host "`n❌ HEALTH CHECK FAILED - Action required" -ForegroundColor Red
}

Write-Host "`n" + ("="*80) + "`n" -ForegroundColor Cyan

# Return exit code based on overall health
if ($healthStatus.Overall) {
    exit 0
} else {
    exit 1
}
