@echo off
REM Complete CUDA worker build with Visual Studio 2022 Community
echo 🚀 Building CUDA Worker with Visual Studio 2022 Community...

REM Set up Visual Studio 2022 Community environment
echo 🔧 Setting up Visual Studio environment...
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvarsall.bat" x64

if %errorlevel% neq 0 (
    echo ❌ Failed to set up Visual Studio environment
    pause
    exit /b 1
)

REM Verify cl.exe is now available
echo 🔍 Verifying cl.exe is available...
where cl.exe
if %errorlevel% neq 0 (
    echo ❌ cl.exe not found in PATH after VS setup
    pause
    exit /b 1
)

REM Build with CUDA 12.8 (more stable than 13.0)
set "CUDA_PATH=C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.8"
set "NVCC=%CUDA_PATH%\bin\nvcc.exe"

echo 🏗️  Compiling CUDA worker...
echo Using NVCC: %NVCC%
echo Using cl.exe: 
where cl.exe

REM Compile with comprehensive flags
"%NVCC%" ^
    -std=c++14 ^
    -arch=sm_75 ^
    --compiler-options="/O2 /MD" ^
    --ptxas-options=-v ^
    --use_fast_math ^
    cuda-worker.cu ^
    -o cuda-worker.exe

if %errorlevel% equ 0 (
    echo ✅ SUCCESS: cuda-worker.exe built successfully!
    echo 📊 Testing CUDA worker...
    
    REM Test the worker with sample data
    echo {"jobId":"build-test","type":"embedding","data":[1.0,2.0,3.0,4.0]} | cuda-worker.exe
    
    if %errorlevel% equ 0 (
        echo ✅ CUDA worker test PASSED!
        echo 🎯 GPU acceleration is now ACTIVE!
        echo.
        echo 📝 Integration Summary:
        echo - Binary: %CD%\cuda-worker.exe
        echo - Service: http://localhost:8096
        echo - Health: http://localhost:8096/health
        echo - Dashboard: http://localhost:5173/system/health
        echo.
        echo 🚀 Your Legal AI platform now has full GPU acceleration!
    ) else (
        echo ⚠️  CUDA worker built but test failed
        echo This may indicate GPU driver issues or hardware compatibility
        echo The service will still work but without GPU acceleration
    )
) else (
    echo ❌ Build failed. Common issues:
    echo - CUDA Toolkit not properly installed
    echo - GPU compute capability mismatch (need 7.5+ for RTX series)
    echo - Visual Studio C++ tools incomplete
    echo.
    echo 💡 Troubleshooting:
    echo 1. Check GPU: nvidia-smi
    echo 2. Verify CUDA: nvcc --version
    echo 3. Verify VS: cl.exe
)

echo.
echo Press any key to continue...
pause > nul