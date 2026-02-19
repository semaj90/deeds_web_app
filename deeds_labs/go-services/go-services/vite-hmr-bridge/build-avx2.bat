@echo off
REM Build Vite HMR Bridge with AVX2 optimizations
echo Building Vite HMR Bridge with AVX2 optimizations...
echo.

REM Set Go build flags for 11th gen Intel
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
go build -ldflags="-s -w" -tags=avx2 -o vite-hmr-bridge.exe .

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo ✅ Build successful with AVX2 optimizations
    echo ========================================
    echo.
    echo Executable: vite-hmr-bridge.exe
    dir vite-hmr-bridge.exe | findstr vite-hmr-bridge.exe
    echo.
    echo Optimizations enabled:
    echo - GOAMD64=v3 (AVX2 support)
    echo - march=native (11th gen Intel)
    echo - O3 optimization level
    echo - FMA instructions
    echo - simdjson-go (AVX2-optimized JSON parsing)
    echo - sonic (fast JSON serialization)
    echo - fsnotify (file watching)
    echo.
    echo To start:
    echo   set HMR_BRIDGE_PORT=24678
    echo   set PROJECT_ROOT=../../sveltekit-frontend
    echo   vite-hmr-bridge.exe
) else (
    echo ❌ Build failed
    exit /b 1
)
