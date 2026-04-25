#!/usr/bin/env python3
import subprocess
from pathlib import Path

CKPT_DIR = "/workspace/trtllm_ckpts/gemma3_270m"
CFG_DIR  = "/workspace/build_configs/gemma3_270m"
OUT_DIR  = "/workspace/trt_engines/gemma3_270m"

def main():
    Path(OUT_DIR).mkdir(parents=True, exist_ok=True)

    cmd = [
        "trtllm-build",
        "--checkpoint_dir", CKPT_DIR,
        "--model_config", f"{CFG_DIR}/model_config.json",
        "--build_config", f"{CFG_DIR}/build_config.json",
        "--output_dir", OUT_DIR,
    ]

    print("🚀 Building engine:", " ".join(cmd))
    subprocess.run(cmd, check=True)
    print("🎉 Engine build complete!")
    print("📁 Engine stored at:", OUT_DIR)

if __name__ == "__main__":
    main()