#!/usr/bin/env python3
import subprocess
import argparse
from pathlib import Path
import sys

def build_engine(model_name: str):

    MODEL_MAP = {
        "gemma3": "/workspace/onnx_models/gemma_3_270m/gemma3.onnx"
    }

    if model_name not in MODEL_MAP:
        print(f"❌ Unknown model: {model_name}")
        sys.exit(1)

    onnx_path = MODEL_MAP[model_name]
    out_dir = f"/workspace/trt_engines/{model_name}"

    Path(out_dir).mkdir(parents=True, exist_ok=True)

    print("🎯 Building GEMMA3 TensorRT engine")
    print(f"📁 ONNX path: {onnx_path}")
    print(f"📤 Engine path: {out_dir}")

    build_cmd = [
        "trtllm-build",
        "--model_format", "onnx",
        "--onnx_path", onnx_path,
        "--output_dir", out_dir,
        "--max_batch_size", "1",
        "--max_input_len", "1024",
        "--max_seq_len", "2048",
        "--dtype", "float16",

        # FIXED HERE ↓↓↓
        "--paged_kv_cache", "enable",

        # AWQ int4 is optional — removing for stability
        "--use_gemm_plugin", "auto",
        "--use_gpt_attention_plugin", "float16",
    ]

    print(f"🔧 Build command: {' '.join(build_cmd)}")

    try:
        subprocess.run(build_cmd, check=True)
        print(f"✅ TensorRT engine built successfully at: {out_dir}")

    except subprocess.CalledProcessError as e:
        print("❌ Engine build failed!")
        print("STDERR:", e.stderr)
        print("STDOUT:", e.stdout)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, help="Model name")
    args = parser.parse_args()
    build_engine(args.model)


if __name__ == "__main__":
    main()