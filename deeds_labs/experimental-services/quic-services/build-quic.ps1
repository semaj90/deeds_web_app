#!/usr/bin/env pwsh
<#
Build QUIC services into ../go-microservice/bin.
Usage: powershell -NoProfile -ExecutionPolicy Bypass -File build-quic.ps1
#>
Set-StrictMode -Version Latest -ErrorAction Stop
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $scriptDir
Write-Host "🌐 Building QUIC services..." -ForegroundColor Cyan

try {
    if (Get-Command go -ErrorAction SilentlyContinue) {
        & go mod tidy
    } else {
        Write-Host "Go not found on PATH; skipping go mod tidy/build." -ForegroundColor Yellow
    }
} catch {
    Write-Host "Warning during go mod tidy: $_" -ForegroundColor Yellow
}

$binDir = Join-Path $scriptDir "..\go-microservice\bin"
if (-not (Test-Path $binDir)) { New-Item -ItemType Directory -Path $binDir | Out-Null }

function Try-Build($src, $out) {
    try {
        Write-Host "  Building $out from $src..." -ForegroundColor Yellow
        & go build -o $out $src
        Write-Host "    ✅ Built: $out"
    } catch {
        Write-Host "    ❌ Failed to build $out: $_" -ForegroundColor Red
    }
}

Try-Build "./quic-gateway.go" (Join-Path $binDir "quic-gateway.exe")
Try-Build "./quic-vector-proxy.go" (Join-Path $binDir "quic-vector-proxy.exe")
Try-Build "./quic-ai-stream.go" (Join-Path $binDir "quic-ai-stream.exe")

# rag-quic-proxy: prefer local, fallback to ../go-microservice/cmd/rag-quic-proxy
if (Test-Path "$scriptDir\rag-quic-proxy.go") {
    Try-Build "./rag-quic-proxy.go" (Join-Path $binDir "rag-quic-proxy.exe")
} elseif (Test-Path "$scriptDir\..\go-microservice\cmd\rag-quic-proxy\main.go") {
    Try-Build "..\go-microservice\cmd\rag-quic-proxy" (Join-Path $binDir "rag-quic-proxy.exe")
} else {
    Write-Host "No rag-quic-proxy source found in either location; skipping." -ForegroundColor Yellow
}

Write-Host "✅ QUIC build script finished." -ForegroundColor Green
Pop-Location
