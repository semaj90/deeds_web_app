@echo off
setlocal enabledelayedexpansion

echo ==========================================
echo CUDA Build with MSVC Environment - VERBOSE
echo ==========================================

REM Initialize Visual Studio environment
echo Setting up Visual Studio 2022 environment...
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvarsall.bat" x64
if %errorlevel% neq 0 (
    echo ❌ Failed to initialize Visual Studio environment
    echo Error level: %errorlevel%
    pause
    exit /b 1
)
echo ✅ Visual Studio environment initialized

REM Verify cl.exe is available
echo.
echo Checking for MSVC compiler...
where cl
if %errorlevel% neq 0 (
    echo ❌ MSVC compiler (cl.exe) not found after environment setup
    echo PATH=%PATH%
    pause
    exit /b 1
) else (
    echo ✅ MSVC compiler found
    cl 2>&1 | findstr "Microsoft"
)

REM Set and verify CUDA paths
echo.
echo Setting up CUDA environment...
set CUDA_PATH=C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0
set PATH=%CUDA_PATH%\bin;%PATH%
echo CUDA_PATH=%CUDA_PATH%
echo Updated PATH includes: %CUDA_PATH%\bin

REM Verify CUDA installation
echo.
echo Checking CUDA installation...
if not exist "%CUDA_PATH%" (
    echo ❌ CUDA path does not exist: %CUDA_PATH%
    pause
    exit /b 1
)

if not exist "%CUDA_PATH%\bin\nvcc.exe" (
    echo ❌ NVCC not found at: %CUDA_PATH%\bin\nvcc.exe
    pause
    exit /b 1
)

echo ✅ CUDA installation verified
where nvcc
nvcc --version

REM Check for required CUDA headers
echo.
echo Checking CUDA headers...
if not exist "%CUDA_PATH%\include\cuda_runtime.h" (
    echo ❌ CUDA runtime header not found: %CUDA_PATH%\include\cuda_runtime.h
    pause
    exit /b 1
) else (
    echo ✅ CUDA headers found
)

echo.
echo ==========================================
echo [1/2] COMPILING CUDA KERNELS - VERBOSE MODE
echo ==========================================
echo Target: RTX 3060 Ti (Compute Capability 8.6)
echo Command: nvcc --verbose -c -o cuda_kernels.o cuda_kernels.cu -gencode arch=compute_86,code=sm_86 --compiler-options "/MD" --compiler-options "/O2" --compiler-options "/DWIN32"
echo.

nvcc --verbose -c -o cuda_kernels.o cuda_kernels.cu -gencode arch=compute_86,code=sm_86 --compiler-options "/MD" --compiler-options "/O2" --compiler-options "/DWIN32"

echo.
echo NVCC Exit Code: %errorlevel%

if %errorlevel% neq 0 (
    echo.
    echo ❌ CUDA COMPILATION FAILED
    echo ==========================================
    echo Error Details:
    echo - NVCC exit code: %errorlevel%
    echo - CUDA Path: %CUDA_PATH%
    echo - Compiler: MSVC
    echo.
    echo Please check the verbose output above for specific errors.
    echo.
    pause
    exit /b 1
) else (
    echo ✅ CUDA kernels compiled successfully
    echo.
    echo Checking output file...
    if exist cuda_kernels.o (
        dir cuda_kernels.o
        echo ✅ Object file created successfully
    ) else (
        echo ❌ Object file not found despite successful compilation
        pause
        exit /b 1
    )
)

echo.
echo [2/2] Building Go service with CUDA support...
set CGO_ENABLED=1
set CGO_CFLAGS=-I"%CUDA_PATH%\include"
set CGO_LDFLAGS=-L"%CUDA_PATH%\lib\x64" -lcuda -lcudart -lcublas

echo Building enhanced-rag-service.exe...
go build -ldflags="-s -w" -o enhanced-rag-service.exe .

if %errorlevel% neq 0 (
    echo ❌ Go build failed
    echo Trying CPU fallback build...
    go build -tags="!cuda" -ldflags="-s -w" -o enhanced-rag-service.exe .
    if %errorlevel% neq 0 (
        echo ❌ CPU fallback build also failed
        pause
        exit /b 1
    ) else (
        echo ✅ Go service built successfully (CPU fallback)
        dir enhanced-rag-service.exe
    )
) else (
    echo ✅ Go service built successfully with CUDA support
    dir enhanced-rag-service.exe
)

echo.
echo ==========================================
echo 🚀 Build Complete!
echo ==========================================
pause