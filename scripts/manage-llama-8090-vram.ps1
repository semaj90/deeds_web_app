<#
.SYNOPSIS
  Operator-authorized, port-scoped VRAM lifecycle manager for llama-server :8090.
.DESCRIPTION
  Checks /slots idle state (fail-closed when unreachable or malformed), verifies port-scoped
  process identity, serializes lifecycle operations, and reports the lease marker
  (.tmp/atlas/gpu-vram-lease.json). Release remains refused until request draining
  and a supported graceful shutdown control are implemented.
  writes .tmp/atlas/vram-release-receipt-latest.json, and restores :8090 via
  scripts/launch-turboquant.ps1.
#>
[CmdletBinding()]
param(
  [ValidateSet('status', 'release', 'restore')]
  [string] $Action = 'status',
  [int] $Port = 8090,
  [string] $Reason = 'gpu-job-vram-coordination',
  [switch] $DryRun
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$ReceiptPath = Join-Path $RepoRoot '.tmp\atlas\vram-release-receipt-latest.json'
$LeasePath = Join-Path $RepoRoot '.tmp\atlas\gpu-vram-lease.json'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ReceiptPath) | Out-Null
. (Join-Path $PSScriptRoot 'lib\llama-8090-vram-guards.ps1')

function Get-VramSnapshot {
  try {
    $raw = (& nvidia-smi --query-gpu=memory.total,memory.used,memory.free --format=csv,noheader,nounits 2>$null | Select-Object -First 1)
    if (-not $raw) { return @{ totalMiB = $null; usedMiB = $null; freeMiB = $null } }
    $parts = $raw.Split(',') | ForEach-Object { [int]($_.Trim()) }
    return @{ totalMiB = $parts[0]; usedMiB = $parts[1]; freeMiB = $parts[2] }
  } catch {
    return @{ totalMiB = $null; usedMiB = $null; freeMiB = $null }
  }
}

function Get-PortProcessIdentity([int] $TargetPort) {
  $conn = Get-NetTCPConnection -LocalPort $TargetPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $conn) {
    return @{ pid = $null; processName = $null; executablePath = $null; isLlamaServer = $false }
  }
  $owningPid = [int]$conn.OwningProcess
  $proc = Get-Process -Id $owningPid -ErrorAction SilentlyContinue
  $cim = Get-CimInstance Win32_Process -Filter "ProcessId = $owningPid" -ErrorAction SilentlyContinue
  $name = if ($proc) { [string]$proc.ProcessName } else { $null }
  $exePath = if ($cim -and $cim.ExecutablePath) { [string]$cim.ExecutablePath } else { $null }
  $identityProbe = [pscustomobject]@{
    ProcessId = $owningPid
    Name = $name
    CommandLine = if ($cim) { [string]$cim.CommandLine } else { $null }
  }
  $isLlama = Test-LlamaPortProcessIdentityV1 -Port $TargetPort -Process $identityProbe
  return @{
    pid = $owningPid
    processName = $name
    executablePath = $exePath
    commandLineVerified = [bool]$isLlama
    isLlamaServer = [bool]$isLlama
  }
}

function Get-LlamaSlots([int] $TargetPort) {
  try {
    $slots = Invoke-RestMethod -Uri "http://127.0.0.1:$TargetPort/slots" -Method Get -TimeoutSec 3
    return (ConvertTo-ValidatedLlamaSlotsV1 -Response $slots)
  } catch {
    return [pscustomobject]@{ reachable = $false; valid = $false; total = 0; busy = 0; reason = 'SLOTS_UNREACHABLE' }
  }
}

function Get-LoadedModel([int] $TargetPort) {
  try {
    $m = Invoke-RestMethod -Uri "http://127.0.0.1:$TargetPort/v1/models" -Method Get -TimeoutSec 3
    if ($m.data -and $m.data.Count -gt 0) { return [string]$m.data[0].id }
    return $null
  } catch {
    return $null
  }
}

function Get-ActiveGpuLease {
  if (-not (Test-Path $LeasePath)) { return $null }
  try {
    return (Get-Content -Path $LeasePath -Raw -Encoding UTF8 | ConvertFrom-Json)
  } catch {
    return @{ status = 'CORRUPT_LEASE' }
  }
}

$vramBefore = Get-VramSnapshot
$procInfo = Get-PortProcessIdentity -TargetPort $Port
$listenPid = $procInfo.pid
$slots = Get-LlamaSlots -TargetPort $Port
$modelId = Get-LoadedModel -TargetPort $Port
$activeLease = Get-ActiveGpuLease

