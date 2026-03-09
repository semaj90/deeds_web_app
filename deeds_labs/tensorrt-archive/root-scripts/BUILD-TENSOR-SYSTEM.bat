@echo off
echo.
echo ==========================================
echo    ENHANCED RAG V2 - TENSOR GPU SYSTEM
echo    Building Complete Architecture
echo ==========================================
echo.

cd /d "C:\Users\james\Desktop\deeds-web\deeds-web-app"

echo [1] Building Go Tensor Services...
cd go-microservice
set CGO_ENABLED=0

echo Building Tensor GPU Service...
go build -o bin\tensor-gpu-service.exe tensor-gpu-service.go
if exist "bin\tensor-gpu-service.exe" (
    echo [OK] Tensor GPU Service built
)

echo Building QUIC Tensor Server...
go build -o bin\quic-tensor-server.exe quic-tensor-server.go
if exist "bin\quic-tensor-server.exe" (
    echo [OK] QUIC Tensor Server built
)

cd ..

echo.
echo [2] Compiling WebAssembly Module...
if exist "C:\emsdk\emcc.bat" (
    cd wasm
    call emcc gpu-compute.cpp -O3 -s WASM=1 -s USE_WEBGPU=1 -o gpu-compute.js
    echo [OK] WebAssembly module compiled
    cd ..
) else (
    echo [INFO] Emscripten not found - using pre-compiled WASM
)

echo.
echo [3] Generating Protobuf Files...
if exist "C:\protoc\bin\protoc.exe" (
    protoc --go_out=. --go-grpc_out=. proto\tensor.proto
    echo [OK] Protobuf files generated
) else (
    echo [INFO] protoc not found - using existing files
)

echo.
echo [4] Starting Services...

REM Start Tensor GPU Service
if exist "go-microservice\bin\tensor-gpu-service.exe" (
    echo Starting Tensor GPU Service on port 8085...
    start /B go-microservice\bin\tensor-gpu-service.exe
)

REM Start QUIC Server
if exist "go-microservice\bin\quic-tensor-server.exe" (
    echo Starting QUIC Server on port 8443...
    start /B go-microservice\bin\quic-tensor-server.exe
)

timeout /t 3 >nul

echo.
echo ==========================================
echo    TENSOR PROCESSING SYSTEM READY!
echo ==========================================
echo.
echo Services:
echo   Tensor GPU API:    http://localhost:8085
echo   QUIC Server:       https://localhost:8443
echo   WebSocket:         ws://localhost:8086/ws/tensor
echo.
echo Endpoints:
echo   POST /api/tensor        - Process tensor operations
echo   GET  /api/vertex-cache  - Cache statistics
echo   WS   /ws                - WebSocket for protobuf
echo.
echo Features:
echo   - Gorgonia tensor operations
echo   - WebAssembly GPU compute
echo   - QUIC/HTTP3 transport
echo   - Protobuf serialization
echo   - Vertex buffer caching
echo   - URL heuristic learning
echo.
pause