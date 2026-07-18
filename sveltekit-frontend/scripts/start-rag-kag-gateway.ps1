#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Start the RAG+KAG Gateway service

.DESCRIPTION
    Starts the FastAPI RAG+KAG Gateway on port 8099
    Requires Python 3.11+ with dependencies installed

.EXAMPLE
    .\scripts\start-rag-kag-gateway.ps1
#>

param(
    [int]$Port = 8099,
    [switch]$Install
)

$ErrorActionPreference = "Stop"
$gatewayDir = Join-Path $PSScriptRoot "..\services\rag_kag_gateway"

Write-Host "🚀 RAG+KAG Gateway Startup" -ForegroundColor Cyan
Write-Host "=" * 60

# Check Python
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    Write-Host "❌ Python not found. Please install Python 3.11+" -ForegroundColor Red
    exit 1
}

$pythonVersion = python --version
Write-Host "   Python: $pythonVersion"

# Install dependencies if requested
if ($Install) {
    Write-Host "`n📦 Installing dependencies..." -ForegroundColor Yellow
    pip install -r "$gatewayDir\requirements.txt"
}

# Set environment variables
Write-Host "`n🔧 Setting environment variables..."
$env:PGHOST = "127.0.0.1"
$env:PGPORT = "5434"
$env:PGUSER = "user"
$env:PGPASSWORD = "pass"
$env:PGDATABASE = "legal"
$env:DATABASE_URL = "postgresql://user:pass@127.0.0.1:5434/legal"
$env:QDRANT_URL = "http://127.0.0.1:6333"
$env:REDIS_URL = "redis://127.0.0.1:6379"
$env:OLLAMA_URL = "http://127.0.0.1:11434"
$env:OLLAMA_EMBED_MODEL = "embeddinggemma:latest"
$env:ROTORQUANT_CHAT_MODEL = "gemma4-rotorquant:latest"
$env:OLLAMA_CHAT_MODEL = $env:ROTORQUANT_CHAT_MODEL
$env:API_PORT = $Port

Write-Host "   ✅ Environment configured"

# Check if port is available
$tcp = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
if ($tcp) {
    Write-Host "   ⚠️  Port $Port in use, stopping existing process..." -ForegroundColor Yellow
    Stop-Process -Id $tcp.OwningProcess -Force
    Start-Sleep -Seconds 2
}

# Verify dependencies
Write-Host "`n🔌 Checking dependencies..."
try {
    $qdrantHealth = Invoke-RestMethod "http://127.0.0.1:6333/collections" -TimeoutSec 3
    Write-Host "   ✅ Qdrant: $($qdrantHealth.result.collections.Count) collections" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  Qdrant not responding" -ForegroundColor Yellow
}

try {
    $ollamaModels = Invoke-RestMethod "http://127.0.0.1:11434/api/tags" -TimeoutSec 3
    Write-Host "   ✅ Ollama: $($ollamaModels.models.Count) models" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  Ollama not responding" -ForegroundColor Yellow
}

# Start the gateway
Write-Host "`n🚀 Starting RAG+KAG Gateway on port $Port..."
Write-Host "   URL: http://localhost:$Port"
Write-Host "   Docs: http://localhost:$Port/docs"
Write-Host "   Health: http://localhost:$Port/health"
Write-Host ""
Write-Host "Press Ctrl+C to stop" -ForegroundColor DarkGray
Write-Host ""

Set-Location $gatewayDir
python -m uvicorn main:app --host 0.0.0.0 --port $Port --reload
