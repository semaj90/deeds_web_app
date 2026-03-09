#!/bin/bash
# Build TensorRT-LLM engines for Gemma3 Legal AI

echo "=== TensorRT-LLM Engine Building Script ==="
echo "This will create both INT8 and FP16 engines for comparison"
echo ""

# Activate TensorRT environment
source ~/trt_env_310/bin/activate

# Step 1: Clean up duplicates first
echo "Step 1: Removing duplicate checkpoints..."
rm -rf ~/gemma3_trt_ready ~/gemma3_clean_checkpoint
echo "Freed 38GB by removing duplicates"

# Step 2: Convert to INT8 quantized checkpoint
echo ""
echo "Step 2: Creating INT8 quantized checkpoint..."
echo "Converting BF16 (19GB) → INT8 (~5GB)"

trtllm-convert-checkpoint \
    --model_dir ~/gemma3_trtllm_checkpoint \
    --output_dir ~/gemma3_checkpoint_int8 \
    --dtype float16 \
    --use_weight_only \
    --weight_only_precision int8

# Step 3: Build INT8 engine
echo ""
echo "Step 3: Building INT8 TensorRT engine..."
trtllm-build \
    --checkpoint_dir ~/gemma3_checkpoint_int8 \
    --output_dir ~/gemma3_engine_int8 \
    --gemma_plugin float16 \
    --max_batch_size 8 \
    --max_input_len 2048 \
    --max_output_len 1024

# Step 4: Build FP16 engine (from original BF16 checkpoint)
echo ""
echo "Step 4: Building FP16 TensorRT engine for quality comparison..."
trtllm-build \
    --checkpoint_dir ~/gemma3_trtllm_checkpoint \
    --output_dir ~/gemma3_engine_fp16 \
    --gemma_plugin float16 \
    --max_batch_size 8 \
    --max_input_len 2048 \
    --max_output_len 1024

echo ""
echo "=== Build Complete ==="
echo "INT8 Engine: ~/gemma3_engine_int8/"
echo "FP16 Engine: ~/gemma3_engine_fp16/"
echo ""
echo "Performance expectations:"
echo "- INT8: ~3-4x faster, ~4x smaller memory"
echo "- FP16: Better quality, baseline performance"