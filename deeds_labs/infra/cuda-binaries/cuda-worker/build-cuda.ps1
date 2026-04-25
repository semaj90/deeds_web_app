# PowerShell script to build CUDA worker
Write-Host "Building CUDA Worker..." -ForegroundColor Green

# Set Visual Studio paths
$vsPath = "C:\Program Files\Microsoft Visual Studio\2022\Community"
$msvcPath = "$vsPath\VC\Tools\MSVC\14.43.34808\bin\Hostx64\x64"
$msvcLibPath = "$vsPath\VC\Tools\MSVC\14.43.34808\lib\x64"
$msvcIncludePath = "$vsPath\VC\Tools\MSVC\14.43.34808\include"

# Add paths to environment
$env:PATH = "$msvcPath;$env:PATH"
$env:INCLUDE = "$msvcIncludePath;$env:INCLUDE"
$env:LIB = "$msvcLibPath;$env:LIB"

Write-Host "Environment setup complete" -ForegroundColor Yellow

# Verify cl.exe
Write-Host "Checking for cl.exe..." -ForegroundColor Cyan
if (Get-Command cl.exe -ErrorAction SilentlyContinue) {
    Write-Host "cl.exe found" -ForegroundColor Green
} else {
    Write-Host "cl.exe not found in PATH" -ForegroundColor Red
    exit 1
}

# Build CUDA worker
Write-Host "Compiling CUDA worker..." -ForegroundColor Yellow

try {
    & nvcc -std=c++14 -arch=sm_75 cuda-worker.cu -o cuda-worker.exe
    
    if (Test-Path "cuda-worker.exe") {
        Write-Host "SUCCESS: cuda-worker.exe built!" -ForegroundColor Green
        
        # Test the worker
        Write-Host "Testing CUDA worker..." -ForegroundColor Cyan
        $testInput = '{"jobId":"test","type":"embedding","data":[1.0,2.0,3.0,4.0]}'
        try {
            $result = $testInput | & .\cuda-worker.exe
            Write-Host "CUDA worker test PASSED!" -ForegroundColor Green
            Write-Host "GPU acceleration is now ACTIVE!" -ForegroundColor Magenta
        } catch {
            Write-Host "CUDA worker built but test failed" -ForegroundColor Yellow
        }
    } else {
        Write-Host "Build failed: cuda-worker.exe not created" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "Build failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}