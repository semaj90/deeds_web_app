#!/usr/bin/env python3
"""
Merge LoRA Adapter with Base Model for Inference
Combines fine-tuned LoRA weights with base Gemma3 model.
Writes an adapter manifest (manifest.json) for the SvelteKit status endpoint.
"""

import os
import sys
import json
import argparse
import uuid
import torch
from datetime import datetime, timezone
from pathlib import Path
from peft import PeftModel, PeftConfig
from transformers import AutoModelForCausalLM, AutoTokenizer


def write_manifest(output_dir: str, artifact: dict):
    """Write or update the adapter manifest.json alongside the merged model."""
    manifest_path = Path(output_dir).parent / "manifest.json"

    # Load existing manifest or create new one
    if manifest_path.exists():
        with open(manifest_path) as f:
            manifest = json.load(f)
    else:
        manifest = {"version": 1, "updatedAt": "", "artifacts": []}

    # Replace existing artifact with same id, or append
    manifest["artifacts"] = [
        a for a in manifest["artifacts"] if a.get("id") != artifact["id"]
    ]
    manifest["artifacts"].append(artifact)
    manifest["updatedAt"] = datetime.now(timezone.utc).isoformat()

    os.makedirs(manifest_path.parent, exist_ok=True)
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"📋 Manifest updated: {manifest_path}")


def main():
    parser = argparse.ArgumentParser(description="Merge LoRA adapter with base model")
    parser.add_argument("--adapter", required=True, help="LoRA adapter directory")
    parser.add_argument("--base_model", default="/workspace/tensorrt_build/input", help="Base model path")
    parser.add_argument("--output", required=True, help="Output directory for merged model")
    parser.add_argument("--format", default="hf", choices=["hf", "gguf", "tensorrt", "onnx"], help="Output format")
    parser.add_argument("--id", default=None, help="Artifact ID (auto-generated if omitted)")

    args = parser.parse_args()
    artifact_id = args.id or str(uuid.uuid4())[:8]

    print("🔗 Merging LoRA Adapter with Base Model")
    print("=" * 50)
    print(f"Adapter:    {args.adapter}")
    print(f"Base Model: {args.base_model}")
    print(f"Output:     {args.output}")
    print(f"Format:     {args.format}")
    print(f"ID:         {artifact_id}")
    print()

    # Check if adapter exists
    if not Path(args.adapter).exists():
        print("❌ LoRA adapter not found")
        return 1

    # Create output directory
    os.makedirs(args.output, exist_ok=True)

    # Read LoRA config for manifest metadata
    lora_meta = {}
    try:
        peft_config = PeftConfig.from_pretrained(args.adapter)
        lora_meta = {
            "loraR": getattr(peft_config, "r", None),
            "loraAlpha": getattr(peft_config, "lora_alpha", None),
        }
    except Exception:
        pass

    try:
        print("🔄 Loading base model...")
        model = AutoModelForCausalLM.from_pretrained(
            args.base_model,
            torch_dtype=torch.bfloat16,
            device_map="auto",
            trust_remote_code=True
        )

        print("🔄 Loading LoRA adapter...")
        model = PeftModel.from_pretrained(model, args.adapter)

        print("🔄 Merging weights...")
        merged_model = model.merge_and_unload()

        print("💾 Saving merged model...")
        merged_model.save_pretrained(args.output)

        # Try to copy tokenizer if available
        tokenizer_paths = [
            args.base_model,
            "/workspace/gemma3-12b-finetuned-fp16"
        ]

        tokenizer_saved = False
        for tokenizer_path in tokenizer_paths:
            try:
                if Path(tokenizer_path).exists():
                    tokenizer = AutoTokenizer.from_pretrained(tokenizer_path)
                    tokenizer.save_pretrained(args.output)
                    print(f"✅ Tokenizer saved from {tokenizer_path}")
                    tokenizer_saved = True
                    break
            except Exception as e:
                print(f"⚠️ Could not load tokenizer from {tokenizer_path}: {e}")

        if not tokenizer_saved:
            print("⚠️ No tokenizer found - you'll need to add one manually")

        # Calculate model size
        model_size = sum(p.numel() for p in merged_model.parameters()) * 2 / (1024**3)  # GB in BF16
        print(f"📦 Model size: {model_size:.2f} GB")

        # Write adapter manifest
        artifact = {
            "id": artifact_id,
            "baseModel": str(args.base_model),
            "adapterPath": str(args.adapter),
            "mergedPath": str(args.output),
            "format": args.format,
            "status": "ready",
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "metadata": {
                "modelSizeGb": round(model_size, 2),
                "quantization": "bf16",
                "trainingGpu": "A100" if torch.cuda.is_available() and torch.cuda.get_device_name(0).startswith("A100") else "unknown",
                "targetGpu": "RTX 3060 Ti",
                **lora_meta,
            },
        }
        write_manifest(args.output, artifact)

        print("✅ Model merging complete!")
        print(f"📄 Merged model saved to {args.output}")
        return 0

    except Exception as e:
        print(f"❌ Merging failed: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
