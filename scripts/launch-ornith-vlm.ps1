<#
.SYNOPSIS
  Switch the canonical workstation llama.cpp service on :8090 to the proven
  Ornith 1.5 vision profile.

.DESCRIPTION
  Thin owner-preserving wrapper around launch-turboquant.ps1. It does not
  launch Ollama and does not select a Gemma4 projector. The underlying launcher
  resolves the exact Ornith family projector and fails closed if it is absent.
#>
[CmdletBinding()]
param(
  [switch] $Foreground,
  [switch] $NoEvict
)

$ErrorActionPreference = 'Stop'
$launcher = Join-Path $PSScriptRoot 'launch-turboquant.ps1'
if (-not (Test-Path $launcher)) {
  throw "Canonical llama.cpp launcher not found: $launcher"
}

$args = @(
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-File', $launcher,
  '-StartupProfile', 'ornith-1.5-vlm'
)
if (-not $Foreground) { $args += '-Detached' }
if ($NoEvict) { $args += '-NoEvict' }

Write-Host 'Switching :8090 to Ornith 1.5 VLM (official Ornith mmproj)...' -ForegroundColor Cyan
& pwsh @args
if ($LASTEXITCODE -ne 0) {
  throw "Ornith VLM launcher failed with exit code $LASTEXITCODE"
}

$props = Invoke-RestMethod 'http://127.0.0.1:8090/props' -TimeoutSec 5
$modelAlias = [string]$props.model_alias
$vision = [bool]$props.modalities.vision
if ($modelAlias -notlike 'ornith-1.5*') {
  throw "ORNITH_VLM_MODEL_MISMATCH: :8090 reports '$modelAlias'"
}
if (-not $vision) {
  throw 'ORNITH_VLM_PROJECTOR_NOT_LOADED: :8090 reports modalities.vision=false'
}

Write-Host "Ornith VLM ready: model=$modelAlias vision=$vision endpoint=http://127.0.0.1:8090/v1" -ForegroundColor Green
