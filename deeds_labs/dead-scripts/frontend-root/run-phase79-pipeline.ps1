#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Phase 79: Complete Error Analysis & Remediation Pipeline

.DESCRIPTION
    Runs the complete Phase 66-79 error brain:
    1. Capture errors from svelte-check
    2. Parse and normalize to JSONL
    3. Cluster by pattern
    4. Rank by impact score
    5. Apply deterministic auto-fixes
    6. Index to Qdrant (optional)
    7. Generate reports

.PARAMETER Mode
    Pipeline mode:
      - fresh: Run fresh diagnostic
      - autofix: Apply pattern fixes
      - index: Index to Qdrant
      - full: Complete pipeline

.PARAMETER Top
    Number of top files to analyze (default: 1000)

.PARAMETER SkipIndex
    Skip Qdrant indexing step

.EXAMPLE
    .\run-phase79-pipeline.ps1 -Mode fresh -Top 1000
    .\run-phase79-pipeline.ps1 -Mode autofix
    .\run-phase79-pipeline.ps1 -Mode full
#>

param(
    [ValidateSet('fresh', 'autofix', 'index', 'full')]
    [string]$Mode = 'fresh',

    [int]$Top = 1000,

    [switch]$SkipIndex,

    [switch]$Verbose
)

$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot

# ============================================================================
# Configuration
# ============================================================================

$RunId = "phase79-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$ReportsDir = "reports/phase79-$RunId"
$LogsDir = "logs/errors"

Write-Host "`n╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║         Phase 79: Error Brain Pipeline                   ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "Run ID:  $RunId" -ForegroundColor Yellow
Write-Host "Mode:    $Mode" -ForegroundColor Yellow
Write-Host "Top N:   $Top" -ForegroundColor Yellow
Write-Host ""

# ============================================================================
# Step 1: Capture Errors
# ============================================================================

if ($Mode -eq 'fresh' -or $Mode -eq 'full') {
    Write-Host "═══ Step 1: Capture Errors ═══`n" -ForegroundColor Cyan

    # Create reports directory
    New-Item -ItemType Directory -Path $ReportsDir -Force | Out-Null

    Write-Host "Running svelte-check..." -ForegroundColor Yellow
    $captureStart = Get-Date

    # Capture raw output
    $rawOutput = npx svelte-check 2>&1 | Out-String
    $rawOutput | Out-File -FilePath "$ReportsDir/svelte-check-raw.txt"

    # Count errors
    $errorCount = ([regex]::Matches($rawOutput, "Error:")).Count
    $captureElapsed = ((Get-Date) - $captureStart).TotalSeconds

    Write-Host "✅ Captured $errorCount errors ($([math]::Round($captureElapsed, 1))s)`n" -ForegroundColor Green

    # Parse errors to structured format
    Write-Host "Parsing errors to structured format..." -ForegroundColor Yellow
    $errors = @()
    $currentFile = $null
    $currentLine = 0
    $currentColumn = 0

    foreach ($line in $rawOutput -split "`n") {
        # Match file:line:column pattern (supports Windows paths like c:\...)
        if ($line -match '^([a-zA-Z]:[^:]+\.(ts|svelte|js)):(\d+):(\d+)\s*$') {
            $currentFile = $matches[1]
            $currentLine = [int]$matches[3]
            $currentColumn = [int]$matches[4]
            continue
        }

        # Match error message (appears on next line after file path)
        if ($line -match '^Error:\s*(.+?)\s*(\(ts\((\d+)\)\))?\s*$') {
            if ($currentFile) {
                $tsCode = if ($matches[3]) { $matches[3] } else { "unknown" }
                $errors += [PSCustomObject]@{
                    runId = $RunId
                    file = $currentFile
                    line = $currentLine
                    column = $currentColumn
                    code = "ts($tsCode)"
                    message = $matches[1].Trim()
                    tool = "svelte-check"
                    timestamp = (Get-Date).ToString("o")
                }
            }
        }
    }

    Write-Host "✅ Parsed $($errors.Count) structured errors`n" -ForegroundColor Green

    # Save to JSONL
    $jsonlPath = "$LogsDir/$RunId.jsonl"
    New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null

    $errors | ForEach-Object {
        $_ | ConvertTo-Json -Compress
    } | Out-File -FilePath $jsonlPath

    Write-Host "✅ Saved to $jsonlPath`n" -ForegroundColor Green
}

# ============================================================================
# Step 2: Pattern Clustering & Ranking
# ============================================================================

