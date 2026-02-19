<#
Start-TensorRT-LLM
PowerShell helper to start a Triton/TensorRT container with GPU support on Windows (WSL2)

Usage: .\start-tensorrt-llm.ps1 [-ModelRepoPath ./docker/tensorrt-llm/models]
#>

param(
  [string]$ModelRepoPath = "${PSScriptRoot}\\models",
  [switch]$Recreate
)

function Test-Nvidia {
  try {
    $out = & wsl -d $(wsl -l -q | Select-Object -First 1) -- nvidia-smi 2>&1
    if ($LASTEXITCODE -ne 0) {
      Write-Host "nvidia-smi not available inside WSL. Ensure NVIDIA Container Toolkit is installed in WSL distro." -ForegroundColor Yellow
      return $false
    }
    Write-Host "NVIDIA GPU detected inside WSL:" -ForegroundColor Green
    Write-Host $out
    return $true
  } catch {
    Write-Host "Failed to run nvidia-smi inside WSL. You may not have NVIDIA runtime available." -ForegroundColor Red
    return $false
  }
}

if (-not (Test-Nvidia)) {
  Write-Host "Cannot detect NVIDIA GPU in WSL. Exiting." -ForegroundColor Red
  exit 1
}

Push-Location (Join-Path $PSScriptRoot)
if ($Recreate) {
  Write-Host "Recreating containers (docker-compose down && up -d)" -ForegroundColor Cyan
  docker-compose down
  docker-compose up -d --build
} else {
  Write-Host "Starting tensorrt-llm stack (docker-compose up -d)" -ForegroundColor Cyan
  docker-compose up -d
}

Write-Host "Waiting 3s for container to initialize..."
Start-Sleep -Seconds 3

Write-Host "Triton endpoints (local):"
Write-Host "  HTTP : http://localhost:8000/v2/health/ready"
Write-Host "  GRPC : localhost:8001"
Write-Host "  Metrics: http://localhost:8002/metrics"

Pop-Location

Write-Host "Done. Check container logs with: docker-compose logs -f" -ForegroundColor Green