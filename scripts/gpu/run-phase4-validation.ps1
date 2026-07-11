#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Phase 4 cuVS recall validation launcher.

.DESCRIPTION
    Thin Windows wrapper that executes the WSL2 RAPIDS runner.
#>

param(
    [switch]$DryRun = $false,
    [int]$NumQueries = 100,
    [int]$NLists = 100
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path $PSScriptRoot -Parent | Split-Path -Parent
$ScriptPath = Join-Path $RepoRoot 'scripts\gpu\phase4-cuVS-recall-runner.mjs'

Write-Host ('=' * 80)
Write-Host 'Phase 4: cuVS Recall Baseline Validation (WSL2)'
Write-Host ('=' * 80)
Write-Host ''
Write-Host "Runner: $ScriptPath"
Write-Host "Mode: $(if ($DryRun) { 'dry-run' } else { 'apply' })"
Write-Host ''

if (-not (Test-Path $ScriptPath)) {
    throw "Runner not found: $ScriptPath"
}

[string[]]$cmdArgs = @('node', $ScriptPath)
if ($DryRun) {
    $cmdArgs += '--dry-run'
}

& $cmdArgs[0] $cmdArgs[1..($cmdArgs.Count - 1)]
if ($LASTEXITCODE -ne 0) {
    throw "Phase 4 runner failed with exit code $LASTEXITCODE"
}

Write-Host ''
Write-Host '[done] Phase 4 launcher completed.'
