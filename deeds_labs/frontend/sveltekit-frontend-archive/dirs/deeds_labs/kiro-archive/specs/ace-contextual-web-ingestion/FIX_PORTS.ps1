# ACE Web Ingestion - Port Connectivity Fix
# Diagnoses and fixes port connectivity issues between Windows host and Docker containers

$ErrorActionPreference = "Continue"

Write-Host "=== ACE Port Connectivity Diagnostic ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Test from inside containers (should always work)
Write-Host "Step 1: Testing from INSIDE containers..." -ForegroundColor Yellow
Write-Host "---------------------------------------" -ForegroundColor Yellow

Write-Host "`nQdrant (internal):"
$qdrantInternal = docker exec phase66-qdrant wget -q -O- http://localhost:6333/ 2>$null
if ($qdrantInternal) {
    Write-Host "  ✅ Qdrant responding inside container" -ForegroundColor Green
} else {
    Write-Host "  ❌ Qdrant NOT responding inside container" -ForegroundColor Red
}

Write-Host "`nRabbitMQ (internal):"
$rabbitInternal = docker exec phase66-rabbitmq wget -q -O- http://localhost:15672 2>$null
if ($rabbitInternal) {
    Write-Host "  ✅ RabbitMQ responding inside container" -ForegroundColor Green
} else {
    Write-Host "  ❌ RabbitMQ NOT responding inside container" -ForegroundColor Red
}

Write-Host ""

# Step 2: Get container IPs
Write-Host "Step 2: Getting container IP addresses..." -ForegroundColor Yellow
Write-Host "---------------------------------------" -ForegroundColor Yellow

$qdrantIP = docker inspect phase66-qdrant --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'
$rabbitIP = docker inspect phase66-rabbitmq --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'
$minioIP = docker inspect phase66-minio --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'
$postgresIP = docker inspect phase66-postgres --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'

Write-Host "`nContainer IPs:"
Write-Host "  Qdrant:    $qdrantIP" -ForegroundColor Cyan
Write-Host "  RabbitMQ:  $rabbitIP" -ForegroundColor Cyan
Write-Host "  MinIO:     $minioIP" -ForegroundColor Cyan
Write-Host "  PostgreSQL: $postgresIP" -ForegroundColor Cyan

Write-Host ""

# Step 3: Test from host with different methods
Write-Host "Step 3: Testing from HOST (Windows)..." -ForegroundColor Yellow
Write-Host "---------------------------------------" -ForegroundColor Yellow

# Test Qdrant
Write-Host "`nQdrant (port 6333):"
Write-Host "  Testing localhost..." -NoNewline
try {
    $test1 = Invoke-WebRequest -Uri "http://localhost:6333/" -Method Get -TimeoutSec 2 -ErrorAction Stop
    Write-Host " ✅ Works" -ForegroundColor Green
    $qdrantWorks = "localhost"
} catch {
    Write-Host " ❌ Failed" -ForegroundColor Red
    $qdrantWorks = $null
}

Write-Host "  Testing 127.0.0.1..." -NoNewline
try {
    $test2 = Invoke-WebRequest -Uri "http://127.0.0.1:6333/" -Method Get -TimeoutSec 2 -ErrorAction Stop
    Write-Host " ✅ Works" -ForegroundColor Green
    if (-not $qdrantWorks) { $qdrantWorks = "127.0.0.1" }
} catch {
    Write-Host " ❌ Failed" -ForegroundColor Red
}

Write-Host "  Testing container IP ($qdrantIP)..." -NoNewline
try {
    $test3 = Invoke-WebRequest -Uri "http://${qdrantIP}:6333/" -Method Get -TimeoutSec 2 -ErrorAction Stop
    Write-Host " ✅ Works" -ForegroundColor Green
    if (-not $qdrantWorks) { $qdrantWorks = $qdrantIP }
} catch {
    Write-Host " ❌ Failed" -ForegroundColor Red
}

