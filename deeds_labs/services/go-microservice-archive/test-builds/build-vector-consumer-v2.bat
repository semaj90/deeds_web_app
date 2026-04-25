@echo off
REM Enterprise Vector Consumer Service v2.0 Build Script - Native Windows
REM No Docker - Direct Windows compilation with CUDA support

echo ====================================
echo Building Enterprise Vector Consumer Service v2.0
echo Native Windows Deployment (No Docker)
echo ====================================

REM Set environment variables
set CGO_ENABLED=1
set GOOS=windows
set GOARCH=amd64

REM Check Go installation
echo Checking Go installation...
go version
if %ERRORLEVEL% neq 0 (
    echo ERROR: Go is not installed or not in PATH
    pause
    exit /b 1
)

REM Check CUDA installation (optional)
echo Checking CUDA installation...
if exist "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA" (
    echo CUDA toolkit found - CUDA acceleration will be available
    set CUDA_AVAILABLE=1
    set CGO_CFLAGS=-IC:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.0\include
    set CGO_LDFLAGS=-LC:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.0\lib\x64
) else (
    echo CUDA toolkit not found - CPU-only mode
    set CUDA_AVAILABLE=0
)

REM Create bin directory
if not exist "bin" mkdir bin

REM Generate protobuf code
echo Generating gRPC code from protobuf...
cd proto
if exist "*.pb.go" del "*.pb.go"
protoc --go_out=. --go_opt=paths=source_relative --go-grpc_out=. --go-grpc_opt=paths=source_relative aiserver.proto
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to generate protobuf code
    cd ..
    pause
    exit /b 1
)
cd ..

REM Generate sqlc code
echo Generating database code with sqlc...
if exist "sqlc" (
    sqlc generate
    if %ERRORLEVEL% neq 0 (
        echo WARNING: Failed to generate sqlc code - continuing anyway
    )
)

REM Download dependencies
echo Downloading Go dependencies...
go mod tidy
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to download dependencies
    pause
    exit /b 1
)

REM Build CUDA worker (if available)
if "%CUDA_AVAILABLE%"=="1" (
    echo Building enhanced CUDA worker...
    cd cuda-worker-v2
    if exist "Makefile" (
        make release
        if %ERRORLEVEL% neq 0 (
            echo WARNING: CUDA worker build failed - continuing with CPU-only
        )
    )
    cd ..
)

REM Build main service
echo Building Enterprise Vector Consumer Service v2.0...
set BUILD_TIME=%date% %time%
set GIT_COMMIT=native-windows-v2.0

go build -ldflags "-X main.BuildTime=%BUILD_TIME% -X main.GitCommit=%GIT_COMMIT%" -o bin\vector-consumer-v2.exe .\cmd\vector-consumer-v2\

if %ERRORLEVEL% neq 0 (
    echo ERROR: Build failed
    pause
    exit /b 1
)

REM Build additional utilities
echo Building health checker...
go build -o bin\health-checker.exe .\cmd\health-checker\

echo Building migration tool...
go build -o bin\migrate.exe .\cmd\migrate\

REM Set executable permissions (Windows equivalent)
echo Setting file attributes...
attrib +R bin\vector-consumer-v2.exe

echo ====================================
echo Build completed successfully!
echo ====================================
echo.
echo Executable: bin\vector-consumer-v2.exe
echo CUDA Support: %CUDA_AVAILABLE%
echo Build Time: %BUILD_TIME%
echo.
echo To start the service:
echo   bin\vector-consumer-v2.exe --port 8095 --cuda=%CUDA_AVAILABLE%
echo.
echo For help:
echo   bin\vector-consumer-v2.exe --help
echo ====================================

pause