<#
.SYNOPSIS
  Wrapper script for launch-turboquant.ps1 that parses command-line parameters
  and sets environment variables dynamically.
#>
[CmdletBinding()]
param(
  [string] $Profile,

  [Alias("ctx-size", "ctx_size")]
  [int] $CtxSize,

  [switch] $Detached,
  [switch] $TextOnly,
  [switch] $NoEvict,
  [switch] $StatusOnly
)

if ($Profile) {
    [System.Environment]::SetEnvironmentVariable('TURBO_PROFILE', $Profile)
    Write-Host "Setting TURBO_PROFILE=$Profile in environment." -ForegroundColor Gray
}
if ($CtxSize) {
    [System.Environment]::SetEnvironmentVariable('TURBO_CTX', [string]$CtxSize)
    Write-Host "Setting TURBO_CTX=$CtxSize in environment." -ForegroundColor Gray
}

$scriptPath = Join-Path $PSScriptRoot "launch-turboquant.ps1"
$args = @()
if ($Detached) { $args += "-Detached" }
if ($TextOnly) { $args += "-TextOnly" }
if ($NoEvict) { $args += "-NoEvict" }
if ($StatusOnly) { $args += "-StatusOnly" }

& $scriptPath @args
