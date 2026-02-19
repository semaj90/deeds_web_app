@echo off
REM Quick start script for gemma3-legal MCP server

echo ========================================
echo Gemma3-Legal Agentic MCP Server
echo ========================================
echo.

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found!
    echo Please install Python 3.8+ first.
    exit /b 1
)

REM Check if in correct directory
if not exist "gemma3-legal-agentic-mcp.py" (
    echo ERROR: gemma3-legal-agentic-mcp.py not found!
    echo Please run this script from the mcp-servers directory.
    exit /b 1
)

echo [1/5] Checking dependencies...
python -c "import mcp" >nul 2>&1
if errorlevel 1 (
    echo Installing FastMCP...
    pip install mcp
)

python -c "import aio_pika" >nul 2>&1
if errorlevel 1 (
    echo Installing aio-pika...
    pip install aio-pika
)

python -c "import aiohttp" >nul 2>&1
if errorlevel 1 (
    echo Installing aiohttp...
    pip install aiohttp
)

python -c "import bs4" >nul 2>&1
if errorlevel 1 (
    echo Installing beautifulsoup4...
    pip install beautifulsoup4
)

python -c "import httpx" >nul 2>&1
if errorlevel 1 (
    echo Installing httpx...
    pip install httpx
)

echo [2/5] Checking RabbitMQ...
curl -s http://localhost:15672 >nul 2>&1
if errorlevel 1 (
    echo WARNING: RabbitMQ not detected on port 15672
    echo The server will run but won't publish to RabbitMQ queues.
    echo.
    echo To start RabbitMQ:
    echo   docker run -d --name rabbitmq-legal-mcp -p 5672:5672 -p 15672:15672 rabbitmq:3.13-management-alpine
    echo.
) else (
    echo RabbitMQ detected! ✓
)

echo [3/5] Checking Ollama...
curl -s http://localhost:11434/api/tags >nul 2>&1
if errorlevel 1 (
    echo WARNING: Ollama not detected on port 11434
    echo The server will run but gemma3-legal tool won't work.
    echo.
    echo Make sure Ollama is running: ollama serve
    echo.
) else (
    echo Ollama detected! ✓
)

echo [4/5] Running test script...
python test_gemma_legal_mcp.py

echo.
echo [5/5] Starting MCP server...
echo.
echo ========================================
echo Server is starting...
echo Press Ctrl+C to stop
echo ========================================
echo.

python gemma3-legal-agentic-mcp.py
