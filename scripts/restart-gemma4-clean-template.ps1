#!/usr/bin/env pwsh
<#
.SYNOPSIS
Restart llama-server with gemma4-summary-clean.jinja template (no thinking blocks)

.DESCRIPTION
Stops existing llama-server instance and launches with the clean template.

.EXAMPLE
.\scripts\restart-gemma4-clean-template.ps1
#>

$ErrorActionPreference = 'Stop'

Write-Host "🛑 Stopping existing llama-server processes..." -ForegroundColor Yellow
$existing = Get-Process -Name "llama-server" -ErrorAction SilentlyContinue
if ($existing) {
    $existing | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Host "✓ Stopped" -ForegroundColor Green
} else {
    Write-Host "ℹ No existing process found" -ForegroundColor Cyan
}

Start-Sleep -Seconds 3

Write-Host ""
Write-Host "🚀 Launching llama-server with gemma4-summary-clean.jinja..." -ForegroundColor Cyan
Write-Host ""

& ".\sveltekit-frontend\scripts\launch-gemma4-summary-server.ps1" `
    -Context 16384 `
    -Parallel 2 `
    -Slots 2 `
    -Verbose

Write-Host ""
Write-Host "✓ Restart sequence complete" -ForegroundColor Green
