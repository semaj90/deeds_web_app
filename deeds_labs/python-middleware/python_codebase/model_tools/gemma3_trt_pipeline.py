#!/usr/bin/env python3
"""
WSL2 Gemma3 TensorRT-LLM pipeline
1️⃣ Quantizes FP16 checkpoint → AWQ4
2️⃣ Builds TensorRT .plan engine
3️⃣ Runs Python inference with KV-cache / sliding window
"""

import os
import subprocess
from pathlib import Path

# ==== USER CONFIGURATION ====
FP16_CHECKPOINT = Path("/mnt/c/Users/james/Videos/deeds-web-app/model_unsloth_hf_f16")
AWQ4_DIR = Path("/home/james/gemma3_awq4")
ENGINE_DIR = Path("/home/james/gemma3_engine_trt")
MAX_BATCH_SIZE = 8
MAX_INPUT_LEN = 2048
MAX_SEQ_LEN = 4096
DEVICE_ID = 0  # GPU ID

# ==== ENV SETUP ====
TRT_ENV = Path.home() / "trt_env_310"
ACTIVATE_CMD = f"source {TRT_ENV}/bin/activate"

# ==== STEP 1: Quantize FP16 → AWQ4 ====
def quantize_awq4():
    print("➡️ Quantizing FP16 checkpoint → AWQ4 (~6GB)")
    AWQ4_DIR.mkdir(parents=True, exist_ok=True)

    cmd = f"""
    {ACTIVATE_CMD} && \
    python -m quantize_gemma \
        --input_dir {FP16_CHECKPOINT} \
        --output_dir {AWQ4_DIR} \
        --method awq4 \
        --verbose
    """
    subprocess.run(cmd, shell=True, check=True)

# ==== STEP 2: Build TensorRT Engine ====
def build_trt_engine():
    print("➡️ Building TensorRT engine (.plan)")
    ENGINE_DIR.mkdir(parents=True, exist_ok=True)

    cmd = f"""
    {ACTIVATE_CMD} && \
    trtllm-build \
        --checkpoint_dir {AWQ4_DIR} \
        --output_dir {ENGINE_DIR} \
        --model_type gemma3 \
        --num_layers 48 \
        --hidden_size 4096 \
        --num_attention_heads 32 \
        --max_batch_size {MAX_BATCH_SIZE} \
        --max_input_len {MAX_INPUT_LEN} \
        --max_seq_len {MAX_SEQ_LEN} \
        --int8_kv_cache \
        --use_flash_inference \
        --flash_inference_device_id {DEVICE_ID} \
        --use_gpt_attention_plugin float16 \
        --use_gemm_plugin float16 \
        --use_rmsnorm_plugin float16 \
        --enable_context_fmha \
        --enable_context_fmha_fp32_acc \
        --multi_block_mode \
        --remove_input_padding \
        --reduce_fusion \
        --strongly_typed \
        --log_level info
    """
    subprocess.run(cmd, shell=True, check=True)

# ==== STEP 3: Python Inference Example ====
def run_inference():
    print("➡️ Running Python inference with KV-cache / sliding window")
    import torch
    from trt_llm import TRTLlmModel

    model = TRTLlmModel(str(ENGINE_DIR / "engine.plan"), device_id=DEVICE_ID)
    # Initialize KV-cache
    model.init_kv_cache(batch_size=1, max_seq_len=MAX_SEQ_LEN)

    prompt = "Your legal AI prompt goes here."
    output = model.generate(prompt, max_new_tokens=128, use_sliding_window=True)
    print("📝 Generated output:\n", output)

# ==== MAIN PIPELINE ====
if __name__ == "__main__":
    quantize_awq4()
    build_trt_engine()
    run_inference()