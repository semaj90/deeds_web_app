#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Phase 34D Integration - Automated AST repair workflow
.DESCRIPTION
    Integrates Phase 34D AI-assisted AST pattern repair with existing phase repair system
.NOTES
    Generated: 2025-11-03
    Phase: 34D - AI-Assisted AST Repair Integration
#>

param(
    [switch]$SkipInstall,
    [switch]$QuickScan,
    [switch]$FullReport,
    [switch]$AutoFix
)

$ErrorActionPreference = "Stop"
$root = "C:\Users\james\Videos\deeds-web-app\sveltekit-frontend"
Push-Location $root

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "   Phase 34D: AI-Assisted AST Repair" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Cyan

# Step 1: Verify dependencies
Write-Host "🔍 Step 1: Checking dependencies..." -ForegroundColor Yellow
$requiredPackages = @(
    "node_modules/@babel/core",
    "node_modules/@babel/parser",
    "node_modules/@babel/traverse",
    "node_modules/@babel/types",
    "node_modules/ts-morph",
    "node_modules/recast"
)

$allPresent = $true
foreach ($pkg in $requiredPackages) {
    if (!(Test-Path $pkg)) {
        $allPresent = $false
        $pkgName = $pkg -replace "node_modules/", ""
        Write-Host "  ✗ Missing: $pkgName" -ForegroundColor Red
    }
}

if (!$allPresent -and !$SkipInstall) {
    Write-Host "`n📦 Installing missing dependencies..." -ForegroundColor Yellow
    npm install --save-dev @babel/core @babel/parser @babel/traverse @babel/types ts-morph recast
    Write-Host "  ✓ Dependencies installed" -ForegroundColor Green
} elseif ($allPresent) {
    Write-Host "  ✓ All dependencies present" -ForegroundColor Green
}

