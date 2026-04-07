@echo off
REM Persistent whisper-server.exe — keeps GGML model in GPU VRAM
REM Eliminates 2-3s cold start per transcription request
REM API: POST /inference (multipart/form-data), GET /health
REM VRAM: ~200MB for base model (fits alongside Ollama gemma4 ~6.4GB on 8GB RTX 3060 Ti)

SET WHISPER_DIR=%~dp0..\sveltekit-frontend\node_modules\nodejs-whisper\cpp\whisper.cpp
SET MODEL=%WHISPER_DIR%\models\ggml-base.bin
SET SERVER=%WHISPER_DIR%\build\bin\Release\whisper-server.exe
SET PORT=8178

IF NOT EXIST "%SERVER%" (
    echo ERROR: whisper-server.exe not found at:
    echo   %SERVER%
    echo.
    echo Run: cd sveltekit-frontend ^&^& npm i nodejs-whisper
    pause
    exit /b 1
)

IF NOT EXIST "%MODEL%" (
    echo ERROR: Model not found at:
    echo   %MODEL%
    echo.
    echo Run: cd %WHISPER_DIR% ^&^& download-ggml-model.cmd base
    pause
    exit /b 1
)

echo ============================================
echo  Whisper Server (CUDA GPU)
echo  Port: %PORT%
echo  Model: ggml-base.bin (142MB)
echo  GPU Layers: 99 (full CUDA offload)
echo ============================================
echo.

"%SERVER%" --model "%MODEL%" --port %PORT% --host 127.0.0.1 --gpu-layers 99