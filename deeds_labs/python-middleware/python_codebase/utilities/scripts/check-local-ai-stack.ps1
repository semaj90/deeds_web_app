<#
Runs health checks for local AI stack services and prints concise ✅/❌ results.
Usage: pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\check-local-ai-stack.ps1
#>
Write-Host "=== Checking Local AI Stack Services ===" -ForegroundColor Cyan

function Try-Command([ScriptBlock]$block, [string]$okMsg, [string]$failMsg) {
    try {
        & $block | Out-Null
        Write-Host "✅ $okMsg" -ForegroundColor Green
    } catch {
        Write-Host "❌ $failMsg" -ForegroundColor Red
    }
}

Write-Host "Checking Redis..." -NoNewline
try {
    $r = & redis-cli -h localhost -p 6379 ping 2>$null
    if ($r -eq 'PONG') { Write-Host " ✅ Redis OK" -ForegroundColor Green } else { Write-Host " ❌ Redis check failed" -ForegroundColor Red }
} catch { Write-Host " ❌ Redis check failed" -ForegroundColor Red }

Write-Host "Checking Postgres (listing tables)..."
try {
    & psql -h localhost -U postgres -d legal_ai_db -c "\dt" 2>$null
    if ($LASTEXITCODE -eq 0) { Write-Host "✅ Postgres reachable" -ForegroundColor Green } else { Write-Host "❌ Postgres check failed (non-zero exit)" -ForegroundColor Yellow }
} catch { Write-Host "❌ Postgres check failed" -ForegroundColor Red }

Write-Host "Checking Neo4j HTTP..."
Try-Command { Invoke-WebRequest -Uri 'http://localhost:7474' -UseBasicParsing -TimeoutSec 3 } 'Neo4j reachable' 'Neo4j not reachable'

Write-Host "Checking Qdrant..."
Try-Command { Invoke-WebRequest -Uri 'http://localhost:6333/health' -UseBasicParsing -TimeoutSec 3 } 'Qdrant OK' 'Qdrant not reachable'

Write-Host "Checking MinIO..."
Try-Command { Invoke-WebRequest -Uri 'http://localhost:9000/minio/health/ready' -UseBasicParsing -TimeoutSec 3 } 'MinIO OK' 'MinIO not reachable'

Write-Host "Checking RabbitMQ dashboard..."
Try-Command { Invoke-WebRequest -Uri 'http://localhost:15672' -UseBasicParsing -TimeoutSec 3 } 'RabbitMQ dashboard reachable' 'RabbitMQ not reachable'

Write-Host "Checking Triton inference server..."
Try-Command { Invoke-WebRequest -Uri 'http://localhost:8000/v2/health/ready' -UseBasicParsing -TimeoutSec 3 } 'Triton inference server OK' 'Triton not reachable'

Write-Host "=== Health check complete ===" -ForegroundColor Cyan
