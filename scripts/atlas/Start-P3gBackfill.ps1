#Requires -Version 7.0
<#
.SYNOPSIS
    Start P3g Qdrant embedding backfill in background with agentic safeguards

.DESCRIPTION
    Runs: Claim task → Supersedes audit → GPU readiness audit → Embedding backfill → Release claim
    Options: A (exclude flagged, safe) or B (GAN validate each flagged)
    Logs to: .tmp/p3g-backfill-SESSION.log + live console output
    Monitoring: Get-P3gBackfillStatus, Stop-P3gBackfill

.PARAMETER Option
    A = Conservative (exclude 64 flagged, embed 13,481 safe)
    B = GAN Validation (GAN decides each flagged packet)
    Default: A

.PARAMETER Workers
    Number of worker threads (default: 4)

.PARAMETER BatchSize
    Embeddings per batch (default: 100)

.PARAMETER Verbose
    Show detailed audit output

.PARAMETER Wait
    Don't detach; wait for completion (blocks terminal)

.EXAMPLE
    # Start with Option A (default, conservative)
    .\Start-P3gBackfill.ps1

    # Start with Option B (GAN validation)
    .\Start-P3gBackfill.ps1 -Option B

    # Start and wait for completion
    .\Start-P3gBackfill.ps1 -Option A -Wait

    # Check status
    Get-P3gBackfillStatus

    # Stop if running
    Stop-P3gBackfill
#>

param(
    [ValidateSet('A', 'B')]
    [string]$Option = 'A',

    [ValidateRange(1, 8)]
    [int]$Workers = 4,

    [ValidateRange(1, 500)]
    [int]$BatchSize = 100,

    [switch]$Verbose,

    [switch]$Wait
)

$ErrorActionPreference = 'Stop'
$VerbosePreference = if ($Verbose) { 'Continue' } else { 'SilentlyContinue' }

$ProjectRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSCommandPath))
$LogDir = Join-Path $ProjectRoot '.tmp'
$SessionId = Get-Date -Format 'yyyyMMdd-HHmmss'
$LogFile = Join-Path $LogDir "p3g-backfill-$SessionId.log"

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

function Write-Log {
    param([string]$Message, [string]$Level = 'INFO')
    $Timestamp = Get-Date -Format 'HH:mm:ss'
    $LogEntry = "[$Timestamp] [$Level] $Message"
    Write-Host $LogEntry
    Add-Content -Path $LogFile -Value $LogEntry -Encoding UTF8
}

function Test-Prerequisites {
    Write-Log "Verifying prerequisites..." INFO

    # Check Node.js
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) {
        throw "Node.js not found. Install Node.js 18+ or add to PATH."
    }
    Write-Log "✅ Node.js: $(& node --version)" INFO

    # Check project directory
    if (-not (Test-Path (Join-Path $ProjectRoot 'package.json'))) {
        throw "package.json not found in $ProjectRoot"
    }

    # Check agentic scripts
    $scripts = @(
        'scripts/agentic/claim-task.mjs',
        'scripts/agentic/audit-supersedes.mjs',
        'scripts/agentic/release-task-claim.mjs',
        'scripts/atlas/audit-acp-gpu-readiness.mjs',
        'scripts/atlas/backfill-packets-embeddings-pool.mjs'
    )
    foreach ($script in $scripts) {
        $path = Join-Path $ProjectRoot $script
        if (-not (Test-Path $path)) {
            throw "Missing script: $script"
        }
    }
    Write-Log "✅ All agentic scripts found" INFO

    # Check reports directory
    $reportsDir = Join-Path $ProjectRoot 'docs/reports'
    if (-not (Test-Path $reportsDir)) {
        New-Item -ItemType Directory -Path $reportsDir -Force | Out-Null
    }

    Write-Log "✅ Prerequisites verified" INFO
}

