#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Phase 72 KAG prerequisites gate (source of truth).

.DESCRIPTION
  Validates only what the KAG pipeline truly needs to run:
    A) Node works (ESM sanity)
    B) Redis reachable via Node + ioredis (no redis-cli required)
    C) Scripts exist + imports resolve (selftests)
    D) Structural guard: no "await parseSIMD" inside rl.on('line', ...)

  This script should be run BEFORE any fix application runs.

.PARAMETER SkipOptional
  Skips optional checks (SIMD parser, Ollama).
#>

param(
  [switch]$SkipOptional
)

$ErrorActionPreference = "Stop"

function Write-Section([string]$Title) {
  Write-Host ""
  Write-Host "== $Title ==" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) { Write-Host "  ✅ $Message" -ForegroundColor Green }
function Write-Warn([string]$Message) { Write-Host "  ⚠️  $Message" -ForegroundColor Yellow }
function Write-Fail([string]$Message) { Write-Host "  ❌ $Message" -ForegroundColor Red }

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $repoRoot

$failed = $false

try {
  Write-Section "Node + ESM sanity"

  try {
    $nodeVersion = (& node -v) 2>$null
    if (-not $nodeVersion) { throw "node not found on PATH" }
    Write-Ok "Node: $nodeVersion"
  } catch {
    Write-Fail "Node not available: $($_.Exception.Message)"
    throw
  }

  try {
    $nodeOk = (& node -e "console.log('node_ok')") 2>$null
    if ($nodeOk -notmatch "node_ok") { throw "unexpected node output" }
    Write-Ok "Node execution OK"
  } catch {
    Write-Fail "Node execution failed: $($_.Exception.Message)"
    throw
  }

  if (-not $env:NODE_OPTIONS) {
    Write-Warn "NODE_OPTIONS not set (ok, but recommended for large runs)"
  } else {
    Write-Ok "NODE_OPTIONS set: $env:NODE_OPTIONS"
  }

  Write-Section "Redis reachable (Node + ioredis)"

  $redisUrl = $env:REDIS_URL
  if (-not $redisUrl) {
    $host = $env:REDIS_HOST; if (-not $host) { $host = "127.0.0.1" }
    $port = $env:REDIS_PORT; if (-not $port) { $port = "4005" }
    $redisUrl = "redis://$host`:$port"
  }

  $redisCmd = @"
import Redis from 'ioredis';
const r = new Redis('$redisUrl', { enableOfflineQueue: false, maxRetriesPerRequest: 1 });
r.ping().then((x)=>{ console.log('redis', x); r.quit(); })
  .catch((e)=>{ console.error('redis_fail', e.message); process.exit(1); });
"@

  try {
    & node -e $redisCmd | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "Redis ping failed" }
    Write-Ok "Redis OK via ioredis ($redisUrl)"
  } catch {
    Write-Fail "Redis not reachable via ioredis ($redisUrl)"
    throw
  }

  Write-Section "Scripts exist"

  $must = @(
    ".\scripts\kag-fix-store.mjs",
    ".\scripts\kag-rag-dashboard.mjs",
    ".\scripts\integrate-kag-into-fixer.mjs",
    ".\scripts\phase72-kag-quickstart.ps1",
    ".\scripts\factory-fixer-v2.mjs"
  )

  foreach ($p in $must) {
    if (!(Test-Path $p)) {
      Write-Fail "Missing: $p"
      throw "Missing required file(s)"
    }
    Write-Ok "Found: $p"
  }

  Write-Section "Selftests (import paths + runtime)"

  & node .\scripts\kag-fix-store.mjs --selftest | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "kag-fix-store.mjs selftest failed" }
  Write-Ok "kag-fix-store.mjs --selftest"

  & node .\scripts\integrate-kag-into-fixer.mjs --selftest | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "integrate-kag-into-fixer.mjs selftest failed" }
  Write-Ok "integrate-kag-into-fixer.mjs --selftest"

  & node .\scripts\kag-rag-dashboard.mjs --selftest | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "kag-rag-dashboard.mjs selftest failed" }
  Write-Ok "kag-rag-dashboard.mjs --selftest"

  Write-Section "Structural guards"

  $rg = Get-Command rg -ErrorAction SilentlyContinue
  if ($null -eq $rg) {
    Write-Warn "ripgrep (rg) not found; skipping await/handler structural guard"
  } else {
    $bad = & rg -n "on\\('line'[^\\n]*await\\s+parseSIMD" .\scripts\factory-fixer-v2.mjs
    if ($bad) {
      Write-Fail "Found forbidden await-in-line-handler pattern in factory-fixer-v2.mjs"
      Write-Host $bad
      throw "factory-fixer-v2.mjs structural guard failed"
    }
    Write-Ok "No forbidden await-in-line-handler pattern"
  }

  if (-not $SkipOptional) {
    Write-Section "Optional checks"

    # SIMD parser (optional)
    $simdUrl = $env:SIMD_JSON_PARSER_URL
    if (-not $simdUrl) { $simdUrl = "http://localhost:8096/api/simd" }
    try {
      $resp = Invoke-WebRequest -Uri "$simdUrl/health" -Method GET -TimeoutSec 2 -UseBasicParsing -ErrorAction SilentlyContinue
      if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300) {
        Write-Ok "SIMD parser reachable ($simdUrl)"
      } else {
        Write-Warn "SIMD parser not reachable ($simdUrl) (optional)"
      }
    } catch {
      Write-Warn "SIMD parser check failed (optional)"
    }

    # Ollama (optional)
    try {
      $resp = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -Method GET -TimeoutSec 2 -UseBasicParsing -ErrorAction SilentlyContinue
      if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300) {
        Write-Ok "Ollama reachable (http://localhost:11434)"
      } else {
        Write-Warn "Ollama not reachable (optional)"
      }
    } catch {
      Write-Warn "Ollama check failed (optional)"
    }
  }

  Write-Host ""
  Write-Ok "Prerequisites PASSED"
} catch {
  $failed = $true
  Write-Host ""
  Write-Fail "Prerequisites FAILED"
  Write-Fail $_.Exception.Message
} finally {
  Pop-Location
}

if ($failed) { exit 1 }
exit 0

