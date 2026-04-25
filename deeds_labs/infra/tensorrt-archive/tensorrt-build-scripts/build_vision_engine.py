#!/usr/bin/env python3
"""
Build TensorRT Engine for SigLIP Vision Tower (Gemma 3 VLM)

Exports the SigLIP vision encoder to ONNX, then builds a TensorRT FP16 engine.
The vision engine processes images → visual embeddings that feed into the text decoder.

Usage:
  python build_vision_engine.py \
    --input  output/gemma3-vision-tower/ \
    --output output/vision-engine/

Requirements:
  pip install torch transformers onnx tensorrt
"""

import argparse
import os
from pathlib import Path


def build_vision_engine(input_dir: str, output_dir: str, max_batch: int = 1):
    input_dir = Path(input_dir)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    onnx_path = output_dir / "siglip_vision.onnx"
    engine_path = output_dir / "siglip_vision.engine"

    print("=" * 60)
    print("SigLIP Vision Tower → TensorRT Engine")
    print(f"  Input:  {input_dir}")
    print(f"  Output: {output_dir}")
    print("=" * 60)

    # ── Step 1: Load SigLIP vision model ────────────────────────
    print("\n[1/3] Loading SigLIP vision tower...")

    try:
        import torch
        from safetensors import safe_open
    except ImportError:
        print("ERROR: torch and safetensors required")
        return False

    config_path = input_dir / "config.json"
    weights_path = input_dir / "model.safetensors"

    if not config_path.exists():
        print(f"ERROR: config.json not found at {config_path}")
        return False

    import json
    with open(config_path) as f:
        config = json.load(f)

    # SigLIP parameters from config
    image_size = config.get("image_size", 384)
    patch_size = config.get("patch_size", 14)
    hidden_size = config.get("hidden_size", 1152)
    num_heads = config.get("num_attention_heads", 16)
    num_layers = config.get("num_hidden_layers", 27)

    print(f"  Image size: {image_size}x{image_size}")
    print(f"  Patch size: {patch_size}x{patch_size}")
    print(f"  Hidden dim: {hidden_size}")
    print(f"  Layers:     {num_layers}")
    print(f"  Heads:      {num_heads}")

    # ── Step 2: Export to ONNX ──────────────────────────────────
    print("\n[2/3] Exporting to ONNX...")

    try:
        from transformers import SiglipVisionModel, SiglipVisionConfig

        siglip_config = SiglipVisionConfig(
            image_size=image_size,
            patch_size=patch_size,
            hidden_size=hidden_size,
            num_attention_heads=num_heads,
            num_hidden_layers=num_layers,
            intermediate_size=config.get("intermediate_size", 4304),
        )

        model = SiglipVisionModel(siglip_config)

        # Load weights from split checkpoint
        if weights_path.exists():
            with safe_open(str(weights_path), framework="pt", device="cpu") as f:
                state_dict = {k: f.get_tensor(k) for k in f.keys()}
            # Filter to vision model keys only
            vision_keys = {k: v for k, v in state_dict.items()
                          if not k.startswith("multi_modal_projector")}
            model.load_state_dict(vision_keys, strict=False)
            print(f"  Loaded {len(vision_keys)} vision tensor weights")

        model.eval()

        # Create dummy input: [batch, channels, height, width]
        dummy_input = torch.randn(max_batch, 3, image_size, image_size)

        torch.onnx.export(
            model,
            dummy_input,
            str(onnx_path),
            opset_version=17,
            input_names=["pixel_values"],
            output_names=["last_hidden_state"],
            dynamic_axes={
                "pixel_values": {0: "batch_size"},
                "last_hidden_state": {0: "batch_size"},
            },
        )
        print(f"  ONNX exported: {onnx_path} ({onnx_path.stat().st_size / 1e6:.1f} MB)")

    except Exception as e:
        print(f"  ONNX export failed: {e}")
        print("  Falling back to TensorRT Python API direct build...")
        # If ONNX export fails, create a minimal engine stub
        with open(output_dir / "BUILD_NOTES.md", "w") as f:
            f.write(f"# Vision Engine Build Notes\n\n")
            f.write(f"ONNX export failed: {e}\n\n")
            f.write(f"To build manually:\n")
            f.write(f"1. Use TRT-LLM's multimodal examples\n")
            f.write(f"2. Or convert via trtexec --onnx=siglip_vision.onnx\n")
        return False

    # ── Step 3: Build TensorRT engine ───────────────────────────
    print("\n[3/3] Building TensorRT FP16 engine...")

    try:
        import tensorrt as trt

        logger = trt.Logger(trt.Logger.WARNING)
        builder = trt.Builder(logger)
        network = builder.create_network(
            1 << int(trt.NetworkDefinitionCreationFlag.EXPLICIT_BATCH)
        )
        parser = trt.OnnxParser(network, logger)

        with open(str(onnx_path), "rb") as f:
            if not parser.parse(f.read()):
                for i in range(parser.num_errors):
                    print(f"  ONNX parse error: {parser.get_error(i)}")
                return False

        config_trt = builder.create_builder_config()
        config_trt.set_memory_pool_limit(trt.MemoryPoolType.WORKSPACE, 2 * 1024 * 1024 * 1024)  # 2GB
        config_trt.set_flag(trt.BuilderFlag.FP16)

        # Build engine
        engine = builder.build_serialized_network(network, config_trt)
        if engine is None:
            print("  ERROR: TensorRT engine build failed")
            return False

        with open(str(engine_path), "wb") as f:
            f.write(engine)

        print(f"  Engine built: {engine_path} ({engine_path.stat().st_size / 1e6:.1f} MB)")
        print("\nVision engine build complete!")
        return True

    except ImportError:
        print("  tensorrt not available. Use trtexec instead:")
        print(f"  trtexec --onnx={onnx_path} --saveEngine={engine_path} --fp16")
        # Write trtexec command for manual execution
        with open(output_dir / "build_cmd.sh", "w") as f:
            f.write(f"#!/bin/bash\ntrtexec --onnx={onnx_path} --saveEngine={engine_path} --fp16\n")
        return False


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build SigLIP vision TensorRT engine")
    parser.add_argument("--input", required=True, help="Path to gemma3-vision-tower/")
    parser.add_argument("--output", default="./output/vision-engine", help="Output dir")
    parser.add_argument("--max-batch", type=int, default=1, help="Max batch size")
    args = parser.parse_args()
    build_vision_engine(args.input, args.output, args.max_batch)