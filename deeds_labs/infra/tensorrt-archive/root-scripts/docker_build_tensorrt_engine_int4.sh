#!/bin/bash
# Custom TensorRT-LLM Build Pipeline for Non-Canonical Gemma3 Architecture
# Preserves 30/17 QKV head configuration and 3840 hidden size

set -e

echo "🔥 Starting Custom TensorRT-LLM Build Pipeline"
echo "=============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MODEL_DIR="/workspace/tensorrt_build/input"
OUTPUT_DIR="/workspace/gemma3_trt_ckpt"
ENGINE_DIR="/workspace/gemma3_12b_engine"
CONTAINER_NAME="legal-ai-tensorrt-llm"

echo -e "${BLUE}Model Directory:${NC} $MODEL_DIR"
echo -e "${BLUE}Output Directory:${NC} $OUTPUT_DIR"
echo -e "${BLUE}Engine Directory:${NC} $ENGINE_DIR"
echo ""

# Check if container is running
if ! docker ps --format "{{.Names}}" | grep -q "$CONTAINER_NAME"; then
    echo -e "${RED}❌ Container '$CONTAINER_NAME' is not running. Please start it first.${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 Step 1: Verifying Custom Model Shapes${NC}"
docker exec $CONTAINER_NAME python3 /workspace/scripts/verify_custom_shapes.py \
    --model_dir $MODEL_DIR \
    --expected_hidden 3840 \
    --expected_q_heads 30 \
    --expected_kv_heads 17

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Custom shapes verified${NC}"
else
    echo -e "${RED}❌ Shape verification failed${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}🔄 Step 2: Converting Checkpoint with Custom Logic${NC}"
docker exec $CONTAINER_NAME python3 /workspace/scripts/convert_checkpoint_custom.py \
    --model_dir $MODEL_DIR \
    --output_dir $OUTPUT_DIR \
    --dtype bfloat16 \
    --use_weight_only \
    --weight_only_precision int4_awq \
    --per_group \
    --enable_multimodal \
    --custom_config /workspace/scripts/custom_model_config.json

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Checkpoint conversion complete${NC}"
else
    echo -e "${RED}❌ Checkpoint conversion failed${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}⚖️ Step 3: Calibrating for INT4 AWQ${NC}"
docker exec $CONTAINER_NAME python3 /workspace/scripts/calibrate_dataset.py \
    --checkpoint_dir $OUTPUT_DIR \
    --output_dir $OUTPUT_DIR \
    --calibration_dataset /workspace/scripts/legal_calibration_data.json \
    --num_samples 512 \
    --batch_size 8

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Calibration complete${NC}"
else
    echo -e "${RED}❌ Calibration failed${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}🏗️ Step 4: Building INT4 AWQ Engine${NC}"
docker exec $CONTAINER_NAME python3 /workspace/scripts/build_int4_engine.py \
    --checkpoint_dir $OUTPUT_DIR \
    --output_dir $ENGINE_DIR \
    --gemm_plugin bfloat16 \
    --max_batch_size 1 \
    --max_input_len 2048 \
    --max_output_len 512 \
    --max_num_tokens 2560 \
    --remove_input_padding enable \
    --paged_kv_cache enable \
    --custom_attention_config /workspace/scripts/attention_config_30_17.json

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ INT4 AWQ Engine built successfully${NC}"
else
    echo -e "${RED}❌ Engine build failed${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}🎉 Custom TensorRT-LLM Build Pipeline Complete!${NC}"
echo "=============================================="
echo ""
echo -e "${BLUE}📊 Build Summary:${NC}"
echo -e "  Model: Gemma3 12B Fine-tuned (Custom Architecture)"
echo -e "  Hidden Size: 3840"
echo -e "  Q Heads: 30, KV Heads: 17"
echo -e "  Precision: INT4 AWQ"
echo -e "  Max Batch Size: 1"
echo -e "  Max Input Length: 2048"
echo -e "  Max Output Length: 512"
echo ""
echo -e "${BLUE}💡 Next Steps:${NC}"
echo -e "  1. Test the engine: python3 scripts/test_custom_engine.py"
echo -e "  2. Build training dataset: python3 scripts/build_training_dataset.py --output agentic_tool_calling.jsonl"
echo -e "  3. Fine-tune LoRA adapter: python3 scripts/train_lora_adapter.py --dataset agentic_tool_calling.jsonl"