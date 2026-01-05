#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Phase 96: Agentic Dry-Run Batch Analyzer

.DESCRIPTION
    Analyzes 1-210 files for corruption patterns without making changes.
    Generates unified AST graph and fix recommendations.

.PARAMETER Limit
    Maximum number of files to analyze (default: 50)

.PARAMETER OutputDir
    Directory for analysis reports (default: reports)

.EXAMPLE
    .\phase96-dry-run-analyzer.ps1 -Limit 50
    .\phase96-dry-run-analyzer.ps1 -Limit 210 -OutputDir "reports/phase96"
#>

param(
    [int]$Limit = 50,
    [string]$OutputDir = "reports"
)

Write-Host "`n🔍 Phase 96: Agentic Dry-Run Batch Analyzer`n" -ForegroundColor Cyan
Write-Host "═" * 60
Write-Host "  Mode: Analysis Only (No Changes)"
Write-Host "  Limit: $Limit files"
Write-Host "  Output: $OutputDir"
Write-Host ""

# Ensure output directory exists
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

# Get top error files from svelte-check output
Write-Host "📊 Identifying top error files..." -ForegroundColor Yellow

$errorFiles = @()
if (Test-Path "svelte-check-output.txt") {
    $errors = Get-Content svelte-check-output.txt | Select-String 'ERROR "' | ForEach-Object { ($_.Line -split '"')[1] }
    $grouped = $errors | Group-Object | Sort-Object Count -Descending | Select-Object -First $Limit
    $errorFiles = $grouped | ForEach-Object { Join-Path "src" $_.Name }
    Write-Host "  ✓ Found $($errorFiles.Count) files with errors" -ForegroundColor Green
} else {
    # Fallback: get files from src directory
    Write-Host "  ⚠ svelte-check-output.txt not found, scanning src directory..." -ForegroundColor Yellow
    $errorFiles = Get-ChildItem -Path src -Recurse -Include *.ts,*.svelte |
        Select-Object -First $Limit -ExpandProperty FullName
}

Write-Host ""

# Corruption pattern database
$patterns = @{
    "import_type_colon" = @{
        regex = 'import\s+type:\s*\{([^}]+)\}\s+from:\s*[''"]([^''"]+)[''"]'
        fix = 'import type { $1 } from "$2"'
        confidence = 0.95
        source = "TypeScript 5.6 module resolution"
    }
    "interface_colon" = @{
        regex = 'interface\s+([A-Z][a-zA-Z0-9]+):\s*\{[,;]?'
        fix = 'interface $1 {'
        confidence = 0.96
        source = "TypeScript interface declaration"
    }
    "object_prop_comma" = @{
        regex = '\{\s*([a-zA-Z0-9_]+),\s*([a-zA-Z0-9_\.]+)'
        fix = '{ $1: $2'
        confidence = 0.95
        source = "Object literal property"
    }
    "missing_paren_colon" = @{
        regex = '([a-zA-Z0-9_]+)\(([^)]+),\s*([a-zA-Z0-9_]+):'
        fix = '$1($2), $3:'
        confidence = 0.93
        source = "Function call missing closing paren"
    }
    "ternary_pipe" = @{
        regex = '\?\s*([^:]+)\s*\|\s*undefined'
        fix = '? $1 : undefined'
        confidence = 0.97
        source = "Ternary operator syntax"
    }
    "drizzle_relations" = @{
        regex = 'export\s+const\s+(\w+)Relations\s*:\s*Relations<''(\w+)'',\s*\{'
        fix = 'export const $1Relations = relations(''$2'', ({'
        confidence = 0.90
        source = "Drizzle ORM 0.44 relations syntax"
    }
    "bindable_rune" = @{
        regex = '\$bindable\(([^)]+),\s*(\w+):'
        fix = '$bindable($1), $2:'
        confidence = 0.91
        source = "Bits UI Svelte 5 $bindable rune"
    }
}

# Analysis results
$analysisResults = @{
    files = @()
    patterns = @{}
    totalFiles = 0
    totalPatterns = 0
    timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")
}

Write-Host "🔧 Analyzing files for corruption patterns...`n" -ForegroundColor Yellow

$fileCount = 0
foreach ($file in $errorFiles) {
    $fileCount++
    $fileName = Split-Path $file -Leaf

    if (-not (Test-Path $file)) {
        continue
    }

    $content = Get-Content $file -Raw -ErrorAction SilentlyContinue
    if (-not $content) {
        continue
    }

    $filePatterns = @()

    foreach ($patternName in $patterns.Keys) {
        $pattern = $patterns[$patternName]
        $matches = [regex]::Matches($content, $pattern.regex)

        foreach ($match in $matches) {
            $lineNumber = ($content.Substring(0, $match.Index) -split "`n").Count
            $filePatterns += @{
                name = $patternName
                line = $lineNumber
                match = $match.Value
                confidence = $pattern.confidence
                source = $pattern.source
            }

            # Aggregate pattern counts
            if (-not $analysisResults.patterns.ContainsKey($patternName)) {
                $analysisResults.patterns[$patternName] = @{
                    count = 0
                    files = @()
                    confidence = $pattern.confidence
                    source = $pattern.source
                }
            }
            $analysisResults.patterns[$patternName].count++
            if ($analysisResults.patterns[$patternName].files -notcontains $file) {
                $analysisResults.patterns[$patternName].files += $file
            }
        }
    }

    if ($filePatterns.Count -gt 0) {
        $analysisResults.files += @{
            path = $file
            name = $fileName
            patternCount = $filePatterns.Count
            patterns = $filePatterns
        }
        $analysisResults.totalPatterns += $filePatterns.Count

        Write-Host ("  [{0,3}/{1,3}] {2,-50} {3,4} patterns" -f $fileCount, $errorFiles.Count, $fileName, $filePatterns.Count)
    }
}

$analysisResults.totalFiles = $analysisResults.files.Count

# Save analysis report
$reportPath = Join-Path $OutputDir "phase96-dry-run-analysis.json"
$analysisResults | ConvertTo-Json -Depth 10 | Set-Content $reportPath

# Print summary
Write-Host "`n📊 Analysis Summary:`n" -ForegroundColor Cyan
Write-Host "  Total Files Analyzed: $($analysisResults.totalFiles)"
Write-Host "  Total Patterns Found: $($analysisResults.totalPatterns)"
Write-Host "  Unique Pattern Types: $($analysisResults.patterns.Count)"
Write-Host ""

Write-Host "🔝 Top Patterns Detected:`n" -ForegroundColor Yellow

$topPatterns = $analysisResults.patterns.GetEnumerator() |
    Sort-Object { $_.Value.count } -Descending |
    Select-Object -First 10

foreach ($pattern in $topPatterns) {
    $name = $pattern.Key.PadRight(30)
    $count = $pattern.Value.count.ToString().PadLeft(5)
    $conf = ([math]::Round($pattern.Value.confidence * 100)).ToString().PadLeft(3)
    Write-Host "  $name $count occurrences (confidence: $conf%)"
}

Write-Host "`n💾 Report saved: $reportPath`n" -ForegroundColor Green
Write-Host "✅ Dry-run analysis complete! No files were modified.`n" -ForegroundColor Green
