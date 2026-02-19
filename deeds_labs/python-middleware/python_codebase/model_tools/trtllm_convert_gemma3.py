#!/usr/bin/env python3
import subprocess
from pathlib import Path

ONNX_PATH = "/workspace/onnx_models/gemma_3_270m/gemma3.onnx"
OUT_DIR   = "/workspace/trtllm_ckpts/gemma3_270m"

def main():
    Path(OUT_DIR).mkdir(parents=True, exist_ok=True)

    cmd = [
        "trtllm-convert-onnx",
        "--onnx_path", ONNX_PATH,
        "--output_dir", OUT_DIR,
        "--dtype", "float16",
        "--use_fp16"
    ]

    print("🔧 Running:", " ".join(cmd))
    subprocess.run(cmd, check=True)
    print("✅ ONNX → TRTLLM checkpoint conversion complete!")

if __name__ == "__main__":
    main()