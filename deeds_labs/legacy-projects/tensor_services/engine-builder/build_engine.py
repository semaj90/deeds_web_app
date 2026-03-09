import os
import subprocess
import json
import time
import torch

MODEL_NAME = "gemma3-legal"
MODEL_PATH = "/models/gemma3-legal-hf"
ENGINE_DIR = "/engines/gemma3-legal"
BUILD_SCRIPT = "/opt/tensorrtllm/bin/build.py"

def detect_gpu():
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA not available inside TensorRT container")

    name = torch.cuda.get_device_name(0)
    cc = torch.cuda.get_device_capability(0)
    print(f"[GPU] Detected GPU: {name}, Compute Capability: {cc}")
    return cc

def build_engine():
    os.makedirs(ENGINE_DIR, exist_ok=True)

    cc = detect_gpu()

    cmd = [
        "python3", BUILD_SCRIPT,
        "--checkpoint_dir", MODEL_PATH,
        "--model_config", f"{MODEL_PATH}/config.json",
        "--output_dir", ENGINE_DIR,
        "--max_batch_size", "1",
        "--max_input_len", "2048",
        "--max_seq_len", "4096",
        "--log_level", "info",

        # FIX: TensorRT LLM now expects explicit boolean
        "--paged_kv_cache", "enable",

        # Ampere optimization
        "--gpt_attention_plugin", "float16",
        "--gemm_plugin", "float16",

        # Force correct compute capability
        "--auto_parallel", "disable",
        "--gpus_per_node", "1",
    ]

    print("\n\n🚀 Launching TensorRT Engine Build...")
    print(" ".join(cmd))

    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    # Stream logs
    for line in proc.stdout:
        print(line.decode(), end="")

    stdout, stderr = proc.communicate()

    if proc.returncode != 0:
        print("\n❌ TensorRT build failed")
        print(stderr.decode())
        raise RuntimeError("ENGINE BUILD FAILED")

    print("\n✅ TensorRT Engine Built Successfully")
    return True


if __name__ == "__main__":
    print("Starting Gemma3-Legal TensorRT Engine Builder")

    # Check if engine directory exists and has files
    if os.path.exists(ENGINE_DIR) and os.listdir(ENGINE_DIR):
        print("✔ Engine already exists. Skipping build.")
    else:
        build_engine()