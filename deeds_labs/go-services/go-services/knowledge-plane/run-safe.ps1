#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Phase 89 Deliverable 1: Safeguarded Dependency Startup
.DESCRIPTION
    ✅ NEVER runs docker compose up
    ✅ NEVER rebuilds images
    ✅ NEVER recreates containers unless missing
    ✅ NEVER touches volumes (no prune)
    ✅ Uses Phase 87 portable stack: postgresql://user:pass@127.0.0.1:5434/legal
#>

param(
  [switch]$DryRun,
  [switch]$SkipHealth
)

$ErrorActionPreference = "Stop"

function Step($m){ Write-Host "`n==> $m" -ForegroundColor Cyan }
function Ok($m){ Write-Host "✅ $m" -ForegroundColor Green }
function Warn($m){ Write-Host "⚠️  $m" -ForegroundColor Yellow }
function Err($m){ Write-Host "❌ $m" -ForegroundColor Red }

function Exec($cmd){
  if($DryRun){ Write-Host "[DRYRUN] $cmd" -ForegroundColor DarkGray; return "" }
  return (Invoke-Expression $cmd)
}

function ExistsContainer($name){
  $id = Exec "docker ps -a --filter `"name=^/$name$`" --format `"{{.ID}}`""
  return -not [string]::IsNullOrWhiteSpace($id)
}

function RunningContainer($name){
  $id = Exec "docker ps --filter `"name=^/$name$`" --format `"{{.ID}}`""
  return -not [string]::IsNullOrWhiteSpace($id)
}

function ExistsVolume($vol){
  $v = Exec "docker volume ls --format `"{{.Name}}`" | Select-String -SimpleMatch $vol"
  return -not [string]::IsNullOrWhiteSpace($v)
}

function Ensure($name, $createFn){
  if(RunningContainer $name){
    Ok "$name already running"
    return
  }

  if(ExistsContainer $name){
    Step "Starting existing container: $name"
    Exec "docker start $name | Out-Null"
    Start-Sleep -Seconds 2
    Ok "$name started (container preserved)"
    return
  }

  Warn "$name MISSING → will CREATE (no compose, no rebuild, volume preserved)"
  & $createFn
}

Write-Host @"

╔═══════════════════════════════════════════════════════════════╗
║  🛡️  Phase 89: Safeguarded Dependency Startup               ║
║                                                               ║
║  ✅ NO docker compose up                                     ║
║  ✅ NO image rebuilds                                        ║
║  ✅ NO container recreation (unless missing)                 ║
║  ✅ NO volume pruning                                        ║
║                                                               ║
║  Database: postgresql://user:pass@127.0.0.1:5434/legal       ║
╚═══════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Cyan

Step "Checking Docker daemon"
Exec "docker version | Out-Null"
Ok "Docker reachable"

# ---- Container names (from actual docker ps -a output: phase66-postgres, qdrant, phase66-redis, ollama-gemma) ----
# Override via environment if needed:
#   $env:KP_POSTGRES_CONTAINER = "phase66-postgres"
#   $env:KP_QDRANT_CONTAINER = "qdrant"
#   etc.

$POSTGRES = $env:KP_POSTGRES_CONTAINER ?? "phase66-postgres"
$QDRANT   = $env:KP_QDRANT_CONTAINER   ?? "qdrant"
$REDIS    = $env:KP_REDIS_CONTAINER    ?? "phase66-redis"
$OLLAMA   = $env:KP_OLLAMA_CONTAINER   ?? "ollama-gemma"

Write-Host "`nContainer targets:" -ForegroundColor Yellow
Write-Host "  Postgres: $POSTGRES" -ForegroundColor Gray
Write-Host "  Qdrant:   $QDRANT" -ForegroundColor Gray
Write-Host "  Redis:    $REDIS" -ForegroundColor Gray
Write-Host "  Ollama:   $OLLAMA" -ForegroundColor Gray

# ---- Ensure containers (create only if missing) ----
Step "Phase 1: Ensuring Postgres"
Ensure $POSTGRES {
  $vol = "phase66_postgres_data"
  if(ExistsVolume $vol){
    Warn "Volume $vol exists → will reuse (SAFE, no data loss)"
  }

  Write-Host "Creating Postgres container: $POSTGRES" -ForegroundColor Yellow
  Write-Host "  Port: 5434 → 5432" -ForegroundColor Gray
  Write-Host "  Database: legal" -ForegroundColor Gray
  Write-Host "  User: user / Password: pass" -ForegroundColor Gray
  Write-Host "  Volume: $vol" -ForegroundColor Gray

  if(-not $DryRun){
    Exec "docker run -d --name $POSTGRES ``
      -e POSTGRES_USER=user ``
      -e POSTGRES_PASSWORD=pass ``
      -e POSTGRES_DB=legal ``
      -p 5434:5432 ``
      -v ${vol}:/var/lib/postgresql/data ``
      postgres:17-alpine" | Out-Null
    Start-Sleep -Seconds 5
  }
  Ok "Postgres created: $POSTGRES"
}
  Write-Warn "🛡️  SAFEGUARD: This will CREATE a new container (no data loss - container was missing)"
  & $createFn
}

