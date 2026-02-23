@echo off
REM Build CUDA worker with nvcc (recommended approach)
REM This script handles Visual Studio environment setup automatically

echo 🚀 Building CUDA worker with nvcc...

REM Try to find and setup Visual Studio environment
set "VS_FOUND=0"

if exist "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvarsall.bat" (
    echo 🔧 Setting up VS 2022 Community environment...
    call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvarsall.bat" x64 >nul 2>&1
    set "VS_FOUND=1"
    goto :build
)

if exist "C:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvarsall.bat" (
    echo 🔧 Setting up VS 2022 Professional environment...
    call "C:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvarsall.bat" x64 >nul 2>&1
    set "VS_FOUND=1"
    goto :build
)

if exist "C:\Program Files (x86)\Microsoft Visual Studio\2019\Community\VC\Auxiliary\Build\vcvarsall.bat" (
    echo 🔧 Setting up VS 2019 Community environment...
    call "C:\Program Files (x86)\Microsoft Visual Studio\2019\Community\VC\Auxiliary\Build\vcvarsall.bat" x64 >nul 2>&1
    set "VS_FOUND=1"
    goto :build
)

if exist "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" (
    echo 🔧 Setting up VS 2022 Build Tools environment...
    call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" x64 >nul 2>&1
    set "VS_FOUND=1"
    goto :build
)

if "%VS_FOUND%"=="0" (
    echo ❌ Visual Studio environment not found!
    echo Please install Visual Studio 2022 Community or Build Tools
    echo Download from: https://visualstudio.microsoft.com/downloads/
    pause
    exit /b 1
)

:build
echo 🏗️  Compiling with nvcc...

REM Use CUDA 12.8 (more stable than 13.0)
set "CUDA_PATH=C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.8"
set "NVCC=%CUDA_PATH%\bin\nvcc.exe"

REM Compile with nvcc
"%NVCC%" -std=c++14 ^
    -arch=sm_75 ^
    --compiler-options="/O2" ^
    cuda-worker.cu ^
    -o cuda-worker.exe

if %errorlevel% equ 0 (
    echo ✅ SUCCESS: cuda-worker.exe built successfully!
    echo 📊 Testing CUDA worker...
    
    REM Test the worker with sample data
    echo {"jobId":"test-build","type":"embedding","data":[1.0,2.0,3.0,4.0]} | cuda-worker.exe
    
    if %errorlevel% equ 0 (
        echo ✅ CUDA worker test passed!
        echo 🎯 Ready for integration with Go microservice
    ) else (
        echo ⚠️  CUDA worker built but test failed - check GPU drivers
    )
) else (
    echo ❌ Build failed. Check error messages above.
    echo Common issues:
    echo - CUDA Toolkit not properly installed
    echo - GPU compute capability mismatch
    echo - Visual Studio C++ tools missing
)

echo.
echo 📝 Integration notes:
echo - Binary location: %CD%\cuda-worker.exe  
echo - Service port: 8095 (cuda-service)
echo - Health check: http://localhost:8095/health
echo - Vectorize API: POST http://localhost:8095/vectorize

pause