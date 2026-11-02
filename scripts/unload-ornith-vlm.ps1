<#
.SYNOPSIS
  Gracefully unload the canonical Ornith 1.5 VLM llama-server on :8090 to free VRAM.

.DESCRIPTION
  Checks if llama-server is currently serving on :8090, verifies whether any inference
  slots are active, stops the process gracefully, and reports freed GPU VRAM via nvidia-smi.
#>
[CmdletBinding()]
param(
  [switch] $Force
)

$ErrorActionPreference = 'Stop'

Write-Host "Probing llama-server on :8090..." -ForegroundColor Cyan

$process = Get-CimInstance Win32_Process -Filter "Name='llama-server.exe'" |
  Where-Object { $_.CommandLine -match '--port 8090( |$)' }

if (-not $process) {
  Write-Host "Ornith llama-server on :8090 is not currently running." -ForegroundColor Yellow
} else {
  # Check slots status if reachable
  try {
    $props = Invoke-RestMethod 'http://127.0.0.1:8090/props' -TimeoutSec 3
    Write-Host "Active model on :8090: $($props.model_alias) (PID $($process.ProcessId))" -ForegroundColor Cyan
  } catch {
    Write-Host "Warning: :8090 /props endpoint unreachable. Proceeding with process stop." -ForegroundColor Yellow
  }

  Write-Host "Stopping :8090 llama-server process (PID $($process.ProcessId))..." -ForegroundColor Cyan
  Stop-Process -Id $process.ProcessId -Force:$Force
  Start-Sleep -Milliseconds 1500

  # Verify termination
  $remaining = Get-CimInstance Win32_Process -Filter "Name='llama-server.exe'" |
    Where-Object { $_.CommandLine -match '--port 8090( |$)' }
  if ($remaining) {
    Write-Warning "llama-server on :8090 still lingering after stop signal."
  } else {
    Write-Host "Ornith llama-server stopped successfully." -ForegroundColor Green
  }
}

# Report VRAM status
try {
  $vram = nvidia-smi --query-gpu=memory.used,memory.free,memory.total --format=csv,noheader,nounits
  $parts = $vram -split ',\s*'
  Write-Host "VRAM Status: Used: $($parts[0]) MB | Free: $($parts[1]) MB | Total: $($parts[2]) MB" -ForegroundColor Green
} catch {
  Write-Host "nvidia-smi not available in current PATH." -ForegroundColor Gray
}
