# Phase 89: Safeguard Configuration
#
# This file defines safety rules for Phase 89 scripts.
# Scripts marked as SAFE can be run without user confirmation.
# Scripts marked as DESTRUCTIVE require user confirmation.
#

param(
    [Parameter(Position=0)]
    [string]$Action = "check"
)

$ErrorActionPreference = "Stop"

# Define safe scripts (non-destructive, read-only or additive)
$SafeScripts = @(
    "phase89-code-unit-indexer.mjs",       # Additive: upserts to Qdrant
    "phase89-cuda-ast-indexer.mjs",        # Additive: upserts to Qdrant
    "phase89-similarity-ranker.mjs",       # Read-only: searches
    "phase89-gemma3-prompt.mjs",           # Read + LLM call
    "phase89-verify-integration.ps1",      # Read-only: checks
    "phase89-verify-wiring.ps1",           # Read-only: checks
    "phase89-cuda-clustering.py"           # Read-only: analysis
)

# Define destructive scripts (require confirmation)
$DestructiveScripts = @(
    "phase89-build-topk-index.mjs",        # TRUNCATE error_topk_index
    "phase89-enhanced-embedder.mjs",       # TRUNCATE (rebuild mode)
    "phase89-reembed-svelte.mjs",          # DELETE FROM raw_error_embeddings
    "phase89-ingest-errors.mjs"            # Can overwrite
)

# Dangerous patterns to detect
$DangerousPatterns = @(
    'DROP TABLE',
    'TRUNCATE',
    'DELETE FROM',
    'docker rm',
    'docker-compose down',
    'docker stop',
    'rm -rf',
    'Remove-Item -Recurse -Force',
    'del /s /q'
)

function Test-Safeguards {
    Write-Host "`n🛡️  Phase 89: Safeguard Check`n" -ForegroundColor Cyan
    Write-Host ("═" * 60)
    Write-Host ""

    $allSafe = $true
    $issues = @()

    # Check all phase89 scripts
    $scripts = Get-ChildItem -Path "scripts" -Filter "phase89-*" -ErrorAction SilentlyContinue

    foreach ($script in $scripts) {
        $content = Get-Content $script.FullName -Raw -ErrorAction SilentlyContinue
        $scriptIssues = @()

        foreach ($pattern in $DangerousPatterns) {
            if ($content -match [regex]::Escape($pattern)) {
                $scriptIssues += $pattern
                $allSafe = $false
            }
        }

        if ($scriptIssues.Count -gt 0) {
            $isSafe = $SafeScripts -contains $script.Name
            $status = if ($isSafe) { "📝 DOCUMENTED" } else { "⚠️  FLAGGED" }
            $color = if ($isSafe) { "Yellow" } else { "Red" }

            Write-Host "   $status $($script.Name)" -ForegroundColor $color
            foreach ($issue in $scriptIssues) {
                Write-Host "      → Contains: $issue" -ForegroundColor DarkGray
            }
        }
    }

    Write-Host ""

    if ($allSafe) {
        Write-Host "   ✅ All scripts are safe (no dangerous patterns)" -ForegroundColor Green
    } else {
        Write-Host "   📋 Review flagged scripts before running" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "   Safe Scripts (can run freely):" -ForegroundColor Green
        foreach ($s in $SafeScripts) {
            Write-Host "      ✅ $s" -ForegroundColor DarkGreen
        }
        Write-Host ""
        Write-Host "   Destructive Scripts (require confirmation):" -ForegroundColor Yellow
        foreach ($s in $DestructiveScripts) {
            Write-Host "      ⚠️  $s" -ForegroundColor DarkYellow
        }
    }

    Write-Host ""
}

function Invoke-SafeScript {
    param(
        [Parameter(Mandatory)]
        [string]$ScriptName,
        [string[]]$Arguments
    )

    $isSafe = $SafeScripts -contains $ScriptName
    $isDestructive = $DestructiveScripts -contains $ScriptName

    if ($isSafe) {
        Write-Host "✅ Running safe script: $ScriptName" -ForegroundColor Green
        node "scripts/$ScriptName" @Arguments
    }
    elseif ($isDestructive) {
        Write-Host "⚠️  DESTRUCTIVE SCRIPT: $ScriptName" -ForegroundColor Red
        Write-Host "    This script may DELETE or TRUNCATE data." -ForegroundColor Yellow
        Write-Host ""
        $confirm = Read-Host "Type 'yes' to confirm"

        if ($confirm -eq 'yes') {
            Write-Host "Running destructive script..." -ForegroundColor Yellow
            node "scripts/$ScriptName" @Arguments
        } else {
            Write-Host "Aborted." -ForegroundColor Red
        }
    }
    else {
        Write-Host "⚠️  Unknown script: $ScriptName" -ForegroundColor Yellow
        Write-Host "    Add to SafeScripts or DestructiveScripts list first."
    }
}

# Main
switch ($Action) {
    "check" { Test-Safeguards }
    "run" {
        if ($args.Count -gt 0) {
            Invoke-SafeScript -ScriptName $args[0] -Arguments ($args | Select-Object -Skip 1)
        } else {
            Write-Host "Usage: .\phase89-safeguards.ps1 run <script-name> [args...]"
        }
    }
    default {
        Write-Host "Usage:"
        Write-Host "  .\phase89-safeguards.ps1 check           # Check all scripts"
        Write-Host "  .\phase89-safeguards.ps1 run <script>    # Run with safeguards"
    }
}