Step "Phase 2: Ensuring Qdrant"
Ensure $QDRANT {
  $vol = "qdrant_storage"
  if(ExistsVolume $vol){
    Warn "Volume $vol exists → will reuse (SAFE, preserves collections)"
  }

  Write-Host "Creating Qdrant container: $QDRANT" -ForegroundColor Yellow
  Write-Host "  Ports: 6333, 6334" -ForegroundColor Gray
  Write-Host "  Volume: $vol" -ForegroundColor Gray

  if(-not $DryRun){
    Exec "docker run -d --name $QDRANT ``
      -p 6333:6333 ``
      -p 6334:6334 ``
      -v ${vol}:/qdrant/storage ``
      qdrant/qdrant:latest" | Out-Null
    Start-Sleep -Seconds 3
  }
  Ok "Qdrant created: $QDRANT"
}

Step "Phase 3: Ensuring Redis"
Ensure $REDIS {
  $vol = "phase66_redis_data"
  if(ExistsVolume $vol){
    Warn "Volume $vol exists → will reuse (SAFE)"
  }

  Write-Host "Creating Redis container: $REDIS" -ForegroundColor Yellow
  Write-Host "  Port: 6379" -ForegroundColor Gray
  Write-Host "  Volume: $vol" -ForegroundColor Gray

  if(-not $DryRun){
    Exec "docker run -d --name $REDIS ``
      -p 6379:6379 ``
      -v ${vol}:/data ``
      redis:7-alpine redis-server --appendonly yes" | Out-Null
    Start-Sleep -Seconds 2
  }
  Ok "Redis created: $REDIS"
}

Step "Phase 4: Ensuring Ollama"
if($env:KP_SKIP_OLLAMA -eq "1"){
  Warn "Skipping Ollama container (KP_SKIP_OLLAMA=1, using native)"
} else {
  Ensure $OLLAMA {
    $vol = "ollama"
    if(ExistsVolume $vol){
      Warn "Volume $vol exists → will reuse (SAFE, preserves models)"
    }

    Write-Host "Creating Ollama container: $OLLAMA" -ForegroundColor Yellow
    Write-Host "  Port: 11434" -ForegroundColor Gray
    Write-Host "  Volume: $vol" -ForegroundColor Gray
    Write-Host "  ⚠️  Requires ~15GB for gemma3-legal + embeddinggemma" -ForegroundColor Yellow

    if(-not $DryRun){
      Exec "docker run -d --name $OLLAMA ``
        -p 11434:11434 ``
        -v ${vol}:/root/.ollama ``
        ollama/ollama:latest" | Out-Null
      Start-Sleep -Seconds 3
      Warn "Remember to pull models: docker exec $OLLAMA ollama pull gemma3-legal:latest"
    }
    Ok "Ollama created: $OLLAMA"
  }
}

