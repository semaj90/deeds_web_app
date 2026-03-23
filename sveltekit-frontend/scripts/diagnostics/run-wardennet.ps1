# PowerShell script to deploy the complete Legal AI platform stack
# Run this to start all services: PostgreSQL, Redis, MinIO, Ollama, Qdrant, SvelteKit

Write-Host "🚀 Starting Legal AI Platform (WardenNet)..." -ForegroundColor Green
Write-Host "This will start: PostgreSQL, Redis, MinIO, Ollama, Qdrant, SvelteKit" -ForegroundColor Cyan
Write-Host ""

# Check if docker-compose exists
if (!(Test-Path "docker-compose.dev.yml")) {
    Write-Host "❌ docker-compose.dev.yml not found in current directory" -ForegroundColor Red
    exit 1
}

# Stop any existing containers
Write-Host "🛑 Stopping existing containers..." -ForegroundColor Yellow
docker-compose -f docker-compose.dev.yml down

# Start all services
Write-Host "🏗️ Building and starting all services..." -ForegroundColor Green
docker-compose -f docker-compose.dev.yml up --build -d

# Wait for services to be ready
Write-Host "⏳ Waiting for services to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Check service status
Write-Host "`n📊 Service Status:" -ForegroundColor Magenta
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Health checks
Write-Host "`n🏥 Health Checks:" -ForegroundColor Blue

# PostgreSQL
try {
    $pgHealth = docker exec deeds-postgres pg_isready -U legal_admin -d legal_ai_db 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ PostgreSQL: Healthy" -ForegroundColor Green
    } else {
        Write-Host "❌ PostgreSQL: Unhealthy" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ PostgreSQL: Connection failed" -ForegroundColor Red
}

# Redis
try {
    $redisHealth = docker exec deeds-redis redis-cli ping 2>$null
    if ($redisHealth -eq "PONG") {
        Write-Host "✅ Redis: Healthy" -ForegroundColor Green
    } else {
        Write-Host "❌ Redis: Unhealthy" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Redis: Connection failed" -ForegroundColor Red
}

# MinIO
try {
    $minioResponse = Invoke-WebRequest -Uri "http://localhost:9000/minio/health/live" -TimeoutSec 5 -ErrorAction Stop
    if ($minioResponse.StatusCode -eq 200) {
        Write-Host "✅ MinIO: Healthy (API: http://localhost:9000, Console: http://localhost:9001)" -ForegroundColor Green
    } else {
        Write-Host "❌ MinIO: Unhealthy" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ MinIO: Connection failed" -ForegroundColor Red
}

# Ollama
try {
    $ollamaResponse = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -TimeoutSec 5 -ErrorAction Stop
    if ($ollamaResponse.StatusCode -eq 200) {
        Write-Host "✅ Ollama: Healthy (http://localhost:11434)" -ForegroundColor Green
    } else {
        Write-Host "❌ Ollama: Unhealthy" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Ollama: Connection failed" -ForegroundColor Red
}

# Qdrant
try {
    $qdrantResponse = Invoke-WebRequest -Uri "http://localhost:6333/health" -TimeoutSec 5 -ErrorAction Stop
    if ($qdrantResponse.StatusCode -eq 200) {
        Write-Host "✅ Qdrant: Healthy (http://localhost:6333)" -ForegroundColor Green
    } else {
        Write-Host "❌ Qdrant: Unhealthy" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Qdrant: Connection failed" -ForegroundColor Red
}

Write-Host "`n🌐 Access URLs:" -ForegroundColor Cyan
Write-Host "📱 SvelteKit App:    http://localhost:5173"
Write-Host "🗄️ MinIO Console:    http://localhost:9001 (user: minioadmin, pass: minioadmin)"
Write-Host "🧠 Qdrant Dashboard: http://localhost:6333/dashboard"
Write-Host "💬 Ollama API:       http://localhost:11434"
Write-Host "🐘 PostgreSQL:       localhost:5432 (user: legal_admin, db: legal_ai_db)"
Write-Host "🔴 Redis:            localhost:6379"

Write-Host "`n🎯 Ready to use! Run your API tests now." -ForegroundColor Green
Write-Host "Example: curl -X POST http://localhost:5173/api/v1/rag/search -H 'Content-Type: application/json' -d '{\"query\":\"test\"}'" -ForegroundColor Yellow