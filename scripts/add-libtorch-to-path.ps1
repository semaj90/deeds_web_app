#!/usr/bin/env pwsh
# ═══════════════════════════════════════════════════════════════════════
# Add LibTorch + CUDA to User PATH (permanent)
# Usage: pwsh scripts/add-libtorch-to-path.ps1
# ═══════════════════════════════════════════════════════════════════════

$LibTorchPath = "C:\libtorch-win-shared-with-deps-2.9.0+cu130\libtorch\lib"
$CudaPath = "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0\bin"

# Get current user PATH
$CurrentPath = [Environment]::GetEnvironmentVariable("PATH", "User")

# Check if paths already exist
$NeedsUpdate = $false
if ($CurrentPath -notlike "*$LibTorchPath*") {
    Write-Host "➕ Adding LibTorch to PATH: $LibTorchPath" -ForegroundColor Green
    $CurrentPath = "$LibTorchPath;$CurrentPath"
    $NeedsUpdate = $true
} else {
    Write-Host "✅ LibTorch already in PATH" -ForegroundColor Cyan
}

if ($CurrentPath -notlike "*$CudaPath*") {
    Write-Host "➕ Adding CUDA to PATH: $CudaPath" -ForegroundColor Green
    $CurrentPath = "$CudaPath;$CurrentPath"
    $NeedsUpdate = $true
} else {
    Write-Host "✅ CUDA already in PATH" -ForegroundColor Cyan
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