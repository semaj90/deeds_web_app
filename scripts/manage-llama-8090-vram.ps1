<#
.SYNOPSIS
  Operator-authorized, port-scoped VRAM lifecycle manager for llama-server :8090.
.DESCRIPTION
  Checks /slots idle state, inspects GPU VRAM via nvidia-smi, releases :8090 strictly
  by port-scoped PID (NEVER taskkill /IM llama-server.exe), writes an audit receipt,
  and restores :8090 via scripts/launch-turboquant.ps1.
#>
[CmdletBinding()]
param(
  [ValidateSet('status', 'release', 'restore')]
  [string] $Action = 'status',
  [int] $Port = 8090,
  [string] $Reason = 'gpu-job-vram-coordination',
  [switch] $Force
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$ReceiptPath = Join-Path $RepoRoot '.tmp\atlas\vram-release-receipt-latest.json'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ReceiptPath) | Out-Null

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

function Get-PortPid([int] $TargetPort) {
  $conn = Get-NetTCPConnection -LocalPort $TargetPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($conn) { return [int]$conn.OwningProcess }
  return $null
}

function Get-LlamaSlots([int] $TargetPort) {
  try {
    $slots = Invoke-RestMethod -Uri "http://127.0.0.1:$TargetPort/slots" -Method Get -TimeoutSec 3
    $busy = @($slots | Where-Object { $_.is_processing -eq $true }).Count
    return @{ reachable = $true; total = @($slots).Count; busy = $busy }
  } catch {
    return @{ reachable = $false; total = 0; busy = 0 }
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

$vramBefore = Get-VramSnapshot
$listenPid = Get-PortPid -TargetPort $Port
$slots = Get-LlamaSlots -TargetPort $Port
$modelId = Get-LoadedModel -TargetPort $Port

if ($Action -eq 'status') {
  $out = @{
    schema = 'atlas.llama-8090-vram-status.v1'
    timestamp = (Get-Date).ToUniversalTime().ToString('o')
    port = $Port
    listenPid = $listenPid
    loadedModelId = $modelId
    slots = $slots
    vram = $vramBefore
  }
  $out | ConvertTo-Json -Depth 6
  exit 0
}

if ($Action -eq 'release') {
  if ($slots.reachable -and $slots.busy -gt 0 -and -not $Force) {
    throw "REFUSED_SLOTS_BUSY: $($slots.busy) active slot(s) on :$Port. Wait for idle or pass -Force."
  }
  $stoppedPid = $null
  if ($listenPid) {
    Stop-Process -Id $listenPid -Force
    $stoppedPid = $listenPid
    Start-Sleep -Seconds 2
  }
  $vramAfter = Get-VramSnapshot
  $receipt = @{
    schema = 'atlas.llama-8090-vram-receipt.v1'
    action = 'release'
    timestamp = (Get-Date).ToUniversalTime().ToString('o')
    port = $Port
    reason = $Reason
    stoppedPortScopedPid = $stoppedPid
    previousModelId = $modelId
    slotsBefore = $slots
    vramBefore = $vramBefore
    vramAfter = $vramAfter
  }
  $receipt | ConvertTo-Json -Depth 6 | Set-Content -Path $ReceiptPath -Encoding UTF8
  $receipt | ConvertTo-Json -Depth 6
  exit 0
}

if ($Action -eq 'restore') {
  if (-not $listenPid) {
    $launcher = Join-Path $RepoRoot 'scripts\launch-turboquant.ps1'
    if (-not (Test-Path $launcher)) { throw "Missing launcher: $launcher" }
    & pwsh -NoProfile -File $launcher -Detached | Out-Null
    for ($i = 0; $i -lt 30; $i++) {
      Start-Sleep -Seconds 1
      $modelId = Get-LoadedModel -TargetPort $Port
      if ($modelId) { break }
    }
  }
  $vramAfter = Get-VramSnapshot
  $receipt = @{
    schema = 'atlas.llama-8090-vram-receipt.v1'
    action = 'restore'
    timestamp = (Get-Date).ToUniversalTime().ToString('o')
    port = $Port
    listenPid = (Get-PortPid -TargetPort $Port)
    loadedModelId = $modelId
    vramAfter = $vramAfter
  }
  $receipt | ConvertTo-Json -Depth 6 | Set-Content -Path $ReceiptPath -Encoding UTF8
  $receipt | ConvertTo-Json -Depth 6
  exit 0
}
