#!/usr/bin/env python3
"""
Test TensorRT engine inference for Gemma 3 270M
"""
import numpy as np
import tensorrt as trt
import torch
from pathlib import Path

def test_trt_engine():
    engine_path = Path("/workspace/engines/gemma_3_270m/gemma3.engine")

    if not engine_path.exists():
        print(f"ERROR: Engine not found at {engine_path}")
        return False

    print(f"Loading TensorRT engine: {engine_path}")
    print(f"Engine size: {engine_path.stat().st_size / (1024*1024):.2f} MB")

    # Load engine
    with open(engine_path, "rb") as f:
        engine_data = f.read()

    # Create runtime
    logger = trt.Logger(trt.Logger.WARNING)
    runtime = trt.Runtime(logger)

    try:
        engine = runtime.deserialize_cuda_engine(engine_data)
        print("SUCCESS: Engine loaded successfully!")
        print(f"Number of I/O tensors: {engine.num_io_tensors}")

        # Print tensor information
        for i in range(engine.num_io_tensors):
            name = engine.get_tensor_name(i)
            mode = engine.get_tensor_mode(name)
            shape = engine.get_tensor_shape(name)
            dtype = engine.get_tensor_dtype(name)
            print(f"  Tensor {i}: {name} - Mode: {mode}, Shape: {shape}, Dtype: {dtype}")

        # Try to get profile information
        try:
            num_profiles = engine.num_optimization_profiles
            print(f"Number of optimization profiles: {num_profiles}")
            if num_profiles > 0:
                profile = engine.get_profile_shape(0, engine.get_tensor_name(0))
                print(f"Profile 0 shape: {profile}")
        except:
            print("Could not retrieve optimization profile information")

        return True

    except Exception as e:
        print(f"ERROR: Failed to load engine: {e}")
        return False

if __name__ == "__main__":
    success = test_trt_engine()
    print(f"\nTest {'PASSED' if success else 'FAILED'}")