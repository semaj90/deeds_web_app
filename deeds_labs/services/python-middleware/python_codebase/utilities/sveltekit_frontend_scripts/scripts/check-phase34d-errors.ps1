#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Phase 34D Error Checker - Validates AST analysis results
.DESCRIPTION
    Checks Phase 34D output for errors and integrates with existing error tracking
#>

param(
    [string]$ReportFile = "phase34d-ai-report.log",
    [switch]$Verbose,
    [switch]$ExportJson
)

$ErrorActionPreference = "Stop"
$root = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend"
Push-Location $root

Write-Host "🔍 Phase 34D Error Checker" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor DarkGray

if (!(Test-Path $ReportFile)) {
    Write-Host "✗ Report file not found: $ReportFile" -ForegroundColor Red
    Write-Host "  Run: node scripts/fix-phase34d-ai-patterns.mjs" -ForegroundColor Yellow
    Pop-Location
    exit 1
}

# Parse report
$reportLines = Get-Content $ReportFile
$errors = @{
    ParseErrors = @()
    TraverseErrors = @()
    ShorthandPatterns = @()
    MissingValues = @()
}

foreach ($line in $reportLines) {
    if ($line -match "PARSE_ERROR") {
        $errors.ParseErrors += $line
    } elseif ($line -match "TRAVERSE_ERROR") {
        $errors.TraverseErrors += $line
    } elseif ($line -match "SHORTHAND_PROPERTY") {
        $errors.ShorthandPatterns += $line
    } elseif ($line -match "MISSING_VALUE") {
        $errors.MissingValues += $line
    }
}

# Display summary
Write-Host "📊 Error Summary:" -ForegroundColor Cyan
Write-Host "  Parse errors:       $($errors.ParseErrors.Count)" -ForegroundColor $(if ($errors.ParseErrors.Count -gt 100) { "Yellow" } else { "White" })
Write-Host "  Traverse errors:    $($errors.TraverseErrors.Count)" -ForegroundColor $(if ($errors.TraverseErrors.Count -gt 0) { "Yellow" } else { "White" })
Write-Host "  Shorthand patterns: $($errors.ShorthandPatterns.Count)" -ForegroundColor Cyan
Write-Host "  Missing values:     $($errors.MissingValues.Count)" -ForegroundColor $(if ($errors.MissingValues.Count -gt 0) { "Red" } else { "Green" })

# Critical errors check
Write-Host "`n🚨 Critical Issues:" -ForegroundColor Yellow
$hasCritical = $false

if ($errors.MissingValues.Count -gt 0) {
    Write-Host "  ✗ $($errors.MissingValues.Count) missing value errors (CRITICAL)" -ForegroundColor Red
    $hasCritical = $true
    if ($Verbose) {
        $errors.MissingValues | Select-Object -First 5 | ForEach-Object {
            Write-Host "    $_" -ForegroundColor DarkRed
        }
    }
}

if ($errors.TraverseErrors.Count -gt 10) {
    Write-Host "  ⚠ $($errors.TraverseErrors.Count) traverse errors (WARNING)" -ForegroundColor Yellow
    $hasCritical = $true
}

if (!$hasCritical) {
    Write-Host "  ✓ No critical issues found" -ForegroundColor Green
}

# Actionable patterns
Write-Host "`n💡 Actionable Patterns:" -ForegroundColor Cyan
if ($errors.ShorthandPatterns.Count -gt 0) {
    Write-Host "  Found $($errors.ShorthandPatterns.Count) shorthand property patterns to review" -ForegroundColor White
    
    # Group by file
    $byFile = @{}
    foreach ($pattern in $errors.ShorthandPatterns) {
        $file = ($pattern -split ":")[0]
        if (!$byFile.ContainsKey($file)) {
            $byFile[$file] = 0
        }
        $byFile[$file]++
    }
    
    Write-Host "`n  Top files by pattern count:" -ForegroundColor Yellow
    $byFile.GetEnumerator() | 
        Sort-Object Value -Descending | 
        Select-Object -First 10 | 
        ForEach-Object {
            $fileName = Split-Path $_.Key -Leaf
            Write-Host "    $($_.Value) patterns - $fileName" -ForegroundColor White
        }
} else {
    Write-Host "  ✓ No patterns found - code structure is clean!" -ForegroundColor Green
}

# Integration with existing phase errors
Write-Host "`n🔗 Integration with Existing Phases:" -ForegroundColor Cyan

# Check for tsc errors
if (Test-Path "tsc-current.log") {
    $tscErrors = (Get-Content "tsc-current.log" | Measure-Object -Line).Lines
    Write-Host "  TypeScript errors: $tscErrors" -ForegroundColor White
}

# Check for svelte-check errors
if (Test-Path "svelte-check-current.log") {
    $svelteErrors = (Get-Content "svelte-check-current.log" | Select-String "Error:" | Measure-Object).Count
    Write-Host "  Svelte check errors: $svelteErrors" -ForegroundColor White
}

# Export to JSON if requested
if ($ExportJson) {
    $jsonOutput = @{
        timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ss"
        phase = "34D"
        summary = @{
            parseErrors = $errors.ParseErrors.Count
            traverseErrors = $errors.TraverseErrors.Count
            shorthandPatterns = $errors.ShorthandPatterns.Count
            missingValues = $errors.MissingValues.Count
        }
        topFiles = ($byFile.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 10 | ForEach-Object { @{ file = $_.Key; count = $_.Value } })
        hasCritical = $hasCritical
    } | ConvertTo-Json -Depth 3
    
    Set-Content "phase34d-error-check.json" $jsonOutput -Encoding UTF8
    Write-Host "`n📄 Exported to: phase34d-error-check.json" -ForegroundColor Green
}

# Final status
Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
if ($hasCritical) {
    Write-Host "   ⚠ Review Required: Critical issues found" -ForegroundColor Yellow
    Pop-Location
    exit 1
} else {
    Write-Host "   ✅ Error Check Complete: No critical issues" -ForegroundColor Green
    Pop-Location
    exit 0
}
