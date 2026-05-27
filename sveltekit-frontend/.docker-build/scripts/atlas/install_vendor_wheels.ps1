param(
    [string]$VendorPath = ''
)

# Resolve script/project paths
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$projectRoot = Resolve-Path (Join-Path $scriptDir '..\..')
$repoRoot = Resolve-Path (Join-Path $scriptDir '..\..\..')

if ($VendorPath -eq '') {
    $vendor = Join-Path $repoRoot 'vendor\wheels'
} else {
    $vendor = if ([System.IO.Path]::IsPathRooted($VendorPath)) { $VendorPath } else { Resolve-Path (Join-Path $repoRoot $VendorPath) }
}

if (-not (Test-Path $vendor)) {
    Write-Error "Vendor wheels path not found: $vendor"
    exit 1
}

Write-Host "Installing vendor wheels from: $vendor"

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Error "Python not found on PATH. Activate your venv first or ensure Python is installed."
    exit 1
}

& "$vendor" | Out-Null

python -m pip install --no-index --find-links="$vendor" numpy xgboost torch || Write-Host "Some wheels may be missing; ensure required wheels are present in $vendor"

Write-Host "Vendor wheel install complete."
