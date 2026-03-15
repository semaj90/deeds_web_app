@echo off
REM Start Ollama with FlashAttention-2 enabled
echo Starting Ollama with FlashAttention-2...

REM Set FlashAttention environment variables
set OLLAMA_FLASH_ATTENTION=1
set OLLAMA_NUM_GPU=35
set OLLAMA_CUDA_BATCH_SIZE=512
set OLLAMA_KV_CACHE_TYPE=q8_0
set OLLAMA_NUM_PARALLEL=2

REM Start Ollama
cd /d C:\Users\james\Music\deeds-web-app\web-app\Ollama
start "Ollama FlashAttention" ollama.exe serve

echo ✅ Ollama started with FlashAttention-2 enabled
echo 📊 Configuration:
echo    - FlashAttention: Enabled
echo    - GPU Layers: 35 (all layers on RTX 3060 Ti)
echo    - CUDA Batch Size: 512
echo    - KV Cache: Q8_0 (halved VRAM)
echo    - Parallel Requests: 2
pause
