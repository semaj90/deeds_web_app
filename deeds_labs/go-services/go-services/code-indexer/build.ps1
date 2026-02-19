#!/usr/bin/env pwsh
# Phase 89: Build Context7 Go Indexer

Write-Host "🔧 Phase 89: Building Context7 Code Indexer" -ForegroundColor Cyan
Write-Host "═" * 60

$ErrorActionPreference = "Stop"

# Navigate to indexer directory
$indexerPath = "c:\Users\james\Videos\deeds-web-app\go-services\code-indexer"
Set-Location $indexerPath
Write-Host "📂 Working directory: $indexerPath"
Write-Host ""

# Download dependencies
Write-Host "📦 Downloading Go dependencies..." -ForegroundColor Yellow
go mod download
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to download dependencies" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Dependencies downloaded" -ForegroundColor Green
Write-Host ""

# Build
Write-Host "🔨 Building indexer..." -ForegroundColor Yellow
go build -o context7-code-indexer.exe main.go
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Build successful: context7-code-indexer.exe" -ForegroundColor Green
Write-Host ""

# Get file size
$exeSize = (Get-Item .\context7-code-indexer.exe).Length / 1MB
Write-Host "📊 Executable size: $([math]::Round($exeSize, 2)) MB" -ForegroundColor Cyan
Write-Host ""

Write-Host "🚀 Ready to start! Run:" -ForegroundColor Green
Write-Host "   .\context7-code-indexer.exe" -ForegroundColor White
Write-Host ""
Write-Host "📋 Test commands:" -ForegroundColor Yellow
Write-Host "   curl http://localhost:8082/health" -ForegroundColor White
Write-Host "   curl -X POST http://localhost:8082/rebuild?root=../../sveltekit-frontend" -ForegroundColor White
Write-Host "   curl http://localhost:8082/stats" -ForegroundColor White
