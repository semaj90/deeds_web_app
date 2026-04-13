@echo off
REM ═══════════════════════════════════════════════════════════════════════
REM Set LibTorch PATH for simdjson/CUDA addon
REM Usage: call scripts\set-libtorch-path.bat
REM ═══════════════════════════════════════════════════════════════════════

set LIBTORCH_ROOT=C:\libtorch-win-shared-with-deps-2.9.0+cu130\libtorch
set CUDA_ROOT=C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0

REM Add LibTorch and CUDA to PATH (prepend for priority)
set PATH=%LIBTORCH_ROOT%\lib;%CUDA_ROOT%\bin;%PATH%

echo ✅ LibTorch PATH configured
echo    LibTorch: %LIBTORCH_ROOT%\lib
echo    CUDA: %CUDA_ROOT%\bin
