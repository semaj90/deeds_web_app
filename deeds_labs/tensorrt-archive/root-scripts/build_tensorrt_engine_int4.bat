@echo off
REM Build TensorRT-LLM engine for Gemma3 12B with INT4 AWQ quantization
REM Optimized for RTX 3060 Ti (8GB VRAM)

echo 🚀 Building TensorRT-LLM Engine for Gemma3 12B (INT4 AWQ)
echo ========================================================

set CHECKPOINT_DIR=/workspace/engines/gemma3-legal-production/checkpoint
set ENGINE_DIR=/workspace/engines/gemma3-legal-production/engine_int4
set BUILD_CONFIG=/workspace/tensorrt_build/input/build_config_int4.json

echo Using checkpoint: %CHECKPOINT_DIR%
echo Output engine: %ENGINE_DIR%
echo Build config: %BUILD_CONFIG%

REM Create engine directory
mkdir -p %ENGINE_DIR%

REM Build the engine
python3 -m tensorrt_llm.commands.build ^
    --checkpoint_dir %CHECKPOINT_DIR% ^
    --output_dir %ENGINE_DIR% ^
    --max_batch_size 1 ^
    --max_input_len 4096 ^
    --max_seq_len 4096 ^
    --max_beam_width 1 ^
    --use_gemm_plugin auto ^
    --use_gpt_attention_plugin float16 ^
    --paged_kv_cache ^
    --dtype float16 ^
    --use_weight_only ^
    --weight_only_precision int4_awq ^
    --per_group ^
    --group_size 128 ^
    --quantize_weights ^
    --build_config %BUILD_CONFIG%

if %ERRORLEVEL% EQU 0 (
    echo ✅ TensorRT engine built successfully!
    echo Engine location: %ENGINE_DIR%
) else (
    echo ❌ Engine build failed!
    exit /b 1
)