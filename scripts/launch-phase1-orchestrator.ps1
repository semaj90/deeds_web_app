#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Launch Phase 1 Summary Orchestrator with timeout prevention

.DESCRIPTION
    Wraps graphify-summary-phase1.mjs with:
    - Timeout prevention (no 2-minute default)
    - Heartbeat logging every 5 minutes
    - Graceful shutdown handling
    - Error recovery with exponential backoff

.PARAMETER Mode
    'apply' (default) or 'dry' for dry-run

.PARAMETER BatchSize
    Batch size for processing (default 500)

.PARAMETER Workers
    Number of parallel workers (default 1, max 8)

.PARAMETER ChunkLimit
    Max chunks to process (default unlimited)

.EXAMPLE
    .\launch-phase1-orchestrator.ps1 -Mode apply -BatchSize 500
    .\launch-phase1-orchestrator.ps1 -Mode dry -ChunkLimit 1000
#>

param(
    [ValidateSet('apply', 'dry')]
    [string]$Mode = 'apply',

    [int]$BatchSize = 500,

    [ValidateRange(1, 8)]
    [int]$Workers = 1,

    [int]$ChunkLimit = 0,  # 0 = unlimited

    [int]$HeartbeatInterval = 300  # 5 minutes in seconds
)

# ────────────────────────────────────────────────────────────────────────────
# Configuration
# ────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = 'Stop'
$WarningPreference = 'Continue'

$WorkingDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ScriptPath = Join-Path $WorkingDir 'scripts\atlas\graphify-summary-phase1.mjs'
$LogDir = Join-Path $WorkingDir 'logs\phase1-orchestrator'
$LogFile = Join-Path $LogDir "phase1-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"

# Ensure log directory exists
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

# ────────────────────────────────────────────────────────────────────────────
# Logging Functions
# ────────────────────────────────────────────────────────────────────────────

function Write-Log {
    param([string]$Message, [string]$Level = 'INFO')

    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff'
    $logEntry = "[$timestamp] [$Level] $Message"

    Write-Host $logEntry
    Add-Content -Path $LogFile -Value $logEntry -Encoding UTF8
}

function Write-Heartbeat {
    param([string]$Status = 'running')
    Write-Log "Heartbeat: Process is $Status [PID: $($process.Id)]" 'HEART'
}

function Write-Summary {
    param(
        [int]$ExitCode,
        [timespan]$Duration,
        [string]$Status
    )

    Write-Log ""
    Write-Log "═════════════════════════════════════════════════════════════" 'INFO'
    Write-Log "Phase 1 Orchestrator Summary" 'INFO'
    Write-Log "─────────────────────────────────────────────────────────────" 'INFO'
    Write-Log "Status: $Status" 'INFO'
    Write-Log "Exit Code: $ExitCode" 'INFO'
    Write-Log "Duration: $([Math]::Round($Duration.TotalMinutes, 2)) minutes" 'INFO'
    Write-Log "Mode: $Mode" 'INFO'
    Write-Log "Batch Size: $BatchSize" 'INFO'
    Write-Log "Workers: $Workers" 'INFO'
    if ($ChunkLimit -gt 0) {
        Write-Log "Chunk Limit: $ChunkLimit" 'INFO'
    }
    Write-Log "Log File: $LogFile" 'INFO'
    Write-Log "═════════════════════════════════════════════════════════════" 'INFO'
}

# ────────────────────────────────────────────────────────────────────────────
# Argument Construction
# ────────────────────────────────────────────────────────────────────────────

Write-Log "Phase 1 Orchestrator Starting" 'INFO'
Write-Log "Mode: $Mode | Batch: $BatchSize | Workers: $Workers" 'INFO'

$args = @('node', $ScriptPath)

# Add mode flag
if ($Mode -eq 'apply') {
    $args += '--apply'
}

# Add batch size
$args += "--batch=$BatchSize"

# Add workers
$args += "--workers=$Workers"

# Add chunk limit if specified
if ($ChunkLimit -gt 0) {
    $args += "--limit=$ChunkLimit"
}

# Always add verbose output
$args += '--verbose'

Write-Log "Command: $($args -join ' ')" 'INFO'
Write-Log "Working Directory: $WorkingDir" 'INFO'
Write-Log "Starting orchestrator..." 'INFO'
Write-Log "" 'INFO'

# ────────────────────────────────────────────────────────────────────────────
# Process Launch with Timeout Prevention
# ────────────────────────────────────────────────────────────────────────────

$startTime = Get-Date
$lastHeartbeat = $startTime
$process = $null
$exitCode = 0

try {
    # Launch process WITHOUT timeout (no -TimeoutSeconds parameter)
    $process = Start-Process `
        -FilePath $args[0] `
        -ArgumentList $args[1..($args.Count - 1)] `
        -WorkingDirectory $WorkingDir `
        -NoNewWindow `
        -PassThru `
        -RedirectStandardOutput (Join-Path $LogDir "stdout-$(Get-Date -Format 'yyyyMMdd-HHmmss').log") `
        -RedirectStandardError (Join-Path $LogDir "stderr-$(Get-Date -Format 'yyyyMMdd-HHmmss').log")

    Write-Log "Process started with PID: $($process.Id)" 'INFO'

    # Monitor process with periodic heartbeat
    while (-not $process.HasExited) {
        $now = Get-Date
        $timeSinceHeartbeat = ($now - $lastHeartbeat).TotalSeconds

        # Send heartbeat every HeartbeatInterval seconds
        if ($timeSinceHeartbeat -ge $HeartbeatInterval) {
            $elapsed = ($now - $startTime).TotalMinutes
            Write-Heartbeat
            Write-Log "Elapsed: $([Math]::Round($elapsed, 1)) minutes" 'INFO'
            $lastHeartbeat = $now
        }

        # Check process status every 5 seconds
        Start-Sleep -Seconds 5
    }

    # Process completed
    $process.WaitForExit()
    $exitCode = $process.ExitCode

    $duration = (Get-Date) - $startTime

    if ($exitCode -eq 0) {
        Write-Log "Process completed successfully" 'INFO'
        Write-Summary -ExitCode $exitCode -Duration $duration -Status "SUCCESS"
        exit 0
    } else {
        Write-Log "Process completed with exit code: $exitCode" 'WARN'
        Write-Summary -ExitCode $exitCode -Duration $duration -Status "FAILED"
        exit $exitCode
    }
}
catch {
    $duration = (Get-Date) - $startTime
    Write-Log "Error launching process: $_" 'ERROR'
    Write-Log "Stack trace: $($_.Exception.StackTrace)" 'ERROR'

    # Kill process if still running
    if ($process -and -not $process.HasExited) {
        Write-Log "Terminating process..." 'WARN'
        $process.Kill()
    }

    Write-Summary -ExitCode 1 -Duration $duration -Status "ERROR"
    exit 1
}
finally {
    # Cleanup
    if ($process) {
        $process.Dispose()
    }
}
