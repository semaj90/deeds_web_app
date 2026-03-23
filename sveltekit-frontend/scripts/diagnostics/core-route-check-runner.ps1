# Core Route Svelte-Check Runner
# Run svelte-check on core routes only to avoid overwhelming errors

param(
    [string]$RoutesFile = "core-routes.txt",
    [string]$TsConfig = "./tsconfig.check.json",
    [switch]$Verbose
)

$report = @()
$startTime = Get-Date

Write-Host "🚀 Starting Core Route Svelte-Check Runner" -ForegroundColor Cyan
Write-Host "📋 Routes file: $RoutesFile" -ForegroundColor Gray
Write-Host "⚙️  TSConfig: $TsConfig" -ForegroundColor Gray
Write-Host ""

if (!(Test-Path $RoutesFile)) {
    Write-Host "❌ Routes file not found: $RoutesFile" -ForegroundColor Red
    exit 1
}

$routes = Get-Content $RoutesFile | Where-Object { $_ -and $_.Trim() } | Sort-Object -Unique

if ($routes.Count -eq 0) {
    Write-Host "❌ No routes found in $RoutesFile" -ForegroundColor Red
    exit 1
}

Write-Host "📋 Found $($routes.Count) core routes:" -ForegroundColor Yellow
$routes | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }
Write-Host ""

$totalPassed = 0
$totalFailed = 0

foreach ($route in $routes) {
    Write-Host "=== CHECK ROUTE: $route ===" -ForegroundColor Magenta

    # Try different possible folder structures
    $candidates = @(
        "src\routes\(app)\$route",
        "src\routes\$route",
        "src\routes\(app)\$route\+page.svelte",
        "src\routes\$route\+page.svelte"
    )

    $target = $null
    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            $target = $candidate
            break
        }
    }

    if (!$target) {
        Write-Host "SKIP (no match): $route" -ForegroundColor Yellow
        $report += [PSCustomObject]@{
            Route = $route
            Status = "Skipped"
            Target = "Not found"
            Errors = 0
            Duration = 0
        }
        continue
    }

    Write-Host "🎯 Target: $target" -ForegroundColor Blue

    # Create temporary tsconfig for this specific route
    $tempTsConfig = "tsconfig-route-check.json"

    # Get all files in the target directory
    $targetFiles = Get-ChildItem -Path $target -Recurse -File | Where-Object {
        $_.Extension -in @('.ts', '.tsx', '.js', '.jsx', '.svelte', '.d.ts')
    } | ForEach-Object {
        $_.FullName -replace [regex]::Escape((Get-Location).Path + '\'), '' -replace '\\', '/'
    }

    if ($targetFiles.Count -eq 0) {
        Write-Host "SKIP (no TypeScript/Svelte files): $route" -ForegroundColor Yellow
        $report += [PSCustomObject]@{
            Route = $route
            Status = "Skipped"
            Target = $target
            Errors = 0
            Duration = 0
        }
        continue
    }

    $includePaths = $targetFiles | ForEach-Object { "`"$_`"" } | Join-String -Separator ",`n    "
    $routeConfig = @"
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "skipLibCheck": true,
    "checkJs": false,
    "isolatedModules": true
  },
  "include": [
    $includePaths
  ],
  "exclude": [
    "node_modules/**",
    ".svelte-kit/**",
    "dist/**",
    "build/**"
  ]
}
"@
    $routeConfig | Out-File -FilePath $tempTsConfig -Encoding UTF8

    $routeStart = Get-Date
    $output = & npx svelte-check --tsconfig $tempTsConfig 2>&1
    $duration = [math]::Round(((Get-Date) - $routeStart).TotalSeconds, 2)

    # Clean up temp config
    Remove-Item $tempTsConfig -ErrorAction SilentlyContinue

    # Parse output for errors
    $errorLines = $output | Where-Object { $_ -match 'error|Error' }
    $errorCount = $errorLines.Count

    if ($errorCount -eq 0) {
        Write-Host "✅ PASSED (0 errors, ${duration}s)" -ForegroundColor Green
        $totalPassed++
        $status = "Passed"
    } else {
        Write-Host "❌ FAILED ($errorCount errors, ${duration}s)" -ForegroundColor Red
        $totalFailed++
        $status = "Failed"
        if ($Verbose) {
            Write-Host "Errors:" -ForegroundColor Red
            $errorLines | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
        }
    }

    $report += [PSCustomObject]@{
        Route = $route
        Status = $status
        Target = $target
        Errors = $errorCount
        Duration = $duration
    }

    Write-Host ""
}

# Generate summary
$totalTime = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 2)
$successRate = [math]::Round(($totalPassed / ($totalPassed + $totalFailed)) * 100, 1)

Write-Host "📊 SUMMARY" -ForegroundColor Cyan
Write-Host "Total routes checked: $($routes.Count)" -ForegroundColor White
Write-Host "Passed: $totalPassed" -ForegroundColor Green
Write-Host "Failed: $totalFailed" -ForegroundColor Red
Write-Host "Success rate: ${successRate}%" -ForegroundColor $(if ($successRate -ge 80) { "Green" } elseif ($successRate -ge 60) { "Yellow" } else { "Red" })
Write-Host "Total time: ${totalTime}s" -ForegroundColor White
Write-Host ""

# Export detailed report
$reportFile = "core-route-check-report-$(Get-Date -Format 'yyyyMMdd-HHmmss').md"
$markdown = @"
# Core Route Svelte-Check Report

**Generated:** $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
**Routes checked:** $($routes.Count)
**Passed:** $totalPassed
**Failed:** $totalFailed
**Success rate:** ${successRate}%
**Total time:** ${totalTime}s

## Route Details

| Route | Status | Target | Errors | Duration (s) |
|-------|--------|--------|--------|--------------|
$($report | ForEach-Object { "| $($_.Route) | $($_.Status) | $($_.Target) | $($_.Errors) | $($_.Duration) |" } | Join-String -Separator "`n")

## Recommendations

$(if ($totalFailed -eq 0) {
    "✅ All core routes passed svelte-check validation!"
} else {
    "⚠️  $($totalFailed) routes have errors. Focus on fixing these before expanding checks."
    if ($successRate -lt 50) {
        "`n🔴 Critical: Less than 50% success rate. Major structural issues detected."
    } elseif ($successRate -lt 80) {
        "`n🟡 Warning: Less than 80% success rate. Significant issues remain."
    }
})
"@

$markdown | Out-File -FilePath $reportFile -Encoding UTF8
Write-Host "📄 Detailed report saved to: $reportFile" -ForegroundColor Cyan