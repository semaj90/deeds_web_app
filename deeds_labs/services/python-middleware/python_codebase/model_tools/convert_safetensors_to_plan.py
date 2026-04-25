#!/usr/bin/env python3
"""
Convert Gemma3 safetensors to TensorRT .plan engine files
"""

import os
import sys
from pathlib import Path

def main():
    # Use current working directory for source models
    current_dir = os.getcwd()
    model_dir = os.path.join(current_dir, "model_unsloth_hf_f16")
    output_dir = os.path.join(current_dir, "gemma3_trt_checkpoint")
    engine_dir = os.path.join(current_dir, "gemma3_engines")

    print("🚀 Gemma3 Safetensors to TensorRT .plan Conversion")
    print("=" * 55)
    print(f"Source model: {model_dir}")
    print(f"TRT checkpoint: {output_dir}")
    print(f"Engine output: {engine_dir}")

    # Check if source model exists
    if not os.path.exists(model_dir):
        print(f"❌ Model directory not found: {model_dir}")
        return False

    # Check safetensor files
    safetensor_files = [f for f in os.listdir(model_dir) if f.endswith('.safetensors') and 'model-' in f]
    print(f"Found {len(safetensor_files)} safetensor files")

    # Create output directories
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    Path(engine_dir).mkdir(parents=True, exist_ok=True)

    print("\n📦 Step 1: Combining safetensor shards...")

    try:
        from safetensors.torch import load_file, save_file

        # Load all shards
        combined_weights = {}
        for shard_file in sorted(safetensor_files):
            if os.path.islink(os.path.join(model_dir, shard_file)):
                continue  # Skip symlinks

            shard_path = os.path.join(model_dir, shard_file)
            print(f"Loading {shard_file}...")

            weights = load_file(shard_path)
            combined_weights.update(weights)
            print(f"  ✅ {len(weights)} tensors loaded")

        # Save combined weights
        rank0_file = os.path.join(output_dir, "rank0.safetensors")
        print(f"\n💾 Saving combined rank0.safetensors...")
        save_file(combined_weights, rank0_file)

        file_size = os.path.getsize(rank0_file) / (1024**3)
        print(f"✅ Combined file saved: {file_size:.1f}GB")

        # Copy config
        import shutil
        config_src = os.path.join(model_dir, "config.json")
        config_dst = os.path.join(output_dir, "config.json")
        shutil.copy2(config_src, config_dst)
        print("✅ Config copied")

    except ImportError:
        print("❌ safetensors not available, installing...")
        os.system("pip install safetensors")
        return main()
    except Exception as e:
        print(f"❌ Error combining shards: {e}")
        return False

    print("\n🔧 Step 2: Building TensorRT engine...")
    print("This may take 30-60 minutes...")

    # Build TensorRT engine command
    build_cmd = f"""
    trtllm-build \\
      --checkpoint_dir {output_dir} \\
      --output_dir {engine_dir} \\
      --max_batch_size 4 \\
      --max_input_len 2048 \\
      --max_seq_len 4096 \\
      --gemm_plugin float16 \\
      --gpt_attention_plugin float16 \\
      --remove_input_padding enable \\
      --log_level info
    """

    print("Running TensorRT build command:")
    print(build_cmd)

    result = os.system(build_cmd)

    if result == 0:
        print("\n🎉 TensorRT engine build complete!")
        print(f"Engine files created in: {engine_dir}")

        # List engine files
        engine_files = os.listdir(engine_dir)
        print("Generated files:")
        for f in engine_files:
            size = os.path.getsize(os.path.join(engine_dir, f)) / (1024**2)
            print(f"  {f} ({size:.1f}MB)")

        return True
    else:
        print("❌ TensorRT engine build failed")
        return False

if __name__ == "__main__":
    success = main()
    if success:
        print("\n✅ Conversion complete! Ready for 2-10x faster inference!")
        sys.exit(0)
    else:
        print("\n❌ Conversion failed!")
        sys.exit(1)