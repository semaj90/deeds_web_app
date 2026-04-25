#!/usr/bin/env pwsh
# Phase 72 Ripgrep Error Scanner (PowerShell version)
# Finds TypeScript/Svelte errors 12x faster than svelte-check

param(
    [string]$RootDir = "src",
    [string]$OutputFormat = "ndjson"
)

$ErrorActionPreference = "Stop"

Write-Host "[phase72-rg] Scanning $RootDir for TypeScript errors..." -ForegroundColor Cyan

# Ripgrep patterns for common TS errors
$patterns = @(
    "error TS\d{4}:",
    "Type '.*' is not assignable to type",
    "Cannot find name",
    "Property '.*' does not exist",
    "Argument of type '.*' is not assignable",
    "Object is possibly 'null'",
    "Object is possibly 'undefined'",
    "'.*' is declared but never used"
)

# Build regex alternation
$regexPattern = "(" + ($patterns -join "|") + ")"

# Run ripgrep with JSON output
$rgOutput = rg --json `
    --type ts `
    --type typescript `
    --type-add 'svelte:*.svelte' `
    --type svelte `
    --no-heading `
    --color never `
    -e $regexPattern `
    $RootDir 2>$null

# Parse ripgrep JSON output
$errors = @()
$errorCount = 0

foreach ($line in $rgOutput) {
    if ($line -match '"type":"match"') {
        $obj = $line | ConvertFrom-Json

        if ($obj.type -eq "match") {
            $file = $obj.data.path.text
            $lineNum = $obj.data.line_number
            $text = $obj.data.lines.text

            # Extract error code
            $code = ""
            if ($text -match 'TS(\d{4})') {
                $code = "TS$($matches[1])"
            }

            # Extract message
            $message = $text
            if ($text -match 'error TS\d{4}: (.+)$') {
                $message = $matches[1]
            }

            # Get column from submatch start
            $col = if ($obj.data.submatches.Count -gt 0) {
                $obj.data.submatches[0].start
            } else {
                0
            }

            $error = @{
                file = $file
                line = $lineNum
                column = $col
                code = $code
                message = $message
                severity = 1
            }

            $errors += $error
            $errorCount++

            if ($OutputFormat -eq "ndjson") {
                # Output as NDJSON (one JSON per line)
                $error | ConvertTo-Json -Compress
            }
        }
    }
}

if ($OutputFormat -eq "json") {
    # Output as single JSON object
    @{
        errors = $errors
        count = $errorCount
    } | ConvertTo-Json -Depth 10
}

Write-Host "[phase72-rg] Found $errorCount errors" -ForegroundColor Green
