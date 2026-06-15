# =================================================================
# TurboQuant Setup Script for Gemma4 (D=256/512)
# =================================================================

# --- Configuration Variables ---
$REPO_URL = "https://github.com/test1111111111111112/llama-cpp-turboquant-gemma4"
$CLONE_DIR = "llama-cpp-turboquant-gemma4"
$DEST_DIR = "C:\Users\james\Desktop\gemmaturboquant_test112"
$CMAKE_COMMAND = "cmake -B build -S . -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=86"

Write-Host "--- 1. Cloning the repository: $REPO_URL ---"
git clone $REPO_URL
Set-Location $CLONE_DIR

Write-Host "--- 2. Running CMake and Building the project (This may take a long time) ---"
# Using a large timeout for the build process
cmake $CMAKE_COMMAND
cmake --build build --config Release

Write-Host "--- 3. Copying the resulting binary to the destination directory ---"
# Check if the source binary exists before copying
$sourceBinary = Join-Path (Get-Location).Path "build\bin\llama-server.exe"
if (Test-Path $sourceBinary) {
    Copy-Item $sourceBinary -Destination $DEST_DIR
    Write-Host "Successfully copied binary to $DEST_DIR"
} else {
    Write-Host "ERROR: Source binary not found at $sourceBinary. Check the build logs."
}

Write-Host "--- 4. Setting Environment Variables ---"
$env:LLAMA_SERVER_PATH = $DEST_DIR
$env:TURBO_PROFILE = 'turboquant'

Write-Host "--- 5. Launching the service (Requires manual confirmation) ---"
# The user will need to run this manually after reviewing the output.
# & ".\scripts\launch-turboquant.ps1" -Detached

Write-Host "================================================================="
Write-Host "Setup complete. Remember to run the launch script manually."
Write-Host "================================================================="