# ---- Health checks ----
if(-not $SkipHealth){
  Step "Running health checks"

  $healthFailed = $false

  # Postgres
  try {
    Exec "docker exec $POSTGRES psql -U user -d legal -c 'SELECT 1;' 2>&1" | Out-Null
    Ok "Postgres healthy (5434/legal/user)"
  } catch {
    Warn "Postgres health check failed: $($_.Exception.Message)"
    $healthFailed = $true
  }

  # Qdrant
  try {
    Exec "powershell -NoProfile -Command 'Invoke-RestMethod http://127.0.0.1:6333/collections 2>&1 | Out-Null'"
    Ok "Qdrant healthy (6333)"
  } catch {
    Warn "Qdrant health check failed: $($_.Exception.Message)"
    $healthFailed = $true
  }

  # Redis
  try {
    $pong = Exec "docker exec $REDIS redis-cli ping 2>&1"
    if($pong -match "PONG"){
      Ok "Redis healthy (6379)"
    } else {
      throw "Unexpected response: $pong"
    }
  } catch {
    Warn "Redis health check failed: $($_.Exception.Message)"
    $healthFailed = $true
  }

  # Ollama
  if($env:KP_SKIP_OLLAMA -ne "1"){
    try {
      Exec "powershell -NoProfile -Command 'Invoke-RestMethod http://127.0.0.1:11434/api/tags 2>&1 | Out-Null'"
      Ok "Ollama healthy (11434)"
    } catch {
      Warn "Ollama health check failed (maybe still starting): $($_.Exception.Message)"
      $healthFailed = $true
    }
  }

  if($healthFailed){
    Warn "Some health checks failed. Containers may still be starting."
    Write-Host "  Wait 10 seconds and check manually: docker ps" -ForegroundColor Gray
  }
}

# ---- Environment setup ----
Step "Setting up environment variables"

$env:KP_DATABASE_URL = $env:KP_DATABASE_URL ?? "postgresql://user:pass@127.0.0.1:5434/legal"
$env:KP_QDRANT_URL   = $env:KP_QDRANT_URL   ?? "http://127.0.0.1:6333"
$env:KP_REDIS_URL    = $env:KP_REDIS_URL    ?? "redis://127.0.0.1:6379"
$env:KP_OLLAMA_URL   = $env:KP_OLLAMA_URL   ?? "http://127.0.0.1:11434"
$env:KP_EMBED_MODEL  = $env:KP_EMBED_MODEL  ?? "embeddinggemma:latest"
$env:KP_CHAT_MODEL   = $env:KP_CHAT_MODEL   ?? "gemma3-legal:latest"
$env:KP_PORT         = $env:KP_PORT         ?? "8099"

Ok "Environment configured:"
Write-Host "  KP_DATABASE_URL = $($env:KP_DATABASE_URL)" -ForegroundColor Gray
Write-Host "  KP_QDRANT_URL   = $($env:KP_QDRANT_URL)" -ForegroundColor Gray
Write-Host "  KP_REDIS_URL    = $($env:KP_REDIS_URL)" -ForegroundColor Gray
Write-Host "  KP_OLLAMA_URL   = $($env:KP_OLLAMA_URL)" -ForegroundColor Gray
Write-Host "  KP_EMBED_MODEL  = $($env:KP_EMBED_MODEL)" -ForegroundColor Gray
Write-Host "  KP_CHAT_MODEL   = $($env:KP_CHAT_MODEL)" -ForegroundColor Gray
Write-Host "  KP_PORT         = $($env:KP_PORT)" -ForegroundColor Gray

# ---- Launch Knowledge Plane ----
if($DryRun){
  Write-Host "`n[DRYRUN] Would execute: .\bin\knowledge-plane.exe" -ForegroundColor DarkGray
  Ok "Dry run complete. Use without -DryRun to actually start."
  exit 0
}

Step "Launching Knowledge Plane (Go service)"

if(-not (Test-Path ".\bin\knowledge-plane.exe")){
  Err "Knowledge Plane binary not found at .\bin\knowledge-plane.exe"
  Write-Host "Build it first:" -ForegroundColor Yellow
  Write-Host "  go build -o bin/knowledge-plane.exe ./cmd/server" -ForegroundColor Gray
  exit 1
}