# Step 2: Check Ollama status
Write-Host "`n🤖 Step 2: Checking AI integration..." -ForegroundColor Yellow
try {
    $ollamaResponse = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -Method GET -TimeoutSec 3 -ErrorAction Stop
    $modelCount = $ollamaResponse.models.Count
    Write-Host "  ✓ Ollama running ($modelCount models available)" -ForegroundColor Green
    
    # Check for Gemma3
    $hasGemma = $ollamaResponse.models | Where-Object { $_.name -like "*gemma*" }
    if ($hasGemma) {
        Write-Host "  ✓ Gemma3 model available for AI suggestions" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ Gemma3 not found (AI suggestions disabled)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ⚠ Ollama not running (pattern detection only)" -ForegroundColor Yellow
}

# Step 3: Run analysis
Write-Host "`n🔬 Step 3: Running AST pattern analysis..." -ForegroundColor Yellow
$analysisStart = Get-Date

try {
    $analysisOutput = node --max-old-space-size=8192 scripts/fix-phase34d-ai-patterns.mjs 2>&1
    $analysisEnd = Get-Date
    $duration = ($analysisEnd - $analysisStart).TotalSeconds
    
    Write-Host "  ✓ Analysis complete in $([math]::Round($duration, 2))s" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Analysis failed: $_" -ForegroundColor Red
    Pop-Location
    exit 1
}

# Step 4: Parse results
Write-Host "`n📊 Step 4: Parsing results..." -ForegroundColor Yellow

if (!(Test-Path "phase34d-ai-report.log")) {
    Write-Host "  ✗ Report not generated" -ForegroundColor Red
    Pop-Location
    exit 1
}

$reportLines = Get-Content "phase34d-ai-report.log"
$totalIssues = ($reportLines | Measure-Object -Line).Lines
$shorthandPatterns = ($reportLines | Select-String "SHORTHAND_PROPERTY" | Measure-Object).Count
$parseErrors = ($reportLines | Select-String "PARSE_ERROR" | Measure-Object).Count
$traverseErrors = ($reportLines | Select-String "TRAVERSE_ERROR" | Measure-Object).Count

Write-Host "  Total entries: $totalIssues" -ForegroundColor White
Write-Host "  Actionable patterns: $shorthandPatterns" -ForegroundColor Cyan
Write-Host "  Parse errors (existing): $parseErrors" -ForegroundColor DarkGray
Write-Host "  Traverse errors: $traverseErrors" -ForegroundColor DarkGray

# Step 5: Generate integration report
Write-Host "`n📝 Step 5: Generating integration report..." -ForegroundColor Yellow

$integrationReport = @"
# Phase 34D Integration Report
Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Duration: $([math]::Round($duration, 2))s

## Summary
- Total entries: $totalIssues
- Actionable patterns: $shorthandPatterns
- Parse errors: $parseErrors
- Traverse errors: $traverseErrors

## Top Priority Files
"@

# Extract top files with most patterns
$topFiles = $reportLines | 
    Select-String "SHORTHAND_PROPERTY" | 
    ForEach-Object { ($_ -split ":")[0] } |
    Group-Object |
    Sort-Object Count -Descending |
    Select-Object -First 10

foreach ($file in $topFiles) {
    $integrationReport += "`n- $($file.Name) ($($file.Count) patterns)"
}

$integrationReport += @"

## Integration with Existing Phases
- Phase 30: TypeScript syntax fixes ✓
- Phase 34: Semantic pattern repair ✓
- Phase 34D: AST-based pattern detection ✓ (NEW)
- Phase 40: Production readiness validation (pending)

## Next Steps
1. Review phase34d-ai-report.log for actionable patterns
2. Apply fixes to high-priority files (10+ patterns)
3. Run TypeScript validation: npx tsc --noEmit
4. Integrate fixes with Phase 40 validation

## Files Generated
- phase34d-ai-report.log (detailed analysis)
- phase34d-integration-report.md (this file)
- phase34d-run.log (execution log)
"@

Set-Content "phase34d-integration-report.md" $integrationReport -Encoding UTF8
Write-Host "  ✓ Integration report: phase34d-integration-report.md" -ForegroundColor Green

# Step 6: Display top priority files
if ($FullReport) {
    Write-Host "`n🎯 Step 6: Top priority files to review:" -ForegroundColor Yellow
    $topFiles | Select-Object -First 5 | ForEach-Object {
        Write-Host "  📄 $($_.Name)" -ForegroundColor Cyan
        Write-Host "     Patterns: $($_.Count)" -ForegroundColor White
    }
}

# Step 7: Check for critical errors
Write-Host "`n🔍 Step 7: Error checking..." -ForegroundColor Yellow
$criticalErrors = $reportLines | Select-String "MISSING_VALUE"
if ($criticalErrors.Count -gt 0) {
    Write-Host "  ⚠ Found $($criticalErrors.Count) critical missing value errors" -ForegroundColor Yellow
} else {
    Write-Host "  ✓ No critical errors found" -ForegroundColor Green
}

# Step 8: Integration complete
Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "   ✅ Phase 34D Integration Complete!" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Green

Write-Host "📊 Results:" -ForegroundColor Cyan
Write-Host "  • Actionable patterns: $shorthandPatterns" -ForegroundColor White
Write-Host "  • Analysis time: $([math]::Round($duration, 2))s" -ForegroundColor White
Write-Host "  • Report: phase34d-ai-report.log" -ForegroundColor White
Write-Host "  • Integration: phase34d-integration-report.md`n" -ForegroundColor White

Write-Host "🚀 Next steps:" -ForegroundColor Cyan
Write-Host "  1. Review: code phase34d-ai-report.log" -ForegroundColor Yellow
Write-Host "  2. View integration: code phase34d-integration-report.md" -ForegroundColor Yellow
Write-Host "  3. Apply fixes to top priority files" -ForegroundColor Yellow
Write-Host "  4. Validate: npx tsc --noEmit`n" -ForegroundColor Yellow

Pop-Location
