#!/usr/bin/env python3
"""
Export SigLIP-SO400M Vision Encoder to ONNX → TensorRT engine.

SigLIP is the vision encoder used in Gemma3 VLM. We export it as a
standalone model so it can be served via Triton independently of the
text decoder, enabling on-demand GPU loading for image processing.

Usage:
    python scripts/export-siglip-onnx.py --output-dir triton_models/siglip_vision/1

Requirements:
    pip install transformers torch onnx onnxruntime
"""

import argparse
import logging
from pathlib import Path

import torch

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def export_siglip(output_dir: Path, opset: int = 17) -> Path:
    """Export SigLIP vision encoder to ONNX."""
    from transformers import SiglipVisionModel

    output_dir.mkdir(parents=True, exist_ok=True)
    onnx_path = output_dir / "model.onnx"

    logger.info("Loading SigLIP-SO400M vision model...")
    model = SiglipVisionModel.from_pretrained(
        "google/siglip-so400m-patch14-384",
        torch_dtype=torch.float16,
    )
    model.eval()

    param_count = sum(p.numel() for p in model.parameters())
    logger.info(f"Model loaded: {param_count / 1e6:.0f}M parameters")

    # SigLIP-SO400M: 384x384 input, 14x14 patches → 27x27 = 729 patch tokens
    # Output: (batch, 729, 1152)
    dummy_input = torch.randn(1, 3, 384, 384, dtype=torch.float16)

    logger.info(f"Exporting to ONNX (opset {opset})...")
    torch.onnx.export(
        model,
        dummy_input,
        str(onnx_path),
        input_names=["pixel_values"],
        output_names=["image_features"],
        dynamic_axes={
            "pixel_values": {0: "batch_size"},
            "image_features": {0: "batch_size"},
        },
        opset_version=opset,
        do_constant_folding=True,
    )

    size_mb = onnx_path.stat().st_size / (1024 * 1024)
    logger.info(f"ONNX exported: {onnx_path} ({size_mb:.0f} MB)")
    return onnx_path


def build_trt_engine(onnx_path: Path, output_path: Path) -> Path:
    """Build TensorRT engine from ONNX (optional, requires tensorrt)."""
    try:
        import tensorrt as trt
    except ImportError:
        logger.warning("tensorrt not installed — skipping engine build")
        logger.info("Run inside TRT-LLM container to build .plan engine")
        return onnx_path

    TRT_LOGGER = trt.Logger(trt.Logger.INFO)
    builder = trt.Builder(TRT_LOGGER)
    network = builder.create_network(
        1 << int(trt.NetworkDefinitionCreationFlag.EXPLICIT_BATCH)
    )
    parser = trt.OnnxParser(network, TRT_LOGGER)

    with open(onnx_path, "rb") as f:
        if not parser.parse(f.read()):
            for i in range(parser.num_errors):
                logger.error(f"ONNX parse error: {parser.get_error(i)}")
            raise RuntimeError("ONNX parsing failed")

    config = builder.create_builder_config()
    config.set_memory_pool_limit(trt.MemoryPoolType.WORKSPACE, 2 * 1024 * 1024 * 1024)
    config.set_flag(trt.BuilderFlag.FP16)

    plan_path = output_path / "model.plan"
    engine = builder.build_serialized_network(network, config)
    if engine is None:
        raise RuntimeError("TensorRT engine build failed")

    with open(plan_path, "wb") as f:
        f.write(engine)

    size_mb = plan_path.stat().st_size / (1024 * 1024)
    logger.info(f"TRT engine built: {plan_path} ({size_mb:.0f} MB)")
    return plan_path


def main():
    parser = argparse.ArgumentParser(description="Export SigLIP to ONNX/TRT")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("triton_models/siglip_vision/1"),
        help="Output directory for model files",
    )
    parser.add_argument("--opset", type=int, default=17, help="ONNX opset version")
    parser.add_argument(
        "--build-trt", action="store_true", help="Also build TensorRT engine"
    )
    args = parser.parse_args()

    onnx_path = export_siglip(args.output_dir, args.opset)

    if args.build_trt:
        build_trt_engine(onnx_path, args.output_dir)

    logger.info("Done.")


if __name__ == "__main__":
    main()
