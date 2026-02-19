param(
  [switch]$AllowCompose,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "✅ $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "⚠️  $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "❌ $msg" -ForegroundColor Red }

function Exec($cmd) {
  if ($DryRun) { Write-Host "[DRYRUN] $cmd" -ForegroundColor Gray; return "" }
  return (Invoke-Expression $cmd)
}

function Container-Exists($name) {
  $id = Exec "docker ps -a --filter `"name=^/$name$`" --format `"{{.ID}}`""
  return -not [string]::IsNullOrWhiteSpace($id)
}

function Container-Running($name) {
  $id = Exec "docker ps --filter `"name=^/$name$`" --format `"{{.ID}}`""
  return -not [string]::IsNullOrWhiteSpace($id)
}

function Volume-Exists($vol) {
  $v = Exec "docker volume ls --format `"{{.Name}}`" | Select-String -SimpleMatch $vol"
  return -not [string]::IsNullOrWhiteSpace($v)
}

function Ensure-Container-Running($name, $createFn) {
  if (Container-Running $name) {
    Write-Ok "$name is already running"
    return
  }

  if (Container-Exists $name) {
    Write-Step "Starting existing container: $name"
    Exec "docker start $name | Out-Null"
    Start-Sleep -Seconds 2
    Write-Ok "$name started (existing container preserved)"
    return
  }

  Write-Warn "$name does NOT exist"
  & $createFn
}

Write-Step "🔒 Dependency safeguard start (NO compose rebuild). DryRun=$DryRun AllowCompose=$AllowCompose"

if ($AllowCompose) {
  Write-Warn "AllowCompose is enabled. This script will allow compose operations if needed."
} else {
  Write-Ok "Safeguard active: will NOT run docker compose (only 'docker start' for existing containers)"
}

Exec "docker version | Out-Null"
Write-Ok "Docker daemon reachable"

# ---- Hardcoded dependency targets (Phase 87 portable stack) ----
# These are your ACTUAL container names from docker ps -a
$deps = @(
  @{
    Name = "phase66-postgres"
    Volume = "phase66-postgres-data"
    Create = {
      Write-Step "Creating Postgres container (missing): phase66-postgres"
      Write-Warn "🔥 SAFEGUARD: Only creating because container is missing."
      Write-Warn "   This container will use:"
      Write-Host "     - Port: 5434 (NOT 5432, to avoid Windows Postgres collision)" -ForegroundColor Yellow
      Write-Host "     - Database: legal_ai_db" -ForegroundColor Yellow
      Write-Host "     - User: legal_admin / Pass: 123456" -ForegroundColor Yellow
      Write-Host "     - Volume: phase66-postgres-data" -ForegroundColor Yellow

      if ($DryRun) {
        Write-Host "[DRYRUN] Would create phase66-postgres" -ForegroundColor Gray
        return
      }

      Exec "docker run -d --name phase66-postgres -e POSTGRES_USER=legal_admin -e POSTGRES_PASSWORD=123456 -e POSTGRES_DB=legal_ai_db -p 5434:5432 -v phase66-postgres-data:/var/lib/postgresql/data postgres:17-alpine" | Out-Null
      Start-Sleep -Seconds 5
      Write-Ok "phase66-postgres created"
    }
    Health = {
      Start-Sleep -Seconds 2
      Exec "docker exec phase66-postgres psql -U legal_admin -d legal_ai_db -c 'SELECT 1;' 2>&1 | Out-Null"
      Write-Ok "Postgres healthy (5434/legal_ai_db/legal_admin)"
    }
  },
  @{
    Name = "phase66-qdrant"
    Volume = "phase66-qdrant-storage"
    Create = {
      $vol = "phase66-qdrant-storage"
      if (Volume-Exists $vol) {
        Write-Warn "Volume '$vol' already exists but container 'phase66-qdrant' is missing."
        Write-Warn "This is safe (volume preserved). Creating container that reuses it."
      }
      Write-Step "Creating Qdrant container (missing): phase66-qdrant"

      if ($DryRun) {
        Write-Host "[DRYRUN] Would create phase66-qdrant" -ForegroundColor Gray
        return
      }

      Exec "docker run -d --name phase66-qdrant -p 6333:6333 -p 6334:6334 -v phase66-qdrant-storage:/qdrant/storage qdrant/qdrant:latest" | Out-Null
      Start-Sleep -Seconds 3
      Write-Ok "phase66-qdrant created"
    }
    Health = {
      Start-Sleep -Seconds 1
      Exec "powershell -NoProfile -Command 'Invoke-RestMethod http://127.0.0.1:6333/collections 2>&1 | Out-Null'"
      Write-Ok "Qdrant reachable (6333)"
    }
  },
  @{
    Name = "phase66-redis"
    Volume = "phase66-redis-data"
    Create = {
      Write-Step "Creating Redis container (missing): phase66-redis"

      if ($DryRun) {
        Write-Host "[DRYRUN] Would create phase66-redis" -ForegroundColor Gray
        return
      }

      Exec "docker run -d --name phase66-redis -p 6379:6379 -v phase66-redis-data:/data redis:7-alpine redis-server --appendonly yes" | Out-Null
      Start-Sleep -Seconds 2
      Write-Ok "phase66-redis created"
    }
    Health = {
      Exec "docker exec phase66-redis redis-cli ping 2>&1 | Out-Null"
      Write-Ok "Redis healthy (6379)"
    }
  },
  @{
    Name = "ollama-gemma"
    Volume = "ollama-models"
    Create = {
      $vol = "ollama-models"
      if (Volume-Exists $vol) {
        Write-Warn "Volume '$vol' exists, reusing it (preserves downloaded models)."
      }
      Write-Step "Creating Ollama container (missing): ollama-gemma"
      Write-Warn "⚠️  This container requires ~15GB for gemma3-legal + embeddinggemma models"

      if ($DryRun) {
        Write-Host "[DRYRUN] Would create ollama-gemma" -ForegroundColor Gray
        return
      }

      Exec "docker run -d --name ollama-gemma -p 11434:11434 -v ollama-models:/root/.ollama ollama/ollama:latest" | Out-Null
      Start-Sleep -Seconds 3
      Write-Ok "ollama-gemma created"
      Write-Warn "Remember to pull models: docker exec ollama-gemma ollama pull gemma3-legal:latest"
    }
    Health = {
      Start-Sleep -Seconds 1
      Exec "powershell -NoProfile -Command 'Invoke-RestMethod http://127.0.0.1:11434/api/tags 2>&1 | Out-Null'"
      Write-Ok "Ollama reachable (11434)"
    }
  },
  @{
    Name = "phase66-minio"
    Volume = "phase66-minio-data"
    Create = {
      Write-Step "Creating MinIO container (missing): phase66-minio"

      if ($DryRun) {
        Write-Host "[DRYRUN] Would create phase66-minio" -ForegroundColor Gray
        return
      }

      Exec "docker run -d --name phase66-minio -p 9000:9000 -p 9001:9001 -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin -v phase66-minio-data:/data minio/minio:latest server /data --console-address ':9001'" | Out-Null
      Start-Sleep -Seconds 3
      Write-Ok "phase66-minio created"
    }
    Health = {
      Start-Sleep -Seconds 1
      Exec "powershell -NoProfile -Command 'Invoke-RestMethod http://127.0.0.1:9000/minio/health/live 2>&1 | Out-Null'"
      Write-Ok "MinIO reachable (9000-9001)"
    }
  }
)

Write-Step "🚀 Starting dependencies (safe mode: no rebuilds)"
foreach ($d in $deps) {
  Ensure-Container-Running $d.Name $d.Create
}

Write-Step "🏥 Health checks"
$healthFailed = $false
foreach ($d in $deps) {
  try {
    & $d.Health
  } catch {
    Write-Warn "$($d.Name) health check failed: $($_.Exception.Message)"
    $healthFailed = $true
  }
}

if ($healthFailed) {
  Write-Warn "Some health checks failed. Containers may still be starting."
  Write-Host "   Wait 10 seconds and check manually with: docker ps" -ForegroundColor Gray
}

Write-Step "🔧 Launching Knowledge Plane (Go service)"

# Phase 66/89 portable stack uses 5434/legal_ai_db/legal_admin
$env:KP_DATABASE_URL = $env:KP_DATABASE_URL ?? "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db"
$env:KP_QDRANT_URL   = $env:KP_QDRANT_URL   ?? "http://127.0.0.1:6333"
$env:KP_REDIS_URL    = $env:KP_REDIS_URL    ?? "redis://127.0.0.1:6379"
$env:KP_OLLAMA_URL   = $env:KP_OLLAMA_URL   ?? "http://127.0.0.1:11434"
$env:KP_EMBED_MODEL  = $env:KP_EMBED_MODEL  ?? "embeddinggemma:latest"
$env:KP_CHAT_MODEL   = $env:KP_CHAT_MODEL   ?? "gemma3-legal:latest"
$env:KP_PORT         = $env:KP_PORT         ?? "8099"

Write-Ok "Environment configured:"
Write-Host "  KP_DATABASE_URL: $($env:KP_DATABASE_URL)" -ForegroundColor Gray
Write-Host "  KP_QDRANT_URL:   $($env:KP_QDRANT_URL)" -ForegroundColor Gray
Write-Host "  KP_REDIS_URL:    $($env:KP_REDIS_URL)" -ForegroundColor Gray
Write-Host "  KP_OLLAMA_URL:   $($env:KP_OLLAMA_URL)" -ForegroundColor Gray
Write-Host "  KP_EMBED_MODEL:  $($env:KP_EMBED_MODEL)" -ForegroundColor Gray
Write-Host "  KP_CHAT_MODEL:   $($env:KP_CHAT_MODEL)" -ForegroundColor Gray
Write-Host "  KP_PORT:         $($env:KP_PORT)" -ForegroundColor Gray

if ($DryRun) {
  Write-Host "`n[DRYRUN] Would execute: .\bin\knowledge-plane.exe" -ForegroundColor Gray
  Write-Ok "Dry run complete. Use without -DryRun to actually start."
  exit 0
}

Write-Step "🚀 Starting Knowledge Plane on port $($env:KP_PORT)..."

if (-not (Test-Path ".\bin\knowledge-plane.exe")) {
  Write-Err "Knowledge Plane binary not found at .\bin\knowledge-plane.exe"
  Write-Host "Build it first: go build -o bin/knowledge-plane.exe ./cmd/server" -ForegroundColor Yellow
  exit 1
}

Exec ".\bin\knowledge-plane.exe"
