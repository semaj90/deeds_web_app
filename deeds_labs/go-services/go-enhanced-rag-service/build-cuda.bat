@echo off
REM CUDA Build Script with MSVC
REM Optimized for RTX 3060 Ti with CUDA 13.0

echo ==========================================
echo Building CUDA Enhanced RAG Service
echo ==========================================

REM Set up Visual Studio environment
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvarsall.bat" x64

REM Set CUDA environment
set CUDA_PATH=C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0
set PATH=%CUDA_PATH%\bin;%PATH%
set PATH=%CUDA_PATH%\libnvvp;%PATH%

echo CUDA_PATH=%CUDA_PATH%
echo.

REM Compile CUDA kernels for RTX 3060 Ti (Compute Capability 8.6)
echo [1/3] Compiling CUDA kernels...
nvcc -c -o cuda_kernels.o cuda_kernels.cu ^
    -gencode arch=compute_86,code=sm_86 ^
    --compiler-options "/MD" ^
    --compiler-options "/O2" ^
    --compiler-options "/DWIN32" ^
    --compiler-options "/D_WINDOWS"

if %errorlevel% neq 0 (
    echo ❌ CUDA kernel compilation failed
    pause
    exit /b 1
) else (
    echo ✅ CUDA kernels compiled successfully
)

REM Build Go service with CUDA support
echo.
echo [2/3] Building Go service with CUDA...
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

REM Test the executable
echo.
echo [3/3] Testing executable...
if exist enhanced-rag-service.exe (
    echo ✅ enhanced-rag-service.exe created successfully
    dir enhanced-rag-service.exe
) else (
    echo ❌ enhanced-rag-service.exe not found
    exit /b 1
)

echo.
echo ==========================================
echo 🚀 Build Complete!
echo ==========================================
echo.
echo To run with development environment:
echo   set DATABASE_URL=postgres://legal_admin:123456@localhost:5433/legal_ai_db?sslmode=disable
echo   set REDIS_URL=redis://localhost:6379/0
echo   set OLLAMA_URL=http://localhost:11434
echo   set CUDA_ENABLED=true
echo   enhanced-rag-service.exe
echo.
pause