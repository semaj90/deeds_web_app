Write-Host "🔧 Configuring GPU Clang + CMake environment..."
$env:CUDA_PATH="C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0"
$env:PATH += ";$env:CUDA_PATH\bin;$env:CUDA_PATH\libnvvp"
$env:CC="clang"
$env:CXX="clang++"

# Increase heap for VS Code extensions
$env:VSCODE_NODE_OPTIONS="--max-old-space-size=8192"

# Initialize CMake preset
if (-Not (Test-Path "CMakePresets.json")) {
  Write-Host "⚠️ Missing CMakePresets.json. Creating default preset..."
  New-Item -ItemType File -Path "CMakePresets.json" -Force | Out-Null
}
cmake --preset clang-cuda-release
Write-Host "✅ Environment ready. You can now build with GPU acceleration."
