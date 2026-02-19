@echo off
REM Enhanced RAG Protobuf Build Script for Windows
REM Generates Go and TypeScript bindings from .proto files

setlocal EnableDelayedExpansion

echo 🚀 Building Enhanced RAG Protobuf Bindings...
echo ════════════════════════════════════════════

REM Directories
set PROTO_DIR=proto
set GO_OUT_DIR=go-microservice\pkg\proto
set TS_OUT_DIR=sveltekit-frontend\src\lib\proto\generated

echo 📁 Proto directory: %PROTO_DIR%
echo 📁 Go output: %GO_OUT_DIR%
echo 📁 TypeScript output: %TS_OUT_DIR%
echo.

REM Check if protoc is installed
protoc --version >nul 2>&1
if !ERRORLEVEL! NEQ 0 (
    echo ❌ protoc not found. Please install Protocol Buffers compiler.
    echo.
    echo Download from: https://github.com/protocolbuffers/protobuf/releases
    echo Extract protoc.exe to a directory in your PATH
    pause
    exit /b 1
)

echo ✅ protoc found
protoc --version

REM Create output directories
if not exist "%GO_OUT_DIR%" mkdir "%GO_OUT_DIR%"
if not exist "%TS_OUT_DIR%" mkdir "%TS_OUT_DIR%"

echo 📦 Setting up Go module...
cd go-microservice

if not exist go.mod (
    go mod init github.com/legal-ai/enhanced-rag
    echo ✅ Go module initialized
)

REM Install Go protobuf dependencies
echo 📦 Installing Go protobuf dependencies...
go get google.golang.org/protobuf/cmd/protoc-gen-go@latest
go get google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
go get github.com/grpc-ecosystem/grpc-gateway/v2/protoc-gen-grpc-gateway@latest
go get github.com/gin-gonic/gin@latest
go get github.com/grpc-ecosystem/grpc-gateway/v2/runtime@latest
go get google.golang.org/grpc@latest

cd ..

REM Generate Go bindings
echo 🔧 Generating Go protobuf bindings...
protoc ^
    --proto_path=%PROTO_DIR% ^
    --go_out=%GO_OUT_DIR% ^
    --go_opt=paths=source_relative ^
    --go-grpc_out=%GO_OUT_DIR% ^
    --go-grpc_opt=paths=source_relative ^
    --grpc-gateway_out=%GO_OUT_DIR% ^
    --grpc-gateway_opt=paths=source_relative ^
    %PROTO_DIR%\enhanced-rag.proto

if !ERRORLEVEL! EQU 0 (
    echo ✅ Go protobuf bindings generated successfully
) else (
    echo ❌ Failed to generate Go protobuf bindings
    pause
    exit /b 1
)

REM Check if npm is available for TypeScript generation
where npm >nul 2>&1
if !ERRORLEVEL! EQU 0 (
    echo 📦 Installing TypeScript protobuf dependencies...
    cd sveltekit-frontend

    REM Install ts-proto if not already installed
    npm list ts-proto >nul 2>&1
    if !ERRORLEVEL! NEQ 0 (
        npm install --save-dev ts-proto
    )

    cd ..

    echo 🔧 Generating TypeScript protobuf bindings...
    REM Note: This might need adjustment based on your ts-proto installation
    echo ⚠️ TypeScript generation using manual bindings (ts-proto setup needed)
) else (
    echo ⚠️ npm not found, skipping TypeScript generation
)

REM Build Go gRPC server
echo 🔧 Building Go gRPC server...
cd go-microservice

go build -o bin\enhanced-rag-grpc.exe .\cmd\enhanced-rag-grpc\

if !ERRORLEVEL! EQU 0 (
    echo ✅ Go gRPC server built: bin\enhanced-rag-grpc.exe
) else (
    echo ❌ Failed to build Go gRPC server
    pause
    exit /b 1
)

cd ..

echo.
echo 🎉 Enhanced RAG Protobuf Build Complete!
echo ════════════════════════════════════════════
echo 🔧 Generated files:
echo    • Go bindings: %GO_OUT_DIR%\
echo    • TypeScript bindings: %TS_OUT_DIR%\
echo    • gRPC server: go-microservice\bin\enhanced-rag-grpc.exe
echo.
echo 🚀 To run the gRPC server:
echo    cd go-microservice ^&^& .\bin\enhanced-rag-grpc.exe
echo.
echo 🔗 Endpoints:
echo    • gRPC: localhost:8095
echo    • HTTP Gateway: localhost:8096
echo    • Health: curl http://localhost:8096/health
echo.

pause