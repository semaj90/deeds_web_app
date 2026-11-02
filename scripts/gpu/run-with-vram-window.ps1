<#
.SYNOPSIS
  Human-run wrapper: unload :8090 -> run ONE repo job -> ALWAYS start :8090 again.
.DESCRIPTION
  Delegates every service mutation to the canonical typed controller
  scripts/atlas/llama-server-control.ps1 (scoped to --port 8090, idle-slot check, single
  instance mutex, no force-kill, receipts, tested by test-llama-server-control.ps1). This
  script adds no stop/start logic of its own.
    1. -Action unload -ConfirmControl   (refuses if slots busy/unknown or ownership ambiguous)
    2. verify measured free VRAM >= -MinFreeMiB from the controller receipt
    3. run the job (.ps1/.mjs/.py under this repo)
    4. finally: -Action start -Profile ornith-1.5-vlm -ConfirmControl (only if step 1 stopped it)
  Receipt: .tmp/atlas/gpu-vram-window-receipt-v1.json. Human/VS Code entry point only; do not expose via MCP.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$JobScript,
  [string[]]$JobArgs = @(),
  [int]$MinFreeMiB = 1536,
  [ValidateSet('ornith-1.5', 'ornith-1.5-vlm')][string]$RestoreProfile = 'ornith-1.5-vlm'
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$control = Join-Path $repo 'scripts/atlas/llama-server-control.ps1'
$jobPath = (Resolve-Path -LiteralPath (Join-Path $repo $JobScript) -ErrorAction Stop).Path
if (-not $jobPath.StartsWith($repo, [StringComparison]::OrdinalIgnoreCase)) { throw 'Job must live under the repo.' }
if ($jobPath -notmatch '\.(ps1|mjs|py)$') { throw 'Job must be .ps1, .mjs or .py.' }

function Invoke-Control([string[]]$ControlArgs) {
  $json = (& pwsh -NoProfile -File $control @ControlArgs | Select-Object -Last 1)
  $r = $json | ConvertFrom-Json
  return $r
}

$receipt = [ordered]@{
  schema = 'atlas.gpu-vram-window.v1'; startedAt = (Get-Date).ToString('o'); job = $JobScript
  unloadStatus = $null; unloadMutated = $false; freeMiBAfterUnload = $null
  jobExit = $null; restoreStatus = $null; error = $null
}
$mutated = $false
try {
  $u = Invoke-Control @('-Action', 'unload', '-ConfirmControl')
  $receipt.unloadStatus = $u.status
  $mutated = [bool]$u.serviceMutationPerformed
  $receipt.unloadMutated = $mutated
  if ($u.status -ne 'STOPPED') { throw "unload refused or failed: $($u.error)" }
  $receipt.freeMiBAfterUnload = ($u.after.gpus | Select-Object -First 1).freeMiB
  if ($null -eq $receipt.freeMiBAfterUnload -or $receipt.freeMiBAfterUnload -lt $MinFreeMiB) {
    throw "free VRAM $($receipt.freeMiBAfterUnload) MiB is below the $MinFreeMiB MiB floor; job not run."
  }
  switch -Regex ($jobPath) {
    '\.ps1$' { & pwsh -NoProfile -File $jobPath @JobArgs }
    '\.mjs$' { & node $jobPath @JobArgs }
    '\.py$'  { & py -3.13 $jobPath @JobArgs }
  }
  $receipt.jobExit = $LASTEXITCODE
} catch {
  $receipt.error = $_.Exception.Message
} finally {
  if ($mutated) {
    $s = Invoke-Control @('-Action', 'start', '-Profile', $RestoreProfile, '-ConfirmControl')
    $receipt.restoreStatus = $s.status
    if ($s.status -ne 'RUNNING' -and $s.status -ne 'ALREADY_RUNNING') {
      Write-Warning ":8090 was NOT restored ($($s.error)). Run the task 'TurboQuant: Start (vision, CPU projector, :8090)'."
    } else { Write-Host "RESTORED: :8090 $($s.status)." }
  }
  $receipt.finishedAt = (Get-Date).ToString('o')
  $out = Join-Path $repo '.tmp/atlas'
  New-Item -ItemType Directory -Force -Path $out | Out-Null
  $receipt | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $out 'gpu-vram-window-receipt-v1.json')
}
if ($receipt.error -or $receipt.jobExit -ne 0) { exit 1 }