# Test RabbitMQ
Write-Host "`nRabbitMQ (port 15672):"
Write-Host "  Testing localhost..." -NoNewline
try {
    $test4 = Invoke-WebRequest -Uri "http://localhost:15672" -Method Get -TimeoutSec 2 -ErrorAction Stop
    Write-Host " ✅ Works" -ForegroundColor Green
    $rabbitWorks = "localhost"
} catch {
    Write-Host " ❌ Failed" -ForegroundColor Red
    $rabbitWorks = $null
}

Write-Host "  Testing 127.0.0.1..." -NoNewline
try {
    $test5 = Invoke-WebRequest -Uri "http://127.0.0.1:15672" -Method Get -TimeoutSec 2 -ErrorAction Stop
    Write-Host " ✅ Works" -ForegroundColor Green
    if (-not $rabbitWorks) { $rabbitWorks = "127.0.0.1" }
} catch {
    Write-Host " ❌ Failed" -ForegroundColor Red
}

Write-Host "  Testing container IP ($rabbitIP)..." -NoNewline
try {
    $test6 = Invoke-WebRequest -Uri "http://${rabbitIP}:15672" -Method Get -TimeoutSec 2 -ErrorAction Stop
    Write-Host " ✅ Works" -ForegroundColor Green
    if (-not $rabbitWorks) { $rabbitWorks = $rabbitIP }
} catch {
    Write-Host " ❌ Failed" -ForegroundColor Red
}

Write-Host ""

# Step 4: Recommendations
Write-Host "=== Recommendations ===" -ForegroundColor Cyan
Write-Host ""

if ($qdrantWorks -and $rabbitWorks) {
    Write-Host "✅ Services are accessible from Windows host!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Update your .env file with these URLs:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "QDRANT_URL=http://${qdrantWorks}:6333" -ForegroundColor Cyan
    Write-Host "RABBITMQ_URL=amqp://guest:guest@${rabbitWorks}:5672/" -ForegroundColor Cyan
    Write-Host "MINIO_ENDPOINT=http://${qdrantWorks}:9000" -ForegroundColor Cyan
    Write-Host "DATABASE_URL=postgresql://legal_admin:123456@${qdrantWorks}:5432/legal_ai_db" -ForegroundColor Cyan
    Write-Host ""
} else {
    Write-Host "❌ Services NOT accessible from Windows host" -ForegroundColor Red
    Write-Host ""
    Write-Host "This is likely a Windows firewall or Docker Desktop networking issue." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Solutions:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Option 1: Run worker in Docker (recommended)" -ForegroundColor Cyan
    Write-Host "  docker run --rm -it --network phase66_default \" -ForegroundColor Gray
    Write-Host "    -e QDRANT_URL=http://phase66-qdrant:6333 \" -ForegroundColor Gray
    Write-Host "    -e RABBITMQ_URL=amqp://guest:guest@phase66-rabbitmq:5672/ \" -ForegroundColor Gray
    Write-Host "    -e DATABASE_URL=postgresql://legal_admin:123456@phase66-postgres:5432/legal_ai_db \" -ForegroundColor Gray
    Write-Host "    -e OLLAMA_URL=http://host.docker.internal:11434 \" -ForegroundColor Gray
    Write-Host "    ace-worker" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Option 2: Use container IPs in .env" -ForegroundColor Cyan
    Write-Host "  QDRANT_URL=http://${qdrantIP}:6333" -ForegroundColor Gray
    Write-Host "  RABBITMQ_URL=amqp://guest:guest@${rabbitIP}:5672/" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Option 3: Restart Docker Desktop" -ForegroundColor Cyan
    Write-Host "  Sometimes Docker networking gets stuck" -ForegroundColor Gray
    Write-Host ""
}

Write-Host "=== Port Mappings ===" -ForegroundColor Cyan
docker port phase66-qdrant
docker port phase66-rabbitmq

Write-Host ""
Write-Host "=== Container Status ===" -ForegroundColor Cyan
docker ps --filter "name=phase66" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

Write-Host ""
