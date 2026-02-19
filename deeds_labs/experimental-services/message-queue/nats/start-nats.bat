@echo off
REM Start NATS Server for Legal AI Platform
REM Requires NATS server to be installed or available

echo 🚀 Starting NATS Server for Legal AI Platform...

REM Check if nats-server.exe exists in PATH
where nats-server >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ❌ nats-server not found in PATH.
    echo Please install NATS server from https://nats.io/download/
    echo Or add it to your PATH.
    pause
    exit /b 1
)

REM Create log directory if it doesn't exist
if not exist "C:\ProgramData\NATS\logs" (
    mkdir "C:\ProgramData\NATS\logs" 2>nul
)

REM Start NATS server with configuration
nats-server -c nats-server.conf

echo ✅ NATS Server started on port 4222
echo 📊 Monitoring available at http://localhost:8222
echo Press Ctrl+C to stop...