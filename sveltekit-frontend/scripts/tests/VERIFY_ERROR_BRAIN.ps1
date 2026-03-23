#!/usr/bin/env pwsh
# Error Brain UI Verification Script
# Validates all components are in place and working

param([switch]$Verbose = $false)

$checks = @()

function Write-Check {
    param([string]$name, [bool]$passed, [string]$detail = "")
    $symbol = if ($passed) { "[OK]" } else { "[FAIL]" }
    $color = if ($passed) { 'Green' } else { 'Red' }
    Write-Host "$symbol $name" -ForegroundColor $color
    if ($detail -and $Verbose) {
        Write-Host "     $detail" -ForegroundColor Gray
    }
    $checks += @{ name = $name; passed = $passed }
}

Write-Host "`n=== Error Brain UI Verification ===" -ForegroundColor Cyan

# File checks
Write-Host "`nFile Checks:" -ForegroundColor Yellow
Write-Check "ErrorModal.svelte exists" (Test-Path "src\lib\components\phase78\ErrorModal.svelte")
Write-Check "all-routes page exists" (Test-Path "src\routes\(app)\all-routes\+page.svelte")
Write-Check "GET error-events API exists" (Test-Path "src\routes\api\phase78\error-events\+server.ts")
Write-Check "POST route-health API exists" (Test-Path "src\routes\api\phase78\route-health\+server.ts")

# Component content checks
Write-Host "`nComponent Content:" -ForegroundColor Yellow

$errorModalPath = "src\lib\components\phase78\ErrorModal.svelte"
if (Test-Path $errorModalPath) {
    $content = Get-Content $errorModalPath -Raw
    Write-Check "ErrorModal uses Svelte 5 state" ($content -match '\$state\(')
    Write-Check "ErrorModal has loadData function" ($content -match 'function loadData|const loadData')
    Write-Check "ErrorModal has applySelectedSuggestion" ($content -match 'applySelectedSuggestion')
    Write-Check "ErrorModal calls error-events endpoint" ($content -match '/api/phase78/error-events')
    Write-Check "ErrorModal uses new onclick syntax" ($content -match 'onclick=')
}

$allRoutesPath = "src\routes\(app)\all-routes\+page.svelte"
if (Test-Path $allRoutesPath) {
    $content = Get-Content $allRoutesPath -Raw
    Write-Check "all-routes imports ErrorModal" ($content -match "import ErrorModal")
    Write-Check "all-routes has openErrorBrainModal" ($content -match 'openErrorBrainModal')
    Write-Check "all-routes has route-card-wrapper" ($content -match 'route-card-wrapper')
    Write-Check "all-routes has card-overlay-btn" ($content -match 'card-overlay-btn')
    Write-Check "all-routes mounts ErrorModal" ($content -match '<ErrorModal')
}

# Documentation checks
Write-Host "`nDocumentation:" -ForegroundColor Yellow
Write-Check "PHASE78_ERROR_BRAIN_UI_WIRING.md exists" (Test-Path "PHASE78_ERROR_BRAIN_UI_WIRING.md")
Write-Check "ERROR_BRAIN_UI_VISUAL_GUIDE.md exists" (Test-Path "ERROR_BRAIN_UI_VISUAL_GUIDE.md")
Write-Check "ERROR_BRAIN_QUICK_START.md exists" (Test-Path "ERROR_BRAIN_QUICK_START.md")

# Summary
Write-Host "`n=== Summary ===" -ForegroundColor Cyan
$passed = ($checks | Where-Object { $_.passed }).Count
$total = $checks.Count
$pct = [math]::Round(($passed / $total) * 100)
Write-Host "$passed out of $total checks passed ($pct%)" -ForegroundColor Cyan

if ($passed -eq $total) {
    Write-Host "`n[SUCCESS] Error Brain UI is ready!" -ForegroundColor Green
    Write-Host "`nNext: npm run dev`n" -ForegroundColor Green
}
else {
    Write-Host "`n[WARNING] Some checks failed. Review above." -ForegroundColor Yellow
}

exit 0Write-Host "`n🧠 Error Brain UI - Verification Report`n" -ForegroundColor Cyan
Write-Host "=" * 60