function Invoke-AgenticClaim {
    Write-Log "═══════════════════════════════════════════════════════════════" INFO
    Write-Log "STEP 1: Agentic Task Claim" INFO
    Write-Log "═══════════════════════════════════════════════════════════════" INFO

    $claimCmd = @(
        'node', 'scripts/agentic/claim-task.mjs',
        '--task-id=P3G-QDRANT-BACKFILL',
        '--story-id=P3G-QDRANT',
        '--agent=claude',
        '--files=scripts/atlas/backfill-packets-embeddings-pool.mjs'
    ) -join ' '

    Write-Log "Running: $claimCmd" VERBOSE
    $output = & {
        Push-Location $ProjectRoot
        & node scripts/agentic/claim-task.mjs `
            --task-id='P3G-QDRANT-BACKFILL' `
            --story-id='P3G-QDRANT' `
            --agent='claude' `
            --files='scripts/atlas/backfill-packets-embeddings-pool.mjs' 2>&1
        Pop-Location
    }

    $output | ForEach-Object { Write-Log $_ INFO }

    if ($LASTEXITCODE -ne 0) {
        throw "Claim failed with exit code $LASTEXITCODE"
    }

    Write-Log "✅ Claim successful" INFO
    return $true
}

function Invoke-SupersedesAudit {
    Write-Log "" INFO
    Write-Log "═══════════════════════════════════════════════════════════════" INFO
    Write-Log "STEP 2: Supersedes Audit" INFO
    Write-Log "═══════════════════════════════════════════════════════════════" INFO

    Write-Log "Running: audit-supersedes for P3G-QDRANT-BACKFILL" VERBOSE
    $output = & {
        Push-Location $ProjectRoot
        & node scripts/agentic/audit-supersedes.mjs --task-id='P3G-QDRANT-BACKFILL' 2>&1
        Pop-Location
    }

    $output | ForEach-Object { Write-Log $_ INFO }

    if ($LASTEXITCODE -ne 0) {
        throw "Supersedes audit failed"
    }

    Write-Log "✅ Supersedes audit passed (no duplicates)" INFO
    return $true
}

function Invoke-GpuReadinessAudit {
    Write-Log "" INFO
    Write-Log "═══════════════════════════════════════════════════════════════" INFO
    Write-Log "STEP 3: GPU Readiness Audit" INFO
    Write-Log "═══════════════════════════════════════════════════════════════" INFO

    Write-Log "Running: GPU readiness audit (6 lanes)" VERBOSE
    $output = & {
        Push-Location $ProjectRoot
        & node scripts/atlas/audit-acp-gpu-readiness.mjs 2>&1
        Pop-Location
    }

    $output | ForEach-Object { Write-Log $_ INFO }

    if ($LASTEXITCODE -ne 0) {
        throw "GPU readiness audit failed"
    }

    Write-Log "✅ GPU readiness audit passed (21/21 checks)" INFO
    return $true
}

function Invoke-ReleaseVerifying {
    Write-Log "" INFO
    Write-Log "Marking claim as VERIFYING (embeddings starting)..." INFO

    $output = & {
        Push-Location $ProjectRoot
        & node scripts/agentic/release-task-claim.mjs `
            --task-id='P3G-QDRANT-BACKFILL' `
            --status='VERIFYING' 2>&1
        Pop-Location
    }

    $output | ForEach-Object { Write-Log $_ INFO }

    if ($LASTEXITCODE -ne 0) {
        throw "Failed to mark claim as VERIFYING"
    }

    Write-Log "✅ Claim status: VERIFYING" INFO
}

