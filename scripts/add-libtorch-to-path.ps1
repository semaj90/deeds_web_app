#!/usr/bin/env pwsh
# ═══════════════════════════════════════════════════════════════════════
# Add LibTorch + CUDA + cuDNN to User PATH (permanent)
# Usage: pwsh scripts/add-libtorch-to-path.ps1
# ═══════════════════════════════════════════════════════════════════════

$LibTorchPath = "C:\libtorch-win-shared-with-deps-2.9.0+cu130\libtorch\lib"
$CudaPaths = @(
    "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0\bin",
    "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.8\bin"
)
$CuDnnPaths = @(
    "C:\Program Files\NVIDIA\CUDNN\v9.16\bin\13.0",
    "C:\Program Files\NVIDIA\CUDNN\v9.8\bin\12.8"
)

function Add-PathEntry {
    param(
        [string]$PathValue,
        [string]$Label
    )

    if ($CurrentPath -notlike "*$PathValue*") {
        Write-Host "➕ Adding $Label to PATH: $PathValue" -ForegroundColor Green
        $script:CurrentPath = "$PathValue;$script:CurrentPath"
        return $true
    }

    Write-Host "✅ $Label already in PATH" -ForegroundColor Cyan
    return $false
}

# Get current user PATH
$CurrentPath = [Environment]::GetEnvironmentVariable("PATH", "User")

# Check if paths already exist
$NeedsUpdate = $false
$NeedsUpdate = (Add-PathEntry -PathValue $LibTorchPath -Label 'LibTorch') -or $NeedsUpdate

foreach ($CudaPath in $CudaPaths) {
    $NeedsUpdate = (Add-PathEntry -PathValue $CudaPath -Label 'CUDA') -or $NeedsUpdate
}

foreach ($CuDnnPath in $CuDnnPaths) {
    $NeedsUpdate = (Add-PathEntry -PathValue $CuDnnPath -Label 'cuDNN') -or $NeedsUpdate
}

# Update PATH if needed
if ($NeedsUpdate) {
    [Environment]::SetEnvironmentVariable("PATH", $CurrentPath, "User")
    Write-Host ""
    Write-Host "✅ User PATH updated successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "⚠️  Important: You must restart your terminal/IDE for changes to take effect." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To verify after restart, run:" -ForegroundColor Cyan
    Write-Host "  node -e `"require('./simd-bridge/cpp/build/Release/tensorrt_bridge.node'); console.log('✅ Addon loaded')`"" -ForegroundColor Gray
} else {
    Write-Host ""
    Write-Host "✅ All paths already configured!" -ForegroundColor Green
}

# Show current PATH
Write-Host ""
Write-Host "Current PATH entries:" -ForegroundColor Cyan
$CurrentPath -split ";" | Where-Object { $_ -like "*libtorch*" -or $_ -like "*CUDA*" } | ForEach-Object {
    Write-Host "  • $_" -ForegroundColor Gray
}