Write-Host "`n🚀 Starting Knowledge Plane on port $($env:KP_PORT)...`n" -ForegroundColor Green

Exec ".\bin\knowledge-plane.exe"

Write-Step "🛡️  Dependency safeguard start (NO COMPOSE REBUILDS EVER)"
Write-Host "Phase 66 canonical containers: phase66-postgres, phase76-qdrant, phase66-redis, ollama-gemma"
Write-Host "DryRun=$DryRun | AllowCompose=$AllowCompose | SkipHealth=$SkipHealth"

# Ensure Docker is available
try {
  Exec "docker version" | Out-Null
  Write-Ok "Docker daemon reachable"
} catch {
  Write-Err "Docker daemon not available. Start Docker Desktop and retry."
  exit 1
}

# Start all dependencies
foreach ($d in $deps) {
  Ensure-Container-Running $d.Name $d.Create
}

# Health checks
if (-not $SkipHealth) {
  Write-Step "Running health checks (use -SkipHealth to disable)"
  foreach ($d in $deps) {
    try { & $d.Health } catch { Write-Warn "$($d.Name) health check failed: $($_.Exception.Message)" }
  }
}

# ---- Optional: Warn about compose if enabled ----
if ($AllowCompose) {
  $missing = @($deps | Where-Object { -not (Container-Exists $_.Name) } )
  if ($missing.Count -gt 0) {
    Write-Warn "⚠️  Some containers missing. You enabled -AllowCompose, but compose can REBUILD."
    Write-Warn "⚠️  Safer to let this script create missing containers via 'docker run' (preserves volumes)."
    Write-Warn "Missing: $($missing.Name -join ', ')"
  } else {
    Write-Ok "All containers exist. -AllowCompose is safe (nothing to rebuild)."
  }
}

# ---- Set environment variables for Knowledge Plane ----
Write-Step "Setting Knowledge Plane environment variables"
$env:KP_DATABASE_URL = "postgresql://user:pass@127.0.0.1:5434/legal"
$env:KP_QDRANT_URL   = "http://127.0.0.1:6333"
$env:KP_REDIS_URL    = "redis://127.0.0.1:6379"
$env:KP_OLLAMA_URL   = "http://127.0.0.1:11434"
$env:KP_EMBED_MODEL  = "embeddinggemma:latest"
$env:KP_CHAT_MODEL   = "gemma3-legal:latest"
$env:KP_PORT         = "8099"

Write-Ok "Environment configured:"
Write-Host "  KP_DATABASE_URL = $($env:KP_DATABASE_URL)" -ForegroundColor Gray
Write-Host "  KP_QDRANT_URL   = $($env:KP_QDRANT_URL)" -ForegroundColor Gray
Write-Host "  KP_REDIS_URL    = $($env:KP_REDIS_URL)" -ForegroundColor Gray
Write-Host "  KP_OLLAMA_URL   = $($env:KP_OLLAMA_URL)" -ForegroundColor Gray
Write-Host "  KP_EMBED_MODEL  = $($env:KP_EMBED_MODEL)" -ForegroundColor Gray
Write-Host "  KP_CHAT_MODEL   = $($env:KP_CHAT_MODEL)" -ForegroundColor Gray
Write-Host "  KP_PORT         = $($env:KP_PORT)" -ForegroundColor Gray

# ---- Launch Knowledge Plane ----
Write-Step "Launching Knowledge Plane (Go service)"
$kpBinary = ".\bin\knowledge-plane.exe"
if (-not (Test-Path $kpBinary)) {
  Write-Err "Knowledge Plane binary not found at $kpBinary"
  Write-Err "Build it first: cd go-services/knowledge-plane; go build -o bin/knowledge-plane.exe ./cmd/server"
  exit 1
}

Write-Ok "Starting Knowledge Plane on port 8099..."
if ($DryRun) {
  Write-Host "[DRYRUN] Would execute: $kpBinary" -ForegroundColor Gray
} else {
  & $kpBinary
}