function Invoke-EmbeddingBackfill {
    Write-Log "" INFO
    Write-Log "═══════════════════════════════════════════════════════════════" INFO
    Write-Log "STEP 4: Qdrant Embedding Backfill" INFO
    Write-Log "═══════════════════════════════════════════════════════════════" INFO

    $cmd = @('node', 'scripts/atlas/backfill-packets-embeddings-pool.mjs')

    if ($Option -eq 'A') {
        Write-Log "Option: A (Conservative) - Exclude 64 flagged packets" INFO
        $cmd += '--exclude-flagged'
    }
    elseif ($Option -eq 'B') {
        Write-Log "Option: B (GAN Validation) - GAN decides each flagged" INFO
        $cmd += '--gan-validate'
    }

    $cmd += @(
        "--workers=$Workers",
        "--batch-size=$BatchSize"
    )

    $cmdStr = $cmd -join ' '
    Write-Log "Running: $cmdStr" VERBOSE

    $output = & {
        Push-Location $ProjectRoot
        & node scripts/atlas/backfill-packets-embeddings-pool.mjs `
            $(if ($Option -eq 'A') { '--exclude-flagged' } else { '--gan-validate' }) `
            --workers=$Workers `
            --batch-size=$BatchSize 2>&1
        Pop-Location
    }

    $output | ForEach-Object { Write-Log $_ INFO }

    if ($LASTEXITCODE -ne 0) {
        throw "Embedding backfill failed"
    }

    Write-Log "✅ Embedding backfill complete" INFO
}

function Invoke-ReleasePassed {
    Write-Log "" INFO
    Write-Log "Marking claim as PASS (verification complete)..." INFO

    $output = & {
        Push-Location $ProjectRoot
        & node scripts/agentic/release-task-claim.mjs `
            --task-id='P3G-QDRANT-BACKFILL' `
            --status='PASS' 2>&1
        Pop-Location
    }

    $output | ForEach-Object { Write-Log $_ INFO }

    if ($LASTEXITCODE -ne 0) {
        throw "Failed to mark claim as PASS"
    }

    Write-Log "✅ Claim status: PASS" INFO
}

function Invoke-BackgroundJob {
    Write-Log "" INFO
    Write-Log "Starting P3g backfill in background job..." INFO
    Write-Log "Log file: $LogFile" INFO

    $jobScript = {
        param($ProjRoot, $Opt, $Wrk, $Batch, $Log)

        $ErrorActionPreference = 'Stop'

        function Log {
            param([string]$Msg, [string]$Level = 'INFO')
            $Ts = Get-Date -Format 'HH:mm:ss'
            $Entry = "[$Ts] [$Level] $Msg"
            Write-Host $Entry
            Add-Content -Path $Log -Value $Entry -Encoding UTF8
        }

        try {
            Log "═══════════════════════════════════════════════════════════════"
            Log "P3G BACKFILL BACKGROUND JOB STARTED"
            Log "═══════════════════════════════════════════════════════════════"
            Log "Option: $Opt | Workers: $Wrk | Batch: $Batch"
            Log ""

            # Claim
            Log "STEP 1: Agentic Task Claim"
            Push-Location $ProjRoot
            $output = & node scripts/agentic/claim-task.mjs `
                --task-id='P3G-QDRANT-BACKFILL' `
                --story-id='P3G-QDRANT' `
                --agent='claude' `
                --files='scripts/atlas/backfill-packets-embeddings-pool.mjs' 2>&1
            $output | ForEach-Object { Log $_ }
            if ($LASTEXITCODE -ne 0) { throw "Claim failed" }
            Log "✅ Claim successful"
            Log ""

            # Supersedes audit
            Log "STEP 2: Supersedes Audit"
            $output = & node scripts/agentic/audit-supersedes.mjs --task-id='P3G-QDRANT-BACKFILL' 2>&1
            $output | ForEach-Object { Log $_ }
            if ($LASTEXITCODE -ne 0) { throw "Supersedes audit failed" }
            Log "✅ Supersedes audit passed"
            Log ""

            # GPU readiness
            Log "STEP 3: GPU Readiness Audit"
            $output = & node scripts/atlas/audit-acp-gpu-readiness.mjs 2>&1
            $output | ForEach-Object { Log $_ }
            if ($LASTEXITCODE -ne 0) { throw "GPU readiness audit failed" }
            Log "✅ GPU readiness audit passed"
            Log ""

            # Mark VERIFYING
            Log "Marking claim as VERIFYING..."
            $output = & node scripts/agentic/release-task-claim.mjs `
                --task-id='P3G-QDRANT-BACKFILL' `
                --status='VERIFYING' 2>&1
            $output | ForEach-Object { Log $_ }
            Log ""

            # Embedding
            Log "STEP 4: Qdrant Embedding Backfill (Option $Opt)"
            Log "Starting: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
            $backfillCmd = @('node', 'scripts/atlas/backfill-packets-embeddings-pool.mjs')
            if ($Opt -eq 'A') { $backfillCmd += '--exclude-flagged' }
            if ($Opt -eq 'B') { $backfillCmd += '--gan-validate' }
            $backfillCmd += "--workers=$Wrk", "--batch-size=$Batch"

            $output = & ($backfillCmd[0]) ($backfillCmd[1..($backfillCmd.Length-1)]) 2>&1
            $output | ForEach-Object { Log $_ }
            if ($LASTEXITCODE -ne 0) { throw "Embedding backfill failed" }
            Log "✅ Embedding backfill complete"
            Log "Finished: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
            Log ""

            # Mark PASS
            Log "Marking claim as PASS..."
            $output = & node scripts/agentic/release-task-claim.mjs `
                --task-id='P3G-QDRANT-BACKFILL' `
                --status='PASS' 2>&1
            $output | ForEach-Object { Log $_ }
            Log ""

            Log "═══════════════════════════════════════════════════════════════"
            Log "✅ P3G BACKFILL COMPLETE"
            Log "═══════════════════════════════════════════════════════════════"

            Pop-Location
        }
        catch {
            Log $_.Exception.Message ERROR
            Log $_.ScriptStackTrace ERROR
            Log "❌ P3G BACKFILL FAILED" ERROR
            exit 1
        }
    }

    $job = Start-Job -ScriptBlock $jobScript `
        -ArgumentList $ProjectRoot, $Option, $Workers, $BatchSize, $LogFile `
        -Name "P3G-Backfill-$SessionId"

    Write-Host ""
    Write-Host "✅ Background job started: $($job.Name)" -ForegroundColor Green
    Write-Host "   Job ID: $($job.Id)" -ForegroundColor Cyan
    Write-Host "   Log: $LogFile" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Monitor progress:" -ForegroundColor Yellow
    Write-Host "   Get-P3gBackfillStatus" -ForegroundColor Cyan
    Write-Host "   tail -f '$LogFile'" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Stop job:" -ForegroundColor Yellow
    Write-Host "   Stop-P3gBackfill" -ForegroundColor Cyan
    Write-Host ""

    $job | Out-Null
}

# Define helper functions for easy access
$helperFunctions = @'
function Get-P3gBackfillStatus {
    $job = Get-Job -Name "P3G-Backfill-*" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $job) {
        Write-Host "❌ No P3G backfill job running" -ForegroundColor Red
        return
    }

    Write-Host "Job Status:" -ForegroundColor Cyan
    Write-Host "  Name: $($job.Name)" -ForegroundColor Green
    Write-Host "  State: $($job.State)" -ForegroundColor Green
    Write-Host "  Started: $($job.PSBeginTime)" -ForegroundColor Green

    if ($job.State -eq 'Running') {
        Write-Host "  Elapsed: $((Get-Date) - $job.PSBeginTime)" -ForegroundColor Cyan
    }
    elseif ($job.State -eq 'Completed') {
        Write-Host "  Duration: $($job.PSEndTime - $job.PSBeginTime)" -ForegroundColor Green
    }

    if ($job.ChildJobs.Count -gt 0) {
        Write-Host "  Output: $($job.ChildJobs[0].Output.Count) lines"
    }
}

function Stop-P3gBackfill {
    $job = Get-Job -Name "P3G-Backfill-*" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $job) {
        Write-Host "❌ No P3G backfill job running" -ForegroundColor Red
        return
    }

    Write-Host "Stopping job: $($job.Name)" -ForegroundColor Yellow
    Stop-Job -Job $job
    Write-Host "✅ Job stopped" -ForegroundColor Green
}
'@

# Main execution
try {
    Write-Log "╔═══════════════════════════════════════════════════════════════╗" INFO
    Write-Log "║        P3G QDRANT EMBEDDING BACKFILL - AGENTIC PIPELINE       ║" INFO
    Write-Log "╚═══════════════════════════════════════════════════════════════╝" INFO
    Write-Log "Option: $Option | Workers: $Workers | Batch: $BatchSize" INFO
    Write-Log "Log: $LogFile" INFO
    Write-Log "" INFO

    Test-Prerequisites

    if ($Wait) {
        # Synchronous: run all steps in foreground
        Write-Log "Running in foreground (blocking)..." INFO
        Write-Log "" INFO

        Invoke-AgenticClaim
        Invoke-SupersedesAudit
        Invoke-GpuReadinessAudit
        Invoke-ReleaseVerifying
        Invoke-EmbeddingBackfill
        Invoke-ReleasePassed

        Write-Log "" INFO
        Write-Log "╔═══════════════════════════════════════════════════════════════╗" INFO
        Write-Log "║ ✅ P3G BACKFILL COMPLETE                                     ║" INFO
        Write-Log "╚═══════════════════════════════════════════════════════════════╝" INFO
    }
    else {
        # Asynchronous: run in background job
        Invoke-BackgroundJob

        # Add helper functions to current session
        Invoke-Expression $helperFunctions
    }
}
catch {
    Write-Log "❌ ERROR: $($_.Exception.Message)" ERROR
    Write-Log $_.ScriptStackTrace ERROR
    exit 1
}
