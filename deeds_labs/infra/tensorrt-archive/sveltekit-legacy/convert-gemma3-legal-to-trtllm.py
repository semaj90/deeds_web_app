#!/usr/bin/env python3
"""
Convert gemma3-legal:latest (Ollama GGUF) to TensorRT-LLM engine
"""

import os
import subprocess
import shutil
from pathlib import Path

def convert_ollama_to_trtllm():
    model_name = "gemma3-legal:latest"
    ollama_dir = os.path.expanduser("~/.ollama/models")
    output_dir = "/workspace/engines/gemma3-legal-trt"

    print(f"Converting {model_name} to TensorRT-LLM engine...")

    # Step 1: Find the GGUF file
    gguf_path = None
    for root, dirs, files in os.walk(ollama_dir):
        for file in files:
            if file.endswith('.gguf') and 'gemma3-legal' in file.lower():
                gguf_path = os.path.join(root, file)
                break
        if gguf_path:
            break

    if not gguf_path:
        print("❌ GGUF file not found. Pulling from Ollama...")
        subprocess.run(["ollama", "pull", model_name], check=True)
        # Retry finding GGUF
        for root, dirs, files in os.walk(ollama_dir):
            for file in files:
                if file.endswith('.gguf') and 'gemma3-legal' in file.lower():
                    gguf_path = os.path.join(root, file)
                    break
            if gguf_path:
                break

    if not gguf_path:
        raise FileNotFoundError("Could not find GGUF file")

    print(f"Found GGUF: {gguf_path}")

    # Step 2: Convert GGUF to HF format
    hf_dir = "/tmp/gemma3-legal-hf"
    os.makedirs(hf_dir, exist_ok=True)

    print("Converting GGUF to HF format...")
    # Use llama.cpp or similar to convert
    # This is a simplified version - you might need gguf-to-hf tools
    subprocess.run([
        "python", "-m", "llama_cpp.convert",
        "--gguf", gguf_path,
        "--out", hf_dir
    ], check=True)

    # Step 3: Build TensorRT-LLM engine
    print("Building TensorRT-LLM engine...")
    os.makedirs(output_dir, exist_ok=True)

    subprocess.run([
        "python", "-m", "tensorrt_llm.commands.build",
        "--checkpoint_dir", hf_dir,
        "--output_dir", output_dir,
        "--max_batch_size", "4",
        "--max_input_len", "2048",
        "--max_seq_len", "4096",
        "--max_beam_width", "1",
        "--use_gemm_plugin", "auto",
        "--use_gpt_attention_plugin", "float16",
        "--paged_kv_cache",
        "--dtype", "float16",
        "--use_weight_only",
        "--weight_only_precision", "int4_awq",
        "--per_group",
        "--group_size", "128"
    ], check=True)

    print(f"✅ TensorRT-LLM engine built at {output_dir}")

    # Cleanup
    shutil.rmtree(hf_dir, ignore_errors=True)

if __name__ == "__main__":
    convert_ollama_to_trtllm()