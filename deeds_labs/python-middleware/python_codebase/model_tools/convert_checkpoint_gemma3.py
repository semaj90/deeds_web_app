#!/usr/bin/env python3
"""
Convert Gemma3 HuggingFace model to TensorRT-LLM checkpoint using convert_checkpoint.py
Alternative approach to resolve weight mapping issues
"""
import os
import subprocess
import sys
from pathlib import Path

def main():
    # === Config ===
    HF_MODEL_PATH = "/mnt/c/Users/james/Videos/deeds-web-app/model_unsloth_hf_f16"
    CHECKPOINT_DIR = "/home/james/gemma3_trtllm_checkpoint"

    # TensorRT-LLM environment
    PYTHON_ENV = "/home/james/trt_env_310/bin/python"

    print(f"🔹 Converting HF model to TensorRT checkpoint...")
    print(f"🔹 Source: {HF_MODEL_PATH}")
    print(f"🔹 Target: {CHECKPOINT_DIR}")

    # Create checkpoint directory
    os.makedirs(CHECKPOINT_DIR, exist_ok=True)

    # Build convert_checkpoint command
    convert_cmd = [
        PYTHON_ENV, "-m", "tensorrt_llm.commands.convert_checkpoint",
        "--model_dir", HF_MODEL_PATH,
        "--output_dir", CHECKPOINT_DIR,
        "--dtype", "float16",
        "--tp_size", "1",  # Single GPU
        "--pp_size", "1",  # No pipeline parallelism
    ]

    print(f"🔹 Running conversion command...")
    print(f"Command: {' '.join(convert_cmd)}")

    try:
        result = subprocess.run(
            convert_cmd,
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout
        )

        if result.returncode == 0:
            print("✅ Checkpoint conversion successful!")
            print(f"✅ Checkpoint saved to: {CHECKPOINT_DIR}")

            # Verify checkpoint files
            checkpoint_files = list(Path(CHECKPOINT_DIR).glob("*"))
            print(f"✅ Generated {len(checkpoint_files)} checkpoint files")

            # List key files
            for file in sorted(checkpoint_files)[:10]:
                size_mb = file.stat().st_size / (1024*1024) if file.is_file() else 0
                print(f"   {file.name} ({size_mb:.1f}MB)")

            return True

        else:
            print("❌ Checkpoint conversion failed!")
            print(f"Return code: {result.returncode}")
            print(f"STDOUT:\n{result.stdout}")
            print(f"STDERR:\n{result.stderr}")
            return False

    except subprocess.TimeoutExpired:
        print("❌ Conversion timed out after 5 minutes")
        return False
    except Exception as e:
        print(f"❌ Conversion error: {e}")
        return False

if __name__ == "__main__":
    success = main()
    if success:
        print("\n🎉 Ready for TensorRT engine building!")
        print("Next: Use build-trt-engines.sh to create .plan files")
    else:
        print("\n💡 Troubleshooting needed for checkpoint conversion")

    sys.exit(0 if success else 1)