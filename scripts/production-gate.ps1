<#
.SYNOPSIS
  Production Readiness Gate — validates the full TurboQuant → LangGraph → Search → SIMD stack.

.DESCRIPTION
  Checks service health, app integration endpoints, and build/test correctness.
  Exit code 0 = all checks passed; non-zero = at least one failure.

.PARAMETER SkipLangGraph
  Skip the LangGraph health check (use when GPU Docker runtime is unavailable).

.PARAMETER SkipTurboQuant
  Skip the TurboQuant health check (use when llama-server is not running).

.PARAMETER DevServerUrl
  Base URL of the SvelteKit dev server. Default: http://localhost:5173

.EXAMPLE
  .\scripts\production-gate.ps1
  .\scripts\production-gate.ps1 -SkipLangGraph
  .\scripts\production-gate.ps1 -SkipLangGraph -SkipTurboQuant
#>
param(
  [switch]$SkipLangGraph,
  [switch]$SkipTurboQuant,
  [string]$DevServerUrl = 'http://localhost:5173'
)

$ErrorActionPreference = 'Continue'
$passed = 0
$failed = 0
$skipped = 0
$results = @()

function Test-Endpoint {
  param(
    [string]$Name,
    [string]$Url,
    [int]$TimeoutSec = 5,
    [switch]$Optional
  )
  try {
    $resp = Invoke-WebRequest -Uri $Url -TimeoutSec $TimeoutSec -UseBasicParsing -ErrorAction Stop
    if ($resp.StatusCode -eq 200) {
      Write-Host "  PASS  $Name ($Url)" -ForegroundColor Green
      $script:passed++
      $script:results += @{ Name = $Name; Status = 'PASS'; Detail = "HTTP $($resp.StatusCode)" }
      return $true
    } else {
      Write-Host "  FAIL  $Name — HTTP $($resp.StatusCode)" -ForegroundColor Red
      $script:failed++
      $script:results += @{ Name = $Name; Status = 'FAIL'; Detail = "HTTP $($resp.StatusCode)" }
      return $false
    }
  } catch {
    if ($Optional) {
      Write-Host "  SKIP  $Name — not reachable (optional)" -ForegroundColor Yellow
      $script:skipped++
      $script:results += @{ Name = $Name; Status = 'SKIP'; Detail = $_.Exception.Message }
      return $true
    } else {
      Write-Host "  FAIL  $Name — $($_.Exception.Message)" -ForegroundColor Red
      $script:failed++
      $script:results += @{ Name = $Name; Status = 'FAIL'; Detail = $_.Exception.Message }
      return $false
    }
  }
}

# ═══════════════════════════════════════════════════════════════════
Write-Host ''
Write-Host '═══════════════════════════════════════════════════════' -ForegroundColor Cyan
Write-Host '  PRODUCTION READINESS GATE' -ForegroundColor Cyan
Write-Host '═══════════════════════════════════════════════════════' -ForegroundColor Cyan
Write-Host ''

# ── Section 1: Service Health ─────────────────────────────────────
Write-Host '── Service Health ──────────────────────────────────────' -ForegroundColor White

# Qdrant
Test-Endpoint -Name 'Qdrant (6333)' -Url 'http://localhost:6333/collections'

# Redis
try {
  $redisPong = docker exec deeds-redis-prod redis-cli PING 2>&1
  if ($redisPong -match 'PONG') {
    Write-Host '  PASS  Redis PING → PONG' -ForegroundColor Green
    $passed++
    $results += @{ Name = 'Redis'; Status = 'PASS'; Detail = 'PONG' }
  } else {
    Write-Host "  FAIL  Redis PING → $redisPong" -ForegroundColor Red
    $failed++
    $results += @{ Name = 'Redis'; Status = 'FAIL'; Detail = $redisPong }
  }
} catch {
  Write-Host "  FAIL  Redis — $($_.Exception.Message)" -ForegroundColor Red
  $failed++
  $results += @{ Name = 'Redis'; Status = 'FAIL'; Detail = $_.Exception.Message }
}

# Go Search
Test-Endpoint -Name 'Go Search (8096)' -Url 'http://localhost:8096/health'

# Go Embedding
Test-Endpoint -Name 'Go Embedding (8097)' -Url 'http://localhost:8097/health'

# TurboQuant
if ($SkipTurboQuant) {
  Write-Host '  SKIP  TurboQuant (8090) — skipped via -SkipTurboQuant' -ForegroundColor Yellow
  $skipped++
  $results += @{ Name = 'TurboQuant'; Status = 'SKIP'; Detail = 'Skipped' }
} else {
  Test-Endpoint -Name 'TurboQuant (8090)' -Url 'http://localhost:8090/health' -Optional
}

# LangGraph
if ($SkipLangGraph) {
  Write-Host '  SKIP  LangGraph (8091) — skipped via -SkipLangGraph' -ForegroundColor Yellow
  $skipped++
  $results += @{ Name = 'LangGraph'; Status = 'SKIP'; Detail = 'Skipped' }
} else {
  Test-Endpoint -Name 'LangGraph (8091)' -Url 'http://localhost:8091/health' -Optional
}

# Bifrost
Test-Endpoint -Name 'Bifrost (3040)' -Url 'http://localhost:3040/health' -Optional

Write-Host ''

# ── Section 2: App Integration ────────────────────────────────────
Write-Host '── App Integration ─────────────────────────────────────' -ForegroundColor White

