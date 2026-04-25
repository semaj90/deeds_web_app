# ACE Contextual Web Ingestion - Service Health Check
# Simple version for manual testing

Write-Host "=== Service Health Check ===" -ForegroundColor Cyan
Write-Host ""

# Check Qdrant
Write-Host "Checking Qdrant (http://localhost:6333)..." -ForegroundColor Green
try {
    $qdrant = Invoke-RestMethod -Uri "http://localhost:6333/health" -Method Get -ErrorAction Stop -TimeoutSec 5
    Write-Host "  SUCCESS: Qdrant is healthy" -ForegroundColor Green
} catch {
    Write-Host "  FAILED: Qdrant not responding" -ForegroundColor Red
}

# Check MinIO
Write-Host "Checking MinIO (http://localhost:9000)..." -ForegroundColor Green
try {
    $minio = Invoke-RestMethod -Uri "http://localhost:9000/minio/health/live" -Method Get -ErrorAction Stop -TimeoutSec 5
    Write-Host "  SUCCESS: MinIO is healthy" -ForegroundColor Green
} catch {
    Write-Host "  FAILED: MinIO not responding" -ForegroundColor Red
}

# Check RabbitMQ
Write-Host "Checking RabbitMQ (http://localhost:15672)..." -ForegroundColor Green
try {
    $cred = New-Object System.Management.Automation.PSCredential("admin", (ConvertTo-SecureString "admin" -AsPlainText -Force))
    $rabbit = Invoke-RestMethod -Uri "http://localhost:15672/api/overview" -Method Get -Credential $cred -ErrorAction Stop -TimeoutSec 5
    Write-Host "  SUCCESS: RabbitMQ is healthy" -ForegroundColor Green
} catch {
    Write-Host "  FAILED: RabbitMQ not responding" -ForegroundColor Red
}

# Check Ollama
Write-Host "Checking Ollama (http://localhost:11434)..." -ForegroundColor Green
try {
    $ollama = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -Method Get -ErrorAction Stop -TimeoutSec 5
    Write-Host "  SUCCESS: Ollama is healthy" -ForegroundColor Green
} catch {
    Write-Host "  FAILED: Ollama not responding" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Health Check Complete ===" -ForegroundColor Cyan
