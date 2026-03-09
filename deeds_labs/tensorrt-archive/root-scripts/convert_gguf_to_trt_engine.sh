#!/bin/bash
# Convert GGUF file directly to TensorRT engine

set -e

echo "=== Converting GGUF to TensorRT Engine ==="

# Activate TensorRT environment
source /home/james/trt_env_310/bin/activate

# Configuration
GGUF_FILE="/mnt/c/Users/james/Videos/deeds-web-app/gemma3Q4_K_M/mohf16-Q4_K_M.gguf"
CHECKPOINT_DIR="/home/james/gemma3_gguf_checkpoint"
OUTPUT_DIR="/home/james/gemma3_gguf_engine"

# Create directories
mkdir -p $CHECKPOINT_DIR
mkdir -p $OUTPUT_DIR

echo "📁 GGUF file: $GGUF_FILE"
echo "📁 Checkpoint: $CHECKPOINT_DIR"
echo "📁 Engine: $OUTPUT_DIR"

# Check if GGUF file exists
if [ ! -f "$GGUF_FILE" ]; then
    echo "❌ GGUF file not found: $GGUF_FILE"
    exit 1
fi

GGUF_SIZE=$(du -h "$GGUF_FILE" | cut -f1)
echo "✅ Found GGUF file: $GGUF_SIZE"

# Step 1: Convert GGUF to TensorRT checkpoint
echo "🔄 Step 1: Converting GGUF to TensorRT checkpoint..."

python -c "
import sys
sys.path.append('/home/james/trt_env_310/lib/python3.10/site-packages')

try:
    from tensorrt_llm.models.gemma.convert import convert_from_gguf
    print('✅ TensorRT-LLM GGUF converter available')

    # Convert GGUF to checkpoint
    convert_from_gguf(
        gguf_file='$GGUF_FILE',
        output_dir='$CHECKPOINT_DIR',
        dtype='float16',
        load_model_on_cpu=True
    )
    print('✅ GGUF conversion completed')

except ImportError as e:
    print(f'❌ GGUF converter not available: {e}')
    print('Using alternative conversion method...')

    # Alternative: Use trtllm-build with GGUF support
    import subprocess
    cmd = [
        'trtllm-build',
        '--model_config', '$GGUF_FILE',
        '--output_dir', '$OUTPUT_DIR',
        '--gemm_plugin', 'float16',
        '--gpt_attention_plugin', 'float16',
        '--max_batch_size', '1',
        '--max_input_len', '512',
        '--max_seq_len', '768',
        '--max_beam_width', '1',
        '--workers', '1',
        '--use_paged_context_fmha', 'enable',
        '--use_fused_mlp', 'enable',
        '--remove_input_padding', 'enable',
        '--context_fmha', 'enable'
    ]

    print(f'Running: {\" \".join(cmd)}')
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode == 0:
        print('✅ Direct GGUF to engine conversion successful')
        exit(0)
    else:
        print(f'❌ Direct conversion failed: {result.stderr}')
        exit(1)

except Exception as e:
    print(f'❌ Conversion failed: {e}')
    exit(1)
"

# Check if checkpoint was created
if [ -d "$CHECKPOINT_DIR" ] && [ "$(ls -A $CHECKPOINT_DIR)" ]; then
    echo "✅ Checkpoint created successfully"
    ls -la $CHECKPOINT_DIR/

    # Step 2: Build TensorRT engine from checkpoint
    echo "🔄 Step 2: Building TensorRT engine..."

    trtllm-build \
        --checkpoint_dir $CHECKPOINT_DIR \
        --output_dir $OUTPUT_DIR \
        --gemm_plugin float16 \
        --gpt_attention_plugin float16 \
        --max_batch_size 1 \
        --max_input_len 512 \
        --max_seq_len 768 \
        --max_beam_width 1 \
        --workers 1 \
        --use_paged_context_fmha enable \
        --use_fused_mlp enable \
        --remove_input_padding enable \
        --context_fmha enable \
        --multiple_profiles enable \
        2>&1 | tee $OUTPUT_DIR/build.log
else
    echo "❌ Checkpoint creation failed"
    exit 1
fi

# Verify the engine was created
if [ -f "$OUTPUT_DIR/rank0.engine" ]; then
    echo "✅ GGUF → TensorRT engine conversion successful!"

    # Get engine file size
    ENGINE_SIZE=$(du -h "$OUTPUT_DIR/rank0.engine" | cut -f1)
    echo "Engine size: $ENGINE_SIZE"

    # Get original GGUF size for comparison
    echo "Original GGUF size: $GGUF_SIZE"

    # Create metadata
    cat > $OUTPUT_DIR/engine_metadata.json << EOF
{
  "engine_name": "gemma3-gguf-q4km-optimized",
  "source_format": "GGUF_Q4_K_M",
  "target_performance": "sub_2ms",
  "gpu_target": "RTX_3060_Ti",
  "batch_size": 1,
  "max_input_tokens": 512,
  "max_seq_len": 768,
  "quantization": "Q4_K_M",
  "optimizations": [
    "FP16_GEMM",
    "FP16_Attention",
    "Paged_Context_FMHA",
    "Fused_MLP",
    "Remove_Input_Padding",
    "Multiple_Profiles",
    "GGUF_Source"
  ],
  "build_timestamp": $(date +%s),
  "engine_size": "$ENGINE_SIZE",
  "source_size": "$GGUF_SIZE"
}
EOF

    echo "✅ Engine metadata:"
    cat $OUTPUT_DIR/engine_metadata.json
    echo
    ls -lah $OUTPUT_DIR/
else
    echo "❌ Engine build failed. Check $OUTPUT_DIR/build.log for details"
    if [ -f "$OUTPUT_DIR/build.log" ]; then
        echo "Last 20 lines of build log:"
        tail -20 $OUTPUT_DIR/build.log
    fi
    exit 1
fi

echo "=== GGUF → TensorRT Conversion Complete ==="
echo "🎯 Engine location: $OUTPUT_DIR/rank0.engine"
echo "🚀 Ready for optimized legal AI inference!"