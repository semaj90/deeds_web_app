@echo off
REM ============================================================
REM  start-ollama-flash-attention.bat  —  Flash Attention + q8_0 KV
REM
REM  RTX 3060 Ti 8 GB — target settings:
REM    OLLAMA_KV_CACHE_TYPE=q8_0  halves KV VRAM (was f16)
REM    OLLAMA_FLASH_ATTENTION=1   2x effective context
REM    OLLAMA_NUM_PARALLEL=2      balanced for 8 GB
REM    OLLAMA_GPU_OVERHEAD=256    reduced overhead budget
REM ============================================================

set OLLAMA_KV_CACHE_TYPE=q8_0
set OLLAMA_FLASH_ATTENTION=1
set OLLAMA_NUM_PARALLEL=2
set OLLAMA_GPU_OVERHEAD=256
set OLLAMA_NUM_GPU=1
set CUDA_VISIBLE_DEVICES=0

echo [Ollama FA] Flash Attention ON ^| KV: q8_0 ^| Parallel: 2
ollama serve