if ($Mode -eq 'fresh' -or $Mode -eq 'full') {
    Write-Host "═══ Step 2: Pattern Clustering & Ranking ═══`n" -ForegroundColor Cyan

    Write-Host "Loading patterns from patterns.json..." -ForegroundColor Yellow
    $patterns = Get-Content "patterns.json" | ConvertFrom-Json

    Write-Host "Clustering errors by pattern..." -ForegroundColor Yellow

    # Group errors by file
    $fileGroups = $errors | Group-Object -Property file

    # Calculate impact scores
    $rankedFiles = @()

    foreach ($group in $fileGroups) {
        $file = $group.Name
        $fileErrors = $group.Group

        # Classify architectural category
        $category = 'other'
        $categoryWeight = 1

        if ($file -match '\+page\.svelte$') {
            $category = 'routes-pages'
            $categoryWeight = 10
        }
        elseif ($file -match '\+server\.ts$') {
            $category = 'routes-server'
            $categoryWeight = 10
        }
        elseif ($file -match 'src/routes/api/.*\+server\.ts$') {
            $category = 'api-endpoints'
            $categoryWeight = 10
        }
        elseif ($file -match 'src/lib/server/db') {
            $category = 'database'
            $categoryWeight = 9
        }
        elseif ($file -match 'lucia|auth') {
            $category = 'auth'
            $categoryWeight = 9
        }
        elseif ($file -match 'src/lib/components') {
            $category = 'components'
            $categoryWeight = 5
        }

        # Classify patterns
        $patternCounts = @{}
        foreach ($error in $fileErrors) {
            $matched = $false
            foreach ($pattern in $patterns.patterns) {
                if ($error.message -match $pattern.regex -or $error.code -match $pattern.regex) {
                    $patternCounts[$pattern.id] = ($patternCounts[$pattern.id] -or 0) + 1
                    $matched = $true
                    break
                }
            }
            if (-not $matched) {
                $patternCounts['unknown'] = ($patternCounts['unknown'] -or 0) + 1
            }
        }

        # Calculate impact score
        $cascadeMultiplier = if ($category -in @('routes-pages', 'api-endpoints')) { 1.5 } else { 1.0 }
        $impactScore = [math]::Round($fileErrors.Count * $categoryWeight * $cascadeMultiplier)

        $rankedFiles += [PSCustomObject]@{
            file = $file
            errorCount = $fileErrors.Count
            category = $category
            categoryWeight = $categoryWeight
            impactScore = $impactScore
            patterns = $patternCounts
            priority = if ($impactScore -gt 100) { 'P0' } elseif ($impactScore -gt 50) { 'P1' } else { 'P2' }
        }
    }

    # Sort by impact score
    $rankedFiles = $rankedFiles | Sort-Object -Property impactScore -Descending

    Write-Host "✅ Ranked $($rankedFiles.Count) files by impact`n" -ForegroundColor Green

    # Generate leaderboard markdown
    $markdown = @"
# Phase 79: Error Leaderboard

**Run ID:** $RunId
**Generated:** $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
**Total Errors:** $($errors.Count)
**Affected Files:** $($rankedFiles.Count)
**Top N:** $Top

---

## 📊 By Architecture Component

$(
    $rankedFiles | Group-Object -Property category | Sort-Object -Property Count -Descending | ForEach-Object {
        $totalErrors = ($_.Group | Measure-Object -Property errorCount -Sum).Sum
        "- **$($_.Name)**: $totalErrors errors ($($_.Count) files)"
    }
)

---

## 🎯 Top $([math]::Min($Top, $rankedFiles.Count)) Files by Impact Score

| Rank | File | Errors | Category | Weight | Impact | Priority |
|------|------|--------|----------|--------|--------|----------|
$(
    for ($i = 0; $i -lt [math]::Min($Top, $rankedFiles.Count); $i++) {
        $item = $rankedFiles[$i]
        $shortPath = $item.file -replace '^src/', ''
        "| $($i + 1) | ``$shortPath`` | $($item.errorCount) | $($item.category) | $($item.categoryWeight) | $($item.impactScore) | **$($item.priority)** |"
    }
)

---

## 🔧 Fix Recommendations

### P0 (Critical - Impact > 100)

$(
    $p0Files = $rankedFiles | Where-Object { $_.impactScore -gt 100 } | Select-Object -First 10
    $p0Files | ForEach-Object {
        $shortPath = $_.file -replace '^src/', ''
        "- [ ] ``$shortPath`` ($($_.errorCount) errors, score: $($_.impactScore))"
    }
)

### P1 (High - Impact 50-100)

$(
    $p1Files = $rankedFiles | Where-Object { $_.impactScore -gt 50 -and $_.impactScore -le 100 } | Select-Object -First 10
    $p1Files | ForEach-Object {
        $shortPath = $_.file -replace '^src/', ''
        "- [ ] ``$shortPath`` ($($_.errorCount) errors, score: $($_.impactScore))"
    }
)

---

## 💡 Next Steps

1. Apply deterministic auto-fixes: ``node scripts/phase79-pattern-fixer.mjs --apply``
2. Index to Qdrant: ``node scripts/error-index-qdrant.mjs --run $RunId``
3. Semantic search: ``node scripts/error-search.mjs --query "high impact errors"``
4. ACE contextual prompting: ``node scripts/phase76-ace-prompt-engineer.mjs --task "Fix P0 files"``
"@

    $markdown | Out-File -FilePath "$ReportsDir/leaderboard.md"
    Write-Host "✅ Leaderboard saved to $ReportsDir/leaderboard.md`n" -ForegroundColor Green

    # Print top 10
    Write-Host "📊 TOP 10 FILES BY IMPACT`n" -ForegroundColor Cyan
    for ($i = 0; $i -lt [math]::Min(10, $rankedFiles.Count); $i++) {
        $item = $rankedFiles[$i]
        $shortPath = $item.file -replace '^src/', ''
        Write-Host "$($i + 1). $shortPath" -ForegroundColor White
        Write-Host "   Errors: $($item.errorCount) | Impact: $($item.impactScore) | Priority: $($item.priority)`n" -ForegroundColor Gray
    }
}

