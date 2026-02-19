@echo off
REM Start MinIO SIMD Service on port 8096
set MINIO_SIMD_PORT=8096
set MINIO_ENDPOINT=localhost:9000
set MINIO_ACCESS_KEY=minioadmin
set MINIO_SECRET_KEY=minioadmin
set MINIO_USE_SSL=false

echo Starting MinIO SIMD Service on port %MINIO_SIMD_PORT%...
echo MinIO endpoint: %MINIO_ENDPOINT%

REM Check if Go services directory exists
if not exist "..\..\deeds_labs\go-services\go-services\simd-json-accelerator" (
    echo ⚠️  SIMD service directory not found, skipping...
    echo ℹ️  To enable SIMD acceleration, ensure go-services/simd-json-accelerator exists
    exit /b 0
)

REM Check for existing executables (use simd-json-accelerator.exe which is already built)
if exist "..\..\deeds_labs\go-services\go-services\simd-json-accelerator\simd-json-accelerator.exe" (
    echo ✅ Using existing SIMD accelerator
    start "MinIO SIMD Service" /B ..\..\deeds_labs\go-services\go-services\simd-json-accelerator\simd-json-accelerator.exe
) else if exist "..\..\deeds_labs\go-services\go-services\simd-json-accelerator\minio-simd-service.exe" (
    echo ✅ Using MinIO SIMD service
    start "MinIO SIMD Service" /B ..\..\deeds_labs\go-services\go-services\simd-json-accelerator\minio-simd-service.exe
) else (
    echo ⚠️  No SIMD service executable found
    echo ℹ️  Build the service with: cd go-services\simd-json-accelerator ^&^& go build -o simd-json-accelerator.exe main.go
    echo ℹ️  Continuing without SIMD acceleration...
    exit /b 0
)

timeout /t 3 /nobreak >nul
echo.
echo ✅ MinIO SIMD Service started
echo 📡 Health: http://localhost:%MINIO_SIMD_PORT%/health
echo 📦 Parse: http://localhost:%MINIO_SIMD_PORT%/parse
echo 📂 MinIO store: http://localhost:%MINIO_SIMD_PORT%/minio/store
