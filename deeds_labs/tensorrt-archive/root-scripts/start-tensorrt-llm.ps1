# Start TensorRT-LLM Container for Development
$WaitForHealth = $args -contains "-WaitForHealth"
$TimeoutSeconds = 300

# Check for custom timeout
$timeoutIndex = $args.IndexOf("-TimeoutSeconds")
if ($timeoutIndex -ge 0 -and $args.Count -gt $timeoutIndex + 1) {
    $TimeoutSeconds = [int]$args[$timeoutIndex + 1]
}

Write-Host "🚀 Starting TensorRT-LLM Container..." -ForegroundColor Yellow

# Check if container already exists
$containerName = 'phase66-tensorrt-llm'
$existingContainer = docker ps -a --format '{{.Names}}' | Select-String -Pattern $containerName

if ($existingContainer) {
    Write-Host "Container '$containerName' already exists, starting it..." -ForegroundColor Cyan
    docker start $containerName
} else {
    Write-Host "Container '$containerName' does not exist, creating it..." -ForegroundColor Cyan
    docker-compose -f docker-compose.phase66.yml up -d tensorrt-llm
}

if ($WaitForHealth) {
    Write-Host "⏳ Waiting for TensorRT-LLM service to be healthy..." -ForegroundColor Magenta

    $startTime = Get-Date
    $timeout = New-TimeSpan -Seconds $TimeoutSeconds

    while ((Get-Date) - $startTime -lt $timeout) {
        try {
            $response = Invoke-WebRequest -Uri 'http://localhost:8098/health' -TimeoutSec 5
            if ($response.StatusCode -eq 200) {
                Write-Host "✅ TensorRT-LLM service is healthy!" -ForegroundColor Green
                exit 0
            }
        } catch {
            Write-Host "⏳ Service not ready yet, waiting..." -ForegroundColor Yellow
        }
        Start-Sleep -Seconds 5
    }

    Write-Host "❌ Timeout waiting for TensorRT-LLM service to become healthy" -ForegroundColor Red
    exit 1
}