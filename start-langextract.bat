@echo off
REM Start LangExtract Service (Google's official library + Ollama)
REM Uses existing gemma3-legal model - NO separate Docker container needed

setlocal

cd /d "%~dp0"

echo.
echo  LangExtract Service Startup
echo  ============================================
echo  Using: Google LangExtract ^+ Local Ollama
echo  Model: gemma3-legal:latest (11.8B)
echo  Port:  8095
echo  ============================================
echo.

REM Check if Ollama is running
curl -s http://localhost:11434/api/tags >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Ollama not running at localhost:11434
    echo         Please start Ollama first: ollama serve
    exit /b 1
)

REM Check if venv exists
if not exist ".venv\Scripts\activate.bat" (
    echo [INFO] Creating Python virtual environment...
    python -m venv .venv
)

REM Activate venv
call .venv\Scripts\activate.bat

REM Install dependencies if needed
pip show langextract >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Installing langextract...
    pip install -r python\requirements-langextract.txt
)

REM Set environment variables
set OLLAMA_BASE_URL=http://localhost:11434
set LANGEXTRACT_MODEL=gemma3-legal:latest

echo [INFO] Starting LangExtract service...
python python\langextract_service.py --port 8095

endlocal
