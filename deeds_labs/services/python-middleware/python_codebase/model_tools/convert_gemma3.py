#!/usr/bin/env python3
"""
Convert Gemma3 checkpoint to TensorRT engine
"""

import os
import sys

# Set up library paths
lib_paths = [
    "/home/james/trt_env_310/lib/python3.10/site-packages/nvidia/cusparselt/lib",
    "/home/james/trt_env_310/lib/python3.10/site-packages/nvidia/cudnn/lib",
    "/home/james/trt_env_310/lib/python3.10/site-packages/nvidia/cublas/lib",
    "/home/james/trt_env_310/lib/python3.10/site-packages/nvidia/cuda_runtime/lib",
    "/home/james/trt_env_310/lib/python3.10/site-packages/tensorrt_libs"
]

os.environ["LD_LIBRARY_PATH"] = ":".join(lib_paths) + ":" + os.environ.get("LD_LIBRARY_PATH", "")

# Add TensorRT-LLM to path
sys.path.insert(0, "/home/james/trt_env_310/lib/python3.10/site-packages")

def main():
    print("=== Gemma3 TensorRT Conversion ===")

    checkpoint_dir = "/home/james/gemma3_trt_ready"
    output_dir = "/home/james/gemma3_trt_engine"

    # Create output directory
    os.makedirs(output_dir, exist_ok=True)

    try:
        # Use subprocess to call trtllm-build
        import subprocess

        cmd = [
            "/home/james/trt_env_310/bin/trtllm-build",
            "--checkpoint_dir", checkpoint_dir,
            "--output_dir", output_dir,
            "--gemm_plugin", "float16",
            "--max_batch_size", "8",
            "--max_input_len", "2048",
            "--max_output_len", "2048",
            "--max_beam_width", "1"
        ]

        print(f"Running: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True, env=os.environ)

        if result.returncode == 0:
            print("✅ Build successful!")
            print(result.stdout)
        else:
            print("❌ Build failed:")
            print(result.stderr)
            return 1

    except Exception as e:
        print(f"Error: {e}")

        # Try alternative method
        print("\nTrying alternative Python API method...")
        try:
            from tensorrt_llm import Builder
            from tensorrt_llm.models import GemmaForCausalLM

            # Load model and build
            print("Loading checkpoint...")
            model = GemmaForCausalLM.from_checkpoint(checkpoint_dir)

            print("Building engine...")
            builder = Builder()
            engine = builder.build_engine(model, output_dir)

            print("✅ Engine built successfully!")

        except Exception as e2:
            print(f"Alternative method also failed: {e2}")
            return 1

    # Check output
    print("\nChecking output directory:")
    for f in os.listdir(output_dir):
        size = os.path.getsize(os.path.join(output_dir, f))
        print(f"  {f}: {size:,} bytes")

    return 0

if __name__ == "__main__":
    sys.exit(main())