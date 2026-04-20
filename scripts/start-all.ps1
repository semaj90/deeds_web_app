#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Start all local services in parallel, wait for health, then launch workers.

.DESCRIPTION
  Boot order (all parallel):
    1. Docker services: postgres, redis, rabbitmq, qdrant, minio, neo4j,
       couchdb, nats, bifrost, searxng, langfuse, go-services
    2. Ollama (native Windows process)
  Then health-poll until each required service is healthy.
  Then launch enrichment/summarization workers in background windows.

.EXAMPLE
  .\scripts\start-all.ps1                        # start + health + workers
  .\scripts\start-all.ps1 -SkipWorkers           # start + health only
  .\scripts\start-all.ps1 -RequiredOnly          # skip optional services
#>

[CmdletBinding()]
param(
  [switch]$SkipWorkers,
  [switch]$RequiredOnly
)

$ErrorActionPreference = 'Continue'

# ── helpers ──────────────────────────────────────────────────────────────────

function Invoke-HttpCheck {
  param([string]$Url, [int]$TimeoutSec = 4)
  $null = Invoke-RestMethod -Uri $Url -TimeoutSec $TimeoutSec -ErrorAction Stop
  return $true
}

function Invoke-WebCheck {
  param([string]$Url, [int]$TimeoutSec = 4)
  $null = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSec -ErrorAction Stop
  return $true
}

function Wait-Health {
  param(
    [string]$Name,
    [scriptblock]$Check,
    [int]$MaxSeconds = 120,
    [bool]$Required = $true
  )
  $deadline = (Get-Date).AddSeconds($MaxSeconds)
  $dots = 0
  while ((Get-Date) -lt $deadline) {
    try {
      & $Check | Out-Null
      if ($dots -gt 0) { Write-Host '' }
      Write-Host "  [OK] $Name" -ForegroundColor Green
      return $true
    } catch {
      Write-Host -NoNewline '.'
      $dots++
      Start-Sleep -Seconds 3
    }
  }
  if ($dots -gt 0) { Write-Host '' }
  if ($Required) {
    Write-Host "  [FAIL] $Name — timed out after ${MaxSeconds}s" -ForegroundColor Red
    throw "Required service failed: $Name"
  }
  Write-Host "  [SKIP] $Name — optional, not healthy" -ForegroundColor DarkYellow
  return $false
}

# ── 1. Start Docker services ─────────────────────────────────────────────────

Write-Host "`n==> Starting Docker services" -ForegroundColor Cyan

$requiredContainers  = @('legal-ai-postgres', 'legal-ai-redis', 'legal-ai-qdrant')
$optionalContainers  = @(
  'legal-ai-rabbitmq', 'legal-ai-minio', 'legal-ai-neo4j',
  'legal-ai-couchdb',  'legal-ai-nats',  'legal-ai-bifrost',
  'legal-ai-searxng',  'legal-ai-caddy',
  'langfuse-server',   'langfuse-worker',
  'legal-ai-go-search','legal-ai-go-embedding','legal-ai-go-retrieval',
  'legal-ai-langgraph'
)

$containers = $requiredContainers + $(if (-not $RequiredOnly) { $optionalContainers } else { @() })

foreach ($c in $containers) {
  $state = docker inspect --format='{{.State.Status}}' $c 2>$null
  if ($state -eq 'running') {
    Write-Host "  $c already running" -ForegroundColor DarkGray
  } elseif ($state -in 'exited','created','paused') {
    docker start $c | Out-Null
    Write-Host "  $c started" -ForegroundColor Yellow
  } else {
    Write-Host "  $c not found (container may not exist)" -ForegroundColor DarkYellow
  }
}

# ── 2. Start Ollama (native, idempotent) ────────────────────────────────────

Write-Host "`n==> Starting Ollama" -ForegroundColor Cyan
$ollamaRunning = Get-Process -Name 'ollama' -ErrorAction SilentlyContinue
if (-not $ollamaRunning) {
  $ollamaExe = (Get-Command ollama -ErrorAction SilentlyContinue)?.Source
  if ($ollamaExe) {
    Start-Process -FilePath $ollamaExe -ArgumentList 'serve' -WindowStyle Minimized
    Write-Host "  ollama serve started" -ForegroundColor Yellow
  } else {
    Write-Host "  ollama not found in PATH — skipping" -ForegroundColor DarkYellow
  }
} else {
  Write-Host "  ollama already running" -ForegroundColor DarkGray
}

# ── 3. Health checks ─────────────────────────────────────────────────────────

Write-Host "`n==> Waiting for health..." -ForegroundColor Cyan

# Required
Wait-Health 'postgres'  { pg_isready -h 127.0.0.1 -p 5432 -U legal_admin 2>&1 | Out-Null; if ($LASTEXITCODE -ne 0) { throw } } -Required $true
Wait-Health 'redis'     { docker exec legal-ai-redis redis-cli ping 2>&1 | Select-String 'PONG' | Out-Null; if ($LASTEXITCODE -ne 0) { throw } } -Required $true
Wait-Health 'qdrant'    { Invoke-HttpCheck 'http://localhost:6333/collections' } -Required $true
Wait-Health 'ollama'    { Invoke-HttpCheck 'http://localhost:11434/api/tags' } -Required $true -MaxSeconds 180

if (-not $RequiredOnly) {
  # Optional
  Wait-Health 'rabbitmq'  { Invoke-HttpCheck 'http://localhost:15672/' } -Required $false
  Wait-Health 'neo4j'     { Invoke-WebCheck  'http://localhost:7474'   } -Required $false
  Wait-Health 'minio'     { Invoke-HttpCheck 'http://localhost:9000/minio/health/live' } -Required $false
  Wait-Health 'bifrost'   { Invoke-HttpCheck 'http://localhost:3040/health' } -Required $false
  Wait-Health 'langfuse'  { Invoke-WebCheck  'http://localhost:3030' } -Required $false
  Wait-Health 'go-search' { Invoke-HttpCheck 'http://localhost:8096/health' } -Required $false
  Wait-Health 'langgraph' { Invoke-HttpCheck 'http://localhost:8100/health' } -Required $false
}

Write-Host "`n==> All required services healthy." -ForegroundColor Green

# ── 4. Launch workers ─────────────────────────────────────────────────────────

if (-not $SkipWorkers) {
  Write-Host "`n==> Launching background workers" -ForegroundColor Cyan

  $frontendDir = Join-Path $PSScriptRoot '..' 'sveltekit-frontend'

  # Cluster summarizer (idempotent — skips already-done clusters)
  Start-Process powershell -WindowStyle Minimized -ArgumentList @(
    '-NoProfile', '-Command',
    "cd '$frontendDir'; npx tsx scripts/summarize-clusters-pg.ts"
  )
  Write-Host "  Worker: summarize-clusters-pg (background)" -ForegroundColor Yellow

  Write-Host "`n  Workers launched. Check terminal windows for progress." -ForegroundColor DarkGray
}

Write-Host "`n==> Stack ready.`n" -ForegroundColor Green
