#!/usr/bin/env python3
"""
Google Colab TensorRT-LLM Legal AI Conversion Script
Fixes xFormers/Unsloth issues and handles 5-shard models properly
"""

import os
import sys
import json
import subprocess
from pathlib import Path

def setup_environment():
    """Fix xFormers/Unsloth compatibility issues"""
    print("Setting up environment for TensorRT-LLM conversion")

    # Fix xFormers compatibility
    print("📦 Fixing xFormers compatibility")
    try:
        subprocess.run([
            sys.executable, "-m", "pip", "uninstall", "-y", "xformers"
        ], check=False, capture_output=True)

        subprocess.run([
            sys.executable, "-m", "pip", "install",
            "xformers==0.0.21", "--no-deps"
        ], check=True)
        print("✅ xFormers fixed")
    except subprocess.CalledProcessError as e:
        print(f"⚠️  xFormers fix failed: {e}")

    # Install TensorRT-LLM if not present
    try:
        import tensorrt_llm
        print("✅ TensorRT-LLM already installed")
    except ImportError:
        print("📥 Installing TensorRT-LLM")
        subprocess.run([
            sys.executable, "-m", "pip", "install",
            "tensorrt-llm==0.7.0",
            "--extra-index-url", "https://pypi.nvidia.com"
        ], check=True)

def find_conversion_script():
    """Locate the correct TensorRT-LLM conversion script"""
    possible_paths = [
        "/content/TensorRT-LLM/examples/llama/convert_checkpoint.py",
        "/content/TensorRT-LLM/examples/gemma/convert_checkpoint.py",
        "/content/TensorRT-LLM/examples/convert_checkpoint.py",
        "/usr/local/lib/python3.10/dist-packages/tensorrt_llm/examples/llama/convert_checkpoint.py",
        "/opt/conda/lib/python3.10/site-packages/tensorrt_llm/examples/llama/convert_checkpoint.py"
    ]

    for path in possible_paths:
        if os.path.exists(path):
            print(f"✅ Found conversion script: {path}")
            return path

    print("❌ Conversion script not found. Available examples:")
    examples_dir = "/content/TensorRT-LLM/examples"
    if os.path.exists(examples_dir):
        for item in os.listdir(examples_dir):
            item_path = os.path.join(examples_dir, item)
            if os.path.isdir(item_path):
                scripts = [f for f in os.listdir(item_path) if f.endswith('.py')]
                if scripts:
                    print(f"  📁 {item}/: {', '.join(scripts)}")

    return None

def merge_unsloth_shards(model_dir, output_path):
    """Merge Unsloth 5-shard model into single safetensors file"""
    print(f"🔗 Merging Unsloth shards from {model_dir}")

    import torch
    import safetensors.torch
    from safetensors import safe_open

    # Find all shard files
    shard_files = []
    for i in range(1, 6):  # Unsloth typically uses 5 shards
        shard_path = os.path.join(model_dir, f"model-{i:05d}-of-00005.safetensors")
        if os.path.exists(shard_path):
            shard_files.append(shard_path)

    if not shard_files:
        # Try alternative naming
        for file in os.listdir(model_dir):
            if file.endswith('.safetensors'):
                shard_files.append(os.path.join(model_dir, file))

    if not shard_files:
        raise FileNotFoundError(f"No safetensors files found in {model_dir}")

    print(f"📦 Found {len(shard_files)} shard files")

    # Merge all shards
    merged_state_dict = {}
    for shard_file in sorted(shard_files):
        print(f"   Loading {os.path.basename(shard_file)}")
        with safe_open(shard_file, framework="pt") as f:
            for key in f.keys():
                if key in merged_state_dict:
                    print(f"⚠️  Duplicate key found: {key}")
                merged_state_dict[key] = f.get_tensor(key)

    # Save merged model
    print(f"💾 Saving merged model to {output_path}")
    safetensors.torch.save_file(merged_state_dict, output_path)

    # Verify
    file_size = os.path.getsize(output_path) / (1024**3)
    print(f"✅ Merged model: {file_size:.1f}GB")

    return output_path

