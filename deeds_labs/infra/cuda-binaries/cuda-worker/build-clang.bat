@echo off
REM Build script for CUDA worker using Clang with Visual Studio 2022
REM Usage: build-clang.bat

echo Building CUDA worker with Clang + Visual Studio 2022...

REM Set Visual Studio 2022 environment
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat" >nul 2>&1

REM Set CUDA paths
set CUDA_PATH=C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0
set CUDA_LIB_PATH=%CUDA_PATH%\lib\x64

REM Use CUDA 12.8 for better Clang compatibility
set CUDA_PATH_V12=C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.8
if exist "%CUDA_PATH_V12%" (
    set CUDA_PATH=%CUDA_PATH_V12%
    set CUDA_LIB_PATH=%CUDA_PATH_V12%\lib\x64
    echo Using CUDA 12.8 for Clang compatibility
)

REM Compile with Clang targeting Windows MSVC
clang++ -std=c++14 ^
    --target=x86_64-pc-windows-msvc ^
    -fms-extensions ^
    -fms-compatibility ^
    --cuda-gpu-arch=sm_75 ^
    --cuda-path="%CUDA_PATH%" ^
    -I"%CUDA_PATH%\include" ^
    -L"%CUDA_LIB_PATH%" ^
    -lcudart ^
    cuda-worker.cu ^
    -o cuda-worker-clang.exe

if %errorlevel% neq 0 (
    echo Build failed with Clang, trying NVCC fallback...
    nvcc -std=c++14 cuda-worker.cu -o cuda-worker.exe
    if %errorlevel% equ 0 (
        echo Build successful with NVCC
    ) else (
        echo Build failed with both Clang and NVCC
    )
) else (
    echo Build successful with Clang
)

pause