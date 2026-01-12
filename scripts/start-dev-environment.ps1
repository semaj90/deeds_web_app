# Legal AI Development Environment Startup Script
# Phase 96 - Using Existing Docker Containers (NO docker-compose)
# January 11, 2026

param(
    [switch]$SkipDocker,
    [switch]$Verbose,
    [switch]$OpenBrowser
)

$ErrorActionPreference = "Continue"

# Define containers
$containers = @(
    "phase66-postgres",
    "phase66-redis",
    "phase66-rabbitmq",
    "phase66-qdrant",
    "phase66-minio",
    "phase66-couchdb",
    "deeds-neo4j"
)

Write-Host ""
Write-Host "🚀 Legal AI Development Environment" -ForegroundColor Cyan
Write-Host "═" * 70
Write-Host ""

# Check if Docker is running (unless skipped)
if (-not $SkipDocker) {
    Write-Host "🐳 Checking Docker status..." -ForegroundColor Yellow
    try {
        $dockerInfo = docker info 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "   ⚠️  Docker is not running!" -ForegroundColor Red
            Write-Host "   Please start Docker Desktop and try again." -ForegroundColor Yellow
            Write-Host "   Or use -SkipDocker flag to start only SvelteKit." -ForegroundColor Gray
            exit 1
        }
        Write-Host "   ✅ Docker is running" -ForegroundColor Green
    } catch {
        Write-Host "   ❌ Docker not found!" -ForegroundColor Red
        exit 1
    }
    Write-Host ""

    # Start Docker containers (NO docker-compose)
    Write-Host "📦 Starting existing Docker containers..." -ForegroundColor Yellow
    foreach ($container in $containers) {
        $status = docker inspect --format='{{.State.Running}}' $container 2>&1
        if ($status -eq "true") {
            Write-Host "   ⏭️  $container already running" -ForegroundColor Gray
        } else {
            Write-Host "   🔄 Starting $container..." -ForegroundColor Cyan
            docker start $container | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Host "   ✅ $container started" -ForegroundColor Green
            } else {
                Write-Host "   ⚠️  Failed to start $container" -ForegroundColor Yellow
            }
        }
    }
    Write-Host ""

    # Wait for services to initialize
    Write-Host "⏳ Waiting for services to initialize (10 seconds)..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
    Write-Host ""

    # Check service status
    Write-Host "🔍 Service Health Checks:" -ForegroundColor Yellow
    Write-Host ""

    # PostgreSQL (port 5434)
    try {
        $pgStatus = docker exec phase66-postgres pg_isready -U user 2>&1
        if ($pgStatus -match "accepting") {
            Write-Host "   ✅ PostgreSQL" -ForegroundColor Green
            Write-Host "      URL: postgresql://user:user@localhost:5434/legal" -ForegroundColor Gray
        } else {
            Write-Host "   ⚠️  PostgreSQL (still starting...)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "   ❌ PostgreSQL" -ForegroundColor Red
    }

    # Redis (port 6379)
    try {
        $redisStatus = docker exec phase66-redis redis-cli ping 2>&1
        if ($redisStatus -eq "PONG") {
            Write-Host "   ✅ Redis Stack (RediSearch + RedisJSON)" -ForegroundColor Green
            Write-Host "      URL: redis://localhost:6379" -ForegroundColor Gray
        } else {
            Write-Host "   ⚠️  Redis (still starting...)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "   ❌ Redis" -ForegroundColor Red
    }

    # RabbitMQ (ports 5672, 15672)
    try {
        $rabbitStatus = docker exec phase66-rabbitmq rabbitmqctl status 2>&1
        if ($rabbitStatus -match "running") {
            Write-Host "   ✅ RabbitMQ Streams" -ForegroundColor Green
            Write-Host "      AMQP: amqp://guest:guest@localhost:5672" -ForegroundColor Gray
            Write-Host "      UI: http://localhost:15672 (guest/guest)" -ForegroundColor Gray
        } else {
            Write-Host "   ⚠️  RabbitMQ (still starting...)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "   ❌ RabbitMQ" -ForegroundColor Red
    }

    # Qdrant (port 6333)
    try {
        $qdrantStatus = Invoke-RestMethod -Uri "http://localhost:6333/" -Method GET -TimeoutSec 3 -ErrorAction SilentlyContinue
        if ($qdrantStatus) {
            Write-Host "   ✅ Qdrant Vector DB" -ForegroundColor Green
            Write-Host "      HTTP: http://localhost:6333" -ForegroundColor Gray
        } else {
            Write-Host "   ⚠️  Qdrant (still starting...)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "   ⚠️  Qdrant (still starting...)" -ForegroundColor Yellow
    }

    # MinIO (ports 9000-9001)
    try {
        $minioStatus = Invoke-WebRequest -Uri "http://localhost:9000/minio/health/live" -Method GET -TimeoutSec 3 -ErrorAction SilentlyContinue
        if ($minioStatus.StatusCode -eq 200) {
            Write-Host "   ✅ MinIO S3 Storage" -ForegroundColor Green
            Write-Host "      API: http://localhost:9000" -ForegroundColor Gray
            Write-Host "      Console: http://localhost:9001 (minio/minio123)" -ForegroundColor Gray
        } else {
            Write-Host "   ⚠️  MinIO (still starting...)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "   ⚠️  MinIO (still starting...)" -ForegroundColor Yellow
    }

    # CouchDB (port 5984)
    try {
        $couchStatus = Invoke-RestMethod -Uri "http://localhost:5984/_up" -Method GET -TimeoutSec 3 -ErrorAction SilentlyContinue
        if ($couchStatus.status -eq "ok") {
            Write-Host "   ✅ CouchDB" -ForegroundColor Green
            Write-Host "      URL: http://admin:admin@localhost:5984" -ForegroundColor Gray
        } else {
            Write-Host "   ⚠️  CouchDB (still starting...)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "   ⚠️  CouchDB (still starting...)" -ForegroundColor Yellow
    }

    # Neo4j (ports 7474, 7687)
    try {
        $neo4jStatus = Invoke-WebRequest -Uri "http://localhost:7474/" -Method GET -TimeoutSec 3 -ErrorAction SilentlyContinue
        if ($neo4jStatus.StatusCode -eq 200) {
            Write-Host "   ✅ Neo4j Graph DB" -ForegroundColor Green
            Write-Host "      Browser: http://localhost:7474" -ForegroundColor Gray
            Write-Host "      Bolt: bolt://localhost:7687 (neo4j/password)" -ForegroundColor Gray
        } else {
            Write-Host "   ⚠️  Neo4j (still starting...)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "   ⚠️  Neo4j (still starting...)" -ForegroundColor Yellow
    }

    Write-Host ""
}

# Start SvelteKit Frontend
Write-Host "🎨 Starting SvelteKit Frontend..." -ForegroundColor Yellow

# Check if node_modules exists
if (-not (Test-Path "sveltekit-frontend/node_modules")) {
    Write-Host "   📦 Installing dependencies..." -ForegroundColor Yellow
    Push-Location sveltekit-frontend
    npm install | Out-Null
    Pop-Location
    Write-Host "   ✅ Dependencies installed" -ForegroundColor Green
}

# Start dev server in new window
Push-Location sveltekit-frontend

if ($Verbose) {
    Write-Host "   Starting dev server (verbose mode)..." -ForegroundColor Gray
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev"
} else {
    Write-Host "   Starting dev server..." -ForegroundColor Gray
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev" -WindowStyle Minimized
}

Pop-Location

Write-Host "   ✅ SvelteKit started" -ForegroundColor Green
Write-Host ""

# Wait for SvelteKit to start
Write-Host "⏳ Waiting for SvelteKit to start (5 seconds)..." -ForegroundColor Yellow
Start-Sleep -Seconds 5
Write-Host ""

# Final summary
Write-Host "✨ Development Environment Ready!" -ForegroundColor Green
Write-Host "═" * 70
Write-Host ""

Write-Host "🌐 Application URLs:" -ForegroundColor Cyan
Write-Host "   Frontend:        http://localhost:5175" -ForegroundColor White
Write-Host ""

if (-not $SkipDocker) {
    Write-Host "🛠️  Service Management:" -ForegroundColor Cyan
    Write-Host "   RabbitMQ UI:     http://localhost:15672" -ForegroundColor White
    Write-Host "                    (Username: legal_admin, Password: secret123)" -ForegroundColor Gray
    Write-Host "   MinIO Console:   http://localhost:9001" -ForegroundColor White
    Write-Host "                    (Username: minio, Password: minio123)" -ForegroundColor Gray
    Write-Host "   RedisInsight:    http://localhost:18001" -ForegroundColor White
    Write-Host ""

    Write-Host "🔧 Direct Connections:" -ForegroundColor Cyan
    Write-Host "   PostgreSQL:      localhost:5432" -ForegroundColor White
    Write-Host "   Redis:           localhost:6379" -ForegroundColor White
    Write-Host "   RabbitMQ AMQP:   localhost:5672" -ForegroundColor White
    Write-Host "   Qdrant HTTP:     localhost:6333" -ForegroundColor White
    Write-Host "   MinIO S3:        localhost:9000" -ForegroundColor White
    Write-Host ""
}

Write-Host "📚 Documentation:" -ForegroundColor Cyan
Write-Host "   Runtime Guide:   docs/RUNTIME_INTEGRATION_GUIDE.md" -ForegroundColor White
Write-Host "   RabbitMQ Setup:  docs/RABBITMQ_CLUSTER_DEPLOYMENT_GUIDE.md" -ForegroundColor White
Write-Host "   Quick Ref:       docs/PHASE96_QUICK_REFERENCE.md" -ForegroundColor White
Write-Host ""

Write-Host "🛑 To stop all services:" -ForegroundColor Yellow
Write-Host "   docker-compose down" -ForegroundColor Gray
Write-Host ""

# Optional: Open browser
$openBrowser = Read-Host "Open browser to http://localhost:5175? (y/N)"
if ($openBrowser -eq "y" -or $openBrowser -eq "Y") {
    Start-Process "http://localhost:5175"
}

Write-Host ""
Write-Host "Happy coding! 🚀" -ForegroundColor Green
Write-Host ""
