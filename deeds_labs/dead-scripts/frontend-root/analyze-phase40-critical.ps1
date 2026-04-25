# Phase 40: Critical File Analyzer & Fixer
# Analyzes top 1000 files, determines which are actually wired to app, fixes critical errors

$ErrorActionPreference = "Continue"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

Write-Host "🎯 Phase 40: Critical App Wiring Analysis" -ForegroundColor Green
Write-Host "=" * 80 -ForegroundColor Gray

# Step 1: Load error analysis
if (-not (Test-Path "error-analysis-report.json")) {
    Write-Host "❌ Error analysis not found. Run analyze-top-errors.mjs first" -ForegroundColor Red
    exit 1
}

$report = Get-Content "error-analysis-report.json" | ConvertFrom-Json
$top1000 = $report.topFiles

Write-Host "📊 Loaded $($top1000.Count) files from error analysis" -ForegroundColor Cyan

# Step 2: Categorize by app wiring importance
$categories = @{
    Critical = @()      # Routes, hooks, layouts - user-facing
    Important = @()     # Server APIs, DB schemas, auth
    Infrastructure = @() # Services, utilities, components
    Optional = @()      # Tests, demos, archives
}

foreach ($file in $top1000) {
    $path = $file.file
    
    # Critical: Routes and core app files
    if ($path -match '(routes|hooks\.server|app\.html|\+layout|\+page)' -and 
        $path -notmatch '(_archive|test|demo|stories)') {
        $categories.Critical += $file
    }
    # Important: Server infrastructure
    elseif ($path -match '(server|api|db|auth|schema)' -and 
            $path -notmatch '(_archive|test|demo)') {
        $categories.Important += $file
    }
    # Infrastructure: Libraries and services
    elseif ($path -match '(lib|services|components|utils)' -and 
            $path -notmatch '(_archive|test|demo|stories)') {
        $categories.Infrastructure += $file
    }
    # Optional: Everything else
    else {
        $categories.Optional += $file
    }
}

Write-Host "`n📋 File Categories:" -ForegroundColor Yellow
Write-Host "  Critical (routes/hooks):     $($categories.Critical.Count)" -ForegroundColor Red
Write-Host "  Important (server/API):      $($categories.Important.Count)" -ForegroundColor Yellow
Write-Host "  Infrastructure (libs):       $($categories.Infrastructure.Count)" -ForegroundColor Cyan
Write-Host "  Optional (tests/demos):      $($categories.Optional.Count)" -ForegroundColor Gray

# Step 3: Identify files with severe syntax errors (TS1005, TS1128, TS1109)
$criticalErrors = @('TS1005', 'TS1128', 'TS1109', 'TS1434')

$severeFiles = $categories.Critical + $categories.Important | Where-Object {
    $file = $_
    $hasSevere = $false
    foreach ($code in $file.errorCodes) {
        if ($criticalErrors -contains $code) {
            $hasSevere = $true
            break
        }
    }
    $hasSevere
} | Sort-Object -Property priority -Descending | Select-Object -First 50

Write-Host "`n🔴 Top 50 Critical Files Needing Fixes:" -ForegroundColor Red
$severeFiles | ForEach-Object -Begin { $i = 1 } -Process {
    Write-Host "$($i.ToString().PadLeft(2)). $($_.file)" -ForegroundColor White
    Write-Host "    Errors: $($_.errorCount), Codes: $($_.errorCodes -join ', ')" -ForegroundColor Gray
    $i++
}

# Step 4: Export critical files for Phase 40 fixing
$phase40Data = @{
    timestamp = Get-Date -Format 'o'
    categoryCounts = @{
        critical = $categories.Critical.Count
        important = $categories.Important.Count
        infrastructure = $categories.Infrastructure.Count
        optional = $categories.Optional.Count
    }
    severeFiles = $severeFiles | Select-Object -Property file, errorCount, priority, errorCodes
    recommendations = @(
        "Fix Critical category first (routes, hooks, layouts)"
        "Then Important (server APIs, schemas)"
        "Infrastructure can be deferred if not actively used"
        "Optional files can be archived or ignored"
    )
}

$phase40Data | ConvertTo-Json -Depth 10 | Out-File "phase40-critical-files.json"

Write-Host "`n✅ Analysis complete!" -ForegroundColor Green
Write-Host "📁 Saved to: phase40-critical-files.json" -ForegroundColor Cyan

# Step 5: Generate fix recommendations
Write-Host "`n🎯 Phase 40 Recommendations:" -ForegroundColor Yellow
Write-Host "  1. Fix top 50 severe files (routes, APIs)" -ForegroundColor White
Write-Host "  2. Archive/disable unused demo routes" -ForegroundColor White
Write-Host "  3. Replace BullMQ with RabbitMQ (11 files)" -ForegroundColor White
Write-Host "  4. Run 'npm run build' to validate" -ForegroundColor White

Write-Host "`n📊 Next Steps:" -ForegroundColor Cyan
Write-Host "  - Review phase40-critical-files.json" -ForegroundColor White
Write-Host "  - Run Phase 40 AST fixer on top 50 files" -ForegroundColor White
Write-Host "  - Test build after each batch of fixes" -ForegroundColor White
