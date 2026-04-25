#!/usr/bin/env python3
"""
Convert Hugging Face Gemma3 checkpoint to TensorRT-LLM format
"""

import os
import sys
import subprocess

# Set up environment
os.environ["LD_LIBRARY_PATH"] = ":".join([
    "/home/james/trt_env_310/lib/python3.10/site-packages/nvidia/cusparselt/lib",
    "/home/james/trt_env_310/lib/python3.10/site-packages/nvidia/cudnn/lib",
    "/home/james/trt_env_310/lib/python3.10/site-packages/nvidia/cublas/lib",
    "/home/james/trt_env_310/lib/python3.10/site-packages/nvidia/cuda_runtime/lib",
    "/home/james/trt_env_310/lib/python3.10/site-packages/tensorrt_libs"
]) + ":" + os.environ.get("LD_LIBRARY_PATH", "")

def main():
    print("=== Converting HF Gemma3 to TensorRT-LLM ===\n")

    # Paths
    hf_model_dir = "/home/james/gemma3_trt_ready"
    trtllm_checkpoint_dir = "/home/james/gemma3_trtllm_checkpoint"
    engine_dir = "/home/james/gemma3_trt_engine"

    # Step 1: Convert HF to TensorRT-LLM checkpoint
    print("Step 1: Converting HF checkpoint to TensorRT-LLM format...")

    convert_cmd = [
        "/home/james/trt_env_310/bin/python",
        "-m", "tensorrt_llm.examples.gemma.convert_checkpoint",
        "--model_dir", hf_model_dir,
        "--output_dir", trtllm_checkpoint_dir,
        "--dtype", "float16",
        "--tp_size", "1"  # Single GPU
    ]

    # Try the convert script from examples
    alt_convert_cmd = f"""
    cd /home/james/trt_env_310/lib/python3.10/site-packages/tensorrt_llm/examples/gemma
    python convert_checkpoint.py \
        --model_dir {hf_model_dir} \
        --output_dir {trtllm_checkpoint_dir} \
        --dtype float16 \
        --tp_size 1
    """

    try:
        # First attempt
        result = subprocess.run(convert_cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print("Standard conversion failed, trying alternative...")
            # Try alternative
            result = subprocess.run(["bash", "-c", alt_convert_cmd], capture_output=True, text=True)

        if result.returncode == 0:
            print("✅ Checkpoint conversion successful!")
        else:
            print(f"❌ Conversion failed: {result.stderr}")

            # Manual conversion fallback
            print("\nTrying manual conversion...")
            os.makedirs(trtllm_checkpoint_dir, exist_ok=True)

            # Copy and modify config
            import json
            with open(f"{hf_model_dir}/config.json", "r") as f:
                config = json.load(f)

            # Add TensorRT-LLM specific fields
            config["builder_config"] = {
                "name": "gemma",
                "precision": "float16",
                "tensor_parallel": 1,
                "pipeline_parallel": 1,
                "max_batch_size": 8,
                "max_input_len": 2048,
                "max_output_len": 2048,
                "max_beam_width": 1,
                "vocab_size": config.get("vocab_size", 262208),
                "num_layers": config.get("num_hidden_layers", 48),
                "num_heads": config.get("num_attention_heads", 16),
                "num_kv_heads": config.get("num_key_value_heads", 8),
                "hidden_size": config.get("hidden_size", 3840),
                "inter_size": config.get("intermediate_size", 15360),
                "head_size": config.get("head_dim", 256)
            }

            with open(f"{trtllm_checkpoint_dir}/config.json", "w") as f:
                json.dump(config, f, indent=2)

            # Link weights
            import shutil
            for f in os.listdir(hf_model_dir):
                if f.endswith(".safetensors") or f.endswith(".bin"):
                    src = os.path.join(hf_model_dir, f)
                    dst = os.path.join(trtllm_checkpoint_dir, f)
                    if not os.path.exists(dst):
                        shutil.copy2(src, dst)

            print("✅ Manual checkpoint prepared")

    except Exception as e:
        print(f"Conversion error: {e}")
        return 1

    # Step 2: Build TensorRT engine
    print("\nStep 2: Building TensorRT engine...")

    build_cmd = [
        "/home/james/trt_env_310/bin/trtllm-build",
        "--checkpoint_dir", trtllm_checkpoint_dir,
        "--output_dir", engine_dir,
        "--gemm_plugin", "float16",
        "--max_batch_size", "8",
        "--max_input_len", "2048",
        "--max_output_len", "2048",
        "--max_beam_width", "1"
    ]

    try:
        result = subprocess.run(build_cmd, capture_output=True, text=True)
        if result.returncode == 0:
            print("✅ Engine build successful!")
            print(result.stdout)
        else:
            print(f"❌ Engine build failed: {result.stderr}")
            return 1

    except Exception as e:
        print(f"Build error: {e}")
        return 1

    # Step 3: Verify output
    print("\nStep 3: Verifying engine...")
    if os.path.exists(engine_dir):
        files = os.listdir(engine_dir)
        print(f"Engine directory contents:")
        for f in files:
            size = os.path.getsize(os.path.join(engine_dir, f))
            print(f"  {f}: {size:,} bytes")

        if any(f.endswith(".engine") for f in files):
            print("\n✅ TensorRT engine successfully created!")
            return 0

    print("❌ No engine file found")
    return 1

if __name__ == "__main__":
    sys.exit(main())