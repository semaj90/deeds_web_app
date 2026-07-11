##############################################################################
# bootstrap-wsl2-rapids.ps1 — Launch WSL2 RAPIDS bootstrap from Windows
#
# Convenience wrapper to run the bash script inside WSL2
# This ensures the correct environment and avoids path issues
#
# Usage:
# PS> .\scripts\bootstrap-wsl2-rapids.ps1
#     (dry-run, shows commands without executing)
# PS> .\scripts\bootstrap-wsl2-rapids.ps1 -Apply
#     (actually runs the installation)
#
##############################################################################

param(
    [switch]$Apply = $false
)

$ErrorActionPreference = "Stop"

Write-Host "🔍 WSL2 RAPIDS Bootstrap Launcher" -ForegroundColor Green
Write-Host "═" * 60 -ForegroundColor Green

# Check if WSL2 is available
$wslCheck = wsl --list --verbose 2>&1
if ($LASTEXITCODE -ne 0 -or -not $wslCheck) {
    Write-Host "✗ WSL2 not found or not configured" -ForegroundColor Red
    Write-Host ""
    Write-Host "Install WSL2 first:" -ForegroundColor Yellow
    Write-Host "  wsl --install"
    Write-Host "  wsl --set-version Ubuntu-22.04 2"
    Write-Host ""
    exit 1
}

Write-Host "✓ WSL2 detected" -ForegroundColor Green
Write-Host ""

# Find the script path
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$bootstrapScript = Join-Path $scriptDir "bootstrap-wsl2-rapids.sh"

if (-not (Test-Path $bootstrapScript)) {
    Write-Host "✗ bootstrap-wsl2-rapids.sh not found at $bootstrapScript" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Bootstrap script found" -ForegroundColor Green

# Convert Windows path to WSL2 path
$drive = $bootstrapScript.Substring(0, 1).ToLower()
$rest = ($bootstrapScript.Substring(2) -replace '\\', '/').TrimStart('/')
$wslPath = "/mnt/$drive/$rest"

Write-Host "Script path (WSL2): $wslPath" -ForegroundColor Gray
Write-Host ""

# Prepare arguments
$args = @()
if ($Apply) {
    $args += "--apply"
    Write-Host "Mode: APPLY (will execute installations)" -ForegroundColor Yellow
} else {
    Write-Host "Mode: DRY-RUN (preview only)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "📦 Launching bootstrap inside WSL2..." -ForegroundColor Green
Write-Host ""

# Run the script in WSL2
$cmd = "bash `"$wslPath`" $($args -join ' ')"
Write-Host "Command: wsl $cmd" -ForegroundColor Gray
Write-Host ""

wsl bash "$wslPath" @args

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Bootstrap completed successfully" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Green
    Write-Host "  1. Verify GPU access in WSL2:" -ForegroundColor Green
    Write-Host "     wsl bash" -ForegroundColor Gray
    Write-Host "     conda activate atlas-rapids-cu13" -ForegroundColor Gray
    Write-Host "     python -c 'import torch; print(torch.cuda.is_available())'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  2. Run readiness audit again:" -ForegroundColor Green
    Write-Host "     npm run atlas:gpu:readiness" -ForegroundColor Gray
} else {
    Write-Host ""
    Write-Host "✗ Bootstrap failed with exit code $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
}
