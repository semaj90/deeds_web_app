#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Start Phase 79 RAG/KAG Middleware for ACE Contextual Engineering

.DESCRIPTION
    Launches the RAG middleware on port 8765 with proper environment configuration:
    - MinIO: admin/password (Phase 66 credentials)
    - Qdrant: localhost:6333 (24 phase collections)
    - Ollama: localhost:11434 (embeddinggemma, gemma3-legal)

.EXAMPLE
    .\start-rag-middleware.ps1
#>

Write-Host "`n🚀 Starting Phase 79 RAG/KAG Middleware" -ForegroundColor Cyan
Write-Host "=" * 60

# Set environment variables
$env:API_PORT = "8765"
$env:API_HOST = "0.0.0.0"
$env:MINIO_ENDPOINT = "localhost:9000"
$env:MINIO_ACCESS_KEY = "admin"
$env:MINIO_SECRET_KEY = "password"
$env:MINIO_BUCKET = "legal-documents"
$env:MINIO_USE_SSL = "false"
$env:QDRANT_URL = "http://localhost:6333"
$env:OLLAMA_URL = "http://localhost:11434"

Write-Host "`n📋 Configuration:" -ForegroundColor Yellow
Write-Host "   Port:    $env:API_PORT"
Write-Host "   MinIO:   $env:MINIO_ENDPOINT (admin/***)"
Write-Host "   Qdrant:  $env:QDRANT_URL"
Write-Host "   Ollama:  $env:OLLAMA_URL"

Write-Host "`n🔧 Starting server..." -ForegroundColor Green
Write-Host ""

# Navigate to project root
Set-Location "C:\Users\james\Videos\deeds-web-app"

# Start the middleware
python sveltekit-frontend/scripts/phase79-rag-kag-middleware.py
