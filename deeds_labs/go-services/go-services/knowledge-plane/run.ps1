#!/usr/bin/env pwsh
# Knowledge Plane Service Launcher - HARDENED (Phase 66 Containers)
# SAFEGUARD: Never runs "docker compose up" to avoid rebuilding/data loss
param(
  [switch]$AllowCompose,
  [switch]$DryRun,
  [switch]$SkipHealth
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "✅ $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "⚠️  $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "❌ $msg" -ForegroundColor Red }

function Exec($cmd) {
  if ($DryRun) { Write-Host "[DRYRUN] $cmd" -ForegroundColor Gray; return "" }
  try {
    return (Invoke-Expression $cmd 2>$null)
  } catch {
    return $null
  }
}

function Container-Exists($name) {
  $id = Exec "docker ps -a --filter `"name=^${name}$`" --format `"{{.ID}}`""
  return -not [string]::IsNullOrWhiteSpace($id)
}

function Container-Running($name) {
  $id = Exec "docker ps --filter `"name=^${name}$`" --filter `"status=running`" --format `"{{.ID}}`""
  return -not [string]::IsNullOrWhiteSpace($id)
}

function Ensure-Container-Running($name, $createFn) {
  if (Container-Running $name) {
    Write-Ok "$name is already running"
    return
  }

  if (Container-Exists $name) {
    Write-Step "Starting existing container: $name"
    Exec "docker start $name" | Out-Null
    Start-Sleep -Seconds 2
    Write-Ok "$name started"
    return
  }

  Write-Warn "$name does NOT exist - creating now..."
  Write-Warn "⚠️  SAFEGUARD: This will CREATE a fresh container. No existing data to preserve because it was missing."
  & $createFn
}

Write-Step "🛡️  Dependency Safeguard Start (NO compose rebuilds)"
Write-Host "   DryRun: $DryRun | AllowCompose: $AllowCompose | SkipHealth: $SkipHealth"

# Ensure Docker is available
try {
  Exec "docker version" | Out-Null
  Write-Ok "Docker is reachable"
} catch {
  Write-Err "Docker is not running or not installed"
  exit 1
}

