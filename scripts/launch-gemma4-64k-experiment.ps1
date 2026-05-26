<#
.SYNOPSIS
  Experimental Gemma4 64k launch profile for low-VRAM validation.

.DESCRIPTION
  Thin wrapper over the normal TurboQuant launcher. It sets the 64k experiment
  profile to q4_0/q4_0 KV cache and smaller batch sizes so the model has a
  better chance of fitting on the RTX 3060 Ti without immediately spilling
  into system RAM.
#>

[CmdletBinding()]
param(
  [switch] $Detached,
  [switch] $StatusOnly
)

$ErrorActionPreference = 'Stop'

$env:TURBO_CTX = '65536'
$env:TURBO_KV_K = 'q4_0'
$env:TURBO_KV_V = 'q4_0'
$env:TURBO_BATCH_SIZE = '128'
$env:TURBO_UBATCH_SIZE = '64'
$env:TURBO_PROFILE = 'stock'

$launcher = Join-Path $PSScriptRoot 'launch-turboquant.ps1'
$args = @()
if ($Detached) { $args += '-Detached' }
if ($StatusOnly) { $args += '-StatusOnly' }
& pwsh -NoProfile -ExecutionPolicy Bypass -File $launcher @args