# ============================================================================
# Step 3: Apply Auto-Fixes
# ============================================================================

if ($Mode -eq 'autofix' -or $Mode -eq 'full') {
    Write-Host "═══ Step 3: Apply Deterministic Auto-Fixes ═══`n" -ForegroundColor Cyan

    Write-Host "Running pattern fixer..." -ForegroundColor Yellow
    node scripts/phase79-pattern-fixer.mjs --apply

    Write-Host "`n✅ Auto-fix complete`n" -ForegroundColor Green
}

# ============================================================================
# Step 4: Index to Qdrant
# ============================================================================

if (($Mode -eq 'index' -or $Mode -eq 'full') -and -not $SkipIndex) {
    Write-Host "═══ Step 4: Index to Qdrant ═══`n" -ForegroundColor Cyan

    # Check if Qdrant is running
    try {
        $qdrantStatus = Invoke-RestMethod -Uri "http://localhost:6333/collections" -TimeoutSec 5
        Write-Host "✅ Qdrant is running`n" -ForegroundColor Green

        Write-Host "Indexing errors to Qdrant..." -ForegroundColor Yellow
        node scripts/error-index-qdrant.mjs --run $RunId --batch 50

        Write-Host "`n✅ Indexing complete`n" -ForegroundColor Green
    }
    catch {
        Write-Host "⚠️  Qdrant not running, skipping indexing" -ForegroundColor Yellow
        Write-Host "   Start Qdrant: docker start qdrant`n" -ForegroundColor Gray
    }
}

# ============================================================================
# Summary
# ============================================================================

Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║              PHASE 79 PIPELINE COMPLETE                  ║" -ForegroundColor Green
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "Run ID: $RunId" -ForegroundColor Yellow
Write-Host "Reports: $ReportsDir/" -ForegroundColor Yellow
Write-Host ""

if ($Mode -eq 'fresh' -or $Mode -eq 'full') {
    Write-Host "📊 Statistics:" -ForegroundColor Cyan
    Write-Host "   Total Errors: $($errors.Count)" -ForegroundColor White
    Write-Host "   Affected Files: $($rankedFiles.Count)" -ForegroundColor White

    $p0Count = ($rankedFiles | Where-Object { $_.impactScore -gt 100 }).Count
    $p1Count = ($rankedFiles | Where-Object { $_.impactScore -gt 50 -and $_.impactScore -le 100 }).Count
    $p2Count = ($rankedFiles | Where-Object { $_.impactScore -le 50 }).Count

    Write-Host "   P0 Files: $p0Count" -ForegroundColor Red
    Write-Host "   P1 Files: $p1Count" -ForegroundColor Yellow
    Write-Host "   P2 Files: $p2Count" -ForegroundColor Green
    Write-Host ""
}

Write-Host "💡 Next Commands:" -ForegroundColor Cyan
Write-Host "   View leaderboard:  cat $ReportsDir/leaderboard.md" -ForegroundColor White
Write-Host "   Search errors:     node scripts/error-search.mjs --query 'database errors' --top 10" -ForegroundColor White
Write-Host "   ACE analysis:      node scripts/phase76-ace-prompt-engineer.mjs --task 'Fix P0 files'" -ForegroundColor White
Write-Host ""
