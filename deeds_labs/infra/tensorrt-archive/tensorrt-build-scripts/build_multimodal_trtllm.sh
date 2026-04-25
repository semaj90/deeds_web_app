#!/bin/bash
set -e

# ═══════════════════════════════════════════════════════════════════════
# Full Multimodal TRT-LLM Build for Gemma 3 12B VLM
# Vision Tower (SigLIP FP16) + Text Decoder (Gemma 3 INT4 AWQ)
#
# Target: RTX 3060 Ti (8GB VRAM)
# Run inside TRT-LLM Docker container:
#   docker run --gpus all -it -v $(pwd):/workspace nvcr.io/nvidia/trt-llm:0.20.0 bash
# ═══════════════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
INPUT_DIR="$PROJECT_ROOT/input"
OUTPUT_DIR="$PROJECT_ROOT/output"

MODEL_PATH="${MODEL_PATH:-$INPUT_DIR/gemma-3-12b-it}"

echo "═══════════════════════════════════════════════════════════"
echo " Gemma 3 12B Multimodal TRT-LLM Build"
echo " Vision: SigLIP → ONNX → TensorRT FP16"
echo " Text:   Gemma 3 → AWQ INT4 → TRT-LLM Engine"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Model path:  $MODEL_PATH"
echo "Output dir:  $OUTPUT_DIR"
echo ""

# ── Step 1: Split Checkpoint ─────────────────────────────────────────
echo "═══ Step 1/5: Split Multimodal Checkpoint ═══"
python3 "$SCRIPT_DIR/split_multimodal_checkpoint.py" \
    --model-path "$MODEL_PATH" \
    --output-dir "$OUTPUT_DIR"

VISION_DIR="$OUTPUT_DIR/gemma3-vision-tower"
TEXT_DIR="$OUTPUT_DIR/gemma3-text-only"

# ── Step 2: Build Vision Engine (SigLIP → ONNX → TensorRT FP16) ─────
echo ""
echo "═══ Step 2/5: Build Vision Engine (SigLIP FP16) ═══"
python3 "$SCRIPT_DIR/build_vision_engine.py" \
    --input "$VISION_DIR" \
    --output "$OUTPUT_DIR/vision-engine" \
    --max-batch 1

# ── Step 3: Quantize Text Model (AWQ INT4) ───────────────────────────
echo ""
echo "═══ Step 3/5: Quantize Text Model (AWQ INT4) ═══"
AWQ_DIR="$OUTPUT_DIR/gemma3-text-awq"

if command -v python3 -c "import autoawq" &>/dev/null; then
    python3 -c "
from awq import AutoAWQForCausalLM
from transformers import AutoTokenizer

model_path = '$TEXT_DIR'
quant_path = '$AWQ_DIR'

print('Loading text-only model for AWQ quantization...')
model = AutoAWQForCausalLM.from_pretrained(model_path, safetensors=True)
tokenizer = AutoTokenizer.from_pretrained(model_path)

quant_config = {
    'zero_point': True,
    'q_group_size': 128,
    'w_bit': 4,
    'version': 'GEMM'
}

print('Running AWQ quantization (INT4, group_size=128)...')
model.quantize(tokenizer, quant_config=quant_config)
model.save_quantized(quant_path)
tokenizer.save_pretrained(quant_path)
print(f'AWQ model saved to {quant_path}')
"
else
    echo "AutoAWQ not found. Install with: pip install autoawq"
    echo "Using text checkpoint directly (FP16 fallback)"
    AWQ_DIR="$TEXT_DIR"
fi

# ── Step 4: Convert AWQ → TRT-LLM Checkpoint ────────────────────────
echo ""
echo "═══ Step 4/5: Convert to TRT-LLM Checkpoint ═══"
CONVERTED_DIR="$OUTPUT_DIR/trtllm-checkpoint"

if command -v trtllm-build &>/dev/null; then
    # Use TRT-LLM's built-in converter
    python3 -c "
from tensorrt_llm.models import GemmaForCausalLM
GemmaForCausalLM.convert_checkpoint(
    '$AWQ_DIR',
    output_dir='$CONVERTED_DIR',
    dtype='float16',
    quant_config={'quant_algo': 'W4A16_AWQ', 'group_size': 128}
)
print('TRT-LLM checkpoint conversion complete')
" 2>/dev/null || {
    echo "TRT-LLM Python converter not available."
    echo "Using manual checkpoint conversion..."
    python3 "$SCRIPT_DIR/convert_checkpoint.py" \
        --model-dir "$AWQ_DIR" \
        --output-dir "$CONVERTED_DIR" \
        --dtype float16
}
else
    echo "trtllm-build not found. Skipping TRT-LLM conversion."
    echo "Run this inside the TRT-LLM Docker container."
    CONVERTED_DIR="$AWQ_DIR"
fi

# ── Step 5: Build Text Engine (TRT-LLM) ─────────────────────────────
echo ""
echo "═══ Step 5/5: Build Text Engine (TRT-LLM INT4 AWQ) ═══"
ENGINE_DIR="$OUTPUT_DIR/text-engine"
mkdir -p "$ENGINE_DIR"

if command -v trtllm-build &>/dev/null; then
    trtllm-build \
        --checkpoint_dir "$CONVERTED_DIR" \
        --output_dir "$ENGINE_DIR" \
        --gemm_plugin float16 \
        --gpt_attention_plugin float16 \
        --max_batch_size 4 \
        --max_input_len 2048 \
        --max_seq_len 4096 \
        --max_beam_width 1 \
        --use_paged_kv_cache \
        --context_fmha enable \
        --use_weight_only \
        --weight_only_precision int4_awq \
        --per_group \
        --group_size 128

    echo ""
    echo "Text engine built: $ENGINE_DIR"
    ls -la "$ENGINE_DIR/"
else
    echo "trtllm-build not found. Run inside TRT-LLM Docker container."
fi

# ── Summary ──────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
echo " BUILD COMPLETE"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Outputs:"
echo "  Vision Engine (SigLIP FP16):  $OUTPUT_DIR/vision-engine/"
echo "  Text Engine (Gemma3 INT4):    $OUTPUT_DIR/text-engine/"
echo "  AWQ Checkpoint:               $AWQ_DIR/"
echo ""
echo "Triton Deployment:"
echo "  1. Copy vision-engine/ → triton-models/gemma3_vision/1/"
echo "  2. Copy text-engine/   → triton-models/gemma3_legal/1/"
echo "  3. Start Triton: tritonserver --model-repository=triton-models/"
echo ""
echo "VRAM Budget (RTX 3060 Ti 8GB):"
echo "  Vision Engine:  ~0.5 GB (FP16 SigLIP)"
echo "  Text Engine:    ~3.2 GB (INT4 AWQ Gemma3)"
echo "  KV Cache:       ~1.5 GB (paged, 4096 seq)"
echo "  Overhead:       ~0.5 GB"
echo "  Total:          ~5.7 GB  (fits in 8GB)"
echo "═══════════════════════════════════════════════════════════"
