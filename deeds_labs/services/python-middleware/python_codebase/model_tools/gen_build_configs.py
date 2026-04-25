#!/usr/bin/env python3
import subprocess
from pathlib import Path

CKPT_DIR = "/workspace/trtllm_ckpts/gemma3_270m"
BUILD_CONFIG_DIR = "/workspace/build_configs/gemma3_270m"

def main():
    Path(BUILD_CONFIG_DIR).mkdir(parents=True, exist_ok=True)

    cmd = [
        "trtllm-build",
        "--checkpoint_dir", CKPT_DIR,
        "--output_dir", BUILD_CONFIG_DIR,
        "--max_batch_size", "1",
        "--max_input_len", "1024",
        "--max_seq_len", "2048",
        "--dtype", "float16",
        "--dry_run",   # <-- generates model_config.json & build_config.json
    ]

    print("🛠️  Running:", " ".join(cmd))
    subprocess.run(cmd, check=True)
    print("✅ model_config.json & build_config.json generated!")

if __name__ == "__main__":
    main()