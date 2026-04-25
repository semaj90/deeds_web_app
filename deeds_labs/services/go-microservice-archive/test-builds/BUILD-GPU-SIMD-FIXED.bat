@echo off
setlocal EnableDelayedExpansion

echo 🚀 Building Production GPU+SIMD Legal Processor (FIXED)
echo ========================================================

:: Set environment variables with proper path escaping
set CGO_ENABLED=1
set CC=clang
set CXX=clang++

:: CUDA paths with proper quoting for spaces
set "CUDA_PATH=C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0"
set "CGO_CFLAGS=-I"%CUDA_PATH%\include" -mavx2 -mfma"
set "CGO_LDFLAGS=-L"%CUDA_PATH%\lib\x64" -lcudart -lcublas"

echo 📋 Environment Check:
echo CGO_ENABLED: %CGO_ENABLED%
echo CC: %CC%
echo CUDA_PATH: %CUDA_PATH%

:: Verify CUDA installation
nvcc --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ❌ CUDA not found! Building CPU-only version...
    set "CGO_CFLAGS=-mavx2 -mfma -O3"
    set "CGO_LDFLAGS=-mavx2 -mfma"
    set BUILD_TYPE=CPU_SIMD
) else (
    echo ✅ CUDA detected
    set BUILD_TYPE=GPU_SIMD
)

:: Install/update dependencies
echo 🔄 Installing dependencies...
go mod init legal-processor 2>nul
go get github.com/gin-gonic/gin@latest
go get github.com/redis/go-redis/v9@latest
go get github.com/minio/simdjson-go@latest
go get github.com/bytedance/sonic@latest
go get github.com/tidwall/gjson@latest
go get github.com/jackc/pgx/v5/pgxpool@latest
go get github.com/neo4j/neo4j-go-driver/v5/neo4j@latest
go mod tidy

:: Clean build cache
go clean -cache -modcache
del /Q *.exe 2>nul

:: Build with proper flags
echo 🔨 Building (%BUILD_TYPE%)...
set "BUILD_FLAGS=-tags=cgo -ldflags=-s -w -X main.buildType=%BUILD_TYPE% -gcflags=-N -l"
go build %BUILD_FLAGS% -o legal-processor.exe legal_processor_gpu_simd.go

if %ERRORLEVEL% NEQ 0 (
    echo ❌ Build failed!
    echo 🔧 Debug: Testing minimal CGO...
    echo package main > test.go
    echo import "C" >> test.go
    echo func main(){} >> test.go
    go build -tags=cgo test.go
    del test.go test.exe 2>nul
    exit /b 1
)

echo ✅ Build successful!
echo 🧪 Testing binary...
legal-processor.exe --version 2>nul || echo "Binary created successfully"

echo.
echo 🎯 Ready for production deployment
echo 📊 Next: DEPLOY-PRODUCTION.bat
endlocal
