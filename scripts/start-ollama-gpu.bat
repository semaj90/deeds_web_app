@echo off
REM ============================================================
REM  start-ollama-gpu.bat  —  RTX 3060 Ti 8 GB optimized
REM  KV cache: q8_0  (halves VRAM vs f16)
REM  Parallel slots: 2  (enough for legal AI workload)
REM  Flash Attention: on  (2x context with same VRAM)
REM  GPU layers: 30  (keeps compute on CUDA)
REM ============================================================

set OLLAMA_KV_CACHE_TYPE=q8_0
set OLLAMA_NUM_PARALLEL=2
set OLLAMA_FLASH_ATTENTION=1
set OLLAMA_GPU_OVERHEAD=512
set OLLAMA_NUM_GPU=1
set CUDA_VISIBLE_DEVICES=0

echo [Ollama GPU] KV cache: q8_0 ^| Parallel: 2 ^| Flash Attention: ON
ollama serve
