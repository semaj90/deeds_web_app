Param(
    [string]$ServicePath = "${PSScriptRoot}\..\langchain-rag-service"
)

Write-Host "🚀 start-langchain-local.ps1 — helper to create venv, install numpy wheel, install requirements, and run Python service with REDIS_PASSWORD unset"

try {
    $serviceFull = Resolve-Path -Path $ServicePath -ErrorAction SilentlyContinue
    if (-not $serviceFull) {
        Write-Host "⚠️  LangChain service directory not found at: $ServicePath" -ForegroundColor Yellow
        exit 0
    }

    Push-Location $serviceFull

    # Determine python executable inside venv
    if (-not (Test-Path ".venv")) {
        Write-Host "Creating virtual environment .venv..."
        python -m venv .venv
    }

    $pythonExe = Join-Path $PWD ".venv\Scripts\python.exe"
    if (-not (Test-Path $pythonExe)) { $pythonExe = "python" }

    Write-Host "Upgrading pip, setuptools and wheel (inside venv if available)..."
    & $pythonExe -m pip install --upgrade pip setuptools wheel

    Write-Host "Installing numpy (prefers prebuilt binary wheels)..."
    & $pythonExe -m pip install --only-binary=:all: numpy --disable-pip-version-check

    $req = Join-Path $PWD "requirements.txt"
    if (Test-Path $req) {
        Write-Host "Installing remaining requirements from requirements.txt..."
        & $pythonExe -m pip install -r $req
    } else {
        Write-Host "No requirements.txt found in $PWD — skipping requirements install" -ForegroundColor Yellow
    }

    # Unset REDIS_PASSWORD for the duration of starting the service so python clients won't call AUTH
    $oldRedis = $null
    $hadRedis = $false
    if (Test-Path Env:REDIS_PASSWORD) {
        $oldRedis = $env:REDIS_PASSWORD
        Remove-Item Env:REDIS_PASSWORD
        $hadRedis = $true
        Write-Host "Removed REDIS_PASSWORD from environment for the Python process"
    } else {
        Write-Host "No REDIS_PASSWORD found in environment — nothing to unset"
    }

    Write-Host "Starting Python service (main.py) in $PWD...\n"
    & $pythonExe main.py

    # restore REDIS_PASSWORD
    if ($hadRedis) {
        $env:REDIS_PASSWORD = $oldRedis
        Write-Host "Restored REDIS_PASSWORD after Python process exit"
    }

    Pop-Location
    Write-Host "✅ start-langchain-local.ps1 finished"
} catch {
    Write-Host "❌ Error during start-langchain-local.ps1: $_" -ForegroundColor Red
    Pop-Location -ErrorAction SilentlyContinue
    exit 1
}
