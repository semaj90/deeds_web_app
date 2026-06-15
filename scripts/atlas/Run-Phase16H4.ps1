#!/usr/bin/env pwsh
#Requires -Version 7.0
<#
.SYNOPSIS
    Phase 16-H.4: Qdrant Discovery with live PowerShell progress bars.

.EXAMPLE
    .\Run-Phase16H4.ps1
    .\Run-Phase16H4.ps1 -DryRun
    .\Run-Phase16H4.ps1 -BatchSize 200
#>
param(
    [int]   $BatchSize      = 100,
    [int]   $EstimatedTotal = 635000,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$repoRoot  = Resolve-Path "$PSScriptRoot\..\.."
$nodeScript = "$PSScriptRoot\phase-16-h-4-qdrant-discovery-streaming.mjs"

# ── colour helpers ────────────────────────────────────────────────────────────
function Write-Header($t) {
    Write-Host ""
    Write-Host ("=" * 62) -ForegroundColor Cyan
    Write-Host "  $t" -ForegroundColor Cyan
    Write-Host ("=" * 62) -ForegroundColor Cyan
    Write-Host ""
}
function Write-Ok($t)   { Write-Host "  [OK]  $t" -ForegroundColor Green  }
function Write-Warn($t) { Write-Host "  [!!]  $t" -ForegroundColor Yellow }
function Write-Err($t)  { Write-Host "  [ERR] $t" -ForegroundColor Red    }
function Write-Info($t) { Write-Host "  [..] $t"  -ForegroundColor Gray   }

# ── sanity checks ────────────────────────────────────────────────────────────
if (-not (Test-Path $nodeScript)) {
    Write-Err "Script not found: $nodeScript"
    exit 1
}
$nodeExe = (Get-Command node -ErrorAction SilentlyContinue)?.Source
if (-not $nodeExe) { Write-Err "node not found in PATH"; exit 1 }

Write-Header "Phase 16-H.4 — Qdrant Discovery (Streaming)"
Write-Info "Node  : $nodeExe"
Write-Info "Script: $nodeScript"
Write-Info "Batch : $BatchSize   DryRun: $DryRun"
Write-Host ""

# ── try to get live point count from Qdrant ───────────────────────────────────
$envFile = "$repoRoot\.env"
$qdrantUrl = 'http://127.0.0.1:6333'
if (Test-Path $envFile) {
    $match = Select-String -Path $envFile -Pattern '^QDRANT_URL=(.+)' | Select-Object -First 1
    if ($match) { $qdrantUrl = $match.Matches[0].Groups[1].Value.Trim('"').Trim("'") }
}
try {
    $info = Invoke-RestMethod "$qdrantUrl/collections/codebase_chunks_768" -TimeoutSec 8
    $EstimatedTotal = [int]$info.result.points_count
    Write-Ok "Qdrant live — codebase_chunks_768 has $($EstimatedTotal.ToString('N0')) points"
} catch {
    Write-Warn "Could not reach Qdrant at $qdrantUrl — using estimated $($EstimatedTotal.ToString('N0'))"
}

# Pre-flight: how many bridge rows still need linking?
try {
    $preCheck = docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -t -A -c `
        "SELECT COUNT(*) FROM atlas_higher_hop_index WHERE qdrant_point_id IS NULL" 2>$null
    $stillMissing = [int]($preCheck.Trim())
    Write-Info "Bridge rows still unlinked: $stillMissing / 3251"
    if ($stillMissing -eq 0) {
        Write-Ok "All rows already linked — nothing to do. Run H.5 next."
        exit 0
    }
} catch {
    Write-Info "Could not pre-check bridge table (continuing anyway)"
}
Write-Host ""

# ── progress bar helper ───────────────────────────────────────────────────────
$script:startTime = [DateTime]::UtcNow

function Update-Bars($processed, $matched, $missing, $notFound, $batches) {
    $pct     = [Math]::Min([int](100 * $processed / [Math]::Max($EstimatedTotal,1)), 100)
    $elapsed = ([DateTime]::UtcNow - $script:startTime).TotalSeconds
    $rate    = if ($elapsed -gt 1) { [int]($processed / $elapsed) } else { 1 }
    $etaSec  = [int](([Math]::Max($EstimatedTotal - $processed, 0)) / $rate)
    $eta     = '{0:mm\:ss}' -f [TimeSpan]::FromSeconds($etaSec)

    Write-Progress -Id 1 `
        -Activity "H.4 Qdrant Discovery  |  $($processed.ToString('N0')) / $($EstimatedTotal.ToString('N0'))  |  $rate pts/s  |  ETA $eta" `
        -Status   "batch $batches — matched=$matched  no-key=$missing  not-in-table=$notFound" `
        -PercentComplete $pct

    $matchPct = if ($processed -gt 0) { [int](100 * $matched / $processed) } else { 0 }
    Write-Progress -Id 2 -ParentId 1 `
        -Activity "New links this run: $matchPct%" `
        -Status   "$matched newly linked  |  $missing no key in payload  |  $notFound already done/skip" `
        -PercentComplete $matchPct
}

# ── launch node, read JSON lines ──────────────────────────────────────────────
$env:H4_JSON_PROGRESS = '1'
$env:H4_BATCH_SIZE    = "$BatchSize"
$env:H4_DRY_RUN       = if ($DryRun) { '1' } else { '0' }

$psi                        = [System.Diagnostics.ProcessStartInfo]::new('node', "`"$nodeScript`"")
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError  = $true
$psi.UseShellExecute        = $false
$psi.WorkingDirectory       = $repoRoot

$proc = [System.Diagnostics.Process]::new()
$proc.StartInfo = $psi

$null = $proc.Start()

$doneObj = $null
$stderrText = $null

try {
    while (-not $proc.StandardOutput.EndOfStream) {
        $line = $proc.StandardOutput.ReadLine()
        if ([string]::IsNullOrWhiteSpace($line)) { continue }

        $obj = $null
        try { $obj = $line | ConvertFrom-Json -ErrorAction Stop } catch { Write-Host $line; continue }

        switch ($obj.type) {
            'progress' {
                Update-Bars $obj.processed $obj.matched $obj.missing $obj.notFound $obj.batchCount
            }
            'done' {
                $doneObj = $obj
                Update-Bars $obj.processed $obj.matched $obj.missing $obj.notFound $obj.batchCount
            }
            'error' {
                Write-Err $obj.msg
            }
        }
    }
    $proc.WaitForExit()
    $stderrText = $proc.StandardError.ReadToEnd()
} finally {
    Write-Progress -Id 2 -Activity 'Match rate' -Completed
    Write-Progress -Id 1 -Activity 'H.4 Qdrant Discovery' -Completed
    $env:H4_JSON_PROGRESS = $null
    $env:H4_BATCH_SIZE    = $null
    $env:H4_DRY_RUN       = $null
}

# ── results ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Header "Results"

if (-not [string]::IsNullOrWhiteSpace($stderrText)) {
    Write-Host "  -- stderr --" -ForegroundColor DarkGray
    $stderrText -split "`r?`n" | ForEach-Object {
        if (-not [string]::IsNullOrWhiteSpace($_)) {
            Write-Host "  $_" -ForegroundColor DarkGray
        }
    }
    Write-Host ""
}

if ($proc.ExitCode -ne 0) {
    Write-Err "Node exited with code $($proc.ExitCode)"
    exit $proc.ExitCode
}

if (-not $doneObj) {
    Write-Warn "No completion data received — see stderr above"
    exit 1
}

$elapsed = [TimeSpan]::FromMilliseconds($doneObj.elapsedMs)

Write-Host "  Points processed     $($doneObj.processed.ToString('N0'))" -ForegroundColor White
Write-Host "  Batches              $($doneObj.batchCount.ToString('N0'))" -ForegroundColor White
Write-Host "  Elapsed              $($elapsed.ToString('mm\:ss'))" -ForegroundColor Gray
Write-Host ""
Write-Host "  Newly linked         $($doneObj.matched.ToString('N0'))" -ForegroundColor Green
Write-Host "  No key in payload    $($doneObj.missing.ToString('N0'))" -ForegroundColor Yellow
Write-Host "  Already linked/skip  $($doneObj.notFound.ToString('N0'))" -ForegroundColor DarkGray
Write-Host ""

if ($doneObj.audit) {
    $a   = $doneObj.audit
    $pct = if ($a.total -gt 0) { (100 * $a.with_qdrant / $a.total).ToString('F1') } else { '0.0' }
    Write-Host "  ── DB Audit ──────────────────────────" -ForegroundColor Cyan
    Write-Host "  Total rows         $($a.total)" -ForegroundColor White
    Write-Host "  With qdrant_id     $($a.with_qdrant)  ($pct%)" -ForegroundColor White
    Write-Host "  With payload key   $($a.with_key)" -ForegroundColor White
    Write-Host ""
    if ($doneObj.gatePassed) { Write-Ok "Gate PASSED — >= 95% Qdrant coverage" }
    else                     { Write-Warn "Gate WARNING — $pct% < 95%" }
}

if ($DryRun) { Write-Warn "DRY RUN — no rows were updated" }

Write-Host ""
Write-Info "Next step: Run-Phase16H5.ps1  (payload canonicalization)"
