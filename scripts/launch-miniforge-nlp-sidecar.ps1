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
  [switch] $UseDocker,
  [switch] $UseLocalPython,
  [int] $Port = 8095
)

$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$scriptPath = Join-Path $repoRoot 'python\miniforge_nlp_sidecar.py'
$composeFile = Join-Path $repoRoot 'docker\miniforge-nlp-sidecar\docker-compose.yml'
$pythonExe = if ($env:MINIFORGE_PYTHON) { $env:MINIFORGE_PYTHON } else { 'python' }
$useDockerRuntime = $UseDocker -or (-not $UseLocalPython -and [bool](Get-Command docker -ErrorAction SilentlyContinue))

if (-not (Test-Path $scriptPath)) {
  throw "Sidecar script not found: $scriptPath"
}

$env:MINIFORGE_SIDECAR_URL = "http://127.0.0.1:$Port"
$env:NLP_SIDECAR_URL = $env:MINIFORGE_SIDECAR_URL
$env:LANGEXTRACT_URL = $env:MINIFORGE_SIDECAR_URL
$env:MINIFORGE_SIDECAR_PORT = $Port
$launchArgs = @($scriptPath)

function Test-Health {
  param([string]$HealthUrl, [string]$ExpectedModel = $null)
  for ($i = 0; $i -lt 30; $i++) {
    try {
      $resp = Invoke-WebRequest -UseBasicParsing $HealthUrl -TimeoutSec 2
      if ($resp.StatusCode -eq 200) {
        $body = $resp.Content | ConvertFrom-Json -ErrorAction Stop
        if ($body.status -eq 'ok' -and ($null -eq $ExpectedModel -or $body.model -eq $ExpectedModel)) {
          return $true
        }
      }
    } catch {
      Start-Sleep -Seconds 1
    }
  }
  return $false
}

function Start-DockerSidecar {
  param([switch]$DetachedMode)

  if (-not (Test-Path $composeFile)) {
    throw "Docker compose file not found: $composeFile"
  }

  Push-Location $repoRoot
  try {
    docker compose -f $composeFile up -d --build
    if ($LASTEXITCODE -ne 0) {
      throw "docker compose failed to start miniforge sidecar"
    }
  } finally {
    Pop-Location
  }

  for ($i = 0; $i -lt 45; $i++) {
    try {
      $healthStatus = (& docker inspect --format '{{.State.Health.Status}}' miniforge-nlp-sidecar 2>$null).Trim()
      if ($healthStatus -eq 'healthy') {
        Write-Host "Miniforge NLP sidecar ready in Docker mode on http://127.0.0.1:$Port/health"
        return
      }
    } catch {
      # Keep waiting while Docker is still wiring the container.
    }
    Start-Sleep -Seconds 2
  }

  $healthUrl = "http://127.0.0.1:$Port/health"
  throw "Miniforge NLP sidecar did not become healthy in Docker mode within the wait window: $healthUrl"
}

if ($useDockerRuntime) {
  Start-DockerSidecar -DetachedMode:$Detached
  exit 0
}

if ($Detached) {
  Start-Process -FilePath $pythonExe -ArgumentList $launchArgs -WindowStyle Hidden -WorkingDirectory $repoRoot | Out-Null
  $healthUrl = "http://127.0.0.1:$Port/health"
  if (Test-Health -HealthUrl $healthUrl) {
    Write-Host "Miniforge NLP sidecar ready in detached mode on $healthUrl"
    exit 0
  }

  throw "Miniforge NLP sidecar did not become healthy in detached mode within the wait window: $healthUrl"
}

& $pythonExe @launchArgs
