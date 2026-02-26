# ACE Contextual Web Ingestion - Manual Testing Script
# Task 6.3 - Guided Manual Testing
# Date: December 21, 2025

Write-Host "=== ACE Contextual Web Ingestion - Manual Testing ===" -ForegroundColor Cyan
Write-Host ""

# Test Scenario 1: Service Health Check
Write-Host "Test Scenario 1: Service Health Check" -ForegroundColor Yellow
Write-Host "--------------------------------------" -ForegroundColor Yellow
Write-Host ""

Write-Host "Step 1: Check if required services are running..." -ForegroundColor Green
Write-Host "Command: docker-compose ps" -ForegroundColor Gray
Write-Host ""

$services = docker-compose ps --format json 2>&1 | ConvertFrom-Json
if ($services) {
    Write-Host "Services running:" -ForegroundColor Green
    $services | ForEach-Object { Write-Host "  - $($_.Service): $($_.State)" }
} else {
    Write-Host "No services running. Need to start services." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Required services for testing:" -ForegroundColor Cyan
Write-Host "  - postgres (PostgreSQL 17 with pgvector)" -ForegroundColor Gray
Write-Host "  - qdrant (Vector database)" -ForegroundColor Gray
Write-Host "  - minio (Object storage)" -ForegroundColor Gray
Write-Host "  - rabbitmq (Message queue)" -ForegroundColor Gray
Write-Host "  - ollama (LLM service)" -ForegroundColor Gray
Write-Host ""

# Ask user if they want to start services
$response = Read-Host "Do you want to start the required services? (y/n)"
if ($response -eq 'y') {
    Write-Host ""
    Write-Host "Starting services..." -ForegroundColor Green
    docker-compose up -d postgres qdrant minio rabbitmq ollama
    Write-Host ""
    Write-Host "Waiting 10 seconds for services to initialize..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
    Write-Host ""
}

# Test Scenario 2: Verify Service Health
Write-Host ""
Write-Host "Test Scenario 2: Verify Service Health" -ForegroundColor Yellow
Write-Host "---------------------------------------" -ForegroundColor Yellow
Write-Host ""

# Check PostgreSQL
Write-Host "Checking PostgreSQL..." -ForegroundColor Green
try {
    $env:PGPASSWORD = "postgres"
    $pgResult = psql -h localhost -U postgres -d legal_ai -c "SELECT 1;" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ PostgreSQL is healthy" -ForegroundColor Green
    } else {
        Write-Host "  ✗ PostgreSQL connection failed" -ForegroundColor Red
        Write-Host "    Error: $pgResult" -ForegroundColor Red
    }
} catch {
    Write-Host "  ✗ PostgreSQL check failed: $_" -ForegroundColor Red
}

# Check Qdrant
Write-Host "Checking Qdrant..." -ForegroundColor Green
try {
    $qdrantResult = Invoke-RestMethod -Uri "http://localhost:6333/health" -Method Get -ErrorAction Stop
    Write-Host "  ✓ Qdrant is healthy" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Qdrant connection failed: $_" -ForegroundColor Red
}

# Check MinIO
Write-Host "Checking MinIO..." -ForegroundColor Green
try {
    $minioResult = Invoke-RestMethod -Uri "http://localhost:9000/minio/health/live" -Method Get -ErrorAction Stop
    Write-Host "  ✓ MinIO is healthy" -ForegroundColor Green
} catch {
    Write-Host "  ✗ MinIO connection failed: $_" -ForegroundColor Red
}

# Check RabbitMQ
Write-Host "Checking RabbitMQ..." -ForegroundColor Green
try {
    $rabbitResult = Invoke-RestMethod -Uri "http://localhost:15672/api/overview" -Method Get -Credential (New-Object System.Management.Automation.PSCredential("admin", (ConvertTo-SecureString "admin" -AsPlainText -Force))) -ErrorAction Stop
    Write-Host "  ✓ RabbitMQ is healthy" -ForegroundColor Green
} catch {
    Write-Host "  ✗ RabbitMQ connection failed: $_" -ForegroundColor Red
}

# Check Ollama
Write-Host "Checking Ollama..." -ForegroundColor Green
try {
    $ollamaResult = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -Method Get -ErrorAction Stop
    Write-Host "  ✓ Ollama is healthy" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Ollama connection failed: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Service Health Check Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. If all services are healthy, proceed with Test Scenario 3 (Ingestion)" -ForegroundColor Gray
Write-Host "2. If any service failed, troubleshoot before continuing" -ForegroundColor Gray
Write-Host ""
