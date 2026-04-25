@echo off
echo Starting Context7 RAG Pipeline with Gemma Embeddings...
echo.

REM Check if Go is installed
where go >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Go is not installed or not in PATH
    exit /b 1
)

REM Navigate to scripts directory
cd /d "%~dp0"

REM Install dependencies
echo Installing Go dependencies...
go mod download

REM Build the executable
echo Building Context7 RAG pipeline...
go build -o context7-rag-pipeline.exe context7-rag-pipeline.go

if %errorlevel% neq 0 (
    echo Error: Failed to build the pipeline
    exit /b 1
)

REM Run the pipeline
echo.
echo Running Context7 RAG Pipeline...
echo ================================
.\context7-rag-pipeline.exe

echo.
echo Pipeline execution complete!
pause