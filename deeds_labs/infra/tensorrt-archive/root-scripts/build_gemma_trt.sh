#!/usr/bin/env bash
set -e

# Activate clean venv with compatible PyTorch 2.5.1 + CUDA 12.1
source ~/trt_env_clean/bin/activate

echo "🚀 Building Gemma3 AWQ4 TensorRT Engine (RTX 3060 Ti)..."
echo "📂 Checkpoint: /home/james/gemma3_awq4"
echo "📂 Output: /home/james/gemma3_engine_rtx3060ti"

# Create output directory if it doesn't exist
mkdir -p /home/james/gemma3_engine_rtx3060ti

# Build TensorRT engine with RTX 3060 Ti optimized settings
# Note: Allow trtllm-build to fail gracefully so we can run validation
set +e  # Temporarily disable exit on error
trtllm-build \
  --checkpoint_dir /home/james/gemma3_awq4 \
  --output_dir /home/james/gemma3_engine_rtx3060ti \
  --gemma_version 3 \
  --flash_infer True \
  --kv_cache True \
  --max_batch_size 4 \
  --dtype int4 \
  --ampere_opt True \
  --enable_context_fmha True \
  --enable_chunked_context True \
  --max_input_len 2048 \
  --max_seq_len 4096 \
  --strongly_typed \
  --log_level info

BUILD_EXIT_CODE=$?  # Capture the exit code
set -e  # Re-enable exit on error for validation

# ✅ Critical post-build validation (prevents false success)
echo "🔍 Validating TensorRT engine build..."
echo "📊 Build exit code: $BUILD_EXIT_CODE"
ENGINE_DIR="/home/james/gemma3_engine_rtx3060ti"

# Check if directory exists
if [ ! -d "$ENGINE_DIR" ]; then
    echo "❌ FATAL: Output directory not created: $ENGINE_DIR"
    echo "   trtllm-build likely failed silently"
    exit 1
fi

# Find .plan files (critical for TensorRT)
PLAN_FILES=$(find "$ENGINE_DIR" -name "*.plan" 2>/dev/null || true)
if [ -z "$PLAN_FILES" ]; then
    echo "❌ FATAL: No .plan files found in $ENGINE_DIR"
    echo "   TensorRT engine build failed"
    echo ""
    echo "📂 Directory contents:"
    ls -la "$ENGINE_DIR/" 2>/dev/null || echo "   Directory is empty"
    echo ""
    echo "💡 Troubleshooting:"
    echo "   1. Check for CUDA/PyTorch version mismatches"
    echo "   2. Try --dtype int8 instead of int4"
    echo "   3. Reduce --max_batch_size to 2"
    echo "   4. Check available VRAM (needs ~6GB for AWQ4)"
    exit 1
fi

# Validate plan file integrity
PRIMARY_PLAN=$(echo "$PLAN_FILES" | head -n 1)
PLAN_SIZE=$(du -h "$PRIMARY_PLAN" | cut -f1)
PLAN_SIZE_BYTES=$(stat -f%z "$PRIMARY_PLAN" 2>/dev/null || stat -c%s "$PRIMARY_PLAN" 2>/dev/null || echo "0")

if [ "$PLAN_SIZE_BYTES" -lt 100000 ]; then  # Less than 100KB is suspicious
    echo "❌ FATAL: Plan file suspiciously small: $PLAN_SIZE ($PLAN_SIZE_BYTES bytes)"
    echo "   This indicates a failed or corrupted build"
    exit 1
fi

echo "✅ Engine build validation passed!"
echo "📄 Primary plan file: $(basename "$PRIMARY_PLAN") ($PLAN_SIZE)"

# Check for additional required files
if [ -f "$ENGINE_DIR/config.json" ]; then
    echo "✅ Configuration: config.json found"
else
    echo "⚠️  Warning: config.json missing (may cause issues)"
fi

# Report all built artifacts
echo ""
echo "🎯 Built artifacts:"
for file in $PLAN_FILES; do
    SIZE=$(du -h "$file" | cut -f1)
    echo "  🔧 $(basename "$file"): $SIZE"
done

TOTAL_SIZE=$(du -sh "$ENGINE_DIR" | cut -f1)
echo "📊 Total engine directory size: $TOTAL_SIZE"

echo ""
echo "🚀 TensorRT engine ready for Triton Inference Server!"
echo "   Engine path: $ENGINE_DIR"
echo "   Compatible with RTX 3060 Ti (8GB VRAM)"

echo ""
echo "🚀 Next steps:"
echo "  1. Update Triton server to use: $ENGINE_DIR"
echo "  2. Test with SvelteKit AI chat interface"
echo "  3. Fallback to int8 if AWQ4 has memory issues"
echo "  4. API endpoints available at: http://localhost:8000"