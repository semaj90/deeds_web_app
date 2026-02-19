@echo off
REM Build SIMD JSON Accelerator with AVX2 optimizations for 11th gen Intel
echo Building SIMD JSON Accelerator with AVX2 optimizations...
echo.

REM Set Go build flags for 11th gen Intel (Tiger Lake)
set GOAMD64=v3
set CGO_ENABLED=1
set CGO_CFLAGS=-march=native -O3 -mavx2 -mfma
set CGO_LDFLAGS=-march=native

echo [1/3] Downloading dependencies...
go mod download
if %errorlevel% neq 0 (
    echo ❌ Failed to download dependencies
    exit /b 1
)

echo [2/3] Tidying go.mod...
go mod tidy
if %errorlevel% neq 0 (
    echo ❌ Failed to tidy dependencies
    exit /b 1
)

echo [3/3] Building with AVX2 optimizations...
go build -ldflags="-s -w" -tags=avx2 -o simd-json-accelerator.exe .

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo ✅ Build successful with AVX2 optimizations
    echo ========================================
    echo.
    echo Executable: simd-json-accelerator.exe
    echo Size:
    dir simd-json-accelerator.exe | findstr simd-json-accelerator.exe
    echo.
    echo Optimizations enabled:
    echo - GOAMD64=v3 (AVX2 support)
    echo - march=native (11th gen Intel)
    echo - O3 optimization level
    echo - FMA instructions
    echo - simdjson-go (AVX2-optimized JSON parsing)
    echo - sonic (fast JSON serialization)
    echo - MinIO integration
    echo.
    echo To start:
    echo   set SIMD_JSON_PORT=8096
    echo   simd-json-accelerator.exe
) else (
    echo ❌ Build failed
    exit /b 1
)