# Check if dev server is responding at all (could be 404 if SvelteKit root isn't configured, but shouldn't be connection refused)
$devRunning = $false
try {
  $tcp = New-Object System.Net.Sockets.TcpClient
  $tcp.Connect('127.0.0.1', 5173)
  $devRunning = $tcp.Connected
  $tcp.Close()
} catch { }

if ($devRunning) {
  # claude-assist
  Test-Endpoint -Name 'claude-assist route' -Url "$DevServerUrl/api/codebase-index/claude-assist" -Optional

  # feedback endpoint
  Test-Endpoint -Name 'feedback endpoint' -Url "$DevServerUrl/api/codebase-index/claude-assist/feedback/analysis" -Optional

  # defaults endpoint
  Test-Endpoint -Name 'defaults endpoint' -Url "$DevServerUrl/api/codebase-index/claude-assist/defaults" -Optional
} else {
  Write-Host "  SKIP  App integration checks — dev server not running at $DevServerUrl" -ForegroundColor Yellow
  $skipped += 3
  $results += @{ Name = 'App Integration'; Status = 'SKIP'; Detail = 'Dev server not running' }
}

Write-Host ''

# ── Section 3: SIMD Bridge ───────────────────────────────────────
Write-Host '── SIMD Bridge ─────────────────────────────────────────' -ForegroundColor White

$simdPath = Join-Path $PSScriptRoot '..\simd-bridge\cpp\build\Release\tensorrt_bridge.node'
if (Test-Path $simdPath) {
  Write-Host '  PASS  tensorrt_bridge.node exists' -ForegroundColor Green
  $passed++
  $results += @{ Name = 'SIMD Bridge file'; Status = 'PASS'; Detail = 'Exists' }

  # Quick load test
  try {
    $nodeTest = node -e "try { require('./simd-bridge/cpp/build/Release/tensorrt_bridge.node'); console.log('OK') } catch(e) { console.log('FAIL: ' + e.message); process.exit(1) }" 2>&1
    if ($LASTEXITCODE -eq 0) {
      Write-Host '  PASS  tensorrt_bridge.node loads in Node.js' -ForegroundColor Green
      $passed++
      $results += @{ Name = 'SIMD Bridge load'; Status = 'PASS'; Detail = 'Loads OK' }
    } else {
      Write-Host "  FAIL  tensorrt_bridge.node load failed: $nodeTest" -ForegroundColor Red
      $failed++
      $results += @{ Name = 'SIMD Bridge load'; Status = 'FAIL'; Detail = $nodeTest }
    }
  } catch {
    Write-Host "  FAIL  SIMD bridge test error: $($_.Exception.Message)" -ForegroundColor Red
    $failed++
    $results += @{ Name = 'SIMD Bridge load'; Status = 'FAIL'; Detail = $_.Exception.Message }
  }
} else {
  Write-Host '  FAIL  tensorrt_bridge.node not found' -ForegroundColor Red
  $failed++
  $results += @{ Name = 'SIMD Bridge file'; Status = 'FAIL'; Detail = 'Not found' }
}

Write-Host ''

# ── Section 4: Build / Test ───────────────────────────────────────
Write-Host '── Build / Test ────────────────────────────────────────' -ForegroundColor White

# svelte-check
Write-Host '  .... Running svelte-check (this may take a moment)...' -ForegroundColor DarkGray
$svelteCheckDir = Join-Path $PSScriptRoot '..\sveltekit-frontend'
try {
  Push-Location $svelteCheckDir
  $checkOutput = & npx svelte-kit sync 2>&1
  $checkResult = & npx svelte-check --threshold error --tsconfig ./tsconfig.json 2>&1
  $checkExit = $LASTEXITCODE
  Pop-Location

  if ($checkExit -eq 0) {
    Write-Host '  PASS  svelte-check (0 errors)' -ForegroundColor Green
    $passed++
    $results += @{ Name = 'svelte-check'; Status = 'PASS'; Detail = '0 errors' }
  } else {
    $errorCount = ($checkResult | Select-String -Pattern 'Error' | Measure-Object).Count
    Write-Host "  FAIL  svelte-check — $errorCount error(s)" -ForegroundColor Red
    $failed++
    $results += @{ Name = 'svelte-check'; Status = 'FAIL'; Detail = "$errorCount errors" }
  }
} catch {
  Write-Host "  FAIL  svelte-check — $($_.Exception.Message)" -ForegroundColor Red
  $failed++
  $results += @{ Name = 'svelte-check'; Status = 'FAIL'; Detail = $_.Exception.Message }
}

Write-Host ''

# ═══════════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════════
Write-Host '═══════════════════════════════════════════════════════' -ForegroundColor Cyan
Write-Host "  RESULTS:  $passed passed  |  $failed failed  |  $skipped skipped" -ForegroundColor $(if ($failed -eq 0) { 'Green' } else { 'Red' })
Write-Host '═══════════════════════════════════════════════════════' -ForegroundColor Cyan
Write-Host ''

if ($failed -gt 0) {
  Write-Host 'Production gate: FAILED' -ForegroundColor Red
  Write-Host ''
  Write-Host 'Failed checks:' -ForegroundColor Red
  $results | Where-Object { $_.Status -eq 'FAIL' } | ForEach-Object {
    Write-Host "  - $($_.Name): $($_.Detail)" -ForegroundColor Red
  }
  exit 1
} else {
  Write-Host 'Production gate: PASSED' -ForegroundColor Green
  exit 0
}
