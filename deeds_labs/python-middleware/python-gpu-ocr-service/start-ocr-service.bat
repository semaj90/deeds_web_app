@echo off
REM Start GPU OCR Service with Surya + langextract-go integration
REM CUDA 13.0 + RTX 3060 Ti optimization

echo ========================================
echo   GPU OCR Service
echo   Surya OCR + langextract-go + Ollama
echo ========================================
echo.

REM Set environment variables
set CUDA_VISIBLE_DEVICES=0
set PORT=8090
set OLLAMA_URL=http://localhost:11434
set LANGEXTRACT_BINARY=..\langextract-go\langextract.exe

REM Check if langextract-go is built
if not exist "..\langextract-go\langextract.exe" (
    echo Building langextract-go...
    cd ..\langextract-go
    go build -o langextract.exe ./cmd/langextract
    cd ..\python-gpu-ocr-service
    echo ✓ langextract-go built
)

REM Activate virtual environment if it exists
if exist "venv\Scripts\activate.bat" (
    call venv\Scripts\activate.bat
) else (
    echo ⚠️  Virtual environment not found. Creating...
    python -m venv venv
    call venv\Scripts\activate.bat
    echo Installing dependencies...
    pip install -r requirements.txt
)

echo.
echo Starting OCR service on port %PORT%...
echo.

REM Start the service
python ocr_service.py

pause
