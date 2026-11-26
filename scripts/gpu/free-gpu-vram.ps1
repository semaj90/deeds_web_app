<#
.SYNOPSIS
  Human-run: free GPU memory with a progress bar, or restore the model that was running (-Restore).
.DESCRIPTION
  Unloads Ollama models, then stops :8090 only through scripts/atlas/llama-server-control.ps1
  (idle slots required, port-scoped, no force kill, refuses a model it could not restore).
  -Restore starts the profile saved by the last unload, else Gemma 4 text. Do not expose via MCP.
#>
[CmdletBinding()]
param([switch]$Restore)

$ErrorActionPreference = 'Stop'
$control = Join-Path (Split-Path -Parent $PSScriptRoot) 'atlas/llama-server-control.ps1'

if (-not $Restore) {
  $names = @(ollama ps | Select-Object -Skip 1 | ForEach-Object { ($_ -split '\s+')[0] } | Where-Object { $_ })
  foreach ($name in $names) { Write-Host "Unloading Ollama model $name"; ollama stop $name }
}

$action = if ($Restore) { 'start' } else { 'unload' }
$result = & pwsh -NoProfile -File $control -Action $action -ConfirmControl -ShowProgress | Select-Object -Last 1 | ConvertFrom-Json

if ($result.status -eq 'ERROR') {
  Write-Host "NOT DONE: $($result.error)"
  exit 1
}
$gpu = @($result.after.gpus) | Select-Object -First 1
Write-Host "GPU used MiB: $($gpu.usedMiB)  free MiB: $($gpu.freeMiB)"
if ($Restore) {
  Write-Host "$($result.status): $($result.restoreProfile) ($($result.profileSource)), model $($result.after.modelId), vision=$($result.after.vision)"
} elseif ($result.serviceMutationPerformed) {
  Write-Host "Stopped :8090. Chat is unavailable until you run this script with -Restore ($($result.restoreProfile))."
} else {
  Write-Host ':8090 was already stopped.'
}
