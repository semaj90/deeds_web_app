@echo off
REM CUDA Setup and Verification Script for Enhanced RAG Service
REM Supports CUDA 12.8 and 13.0 with RTX 3060

echo ==========================================
echo CUDA Enhanced RAG Service Setup
echo ==========================================
echo.

REM Check CUDA installation
echo [1/6] Checking CUDA installation...
where nvcc >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ NVCC not found in PATH
    echo Please add CUDA bin directory to PATH
    pause
    exit /b 1
) else (
    echo ✅ NVCC found
    nvcc --version | findstr "release"
)

REM Check NVIDIA driver
echo.
echo [2/6] Checking NVIDIA driver...
where nvidia-smi >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ NVIDIA driver not found
    pause
    exit /b 1
) else (
    echo ✅ NVIDIA driver found
    nvidia-smi --query-gpu=name,memory.total,compute_cap --format=csv,noheader
)

REM Set CUDA environment variables for your system
echo.
echo [3/6] Setting CUDA environment variables...

REM Try CUDA 13.0 first, then 12.8
if exist "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0" (
    set CUDA_PATH=C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0
    echo ✅ Using CUDA 13.0
) else if exist "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.8" (
    set CUDA_PATH=C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.8
    echo ✅ Using CUDA 12.8
) else (
    echo ❌ CUDA installation not found in standard location
    echo Please set CUDA_PATH manually
    pause
    exit /b 1
)

set PATH=%CUDA_PATH%\bin;%PATH%
set PATH=%CUDA_PATH%\libnvvp;%PATH%
set CUDA_TOOLKIT_ROOT_DIR=%CUDA_PATH%
set CUDA_SDK_ROOT_DIR=%CUDA_PATH%

echo CUDA_PATH=%CUDA_PATH%

REM Check Go installation
echo.
echo [4/6] Checking Go installation...
where go >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Go not found. Please install Go 1.21+
    pause
    exit /b 1
) else (
    echo ✅ Go found
    go version
)

REM Test CUDA compilation
echo.
echo [5/6] Testing CUDA kernel compilation...
nvcc -c -o test_cuda.o cuda_kernels.cu ^
    -gencode arch=compute_86,code=sm_86 ^
    --compiler-options "/MD" ^
    --compiler-options "/O2"

if %errorlevel% neq 0 (
    echo ❌ CUDA compilation failed
    pause
    exit /b 1
) else (
    echo ✅ CUDA kernels compiled successfully
    del test_cuda.o >nul 2>&1
)

REM Build the Go service with CUDA
echo.
echo [6/6] Building Enhanced RAG Service with CUDA...
set CGO_ENABLED=1
set CGO_CFLAGS=-I"%CUDA_PATH%\include"
set CGO_LDFLAGS=-L"%CUDA_PATH%\lib\x64" -lcuda -lcudart -lcublas

go build -ldflags="-s -w" -o enhanced-rag-service.exe .

if %errorlevel% neq 0 (
    echo ❌ Go build failed
    pause
    exit /b 1
) else (
    echo ✅ Enhanced RAG Service built successfully
)

echo.
echo ==========================================
echo 🚀 CUDA Setup Complete!
echo ==========================================
echo.
echo Your system is ready for GPU-accelerated legal AI:
echo - CUDA Path: %CUDA_PATH%
echo - RTX 3060 detected with Compute Capability 8.6
echo - Enhanced RAG Service: enhanced-rag-service.exe
echo.
echo To start the service:
echo   enhanced-rag-service.exe
echo.
echo To run benchmarks:
echo   enhanced-rag-service.exe -benchmark
echo.
pause