# ---- Hardcoded Phase 66/89 canonical dependency targets ----
# 🔥 CRITICAL: Uses port 5434/legal/user for embeddings + HNSW + KAG
$deps = @(
  @{
    Name = "phase66-postgres"
    Create = {
      Write-Step "Creating PostgreSQL container: phase66-postgres (Phase 89 canonical)"
      Write-Warn "⚠️  Database: legal, User: user, Password: pass, Port: 5434"
      Exec "docker run -d --name phase66-postgres ``
        -e POSTGRES_USER=user ``
        -e POSTGRES_PASSWORD=pass ``
        -e POSTGRES_DB=legal ``
        -p 5434:5432 ``
        -v phase66_postgres_data:/var/lib/postgresql/data ``
        pgvector/pgvector:pg17" | Out-Null
      Start-Sleep -Seconds 5
      Write-Ok "phase66-postgres created"
    }
    Health = {
      if ($SkipHealth) { return }
      $result = Exec "docker exec phase66-postgres pg_isready -U user"
      if ($result -like "*accepting connections*") {
        Write-Ok "PostgreSQL healthy (port 5434/legal/user)"
      } else {
        Write-Warn "PostgreSQL not ready yet"
      }
    }
  },
  @{
    Name = "qdrant"
    Create = {
      Write-Step "Creating Qdrant container: qdrant (shared)"
      Write-Warn "⚠️  This container is shared between Phase 76 and Phase 89"
      Exec "docker run -d --name qdrant ``
        -p 6333:6333 ``
        -p 6334:6334 ``
        -v qdrant_storage:/qdrant/storage ``
        qdrant/qdrant:latest" | Out-Null
      Start-Sleep -Seconds 3
      Write-Ok "qdrant created"
    }
    Health = {
      if ($SkipHealth) { return }
      try {
        Invoke-RestMethod -Uri "http://127.0.0.1:6333/collections" -TimeoutSec 3 | Out-Null
        Write-Ok "Qdrant reachable (810-point KB)"
      } else {
        Write-Warn "Qdrant not ready yet"
      }
    }
  },
  @{
    Name = "phase76-redis"
    Create = {
      Write-Step "Creating Redis container: phase76-redis (can also use phase66-redis)"
      Exec "docker run -d --name phase76-redis ``
        -p 6379:6379 ``
        -v redis_data:/data ``
        redis:7" | Out-Null
      Start-Sleep -Seconds 2
      Write-Ok "phase76-redis created"
    }
    Health = {
      if ($SkipHealth) { return }
      $result = Exec "docker exec phase76-redis redis-cli ping"
      if ($result -eq "PONG") {
        Write-Ok "Redis healthy"
      } else {
        Write-Warn "Redis not ready yet"
      }
    }
  },
  @{
    Name = "ollama-gemma"
    Create = {
      Write-Step "Creating Ollama container: ollama-gemma"
      Write-Warn "⚠️  Models: gemma3-legal:latest, embeddinggemma:latest"
      Exec "docker run -d --name ollama-gemma ``
        -p 11434:11434 ``
        -v ollama:/root/.ollama ``
        ollama/ollama:latest" | Out-Null
      Start-Sleep -Seconds 5
      Write-Ok "ollama-gemma created"
    }
    Health = {
      if ($SkipHealth) { return }
      try {
        Invoke-RestMethod -Uri \"http://127.0.0.1:11434/api/tags\" -TimeoutSec 3 | Out-Null
        Write-Ok \"Ollama healthy\"
      } catch {
        Write-Warn \"Ollama not ready yet\"
      }
    }
  }
    Create = {
      Write-Step "Creating MinIO container: phase66-minio"
      Exec "docker run -d --name phase66-minio ``
        -e MINIO_ROOT_USER=minioadmin ``
        -e MINIO_ROOT_PASSWORD=minioadmin ``
        -p 9000:9000 ``
        -p 9001:9001 ``
        -v phase66_minio_data:/data ``
        minio/minio server /data --console-address \":9001\"" | Out-Null
      Start-Sleep -Seconds 3
      Write-Ok "phase66-minio created"
    }
    Health = {
      if ($SkipHealth) { return }
      try {
        Invoke-RestMethod -Uri "http://127.0.0.1:9000/minio/health/live" -TimeoutSec 3 | Out-Null
        Write-Ok "MinIO reachable"
      } catch {
        Write-Warn "MinIO not ready (non-critical)"
      }
    }
  }
)

# Note: Ollama runs natively on Windows (not in container)
Write-Step "Checking native Ollama..."
try {
  $ollamaVer = Invoke-RestMethod -Uri "http://localhost:11434/api/version" -TimeoutSec 3
  Write-Ok "Ollama running natively: $($ollamaVer.version)"
} catch {
  Write-Warn "Ollama not detected. Start manually: ollama serve"
}

# Check for existing containers and start/create as needed
Write-Step "Ensuring Phase 66 containers are running..."
foreach ($d in $deps) {
  Ensure-Container-Running $d.Name $d.Create
}

# Health checks
if (-not $SkipHealth) {
  Write-Step "Running health checks..."
  foreach ($d in $deps) {
    try {
      & $d.Health
    } catch {
      Write-Warn "$($d.Name) health check failed: $($_.Exception.Message)"
    }
  }
}

# ---- Optional: docker-compose fallback (only if ALL containers missing) ----
if ($AllowCompose) {
  $missing = @($deps | Where-Object { -not (Container-Exists $_.Name) })
  if ($missing.Count -gt 0) {
    Write-Warn "Some containers still missing after creation attempts."
    Write-Warn "You enabled -AllowCompose, but compose can rebuild containers."
    Write-Warn "Safer to debug why docker run failed above."
  } else {
    Write-Ok "All containers exist, no need for compose"
  }
}


# ---- Launch Knowledge Plane (Go) ----
Write-Step "🚀 Launching Knowledge Plane (Go)"

