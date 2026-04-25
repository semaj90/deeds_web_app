#!/usr/bin/env python3
"""
Optimized Gemma3 HuggingFace to TensorRT-LLM conversion
Handles deprecation warnings and optimizes for legal AI workloads
"""
import os
import sys
import warnings
from pathlib import Path
import argparse

# Suppress Pydantic deprecation warnings
warnings.filterwarnings("ignore", category=DeprecationWarning, module="pydantic")
warnings.filterwarnings("ignore", message=".*PydanticDeprecatedSince20.*")

# TensorRT-LLM imports
try:
    from tensorrt_llm.models.gemma.convert import convert_hf_model
    from tensorrt_llm.models.gemma.config import GemmaConfig
    from tensorrt_llm import logger
    print("✅ TensorRT-LLM imports successful")
except ImportError as e:
    print(f"❌ Failed to import TensorRT-LLM: {e}")
    sys.exit(1)

def check_source_model(model_path: str) -> bool:
    """Check if source HuggingFace model exists and is valid"""
    model_dir = Path(model_path)

    if not model_dir.exists():
        print(f"❌ Source model directory not found: {model_path}")
        return False

    # Check for required HuggingFace files
    required_files = ["config.json", "tokenizer.json"]
    model_files = [f for f in model_dir.glob("*.safetensors")] + [f for f in model_dir.glob("*.bin")]

    missing_files = []
    for req_file in required_files:
        if not (model_dir / req_file).exists():
            missing_files.append(req_file)

    if missing_files:
        print(f"⚠️  Missing required files: {missing_files}")

    if not model_files:
        print(f"❌ No model weights found (.safetensors or .bin files)")
        return False

    print(f"✅ Source model validation passed")
    print(f"   Found {len(model_files)} weight files")
    return True

def main():
    # === Optimized Config for Legal AI ===
    HF_MODEL_PATH = "/mnt/c/Users/james/Videos/deeds-web-app/model_unsloth_hf_f16"
    CHECKPOINT_DIR = "/home/james/gemma3_trtllm_checkpoint_optimized"

    print("🚀 Gemma3 TensorRT-LLM Conversion (Optimized for Legal AI)")
    print("=" * 60)

    # Validate source model
    if not check_source_model(HF_MODEL_PATH):
        return False

    # Optimized conversion parameters for legal AI workloads
    args = argparse.Namespace(
        model_dir=HF_MODEL_PATH,
        output_dir=CHECKPOINT_DIR,
        dtype="float16",  # FP16 for good performance/accuracy balance
        use_weight_only=True,  # Enable for faster inference
        weight_only_precision="int4",  # Aggressive quantization for speed
        use_smoothquant=False,  # Keep disabled for stability
        per_channel=True,  # Better quantization quality
        per_token=False,
        int8_kv_cache=False,  # Keep FP16 for better quality
        per_group=True,  # Enable for better INT4 quality
        group_size=128,  # Standard group size for INT4
        smoothquant_val=0.5,
        tp_size=1,  # Single GPU
        pp_size=1,  # No pipeline parallelism
        workers=1,  # Single worker for stability
        load_model_on_cpu=False,  # Use GPU for faster conversion
        calibrate_kv_cache=False,
        calib_dataset="cnn_dailymail",
        use_fp8=False  # Not supported on RTX 3060 Ti
    )

    print(f"📁 Source: {HF_MODEL_PATH}")
    print(f"📁 Target: {CHECKPOINT_DIR}")
    print(f"🔧 Config: FP16 + INT4 weights (optimized for legal AI)")
    print(f"🎯 Target: Sub-2ms inference on RTX 3060 Ti")
    print()

    # Create output directory
    os.makedirs(CHECKPOINT_DIR, exist_ok=True)

    # Set logging level to reduce noise
    logger.set_level("info")

    try:
        print("🔄 Starting model conversion...")
        print("   This may take several minutes...")

        # Convert HF model to TensorRT-LLM checkpoint
        convert_hf_model(args)

        print("✅ Gemma3 conversion completed successfully!")

        # Verify checkpoint files
        checkpoint_files = list(Path(CHECKPOINT_DIR).glob("*"))
        print(f"✅ Generated {len(checkpoint_files)} checkpoint files:")

        total_size_mb = 0
        for file in sorted(checkpoint_files):
            if file.is_file():
                size_mb = file.stat().st_size / (1024*1024)
                total_size_mb += size_mb
                print(f"   📄 {file.name} ({size_mb:.1f}MB)")
            else:
                print(f"   📁 {file.name}/ (directory)")

        print(f"📊 Total checkpoint size: {total_size_mb:.1f}MB")

        # Check for critical files
        critical_files = ["config.json", "rank0.safetensors"]

        missing_files = []
        for critical_file in critical_files:
            if not (Path(CHECKPOINT_DIR) / critical_file).exists():
                missing_files.append(critical_file)

        if missing_files:
            print(f"⚠️  Missing critical files: {missing_files}")
            return False
        else:
            print("✅ All critical checkpoint files present")

        # Print optimization summary
        print("\n🎯 Optimization Summary:")
        print("   • FP16 precision for good performance/accuracy balance")
        print("   • INT4 weight quantization for 4x memory reduction")
        print("   • Per-channel quantization for better quality")
        print("   • Optimized for legal document processing")
        print("   • Target: Sub-2ms inference latency")

        return True

    except Exception as e:
        print(f"❌ Conversion failed: {e}")

        # Print more detailed error info
        import traceback
        print("\n🔍 Detailed error traceback:")
        traceback.print_exc()

        # Common troubleshooting tips
        print("\n💡 Troubleshooting tips:")
        print("   • Ensure source model is complete and valid")
        print("   • Check available GPU memory")
        print("   • Try with load_model_on_cpu=True if OOM")
        print("   • Verify TensorRT-LLM installation")

        return False

if __name__ == "__main__":
    print("🚀 Starting Optimized Gemma3 TensorRT-LLM Conversion")
    print("🎯 Optimized for Legal AI Workloads")
    print()

    success = main()

    if success:
        print("\n🎉 Gemma3 TensorRT-LLM checkpoint ready!")
        print("📋 Next steps:")
        print("   1. Build TensorRT engine with trtllm-build")
        print("   2. Test inference performance")
        print("   3. Compare with Ollama Q4_K_M baseline")
        print("   4. Deploy for legal AI inference")
    else:
        print("\n❌ Conversion failed - check errors above")

    sys.exit(0 if success else 1)