if ($Action -eq 'status') {
  $out = @{
    schema = 'atlas.llama-8090-vram-status.v1'
    timestamp = (Get-Date).ToUniversalTime().ToString('o')
    port = $Port
    listenPid = $listenPid
    processIdentity = $procInfo
    loadedModelId = $modelId
    slots = $slots
    vram = $vramBefore
    gpuLease = $activeLease
  }
  $out | ConvertTo-Json -Depth 6
  exit 0
}

if ($Action -eq 'release') {
  $releaseMutex = [System.Threading.Mutex]::new($false, 'Local\deeds-gpu-vram-release')
  if (-not $releaseMutex.WaitOne(0)) {
    $releaseMutex.Dispose()
    throw 'REFUSED_GPU_LIFECYCLE_BUSY: Another release/restore lifecycle operation holds the lease.'
  }
  try {
    if ($activeLease -and $activeLease.status -ne 'RESTORED') {
      throw "REFUSED_GPU_LEASE_HELD: Lease state exists at $LeasePath (status=$($activeLease.status)); inspect and restore through the reviewed workflow."
    }
    if (-not $listenPid) {
      throw "REFUSED_LLAMA_SERVER_NOT_LISTENING: No process owns :$Port."
    }
    if (-not $procInfo.isLlamaServer) {
      throw "REFUSED_PROCESS_IDENTITY_MISMATCH: Port :$Port is owned by PID $listenPid ($($procInfo.processName)), not a verified llama-server --port $Port process."
    }
    if (-not $slots.reachable -or -not $slots.valid -or $slots.total -le 0 -or $slots.busy -gt 0) {
      Assert-LlamaVramReleasePreconditionsV1 -Slots $slots -ListenerIdentityVerified $true -InferenceDrainGateVerified $false
    }

    # /slots is only a point-in-time observation. There is no supported ingress
    # drain gate in this checkout, so a second idle sample still cannot prevent
    # a new request from arriving before shutdown. Keep release fail-closed.
    Assert-LlamaVramReleasePreconditionsV1 -Slots $slots -ListenerIdentityVerified $true -InferenceDrainGateVerified $false
    throw 'REFUSED_GRACEFUL_SHUTDOWN_NOT_IMPLEMENTED: no supported llama-server drain/shutdown control exists; no process was stopped and no GPU lease was issued.'
  } finally {
    $releaseMutex.ReleaseMutex()
    $releaseMutex.Dispose()
  }
}

if ($Action -eq 'restore') {
  $restoreMutex = [System.Threading.Mutex]::new($false, 'Local\deeds-gpu-vram-release')
  if (-not $restoreMutex.WaitOne(0)) {
    $restoreMutex.Dispose()
    throw 'REFUSED_GPU_LIFECYCLE_BUSY: Another release/restore lifecycle operation holds the lease.'
  }
  try {
  if (-not $listenPid -and -not $DryRun) {
    $launcher = Join-Path $RepoRoot 'scripts\launch-turboquant.ps1'
    if (-not (Test-Path $launcher)) { throw "Missing launcher: $launcher" }
    & pwsh -NoProfile -File $launcher -Detached | Out-Null
    for ($i = 0; $i -lt 30; $i++) {
      Start-Sleep -Seconds 1
      $modelId = Get-LoadedModel -TargetPort $Port
      if ($modelId) { break }
    }
  }
  $procAfter = Get-PortProcessIdentity -TargetPort $Port
  if (-not $DryRun -and (-not $procAfter.isLlamaServer -or [string]::IsNullOrWhiteSpace($modelId))) {
    throw 'RESTORE_NOT_VERIFIED: listener identity or loaded model readback is missing; preserve the GPU lease and receipt for recovery.'
  }
  if (-not $DryRun -and $activeLease) {
    $activeLease.status = 'RESTORED'
    $activeLease.restoredAt = (Get-Date).ToUniversalTime().ToString('o')
    $activeLease.restoredPid = $procAfter.pid
    $activeLease.restoredModelId = $modelId
    $activeLease | ConvertTo-Json -Depth 6 | Set-Content -Path $LeasePath -Encoding UTF8
  }
  $vramAfter = Get-VramSnapshot
  $receipt = @{
    schema = 'atlas.llama-8090-vram-receipt.v1'
    action = 'restore'
    dryRun = [bool]$DryRun
    timestamp = (Get-Date).ToUniversalTime().ToString('o')
    port = $Port
    listenPid = $procAfter.pid
    processIdentity = $procAfter
    loadedModelId = $modelId
    vramAfter = $vramAfter
  }
  if (-not $DryRun) {
    $receipt | ConvertTo-Json -Depth 6 | Set-Content -Path $ReceiptPath -Encoding UTF8
  }
  $receipt | ConvertTo-Json -Depth 6
  exit 0
  } finally {
    $restoreMutex.ReleaseMutex()
    $restoreMutex.Dispose()
  }
}