def convert_with_tensorrt_llm(model_path, output_dir):
    """Convert using TensorRT-LLM build command optimized for RTX 3060 Ti"""
    print(f"🚀 Converting {model_path} to TensorRT-LLM engine")

    # Create checkpoint directory
    checkpoint_dir = os.path.join(output_dir, "checkpoint")
    engine_dir = os.path.join(output_dir, "engine")
    os.makedirs(checkpoint_dir, exist_ok=True)
    os.makedirs(engine_dir, exist_ok=True)

    # Find conversion script
    conversion_script = find_conversion_script()
    if not conversion_script:
        print("❌ No conversion script found")
        return False

    # Step 1: Convert to TensorRT-LLM checkpoint
    print("📝 Step 1: Converting to TensorRT-LLM checkpoint")
    convert_cmd = [
        sys.executable, conversion_script,
        "--model_dir", os.path.dirname(model_path),
        "--output_dir", checkpoint_dir,
        "--dtype", "float16",
        "--use_weight_only",
        "--weight_only_precision", "int4"
    ]

    try:
        result = subprocess.run(convert_cmd, check=True, capture_output=True, text=True)
        print("✅ Checkpoint conversion completed")
    except subprocess.CalledProcessError as e:
        print(f"❌ Checkpoint conversion failed: {e}")
        print(f"stdout: {e.stdout}")
        print(f"stderr: {e.stderr}")
        return False

    # Step 2: Build TensorRT engine optimized for RTX 3060 Ti
    print("🔨 Step 2: Building TensorRT engine (RTX 3060 Ti optimized)")

    build_cmd = [
        "trtllm-build",
        "--checkpoint_dir", checkpoint_dir,
        "--output_dir", engine_dir,
        "--max_batch_size", "2",
        "--max_input_len", "2048",
        "--max_seq_len", "4096",
        "--gpt_attention_plugin", "float16",
        "--gemm_plugin", "float16",
        "--context_fmha", "enable",
        "--use_paged_kv_cache",
        "--enable_cuda_graph",
        "--enable_fp16_qdq",
        "--enable_remove_input_padding",
        "--weight_only_precision", "int4",
        "--builder_opt", "memory_pool_limit:workspace=4096MiB"
    ]

    try:
        result = subprocess.run(build_cmd, check=True, capture_output=True, text=True)
        print("✅ TensorRT engine build completed")

        # Create legal AI configuration
        create_legal_config(engine_dir)

        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Engine build failed: {e}")
        print(f"stdout: {e.stdout}")
        print(f"stderr: {e.stderr}")
        return False

def create_legal_config(engine_dir):
    """Create legal AI specific configuration"""
    config = {
        "legal_ai_config": {
            "optimized_for": "RTX_3060_Ti",
            "use_case": "evidence_analysis",
            "max_evidence_batch": 2,
            "legal_context_window": 4096,
            "specialized_prompts": {
                "evidence_analysis": "Analyze legal evidence with focus on admissibility and chain of custody.",
                "case_research": "Research legal precedents and statutory requirements.",
                "document_review": "Review legal documents for compliance and risk assessment."
            }
        },
        "performance_targets": {
            "inference_latency_ms": "40-60",
            "throughput_tokens_per_sec": "20-30",
            "memory_usage_gb": "6-7",
            "batch_size": 2
        }
    }

    config_path = os.path.join(engine_dir, "legal_ai_config.json")
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)

    print(f"📋 Legal AI config saved: {config_path}")

def main():
    """Main conversion pipeline for Colab"""
    print("🏛️  Legal AI TensorRT-LLM Converter (Colab)")
    print("=" * 60)

    # Configuration
    MODEL_DIR = "/content/legal_model"  # Your Unsloth model directory
    OUTPUT_DIR = "/content/tensorrt_legal_engine"
    MERGED_MODEL_PATH = "/content/model_merged.safetensors"

    try:
        # Step 1: Setup environment
        setup_environment()

        # Step 2: Merge shards
        print("\n" + "="*50)
        if os.path.exists(MODEL_DIR):
            merge_unsloth_shards(MODEL_DIR, MERGED_MODEL_PATH)
        else:
            print(f"❌ Model directory not found: {MODEL_DIR}")
            print("Update MODEL_DIR variable to point to your Unsloth model")
            return 1

        # Step 3: Convert to TensorRT
        print("\n" + "="*50)
        if convert_with_tensorrt_llm(MERGED_MODEL_PATH, OUTPUT_DIR):
            print("\n✨ Legal AI TensorRT-LLM conversion completed!")
            print(f"📁 Engine location: {OUTPUT_DIR}/engine")
            print("\n🚀 Ready for deployment on RTX 3060 Ti!")

            # Show file sizes
            engine_files = os.listdir(os.path.join(OUTPUT_DIR, "engine"))
            print(f"\n📊 Engine files: {len(engine_files)} files")
            for file in engine_files:
                if file.endswith('.plan'):
                    size = os.path.getsize(os.path.join(OUTPUT_DIR, "engine", file)) / (1024**3)
                    print(f"   🎯 {file}: {size:.2f}GB")

            return 0
        else:
            print("\n❌ Conversion failed")
            return 1

    except Exception as e:
        print(f"\n💥 Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == '__main__':
    sys.exit(main())