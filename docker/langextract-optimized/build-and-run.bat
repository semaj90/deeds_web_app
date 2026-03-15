@echo off
REM Build and run optimized LangExtract service
REM Memory: ~200-300MB (down from 1GB)

echo ========================================
echo  Building Optimized LangExtract Service
echo ========================================

cd /d "%~dp0"

REM Stop old container if running
docker stop phase66-langextract 2>nul
docker rm phase66-langextract 2>nul

REM Build optimized image
echo Building optimized Docker image...
docker build -t deeds-langextract-optimized:latest .

if %ERRORLEVEL% NEQ 0 (
    echo Build failed!
    exit /b 1
)

REM Run the optimized container
echo Starting optimized container...
docker run -d ^
    --name langextract-optimized ^
    -p 8095:8095 ^
    -e OLLAMA_URL=http://host.docker.internal:11434 ^
    -e SPACY_MODEL=en_core_web_md ^
    -e ENABLE_SPACY=true ^
    --memory=512m ^
    --restart=unless-stopped ^
    deeds-langextract-optimized:latest

if %ERRORLEVEL% NEQ 0 (
    echo Failed to start container!
    exit /b 1
)

echo ========================================
echo  Container started successfully!
echo ========================================
echo.
echo Testing health endpoint...
timeout /t 5 >nul
curl -s http://localhost:8095/health

echo.
echo Memory stats (after 10s warmup):
timeout /t 10 >nul
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}" langextract-optimized

echo.
echo Done! Service running at http://localhost:8095
