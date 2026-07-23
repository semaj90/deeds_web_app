<#
.SYNOPSIS
  Launch the Miniforge NLP sidecar (LangExtract + tree-sitter + ast-grep).

.DESCRIPTION
  Starts the Python FastAPI sidecar on port 8095 by default. The launcher
  prefers an explicit MINIFORGE_PYTHON executable when provided, otherwise it
  falls back to `python` on PATH. This keeps the sidecar isolated from the main
  Node process while still making startup reproducible.
#>
[CmdletBinding()]
param(
  [switch] $Detached,
  [int] $Port = 8095
)

$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$scriptPath = Join-Path $repoRoot 'python\miniforge_nlp_sidecar.py'
$pythonExe = if ($env:MINIFORGE_PYTHON) { $env:MINIFORGE_PYTHON } else { 'python' }

if (-not (Test-Path $scriptPath)) {
  throw "Sidecar script not found: $scriptPath"
}

$env:MINIFORGE_SIDECAR_PORT = $Port

$args = @($scriptPath)

if ($Detached) {
  Start-Process -FilePath $pythonExe -ArgumentList $args -WindowStyle Hidden -WorkingDirectory $repoRoot | Out-Null
  $healthUrl = "http://127.0.0.1:$Port/health"
  $ready = $false
  for ($i = 0; $i -lt 20; $i++) {
    try {
      $resp = Invoke-WebRequest -UseBasicParsing $healthUrl -TimeoutSec 1
      if ($resp.StatusCode -eq 200) {
        $body = $resp.Content | ConvertFrom-Json -ErrorAction Stop
        if ($body.status -eq 'ok' -and $body.model -eq 'miniforge-nlp-sidecar') {
          $ready = $true
          break
        }
      }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  if ($ready) {
    Write-Host "Miniforge NLP sidecar ready in detached mode on $healthUrl"
  } else {
    Write-Host "Miniforge NLP sidecar launched in detached mode on http://127.0.0.1:$Port; waiting for health endpoint to become ready"
  }
  exit 0
}

& $pythonExe @args