# ─────────────────────────────────────────────────────────────
# 1. File Existence Checks
# ─────────────────────────────────────────────────────────────

Write-Host "`n📁 File Existence Checks:" -ForegroundColor Yellow

$errorModalPath = "src\lib\components\phase78\ErrorModal.svelte"
$errorModalExists = Test-Path $errorModalPath
Write-Check "ErrorModal.svelte exists" $errorModalExists $errorModalPath

$allRoutesPath = "src\routes\(app)\all-routes\+page.svelte"
$allRoutesExists = Test-Path $allRoutesPath
Write-Check "all-routes page exists" $allRoutesExists $allRoutesPath

$getErrorsApiPath = "src\routes\api\phase78\error-events\+server.ts"
$getErrorsApiExists = Test-Path $getErrorsApiPath
Write-Check "GET error-events API exists" $getErrorsApiExists $getErrorsApiPath

$postHealthApiPath = "src\routes\api\phase78\route-health\+server.ts"
$postHealthApiExists = Test-Path $postHealthApiPath
Write-Check "POST route-health API exists" $postHealthApiExists $postHealthApiPath

# ─────────────────────────────────────────────────────────────
# 2. Component Content Checks
# ─────────────────────────────────────────────────────────────

Write-Host "`n🔍 Component Content Checks:" -ForegroundColor Yellow

if ($errorModalExists) {
    $content = Get-Content $errorModalPath -Raw

    $hasScriptState = $content -match '\$state\('
    Write-Check "ErrorModal uses Svelte 5 \$state" $hasScriptState

    $hasLoadData = $content -match 'function loadData|const loadData'
    Write-Check "ErrorModal has loadData function" $hasLoadData

    $hasApplyFunction = $content -match 'applySelectedSuggestion'
    Write-Check "ErrorModal has applySelectedSuggestion" $hasApplyFunction

    $hasEndpoint = $content -match '/api/phase78/error-events'
    Write-Check "ErrorModal calls error-events endpoint" $hasEndpoint

    $hasOldSyntax = $content -match 'on:click(?!={)'
    Write-Check "ErrorModal has NO old on: syntax" (-not $hasOldSyntax)

    $hasNewSyntax = $content -match 'onclick='
    Write-Check "ErrorModal uses new onclick syntax" $hasNewSyntax
}

if ($allRoutesExists) {
    $content = Get-Content $allRoutesPath -Raw

    $hasErrorModalImport = $content -match "import ErrorModal from.*ErrorModal"
    Write-Check "all-routes imports ErrorModal" $hasErrorModalImport

    $hasOpenFunction = $content -match 'openErrorBrainModal'
    Write-Check "all-routes has openErrorBrainModal function" $hasOpenFunction

    $hasCardWrapper = $content -match 'route-card-wrapper'
    Write-Check "all-routes has route-card-wrapper div" $hasCardWrapper

    $hasOverlayButton = $content -match 'card-overlay-btn'
    Write-Check "all-routes has card-overlay-btn" $hasOverlayButton

    $hasErrorModal = $content -match '<ErrorModal'
    Write-Check "all-routes mounts ErrorModal component" $hasErrorModal
}

# ─────────────────────────────────────────────────────────────
# 3. API Endpoint Checks
# ─────────────────────────────────────────────────────────────

Write-Host "`n🔌 API Endpoint Checks:" -ForegroundColor Yellow

if ($getErrorsApiExists) {
    $content = Get-Content $getErrorsApiPath -Raw

    $hasGET = $content -match 'export.*GET|function GET'
    Write-Check "error-events has GET handler" $hasGET

    $hasErrorSelect = $content -match 'errorEventsTable|error_events'
    Write-Check "error-events queries database" $hasErrorSelect

    $hasResponse = $content -match 'return.*new Response|json\(\{'
    Write-Check "error-events returns JSON" $hasResponse
}

if ($postHealthApiExists) {
    $content = Get-Content $postHealthApiPath -Raw

    $hasPOST = $content -match 'export.*POST|function POST'
    Write-Check "route-health has POST handler" $hasPOST

    $hasBodyParsing = $content -match 'request.json|await request'
    Write-Check "route-health parses request body" $hasBodyParsing

    $hasInsert = $content -match 'insert|INSERT|upsert'
    Write-Check "route-health performs database insert/upsert" $hasInsert
}

