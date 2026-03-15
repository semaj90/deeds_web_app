@echo off
REM GPU-optimized Ollama startup for RTX 3060 Ti with CUDA 13.0

REM CUDA settings
set CUDA_VISIBLE_DEVICES=0
set CUDA_PATH=C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0

REM Ollama GPU optimization
set OLLAMA_GPU_LAYERS=30
set OLLAMA_FLASH_ATTENTION=true
set OLLAMA_NUM_GPU=1
set OLLAMA_GPU_OVERHEAD=0
set OLLAMA_MAX_LOADED_MODELS=1

REM Performance tuning
set OLLAMA_NUM_PARALLEL=2
set OLLAMA_KV_CACHE_TYPE=q8_0
set OLLAMA_MAX_QUEUE=512
set OLLAMA_CONTEXT_LENGTH=4096

REM Start Ollama server
"C:\Users\james\Music\deeds-web-app\web-app\Ollama\ollama.exe" serve
