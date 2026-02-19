# Phase 72 Deployment Script for Windows
# Deploys the Neo4j-based AST Error Reduction system

param(
    [string]$Neo4jPassword = "password",
    [string]$RedisPassword = "redis"
)

Write-Host "Starting Phase 72: Neo4j-Based AST Error Reduction Deployment" -ForegroundColor Green

# Check if Docker is running
try {
    $null = docker info
} catch {
    Write-Host "Docker is not running. Please start Docker first." -ForegroundColor Red
    exit 1
}

# Set environment variables
$env:NEO4J_PASSWORD = $Neo4jPassword
$env:REDIS_PASSWORD = $RedisPassword

Write-Host "Building Phase 72 services..." -ForegroundColor Yellow

# Build the services
docker-compose -f ../../docker-compose.phase72.yml build

Write-Host "Starting Phase 72 services..." -ForegroundColor Yellow

# Start the services
docker-compose -f ../../docker-compose.phase72.yml up -d

Write-Host "Waiting for services to be healthy..." -ForegroundColor Yellow

# Wait for Neo4j to be ready
Write-Host "Waiting for Neo4j..." -ForegroundColor Cyan
$timeout = 300
$counter = 0
while ($true) {
    try {
        $result = docker-compose -f ../../docker-compose.phase72.yml exec -T neo4j cypher-shell -u neo4j -p "$env:NEO4J_PASSWORD" "MATCH () RETURN count(*) limit 1"
        if ($LASTEXITCODE -eq 0) {
            break
        }
    } catch {
        # Continue waiting
    }

    if ($counter -gt $timeout) {
        Write-Host "Neo4j failed to start within $timeout seconds" -ForegroundColor Red
        exit 1
    }
    $counter += 10
    Write-Host "Still waiting for Neo4j... ($counter/$timeout seconds)" -ForegroundColor Gray
    Start-Sleep -Seconds 10
}

Write-Host "Neo4j is ready!" -ForegroundColor Green

# Wait for other services
$services = @("phase72-go-service", "phase72-python-service", "phase72-node-service")
$ports = @("8072", "8073", "8074")

for ($i = 0; $i -lt $services.Length; $i++) {
    $service = $services[$i]
    $port = $ports[$i]

    Write-Host "Waiting for $service..." -ForegroundColor Cyan
    $counter = 0
    while ($true) {
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:$port/api/v1/health" -TimeoutSec 5
            if ($response.StatusCode -eq 200) {
                break
            }
        } catch {
            # Continue waiting
        }

        if ($counter -gt 120) {
            Write-Host "$service failed to start within 120 seconds" -ForegroundColor Red
            exit 1
        }
        $counter += 10
        Write-Host "Still waiting for $service... ($counter/120 seconds)" -ForegroundColor Gray
        Start-Sleep -Seconds 10
    }
    Write-Host "$service is ready!" -ForegroundColor Green
}

Write-Host ""
Write-Host "Phase 72 deployment completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Service Endpoints:" -ForegroundColor Blue
Write-Host "  - Neo4j Browser: http://localhost:7474 (neo4j/$Neo4jPassword)" -ForegroundColor White
Write-Host "  - Go Service: http://localhost:8072" -ForegroundColor White
Write-Host "  - Python Service: http://localhost:8073" -ForegroundColor White
Write-Host "  - Node.js Service: http://localhost:8074" -ForegroundColor White
Write-Host "  - Redis: localhost:6379" -ForegroundColor White
Write-Host "  - Qdrant: http://localhost:6333" -ForegroundColor White
Write-Host "  - Ollama: http://localhost:11434" -ForegroundColor White
Write-Host ""
Write-Host "To check service health:" -ForegroundColor Yellow
Write-Host "  docker-compose -f docker-compose.phase72.yml ps" -ForegroundColor White
Write-Host ""
Write-Host "To stop services:" -ForegroundColor Yellow
Write-Host "  docker-compose -f docker-compose.phase72.yml down" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Run svelte-check to generate error data" -ForegroundColor White
Write-Host "  2. Use the Node.js service to ingest errors" -ForegroundColor White
Write-Host "  3. Monitor the error reduction process" -ForegroundColor White