#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Start Phase 89 llama-server
.DESCRIPTION
    Starts the Phase 89 Gemma4 llama-server on port 8090.
    This launcher owns the chat / summary lane only.
#>

param(
    [string]$ServerHost = "127.0.0.1",
    [int]$ServerPort = 8090,
    [int]$Context = 16384,
    [int]$Parallel = 2,
    [int]$Slots = 2,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$ScriptRoot = $PSScriptRoot
$RepoRoot = Split-Path $ScriptRoot -Parent
$WorkspaceRoot = Split-Path $RepoRoot -Parent
$DefaultTemplate = Join-Path $RepoRoot 'configs\templates\gemma4-summary-clean.jinja'

function Write-Status {
    param(
        [string]$Message,
        [ValidateSet('INFO', 'OK', 'WARN', 'ERROR')]$Level = 'INFO'
    )

    $colors = @{
        INFO  = 'Cyan'
        OK    = 'Green'
        WARN  = 'Yellow'
        ERROR = 'Red'
    }

    $timestamp = Get-Date -Format 'HH:mm:ss'
    Write-Host "[$timestamp] [$Level] $Message" -ForegroundColor $colors[$Level]
}

function Resolve-FirstExisting {
    param([string[]]$Candidates)
    foreach ($candidate in $Candidates) {
        if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
        if (Test-Path $candidate) { return $candidate }
    }
    return $null
}

Write-Status "════════════════════════════════════════════════════════════════"
Write-Status "PHASE 89 GEMMA4 LLAMA-SERVER LAUNCHER"
Write-Status "════════════════════════════════════════════════════════════════"
Write-Status ""

$LlamaServerExe = Resolve-FirstExisting @(
    $env:LLAMA_SERVER_PATH,
    (Join-Path $RepoRoot 'tools\llama-server\llama-server.exe'),
    (Join-Path $RepoRoot 'bin\llama-server.exe'),
    (Join-Path $RepoRoot 'vendor\llama-server\llama-server.exe'),
    'C:\Users\james\Desktop\llama-server-cuda\llama-server.exe'
)

$ModelPath = Resolve-FirstExisting @(
    $env:LLAMA_SERVER_MODEL_PATH,
    $env:ROTORQUANT_MODEL_PATH,
    (Join-Path $WorkspaceRoot 'models\hfor\hforf.gguf'),
    (Join-Path $WorkspaceRoot 'models\hforf.gguf'),
    (Join-Path $WorkspaceRoot 'models\gemma4-legal-iq4xs-direct.gguf'),
    (Join-Path $WorkspaceRoot 'models\gemma4-rotorquant:latest-iq4xs-direct.gguf'),
    (Join-Path $RepoRoot 'models\gemma4-legal-iq4xs-direct.gguf'),
    (Join-Path $RepoRoot 'models\gemma4-rotorquant:latest-iq4xs-direct.gguf')
)

$ChatTemplateFile = if (Test-Path $DefaultTemplate) { $DefaultTemplate } else { $null }

if (-not $LlamaServerExe) {
    Write-Status "llama-server.exe not found in configured locations" 'ERROR'
    exit 1
}

if (-not $ModelPath) {
    Write-Status "No model path found for Phase 89. Set LLAMA_SERVER_MODEL_PATH or ROTORQUANT_MODEL_PATH." 'ERROR'
    exit 1
}

Write-Status "Configuration Summary:"
Write-Status "  Binary: $LlamaServerExe"
Write-Status "  Model: $ModelPath"
Write-Status "  Port: :$ServerPort"
Write-Status "  Context: $Context tokens"
Write-Status "  Parallel: $Parallel"
Write-Status "  Slots: $Slots"
Write-Status "  Chat template: $($ChatTemplateFile ?? '(none)')"

$args = @(
    '-m', $ModelPath,
    '--host', $ServerHost,
    '--port', $ServerPort.ToString(),
    '-c', $Context.ToString(),
    '--parallel', $Parallel.ToString(),
    '--slots', $Slots.ToString(),
    '-ctk', 'q8_0',
    '-ctv', 'q8_0',
    '-fa', 'on',
    '-ngl', '99',
    '--cache-prompt',
    '--cache-reuse', '256',
    '--jinja'
)

if ($ChatTemplateFile) {
    $args += @('--chat-template-file', $ChatTemplateFile)
}

if ($DryRun) {
    Write-Status "Dry run: $LlamaServerExe $($args -join ' ')" 'WARN'
    exit 0
}

Write-Status "Checking for existing llama-server processes..."
$existing = Get-Process -Name 'llama-server' -ErrorAction SilentlyContinue
if ($existing) {
    Write-Status "Stopping existing llama-server instances..." 'WARN'
    $existing | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

Write-Status "Launching llama-server..."
try {
    $process = Start-Process -FilePath $LlamaServerExe `
        -ArgumentList $args `
        -PassThru `
        -WindowStyle Hidden `
        -ErrorAction Stop

    Write-Status "✓ llama-server started (PID: $($process.Id))" 'OK'
} catch {
    Write-Status "Failed to start llama-server: $_" 'ERROR'
    exit 1
}

Write-Status "Waiting for /v1/models readiness (max 60 seconds)..."
$maxRetries = 60
$retry = 0
$ready = $false

while ($retry -lt $maxRetries -and -not $ready) {
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:$ServerPort/v1/models" `
            -Method Get `
            -TimeoutSec 2 `
            -ErrorAction Stop

        if ($health.data -and $health.data.Count -gt 0) {
            $modelId = $health.data[0].id
            Write-Status "✓ Server ready: $modelId" 'OK'
            $ready = $true
        }
    } catch {
        # Not ready yet
    }

    if (-not $ready) {
        Start-Sleep -Seconds 1
        $retry++
        Write-Host "." -NoNewline
    }
}

Write-Status ""
if (-not $ready) {
    Write-Status "Server startup timeout (server may still be initializing)" 'WARN'
}

Write-Status ""
Write-Status "Next steps:"
Write-Status "  curl http://127.0.0.1:$ServerPort/v1/models"
Write-Status "  curl -X POST http://127.0.0.1:$ServerPort/v1/chat/completions"
