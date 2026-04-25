@echo off
REM SIMD JSON Parser Service Startup Script
REM This script starts the SIMD-accelerated JSON parsing service

echo 🚀 Starting SIMD JSON Parser Service...
echo 📍 Service will be available at http://localhost:8097

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python is not installed or not in PATH
    echo Please install Python 3.8+ and add it to your PATH
    pause
    exit /b 1
)

REM Check if requirements are installed
python -c "import orjson, torch, numpy" >nul 2>&1
if errorlevel 1 (
    echo ⚠️  Installing Python dependencies...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo ❌ Failed to install dependencies
        pause
        exit /b 1
    )
)

echo ✅ Dependencies installed
echo 🏃 Starting service...

REM Start the service
python simd_parser_service.py

pause