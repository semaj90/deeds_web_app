#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Phase 72 KAG quickstart (deterministic pipeline).

.DESCRIPTION
  Runs the Phase 72 pipeline in an order that avoids false confidence:
    0) Prereq gate (stop immediately if fail)
    1) Produce fresh errors JSONL (or reuse existing if -SkipErrorExtract)
    2) Plan (no writes)
    3) Apply small batch first (writes + backups)
    4) Verify (required for KAG persistence)
    5) Show learning dashboard

.PARAMETER Tier
  Fix tier (default: 2)

.PARAMETER PlanLimit
  Max errors to include in plan (default: 100)

.PARAMETER ApplyLimit
  Max errors to apply in first batch (default: 25)

.PARAMETER VerifyCommand
  Verification command to run after apply (default: npm run check:ultra-fast)

.PARAMETER SkipErrorExtract
  Skip running svelte-check + parse-fast (assumes reports/latest/errors.jsonl exists)

.PARAMETER SkipOptional
  Skip optional checks in prerequisites gate
#>

param(
  [int]$Tier = 2,
  [int]$PlanLimit = 100,
  [int]$ApplyLimit = 25,
  [string]$VerifyCommand = "npm run check:ultra-fast",
  [switch]$SkipErrorExtract,
  [switch]$SkipOptional
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "== $Message ==" -ForegroundColor Cyan
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $root

try {
  Write-Step "0) Prerequisites gate"
  if ($SkipOptional) {
    & .\scripts\phase72-verify-prerequisites.ps1 -SkipOptional | Out-Host
  } else {
    & .\scripts\phase72-verify-prerequisites.ps1 | Out-Host
  }
  if ($LASTEXITCODE -ne 0) { throw "Prerequisites failed" }

  if (-not $SkipErrorExtract) {
    Write-Step "1) Produce fresh errors.jsonl"

    if (!(Test-Path ".\reports")) { New-Item -ItemType Directory -Path ".\reports" | Out-Null }
    if (!(Test-Path ".\reports\latest")) { New-Item -ItemType Directory -Path ".\reports\latest" | Out-Null }

    # Generate raw log
    Write-Host "Running: npm run check:svelte > reports\\svelte_raw.log" -ForegroundColor DarkGray
    cmd /c "npm run check:svelte > reports\\svelte_raw.log 2>&1"

    # Parse to JSONL (put directly into reports/latest so factory-fixer default works)
    Write-Host "Running: node scripts\\parse-fast.mjs reports\\svelte_raw.log reports\\latest\\errors.jsonl" -ForegroundColor DarkGray
    & node .\scripts\parse-fast.mjs .\reports\svelte_raw.log .\reports\latest\errors.jsonl | Out-Host
  } else {
    if (!(Test-Path ".\reports\latest\errors.jsonl")) {
      throw "SkipErrorExtract set but reports\\latest\\errors.jsonl is missing"
    }
  }

  Write-Step "2) Plan (no writes)"
  & node .\scripts\factory-fixer-v2.mjs --plan --tier $Tier --limit $PlanLimit | Out-Host

  Write-Step "3) Apply small batch (writes + backups)"
  Write-Host "Verify: $VerifyCommand" -ForegroundColor DarkGray
  & node .\scripts\factory-fixer-v2.mjs --apply --tier $Tier --limit $ApplyLimit --verify "$VerifyCommand" --show-learning | Out-Host

  Write-Step "4) Learning dashboard"
  & node .\scripts\kag-rag-dashboard.mjs | Out-Host

  Write-Host ""
  Write-Host "✅ Quickstart complete" -ForegroundColor Green
} finally {
  Pop-Location
}

