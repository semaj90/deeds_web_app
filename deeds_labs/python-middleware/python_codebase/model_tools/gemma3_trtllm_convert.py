#!/usr/bin/env python3
"""
Convert Gemma3 HuggingFace model to TensorRT-LLM checkpoint using proper APIs
Uses tensorrt_llm.models.gemma.convert functions
"""
import os
import sys
import warnings
from pathlib import Path
import argparse

# Suppress Pydantic deprecation warnings
warnings.filterwarnings("ignore", category=DeprecationWarning)
warnings.filterwarnings("ignore", message=".*swigvarlink.*")

# TensorRT-LLM imports
from tensorrt_llm.models.gemma.convert import convert_hf_model
from tensorrt_llm.models.gemma.config import GemmaConfig
from tensorrt_llm import logger

def main():
    # === Config ===
    HF_MODEL_PATH = "/mnt/c/Users/james/Videos/deeds-web-app/model_unsloth_hf_f16"
    CHECKPOINT_DIR = "/home/james/gemma3_trtllm_checkpoint"

    # Conversion parameters - Fixed for INT4
    args = argparse.Namespace(
        model_dir=HF_MODEL_PATH,
        output_dir=CHECKPOINT_DIR,
        dtype="float16",
        use_weight_only=True,  # Enable weight-only quantization
        weight_only_precision="int4",  # Use INT4 for maximum speed
        use_smoothquant=False,
        per_channel=True,  # Better quality for weight-only
        per_token=False,
        int8_kv_cache=False,
        per_group=True,  # Required for INT4
        group_size=128,
        smoothquant_val=0.5,
        tp_size=1,
        pp_size=1,
        workers=1,
        load_model_on_cpu=True,  # Avoid OOM during conversion
        calibrate_kv_cache=False,
        calib_dataset="cnn_dailymail",
        use_fp8=False
    )

    print(f"🔹 Converting Gemma3 HuggingFace model to TensorRT-LLM...")
    print(f"🔹 Source: {HF_MODEL_PATH}")
    print(f"🔹 Target: {CHECKPOINT_DIR}")
    print(f"🔹 Data type: {args.dtype}")
    print(f"🔹 Weight quantization: INT4 (for maximum speed)")
    print(f"🔹 Tensor parallel size: {args.tp_size}")

    # Create output directory
    os.makedirs(CHECKPOINT_DIR, exist_ok=True)

    # Set logging level
    logger.set_level("info")

    try:
        # Load Gemma configuration from HF model
        print("🔹 Loading Gemma configuration...")

        # Convert HF model to TensorRT-LLM checkpoint
        print("🔹 Starting model conversion...")
        convert_hf_model(args)

        print("✅ Gemma3 conversion completed successfully!")

        # Verify checkpoint files
        checkpoint_files = list(Path(CHECKPOINT_DIR).glob("*"))
        print(f"✅ Generated {len(checkpoint_files)} checkpoint files:")

        for file in sorted(checkpoint_files):
            if file.is_file():
                size_mb = file.stat().st_size / (1024*1024)
                print(f"   {file.name} ({size_mb:.1f}MB)")
            else:
                print(f"   {file.name} (directory)")

        # Check for critical files
        critical_files = [
            "config.json",
            "rank0.safetensors"
        ]

        missing_files = []
        for critical_file in critical_files:
            if not (Path(CHECKPOINT_DIR) / critical_file).exists():
                missing_files.append(critical_file)

        if missing_files:
            print(f"⚠️  Missing files: {missing_files}")
        else:
            print("✅ All critical checkpoint files present")

        return True

    except Exception as e:
        print(f"❌ Conversion failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("Starting Gemma3 TensorRT-LLM conversion...")

    success = main()

    if success:
        print("\n🎉 Gemma3 TensorRT-LLM checkpoint ready!")
        print("Next steps:")
        print("1. Use trtllm-build to create engine")
        print("2. Test inference performance")
        print("3. Compare with Ollama baseline")
    else:
        print("\n💡 Conversion failed - check errors above")

    sys.exit(0 if success else 1)