param(
    [switch]$InstallTorch,
    [string]$VendorWheels = '',
    [string[]]$Phases = @('17','18'),
    [switch]$NoRun
)

# Resolve repo and project roots
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$projectRoot = Resolve-Path (Join-Path $scriptDir '..\..')
$repoRoot = Resolve-Path (Join-Path $scriptDir '..\..\..')
$venvPath = Join-Path $projectRoot '.venv'

Write-Host "Project root: $projectRoot"
Write-Host "Virtualenv path: $venvPath"

# Prefer vendor wheels if present in repo
## Prefer a repo-root vendor/wheels by default (repoRoot/vendor/wheels)
$defaultVendor = Join-Path $repoRoot 'vendor\wheels'
if ($VendorWheels -ne '') {
    if (-not [System.IO.Path]::IsPathRooted($VendorWheels)) {
        try { $VendorWheels = (Resolve-Path (Join-Path $repoRoot $VendorWheels)).Path } catch { }
    }
} elseif (Test-Path $defaultVendor) {
    $files = Get-ChildItem -Path $defaultVendor -Filter '*.whl' -File -ErrorAction SilentlyContinue
    if ($files -and $files.Count -gt 0) {
        $VendorWheels = $defaultVendor
        Write-Host "Detected vendor wheels at $VendorWheels; will install from vendor wheels."
    }
}

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Error "Python is not on PATH. Install Python 3.10+ and re-run."
    exit 1
}

if (-not (Test-Path $venvPath)) {
    Write-Host "Creating virtualenv..."
    python -m venv $venvPath
} else {
    Write-Host "Virtualenv already exists."
}

# Activate and upgrade pip
& "$venvPath\Scripts\Activate.ps1"
python -m pip install --upgrade pip setuptools wheel

if ($VendorWheels -ne '') {
    Write-Host "Installing from vendor wheels: $VendorWheels"
    python -m pip install --no-index --find-links="$VendorWheels" numpy xgboost
    if ($InstallTorch) {
        Write-Host "Installing torch from vendor wheels (if present)..."
        python -m pip install --no-index --find-links="$VendorWheels" torch || Write-Host "No torch wheel found in vendor path"
    }
} else {
    Write-Host "Installing minimal Python deps (numpy, xgboost)..."
    python -m pip install numpy xgboost
    if ($InstallTorch) {
        Write-Host "Installing CPU Torch (example). For CUDA builds follow https://pytorch.org/get-started/locally"
        python -m pip install --index-url https://download.pytorch.org/whl/cpu torch || Write-Host "Torch install failed; consult PyTorch site for wheel URL"
    }
}

if ($NoRun) {
    Write-Host "Setup complete. Skipping phase runs due to --NoRun."
    exit 0
}

# Run requested phases via npm scripts if present, else call node directly
Push-Location $projectRoot
foreach ($p in $Phases) {
    switch ($p) {
        '17' {
            Write-Host "Running Phase17 (feature extractor)"
            if (Get-Command npm -ErrorAction SilentlyContinue) {
                npm run atlas:phase17 --silent -- --
            } else {
                node "scripts/atlas/phase17-pytorch-feature-extractor.mjs"
            }
        }
        '18' {
            Write-Host "Running Phase18 (xgboost reranker)"
            if (Get-Command npm -ErrorAction SilentlyContinue) {
                npm run atlas:phase18 --silent -- --
            } else {
                node "scripts/atlas/phase18-xgboost-reranker.mjs"
            }
        }
        default {
            Write-Host "Unknown phase: $p — skipping"
        }
    }
}
Pop-Location

Write-Host "All requested phases completed."
