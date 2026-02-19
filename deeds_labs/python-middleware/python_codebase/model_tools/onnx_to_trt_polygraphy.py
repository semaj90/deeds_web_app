#!/usr/bin/env python3
"""
Convert ONNX model to TensorRT engine using Polygraphy
"""
import subprocess
import sys
from pathlib import Path

def convert_onnx_to_trt():
    # Paths
    onnx_path = Path("/workspace/onnx_models/gemma_3_270m/gemma3.onnx")
    engine_path = Path("/workspace/engines/gemma_3_270m/gemma3.engine")

    # Ensure input exists
    if not onnx_path.exists():
        print(f"ERROR: ONNX model not found at {onnx_path}")
        sys.exit(1)

    # Create output directory
    engine_path.parent.mkdir(parents=True, exist_ok=True)

    # Polygraphy convert command
    cmd = [
        "/usr/local/bin/polygraphy", "convert",
        "--model-type", "onnx",
        str(onnx_path),
        "--convert-to", "trt",
        "--output", str(engine_path),
        # Optimization flags
        "--fp16",  # Use FP16 precision for better performance
        "--int8",  # Enable INT8 calibration if possible
        "--save-timing-cache", str(engine_path.parent / "timing.cache"),
        # Input shapes for dynamic batching
        "--input-shapes", "input_ids:[1,512]", "attention_mask:[1,512]",
        # TRT builder flags
        "--trt-min-shapes", "input_ids:[1,1]", "attention_mask:[1,1]",
        "--trt-opt-shapes", "input_ids:[1,512]", "attention_mask:[1,512]",
        "--trt-max-shapes", "input_ids:[1,1024]", "attention_mask:[1,1024]",
    ]

    print(f"Converting ONNX to TensorRT engine...")
    print(f"Input: {onnx_path}")
    print(f"Output: {engine_path}")
    print(f"Command: {' '.join(cmd)}")

    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True, env={
            "LD_LIBRARY_PATH": "/usr/local/tensorrt/targets/x86_64-linux-gnu/lib:$LD_LIBRARY_PATH"
        })
        print("SUCCESS: TensorRT engine created!")
        print(f"Engine size: {engine_path.stat().st_size / (1024*1024):.2f} MB")
        return True
    except subprocess.CalledProcessError as e:
        print(f"ERROR: Conversion failed with exit code {e.returncode}")
        print(f"STDOUT: {e.stdout}")
        print(f"STDERR: {e.stderr}")
        return False

if __name__ == "__main__":
    success = convert_onnx_to_trt()
    sys.exit(0 if success else 1)