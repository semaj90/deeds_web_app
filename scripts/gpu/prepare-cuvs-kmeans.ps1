[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
  [ValidateRange(1, 8192)]
  [int]$MinFreeMiB = $(if ($env:KMEANS_MIN_FREE_MIB) { [int]$env:KMEANS_MIN_FREE_MIB } else { 1536 }),
  [ValidateRange(1, 128)]
  [double]$MinFreeRamGiB = $(if ($env:KMEANS_MIN_FREE_RAM_GIB) { [double]$env:KMEANS_MIN_FREE_RAM_GIB } else { 4 })
)

$ErrorActionPreference = 'Stop'

function Get-GpuMemory {
  $result = & nvidia-smi --query-gpu=memory.used,memory.free --format=csv,noheader,nounits
  if ($LASTEXITCODE -ne 0) { throw 'nvidia-smi failed; refusing to infer available VRAM.' }
  $parts = ($result | Select-Object -First 1) -split ',\s*'
  if ($parts.Count -ne 2 -or $parts[0] -notmatch '^\d+$' -or $parts[1] -notmatch '^\d+$') {
    throw 'nvidia-smi returned an unexpected memory format.'
  }
  [pscustomobject]@{ UsedMiB = [int]$parts[0]; FreeMiB = [int]$parts[1] }
}

function Get-HostMemory {
  $os = Get-CimInstance Win32_OperatingSystem
  if (-not $os.FreePhysicalMemory -or -not $os.TotalVisibleMemorySize) {
    throw 'Windows did not report usable physical-memory measurements.'
  }
  [pscustomobject]@{
    FreeGiB = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
    TotalGiB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
  }
}

function Get-Port8090Process {
  @(
    Get-CimInstance Win32_Process -Filter "Name='llama-server.exe'" |
      Where-Object { $_.CommandLine -match '(?:^|\s)--port(?:\s+|=)8090(?:\s|$)' }
  )
}

function Write-GpuStatus($memory) {
  Write-Host "GPU used MiB: $($memory.UsedMiB)"
  Write-Host "GPU free MiB: $($memory.FreeMiB)"
  Write-Host "Required free MiB: $MinFreeMiB"
}

$hostMemory = Get-HostMemory
Write-Host "Windows RAM free GiB: $($hostMemory.FreeGiB) / $($hostMemory.TotalGiB)"
Write-Host "Required Windows RAM free GiB: $MinFreeRamGiB"
if ($hostMemory.FreeGiB -lt $MinFreeRamGiB) {
  Write-Error 'BLOCKED: host RAM is below the configured workload minimum. No process was stopped and no WSL2 job should start.'
  exit 2
}

$memory = Get-GpuMemory
Write-GpuStatus $memory

if ($memory.FreeMiB -ge $MinFreeMiB) {
  Write-Host 'READY: measured host RAM and VRAM meet their thresholds; no process was stopped.'
  Write-Host 'WSL interpreter: /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python'
  exit 0
}

Write-Host "VRAM is below the requested threshold; checking only llama-server.exe bound to --port 8090."
$targets = @(Get-Port8090Process)
if ($targets.Count -ne 1) {
  Write-Error "BLOCKED: expected exactly one verified :8090 llama-server process; found $($targets.Count). No process was stopped."
  exit 2
}

try {
  $slots = Invoke-RestMethod -Uri 'http://127.0.0.1:8090/slots' -TimeoutSec 3
} catch {
  Write-Error "BLOCKED: could not verify :8090 slot idleness. No process was stopped. $($_.Exception.Message)"
  exit 2
}

$slotList = @($slots)
if ($slotList.Count -eq 0 -or @($slotList | Where-Object { $_.PSObject.Properties.Name -notcontains 'is_processing' -or $_.is_processing -ne $false }).Count -gt 0) {
  Write-Error 'BLOCKED: :8090 slots are empty or not explicitly idle. No process was stopped.'
  exit 2
}

$target = $targets[0]
Write-Host "Verified idle :8090 process PID $($target.ProcessId), started $($target.CreationDate)."
$targetDescription = "llama-server.exe PID $($target.ProcessId) (--port 8090)"
if ($WhatIfPreference) {
  $null = $PSCmdlet.ShouldProcess($targetDescription, 'Stop verified idle process')
  Write-Host 'WHATIF: no process was changed.'
  exit 0
}

$answer = Read-Host "Only $($target.Name) PID $($target.ProcessId) will be stopped to free VRAM. Type STOP-8090 to continue"
if ($answer -cne 'STOP-8090') {
  Write-Host 'CANCELLED: no process was stopped.'
  exit 3
}

$previousConfirmPreference = $ConfirmPreference
try {
  $ConfirmPreference = 'None'
  $approved = $PSCmdlet.ShouldProcess($targetDescription, 'Stop verified idle process')
} finally {
  $ConfirmPreference = $previousConfirmPreference
}
if (-not $approved) {
  Write-Host 'WHATIF: verified target would be stopped; no process was changed.'
  exit 0
}

Stop-Process -Id $target.ProcessId
$deadline = (Get-Date).AddSeconds(20)
do {
  Start-Sleep -Milliseconds 500
  $remaining = @(Get-Port8090Process)
} while ((Get-Date) -lt $deadline -and $remaining.Count -gt 0)

if ($remaining.Count -gt 0) {
  Write-Error 'FAILED: the verified :8090 process remains. No force-stop was attempted.'
  exit 1
}

$memory = Get-GpuMemory
Write-GpuStatus $memory
if ($memory.FreeMiB -lt $MinFreeMiB) {
  Write-Error 'BLOCKED: :8090 stopped, but measured free VRAM is still below the requested threshold.'
  exit 1
}

Write-Host 'READY: measured VRAM meets the threshold. KMeans was not started.'
Write-Host 'After the WSL2 job, restore the :8090 server with the approved TurboQuant start task.'
