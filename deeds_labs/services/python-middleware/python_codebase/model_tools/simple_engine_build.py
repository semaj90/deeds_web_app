#!/usr/bin/env python3
"""
Simple TensorRT engine build for Gemma3
"""

import os
import sys
import subprocess
import json

def main():
    print("=== Simple Gemma3 TensorRT Engine Build ===\n")

    # Set up paths
    checkpoint_dir = "/home/james/gemma3_trtllm_checkpoint"
    engine_dir = "/home/james/gemma3_trt_engine"

    # Create engine directory
    os.makedirs(engine_dir, exist_ok=True)

    # Check checkpoint config
    with open(f"{checkpoint_dir}/config.json", "r") as f:
        config = json.load(f)

    print(f"Model config: {config.get('model_type', 'unknown')}")
    print(f"Hidden size: {config.get('hidden_size', 'unknown')}")
    print(f"Num layers: {config.get('num_hidden_layers', 'unknown')}")

    # Try different build approaches
    build_commands = [
        # Command 1: Basic build
        [
            "trtllm-build",
            "--checkpoint_dir", checkpoint_dir,
            "--output_dir", engine_dir,
            "--max_batch_size", "4",
            "--max_input_len", "1024",
            "--max_output_len", "1024"
        ],
        # Command 2: With dtype specification
        [
            "trtllm-build",
            "--checkpoint_dir", checkpoint_dir,
            "--output_dir", engine_dir,
            "--dtype", "float16",
            "--max_batch_size", "4",
            "--max_input_len", "1024",
            "--max_output_len", "1024"
        ],
        # Command 3: Minimal config
        [
            "trtllm-build",
            "--checkpoint_dir", checkpoint_dir,
            "--output_dir", engine_dir,
            "--max_batch_size", "1",
            "--max_input_len", "512",
            "--max_output_len", "512"
        ]
    ]

    for i, cmd in enumerate(build_commands, 1):
        print(f"\nAttempt {i}: {' '.join(cmd)}")
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

            if result.returncode == 0:
                print("✅ Build successful!")
                print(result.stdout[-500:] if len(result.stdout) > 500 else result.stdout)
                break
            else:
                print(f"❌ Build failed (return code {result.returncode})")
                if result.stderr:
                    print("STDERR:", result.stderr[-500:])
                if result.stdout:
                    print("STDOUT:", result.stdout[-500:])

        except subprocess.TimeoutExpired:
            print("⏰ Build timed out after 5 minutes")
        except Exception as e:
            print(f"Error running command: {e}")

    # Check if any engine was created
    if os.path.exists(engine_dir):
        files = [f for f in os.listdir(engine_dir) if os.path.isfile(os.path.join(engine_dir, f))]
        if files:
            print(f"\n📁 Engine directory contents:")
            for f in files:
                size = os.path.getsize(os.path.join(engine_dir, f))
                print(f"  {f}: {size:,} bytes")

            engine_files = [f for f in files if f.endswith('.engine')]
            if engine_files:
                print(f"\n✅ SUCCESS: Found {len(engine_files)} engine file(s)!")
                return 0
        else:
            print("\n📁 Engine directory is empty")
    else:
        print("\n❌ Engine directory was not created")

    print("\n❌ No TensorRT engine was created")
    return 1

if __name__ == "__main__":
    sys.exit(main())