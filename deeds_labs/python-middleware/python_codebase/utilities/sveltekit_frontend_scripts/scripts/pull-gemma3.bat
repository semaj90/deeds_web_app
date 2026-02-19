@echo off REM Pull gemma3:270m model for document analysis REM REM Usage: pull-gemma3.bat setlocal
enabledelayedexpansion echo. echo 🤖 Ollama Model Puller - Legal AI Document Analysis echo
================================================== echo. REM Check if Ollama is installed where ollama > nul 2>&1 if
!errorlevel! equ 0 ( echo ✅ Ollama is installed ) else ( echo ❌ Ollama is not installed or not in PATH echo Please
install Ollama from https://ollama.ai pause exit /b 1 ) echo. REM Check if Ollama service is running echo Checking
Ollama service... curl -s http://localhost:11434/api/tags > nul 2>&1 if !errorlevel! equ 0 ( echo ✅ Ollama service is
running ) else ( echo ⚠️ Ollama service not responding on localhost:11434 echo Please start Ollama manually before
running this script echo. echo Starting Ollama... start "" "C:\Program Files\Ollama\ollama.exe" timeout /t 10 /nobreak )
echo. echo 📦 Current Models echo ================= ollama list echo. echo 🔄 Pulling gemma3:270m (Lightweight - 2GB)
echo =========================================== echo This model is optimized for fast inference on legal documents.
echo Memory requirement: ~5GB RAM echo. call ollama pull gemma3:270m if !errorlevel! equ 0 ( echo. echo ✅ Model pulled
successfully! echo. ) else ( echo. echo ❌ Model pull failed. Please check your internet connection. pause exit /b 1 )
echo 🔍 Verifying installation... ollama list | findstr "gemma3:270m" > nul if !errorlevel! equ 0 ( echo ✅ gemma3:270m
is installed and ready ) else ( echo ❌ Model verification failed pause exit /b 1 ) echo. echo 📊 Updated model list
echo ==================== ollama list echo. echo 🎉 Setup complete! echo. echo You can now: echo 1. Test the model:
ollama run gemma3:270m echo 2. Upload documents: POST /api/ai/ollama/analyze-legal-document echo 3. Monitor inference:
Check Ollama logs echo. echo Optional: Pull additional models echo Full model: ollama pull gemma3 echo Embedding: ollama
pull embeddinggemma:latest echo Alternative: ollama pull mistral echo. pause
