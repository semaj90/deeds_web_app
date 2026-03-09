#!/usr/bin/env python3
"""
TensorRT Engine Builder for EmbeddingGemma - FP16 Version
Builds FP16 engines that are compatible with asymmetric quantization
"""

import tensorrt as trt
import numpy as np
import onnxruntime as ort
import torch
from pathlib import Path
import os

def build_fp16_tensorrt_engine(onnx_path: str, engine_path: str, max_batch_size: int = 1,
                              max_seq_len: int = 512):
    """Build FP16 TensorRT engine from ONNX model - handles asymmetric quantization"""

    print("🚀 Building FP16 TensorRT engine...")
    print(f"ONNX model: {onnx_path}")
    print(f"Engine output: {engine_path}")

    logger = trt.Logger(trt.Logger.INFO)
    builder = trt.Builder(logger)

    # Create network with explicit batch
    network = builder.create_network(1 << int(trt.NetworkDefinitionCreationFlag.EXPLICIT_BATCH))

    # Create ONNX parser
    parser = trt.OnnxParser(network, logger)

    # Parse ONNX model
    print("📋 Parsing ONNX model...")
    with open(onnx_path, 'rb') as model:
        if not parser.parse(model.read()):
            print("❌ Failed to parse ONNX model")
            for error in range(parser.num_errors):
                print(f"Parser error {error}: {parser.get_error(error)}")
            return False

    print("✅ ONNX model parsed successfully")

    # Get network info
    print(f"Network inputs: {network.num_inputs}")
    print(f"Network outputs: {network.num_outputs}")

    for i in range(network.num_inputs):
        tensor = network.get_input(i)
        print(f"Input {i}: {tensor.name}, shape: {tensor.shape}, dtype: {tensor.dtype}")

    for i in range(network.num_outputs):
        tensor = network.get_output(i)
        print(f"Output {i}: {tensor.name}, shape: {tensor.shape}, dtype: {tensor.dtype}")

    # Create optimization profile for dynamic shapes
    profile = builder.create_optimization_profile()

    # Set dynamic shapes for input_ids (batch_size, seq_len)
    input_tensor = network.get_input(0)
    profile.set_shape(input_tensor.name, (1, 1), (1, 128), (1, max_seq_len))

    # Configure builder config
    config = builder.create_builder_config()
    config.add_optimization_profile(profile)

    # Enable FP16 precision (compatible with asymmetric quantization)
    config.set_flag(trt.BuilderFlag.FP16)
    print("🎯 Using FP16 precision mode")

    # Set memory limits
    config.max_workspace_size = 2 << 30  # 2GB workspace
    print(f"💾 Max workspace: {config.max_workspace_size // (1024*1024*1024)}GB")

    # Build engine
    print("🔨 Building TensorRT engine...")
    try:
        engine = builder.build_engine(network, config)
        if engine is None:
            print("❌ Engine build returned None")
            return False

        print("✅ Engine built successfully!")

        # Save engine
        print(f"💾 Saving engine to: {engine_path}")
        with open(engine_path, 'wb') as f:
            f.write(engine.serialize())

        # Verify engine file
        engine_file = Path(engine_path)
        if engine_file.exists():
            size_mb = engine_file.stat().st_size / (1024 * 1024)
            print(f"📊 Engine file size: {size_mb:.2f} MB")
            return True
        else:
            print("❌ Engine file was not created")
            return False

    except Exception as e:
        print(f"❌ Error building engine: {e}")
        import traceback
        traceback.print_exc()
        return False

def verify_engine(engine_path: str):
    """Verify the built engine can be loaded"""
    print(f"🔍 Verifying engine: {engine_path}")

    try:
        with open(engine_path, 'rb') as f:
            engine_data = f.read()

        logger = trt.Logger(trt.Logger.WARNING)
        runtime = trt.Runtime(logger)
        engine = runtime.deserialize_cuda_engine(engine_data)

        if engine is None:
            print("❌ Failed to deserialize engine")
            return False

        print("✅ Engine verification successful!")
        print(f"🏗️  Engine has {engine.num_bindings} bindings")

        for i in range(engine.num_bindings):
            name = engine.get_binding_name(i)
            shape = engine.get_binding_shape(i)
            dtype = engine.get_binding_dtype(i)
            is_input = engine.binding_is_input(i)
            print(f"  {'Input' if is_input else 'Output'} {i}: {name}, shape: {shape}, dtype: {dtype}")

        return True

    except Exception as e:
        print(f"❌ Engine verification failed: {e}")
        return False

def main():
    # Use the correct model path from the container
    model_dir = "/workspace/models/embeddinggemma_300m_onnx"
    onnx_path = f"{model_dir}/model.onnx"
    engine_path = "/workspace/models/embeddinggemma_300m_fp16.engine"

    print("🎯 Starting EmbeddingGemma FP16 TensorRT Engine Build")
    print("=" * 60)

    # Check if ONNX model exists
    if not Path(onnx_path).exists():
        print(f"❌ ONNX model not found: {onnx_path}")
        return

    # Build TensorRT engine
    success = build_fp16_tensorrt_engine(onnx_path, engine_path)

    if success:
        print("\n🎉 TensorRT engine built successfully!")
        verify_engine(engine_path)
    else:
        print("\n💥 Failed to build TensorRT engine")
        print("This might be due to:")
        print("  - Asymmetric quantization in ONNX model")
        print("  - Unsupported operations in the model")
        print("  - Memory or GPU constraints")

if __name__ == "__main__":
    main()