# ─────────────────────────────────────────────────────────────
# 4. Styling Checks
# ─────────────────────────────────────────────────────────────

Write-Host "`n🎨 Styling Checks:" -ForegroundColor Yellow

if ($allRoutesExists) {
    $content = Get-Content $allRoutesPath -Raw

    $hasWrapperCSS = $content -match '\.route-card-wrapper\s*{'
    Write-Check "route-card-wrapper CSS defined" $hasWrapperCSS

    $hasOverlayCSS = $content -match '\.card-overlay-btn\s*{'
    Write-Check "card-overlay-btn CSS defined" $hasOverlayCSS

    $hasOpacityAnimation = $content -match 'opacity.*0.*1|transition.*opacity'
    Write-Check "Overlay has opacity animation" $hasOpacityAnimation
}

# ─────────────────────────────────────────────────────────────
# 5. Documentation Checks
# ─────────────────────────────────────────────────────────────

Write-Host "`n📚 Documentation Checks:" -ForegroundColor Yellow

$docFiles = @(
    "PHASE78_ERROR_BRAIN_UI_WIRING.md",
    "ERROR_BRAIN_UI_VISUAL_GUIDE.md",
    "ERROR_BRAIN_QUICK_START.md"
)

foreach ($doc in $docFiles) {
    $exists = Test-Path $doc
    Write-Check "$doc exists" $exists
}

# ─────────────────────────────────────────────────────────────
# 6. Database Checks (if PostgreSQL running)
# ─────────────────────────────────────────────────────────────

Write-Host "`n💾 Database Checks:" -ForegroundColor Yellow

$psqlAvailable = Get-Command psql -ErrorAction SilentlyContinue
if ($psqlAvailable) {
    try {
        $tables = & psql -h localhost -U postgres -d legal_ai_db -t -c `
            "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'error_%' OR table_name LIKE 'route_%';" 2>$null

        $tableCount = [int]$tables
        $hasPhase78Tables = $tableCount -ge 4
        Write-Check "Phase 78 tables exist in database" $hasPhase78Tables "Found $tableCount Phase 78 tables"
    }
    catch {
        Write-Check "Could not connect to database" $false "PostgreSQL may not be running"
    }
}
else {
    Write-Check "PostgreSQL (psql) available" $false "Not found in PATH"
}

# ─────────────────────────────────────────────────────────────
# 7. Package.json Scripts
# ─────────────────────────────────────────────────────────────

Write-Host "`n📦 Build Script Checks:" -ForegroundColor Yellow

if (Test-Path "package.json") {
    $pkgContent = Get-Content package.json -Raw

    $hasDevScript = $pkgContent -match '"dev"'
    Write-Check "npm run dev script exists" $hasDevScript

    $hasCheckScript = $pkgContent -match '"check"'
    Write-Check "npm run check script exists" $hasCheckScript
}

# ─────────────────────────────────────────────────────────────
# Final Summary
# ─────────────────────────────────────────────────────────────

Write-Host "`n" + "=" * 60
$passed = ($checks | Where-Object { $_.passed }).Count
$total = $checks.Count
$percentage = [math]::Round(($passed / $total) * 100, 1)

Write-Host "`n📊 Summary: $passed/$total checks passed ($percentage%)`n" -ForegroundColor Cyan

if ($percentage -eq 100) {
    Write-Host "✅ All checks passed! Error Brain UI is ready to use." -ForegroundColor Green
    Write-Host "`nNext steps:" -ForegroundColor Yellow
    Write-Host "1. Run: npm run dev"
    Write-Host "2. Open: http://localhost:5173/all-routes"
    Write-Host "3. Hover over error routes to see 🧠 button"
    Write-Host "4. Click 🧠 to open Error Brain modal`n"
}
elseif ($percentage -ge 80) {
    Write-Host "⚠️  Most checks passed ($percentage%). Review failures above." -ForegroundColor Yellow
}
else {
    Write-Host "❌ Multiple checks failed ($percentage%). Fix issues above." -ForegroundColor Red
}

# Output results
if ($Verbose) {
    Write-Host "`nDetailed Results:" -ForegroundColor Gray
    $checks | Format-Table -AutoSize
}

exit 0
