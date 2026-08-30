<#
.SYNOPSIS
  Launch the Parent Atlas NLP sidecar (LangExtract + Consiliency treesitter-chunker + ast-grep).

.DESCRIPTION
  Starts the provenance-preserving FastAPI facade on port 8095 by default. The
  facade reuses the existing analysis implementation while preserving native
  Consiliency structural IDs/hierarchy and LangExtract grounding metadata.

  The launcher prefers an explicit MINIFORGE_PYTHON executable when provided,
  otherwise it falls back to `python` on PATH. Docker remains the default when
  available. Existing images are reused on normal startup; use -Rebuild after
  dependency or image changes. Set -UseLocalPython to run the facade directly.
#>
[CmdletBinding()]
param(
  [switch] $Detached,
  [switch] $UseDocker,
  [switch] $UseLocalPython,
  [switch] $UseLegacySidecar,
  [switch] $Rebuild,
  [int] $Port = 8095
)

$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$sidecarFile = if ($UseLegacySidecar) { 'miniforge_nlp_sidecar.py' } else { 'miniforge_nlp_sidecar_v2.py' }
$scriptPath = Join-Path $repoRoot ("python\$sidecarFile")
$composeFile = Join-Path $repoRoot 'docker\miniforge-nlp-sidecar\docker-compose.yml'
$pythonExe = if ($env:MINIFORGE_PYTHON) { $env:MINIFORGE_PYTHON } else { 'python' }
$useDockerRuntime = $UseDocker -or (-not $UseLocalPython -and [bool](Get-Command docker -ErrorAction SilentlyContinue))

if (-not (Test-Path $scriptPath)) {
  throw "Sidecar script not found: $scriptPath"
}

if ($UseLegacySidecar -and $useDockerRuntime) {
  throw '-UseLegacySidecar is supported only with -UseLocalPython; Docker is pinned to the provenance-v2 facade.'
}

$env:MINIFORGE_SIDECAR_URL = "http://127.0.0.1:$Port"
$env:NLP_SIDECAR_URL = $env:MINIFORGE_SIDECAR_URL
$env:LANGEXTRACT_URL = $env:MINIFORGE_SIDECAR_URL
$env:MINIFORGE_SIDECAR_PORT = $Port
$launchArgs = @($scriptPath)

function Test-Health {
  param([string]$HealthUrl, [string]$ExpectedContract = $null)
  for ($i = 0; $i -lt 30; $i++) {
    try {
      $resp = Invoke-WebRequest -UseBasicParsing $HealthUrl -TimeoutSec 2
      if ($resp.StatusCode -eq 200) {
        $body = $resp.Content | ConvertFrom-Json -ErrorAction Stop
        $contractOk = $null -eq $ExpectedContract -or $body.contract -eq $ExpectedContract
        if ($body.status -eq 'ok' -and $contractOk) {
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
  if (-not (Test-Path $composeFile)) {
    throw "Docker compose file not found: $composeFile"
  }

  Push-Location $repoRoot
  try {
    $composeArgs = @('-f', $composeFile, 'up', '-d')
    $imageAvailable = $false
    try {
      $null = docker image inspect 'deeds-miniforge-nlp-sidecar:latest' 2>$null
      $imageAvailable = $LASTEXITCODE -eq 0
    } catch {
      $imageAvailable = $false
    }
    if ($Rebuild -or -not $imageAvailable) {
      $composeArgs += '--build'
    }
    docker compose @composeArgs
    if ($LASTEXITCODE -ne 0) {
      throw 'docker compose failed to start miniforge sidecar'
    }
  } finally {
    Pop-Location
  }

  for ($i = 0; $i -lt 45; $i++) {
    try {
      $healthStatus = (& docker inspect --format '{{.State.Health.Status}}' miniforge-nlp-sidecar 2>$null).Trim()
      if ($healthStatus -eq 'healthy') {
        $healthUrl = "http://127.0.0.1:$Port/health"
        if (Test-Health -HealthUrl $healthUrl -ExpectedContract 'provenance-v2') {
          Write-Host "Parent Atlas NLP sidecar provenance-v2 ready in Docker mode on $healthUrl"
          return
        }
      }
    } catch {
      # Keep waiting while Docker is still wiring the container.
    }
    Start-Sleep -Seconds 2
  }

  throw "Parent Atlas NLP sidecar did not become provenance-v2 healthy in Docker mode within the wait window."
}

if ($useDockerRuntime) {
  Start-DockerSidecar
  exit 0
}

$expectedContract = if ($UseLegacySidecar) { $null } else { 'provenance-v2' }

if ($Detached) {
  Start-Process -FilePath $pythonExe -ArgumentList $launchArgs -WindowStyle Hidden -WorkingDirectory $repoRoot | Out-Null
  $healthUrl = "http://127.0.0.1:$Port/health"
  if (Test-Health -HealthUrl $healthUrl -ExpectedContract $expectedContract) {
    Write-Host "Parent Atlas NLP sidecar ready in detached mode on $healthUrl ($sidecarFile)"
    exit 0
  }

  throw "Parent Atlas NLP sidecar did not become healthy in detached mode within the wait window: $healthUrl"
}

& $pythonExe @launchArgs