# 🔥 CRITICAL: Phase 87 portable stack uses 5434/legal/user (NOT 5432/legal_ai_db/legal_admin)
# This matches your Docker Postgres with pgvector, embeddings, and HNSW indexes
$env:DATABASE_URL = $env:DATABASE_URL ?? "postgresql://user:pass@127.0.0.1:5434/legal"
$env:QDRANT_URL   = $env:QDRANT_URL   ?? "http://127.0.0.1:6333"
$env:REDIS_URL    = $env:REDIS_URL    ?? "redis://127.0.0.1:6379"
$env:OLLAMA_URL   = $env:OLLAMA_URL   ?? "http://127.0.0.1:11434"
$env:EMBED_MODEL  = $env:EMBED_MODEL  ?? "embeddinggemma:latest"
$env:CHAT_MODEL   = $env:CHAT_MODEL   ?? "gemma3-legal:latest"
$env:KNOWLEDGE_PLANE_PORT = $env:KNOWLEDGE_PLANE_PORT ?? "8099"

Write-Ok "Environment configured:"
Write-Host "  DATABASE_URL: postgresql://user:***@127.0.0.1:5434/legal" -ForegroundColor Gray
Write-Host "  QDRANT_URL: $($env:QDRANT_URL)" -ForegroundColor Gray
Write-Host "  REDIS_URL: $($env:REDIS_URL)" -ForegroundColor Gray
Write-Host "  OLLAMA_URL: $($env:OLLAMA_URL)" -ForegroundColor Gray
Write-Host "  EMBED_MODEL: $($env:EMBED_MODEL)" -ForegroundColor Gray
Write-Host "  CHAT_MODEL: $($env:CHAT_MODEL)" -ForegroundColor Gray
Write-Host "  PORT: $($env:KNOWLEDGE_PLANE_PORT)" -ForegroundColor Gray

# Check if binary exists
$binary = "knowledge-plane.exe"
if (-not (Test-Path $binary)) {
  Write-Warn "Binary not found: $binary"
  Write-Step "Building Knowledge Plane..."
  if ($DryRun) {
    Write-Host "[DRYRUN] go build -o $binary ./cmd/server" -ForegroundColor Gray
  } else {
    go build -o $binary ./cmd/server
    Write-Ok "Build complete"
  }
}

Write-Step "Starting Knowledge Plane on port $($env:KNOWLEDGE_PLANE_PORT)..."
if (-not $DryRun) {
  & ".\$binary"
} else {
  Write-Host "[DRYRUN] .\$binary" -ForegroundColor Gray
}

Write-Host "`n2. Building service..." -ForegroundColor Yellow
if (-not (Test-Path "bin/knowledge-plane.exe") -or ((Get-Item "cmd/server/main.go").LastWriteTime -gt (Get-Item "bin/knowledge-plane.exe" -ErrorAction SilentlyContinue).LastWriteTime)) {
    Write-Host "   🔨 Compiling from cmd/server..." -ForegroundColor Gray
    go build -o bin/knowledge-plane.exe ./cmd/server/main.go
    if ($LASTEXITCODE -ne 0) {
        Write-Host "   ❌ Build failed" -ForegroundColor Red
        exit 1
    }
    Write-Host "   ✅ Build complete" -ForegroundColor Green
} else {
    Write-Host "   ✅ Binary up to date" -ForegroundColor Green
}

# 3. Load environment
Write-Host "`n3. Loading environment..." -ForegroundColor Yellow
if (Test-Path ".env") {
    Write-Host "   ✅ Using .env" -ForegroundColor Green
} elseif (Test-Path "../../.env.phase87") {
    Write-Host "   ✅ Using ../../.env.phase87" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  No .env file found, using defaults" -ForegroundColor Yellow
}

# 4. Start service
Write-Host "`n4. Starting Knowledge Plane on port 8099..." -ForegroundColor Yellow
Write-Host "   Press Ctrl+C to stop`n" -ForegroundColor Gray

./bin/knowledge-plane.exe
