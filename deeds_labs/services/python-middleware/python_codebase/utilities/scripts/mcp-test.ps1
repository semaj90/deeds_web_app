# Simple MCP Health Check Script
param(
    [string]$Action = "health"
)

$baseUrl = "http://localhost:3002"

Write-Host "🤖 MCP Multicore Server Status" -ForegroundColor Cyan
Write-Host "=" * 40

try {
    $health = Invoke-RestMethod -Uri "$baseUrl/mcp/health" -Method Get -TimeoutSec 5
    Write-Host "✅ Status: $($health.status)" -ForegroundColor Green
    Write-Host "👥 Workers: $($health.workers)" -ForegroundColor Yellow
    Write-Host "⏱️ Uptime: $([math]::Round($health.uptime, 2)) seconds" -ForegroundColor Cyan

    $metrics = Invoke-RestMethod -Uri "$baseUrl/mcp/metrics" -Method Get -TimeoutSec 5
    Write-Host "💾 Memory: $([math]::Round($metrics.memory.rss/1MB, 2)) MB" -ForegroundColor Yellow
    Write-Host "🎮 GPU: $($metrics.gpu)" -ForegroundColor Magenta

    $workers = Invoke-RestMethod -Uri "$baseUrl/mcp/workers" -Method Get -TimeoutSec 5
    Write-Host "🔧 Active Workers: $($workers.active) of $($workers.total)" -ForegroundColor Blue

} catch {
    Write-Host "❌ MCP Server not running" -ForegroundColor Red
    Write-Host "Run task 'Start MCP Multicore Server' in VS Code" -ForegroundColor Yellow
}