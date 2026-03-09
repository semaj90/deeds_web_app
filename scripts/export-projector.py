#!/usr/bin/env python3
"""
Extract Gemma3 VLM projection layers (SigLIP 1152-dim → Gemma3 3840-dim).

The projector is the bridge between the vision encoder output and the
text decoder input space. It's a small linear model (~50MB) that maps
vision token embeddings to the text model's hidden dimension.

Usage:
    python scripts/export-projector.py \
        --model google/gemma-3-12b-it \
        --output-dir triton_models/gemma_projector/1

Requirements:
    pip install transformers torch onnx
"""

import argparse
import logging
from pathlib import Path

import torch
import torch.nn as nn

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def extract_projector(model_name: str, output_dir: Path, opset: int = 17) -> Path:
    """Extract and export the multi-modal projector from Gemma3 VLM."""
    from transformers import AutoModel, AutoConfig

    output_dir.mkdir(parents=True, exist_ok=True)
    onnx_path = output_dir / "model.onnx"

    logger.info(f"Loading config from {model_name}...")
    config = AutoConfig.from_pretrained(model_name, trust_remote_code=True)

    # Check if this is a VLM model with a projector
    if not hasattr(config, "mm_projector_type") and not hasattr(config, "multi_modal_projector"):
        logger.warning("Model may not have a standard projector — creating a linear projection")
        # Gemma3 VLM uses a linear projection: 1152 → 3840
        vision_dim = getattr(config, "vision_config", {})
        vision_hidden = vision_dim.hidden_size if hasattr(vision_dim, "hidden_size") else 1152
        text_hidden = config.hidden_size  # 3840 for Gemma3 12B

        logger.info(f"Creating linear projector: {vision_hidden} → {text_hidden}")
        projector = nn.Linear(vision_hidden, text_hidden, bias=True)

        # Try to load weights from the full model's state dict
        try:
            logger.info("Attempting to load projector weights from full model...")
            from safetensors.torch import load_file
            import glob

            # Look for safetensors files
            model_path = Path(model_name)
            if model_path.exists():
                sf_files = list(model_path.glob("*.safetensors"))
            else:
                # Download just the projector weights
                from huggingface_hub import hf_hub_download
                sf_files = []
                try:
                    path = hf_hub_download(model_name, "model.safetensors.index.json")
                    import json
                    with open(path) as f:
                        index = json.load(f)
                    # Find which shard has projector weights
                    proj_shard = None
                    for key, shard in index["weight_map"].items():
                        if "multi_modal_projector" in key or "mm_projector" in key:
                            proj_shard = shard
                            break
                    if proj_shard:
                        shard_path = hf_hub_download(model_name, proj_shard)
                        sf_files = [Path(shard_path)]
                except Exception as e:
                    logger.warning(f"Could not download projector weights: {e}")

            for sf in sf_files:
                state_dict = load_file(str(sf), device="cpu")
                proj_keys = {k: v for k, v in state_dict.items()
                            if "multi_modal_projector" in k or "mm_projector" in k}
                if proj_keys:
                    logger.info(f"Found projector weights: {list(proj_keys.keys())}")
                    # Map weights to our linear layer
                    for k, v in proj_keys.items():
                        if "weight" in k:
                            projector.weight.data = v
                        elif "bias" in k:
                            projector.bias.data = v
                    break
        except Exception as e:
            logger.warning(f"Could not load pretrained projector weights: {e}")
            logger.info("Using randomly initialized projector (will need fine-tuning)")
    else:
        logger.info("Loading full model to extract projector...")
        model = AutoModel.from_pretrained(
            model_name, torch_dtype=torch.float16, device_map="cpu",
            trust_remote_code=True
        )
        projector = model.multi_modal_projector
        vision_hidden = projector.in_features if hasattr(projector, "in_features") else 1152
        text_hidden = projector.out_features if hasattr(projector, "out_features") else 3840

    projector.eval()

    # Export to ONNX
    dummy_input = torch.randn(1, 729, vision_hidden, dtype=torch.float32)
    logger.info(f"Exporting projector to ONNX: ({vision_hidden}) → ({text_hidden})")

    torch.onnx.export(
        projector,
        dummy_input,
        str(onnx_path),
        input_names=["image_features"],
        output_names=["projected_tokens"],
        dynamic_axes={
            "image_features": {0: "batch_size", 1: "num_tokens"},
            "projected_tokens": {0: "batch_size", 1: "num_tokens"},
        },
        opset_version=opset,
        do_constant_folding=True,
    )

    size_mb = onnx_path.stat().st_size / (1024 * 1024)
    logger.info(f"Projector exported: {onnx_path} ({size_mb:.1f} MB)")
    return onnx_path


def main():
    parser = argparse.ArgumentParser(description="Export Gemma3 VLM projector to ONNX")
    parser.add_argument(
        "--model", default="google/gemma-3-12b-it",
        help="HuggingFace model name or local path"
    )
    parser.add_argument(
        "--output-dir", type=Path,
        default=Path("triton_models/gemma_projector/1"),
        help="Output directory"
    )
    parser.add_argument("--opset", type=int, default=17)
    args = parser.parse_args()

    extract_projector(args.model, args.output_dir, args.opset)
    logger.info("Done.")


if __name__ == "__main__":
    main()
