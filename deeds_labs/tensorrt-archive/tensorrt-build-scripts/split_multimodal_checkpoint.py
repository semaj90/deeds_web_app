#!/usr/bin/env python3
"""
Split Gemma 3 12B Multimodal Checkpoint into Vision Tower + Text Model

Gemma 3 is a multimodal model with:
  - Vision Tower: SigLIP encoder (ViT-SO400M)
  - Text Model:   Gemma 3 decoder (12B params)

TRT-LLM treats these as SEPARATE engines. This script splits the merged
HuggingFace checkpoint into two directories for independent compilation.

Usage:
  python split_multimodal_checkpoint.py \
    --model-path /path/to/gemma-3-12b-it \
    --output-dir /path/to/output

Output:
  output/gemma3-vision-tower/   (SigLIP weights + config)
  output/gemma3-text-only/      (Language model weights + config)
"""

import argparse
import json
import os
import shutil
from pathlib import Path

def split_checkpoint(model_path: str, output_dir: str):
    model_path = Path(model_path)
    output_dir = Path(output_dir)

    vision_dir = output_dir / "gemma3-vision-tower"
    text_dir = output_dir / "gemma3-text-only"
    vision_dir.mkdir(parents=True, exist_ok=True)
    text_dir.mkdir(parents=True, exist_ok=True)

    print(f"[1/4] Loading model config from {model_path}")

    config_path = model_path / "config.json"
    if not config_path.exists():
        raise FileNotFoundError(f"config.json not found at {config_path}")

    with open(config_path) as f:
        config = json.load(f)

    # Extract vision config for SigLIP
    vision_config = config.get("vision_config", {})

    # Extract text config — Gemma 3 nests it under "text_config"
    inner_text_config = config.get("text_config", {})
    text_config = {**inner_text_config}
    text_config["architectures"] = ["Gemma3ForCausalLM"]
    text_config["model_type"] = "gemma3"
    text_config["torch_dtype"] = config.get("torch_dtype", "bfloat16")
    text_config["bos_token_id"] = config.get("bos_token_id", 2)
    text_config["eos_token_id"] = config.get("eos_token_id", 1)
    text_config["pad_token_id"] = config.get("pad_token_id", 0)

    # Write separate configs
    with open(vision_dir / "config.json", "w") as f:
        json.dump({"model_type": "siglip", **vision_config}, f, indent=2)

    with open(text_dir / "config.json", "w") as f:
        json.dump(text_config, f, indent=2)

    print(f"  Text: Gemma3ForCausalLM (hidden={text_config.get('hidden_size')}, layers={text_config.get('num_hidden_layers')})")
    print(f"  Vision: SigLIP ({vision_config.get('hidden_size', '?')}-dim)")

    print(f"[2/4] Scanning safetensors for weight prefixes...")

    # Find all safetensors files
    safetensors_files = sorted(model_path.glob("*.safetensors"))
    if not safetensors_files:
        raise FileNotFoundError(f"No .safetensors files in {model_path}")

    print(f"  Found {len(safetensors_files)} safetensors files")

    try:
        from safetensors import safe_open
        from safetensors.torch import save_file
        import torch
    except ImportError:
        print("ERROR: safetensors and torch required. Install with:")
        print("  pip install safetensors torch")
        return

    # Split by prefix: vision_tower.* → vision, everything else → text
    vision_prefix = "vision_tower."
    multi_modal_prefix = "multi_modal_projector."

    vision_tensors = {}
    text_tensors = {}

    print(f"[3/4] Splitting tensors...")

    # Prefix for Gemma 3 multimodal: text weights nested under model.language_model.*
    # AutoAWQ/TRT-LLM expect model.layers.* (text-only format)
    lang_prefix = "model.language_model."

    for sf_path in safetensors_files:
        print(f"  Processing {sf_path.name}...")
        with safe_open(str(sf_path), framework="pt", device="cpu") as f:
            for key in f.keys():
                tensor = f.get_tensor(key)
                if key.startswith(vision_prefix):
                    # Strip prefix for standalone vision model
                    clean_key = key[len(vision_prefix):]
                    vision_tensors[clean_key] = tensor
                elif key.startswith(multi_modal_prefix):
                    # Projector goes with vision (bridges vision→text)
                    vision_tensors[key] = tensor
                elif key.startswith(lang_prefix):
                    # Remap: model.language_model.X → model.X
                    remapped_key = "model." + key[len(lang_prefix):]
                    text_tensors[remapped_key] = tensor
                else:
                    text_tensors[key] = tensor

    print(f"  Vision tensors: {len(vision_tensors)}")
    print(f"  Text tensors:   {len(text_tensors)} (language_model prefix remapped)")

    # Save split checkpoints
    print(f"[4/4] Saving split checkpoints...")

    if vision_tensors:
        save_file(vision_tensors, str(vision_dir / "model.safetensors"))
        print(f"  Vision: {vision_dir / 'model.safetensors'}")

    if text_tensors:
        # Split text tensors into shards if > 5GB
        total_size = sum(t.nbytes for t in text_tensors.values())
        shard_size = 5 * 1024 * 1024 * 1024  # 5GB per shard

        if total_size > shard_size:
            shard_idx = 0
            current_shard = {}
            current_size = 0

            for key, tensor in text_tensors.items():
                if current_size + tensor.nbytes > shard_size and current_shard:
                    shard_name = f"model-{shard_idx:05d}-of-{len(text_tensors) // 100 + 1:05d}.safetensors"
                    save_file(current_shard, str(text_dir / shard_name))
                    print(f"  Text shard: {shard_name}")
                    shard_idx += 1
                    current_shard = {}
                    current_size = 0

                current_shard[key] = tensor
                current_size += tensor.nbytes

            if current_shard:
                shard_name = f"model-{shard_idx:05d}-of-{shard_idx + 1:05d}.safetensors"
                save_file(current_shard, str(text_dir / shard_name))
                print(f"  Text shard: {shard_name}")
        else:
            save_file(text_tensors, str(text_dir / "model.safetensors"))
            print(f"  Text: {text_dir / 'model.safetensors'}")

    # Copy tokenizer files to text dir
    for tok_file in ["tokenizer.json", "tokenizer_config.json", "tokenizer.model",
                      "special_tokens_map.json", "generation_config.json"]:
        src = model_path / tok_file
        if src.exists():
            shutil.copy2(src, text_dir / tok_file)
            print(f"  Copied {tok_file} → text dir")

    # Copy preprocessor config to vision dir
    for vis_file in ["preprocessor_config.json", "processor_config.json"]:
        src = model_path / vis_file
        if src.exists():
            shutil.copy2(src, vision_dir / vis_file)
            print(f"  Copied {vis_file} → vision dir")

    print()
    print("=" * 60)
    print("SPLIT COMPLETE")
    print(f"  Vision Tower: {vision_dir}")
    print(f"  Text Model:   {text_dir}")
    print()
    print("Next steps:")
    print("  1. Build Vision Engine:  python build_vision_engine.py --input gemma3-vision-tower/")
    print("  2. Quantize Text (AWQ):  python -m autoawq.quantize --model gemma3-text-only/")
    print("  3. Build Text Engine:    trtllm-build --checkpoint_dir gemma3-text-only-awq/")
    print("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Split Gemma 3 multimodal checkpoint")
    parser.add_argument("--model-path", required=True, help="Path to merged HF checkpoint")
    parser.add_argument("--output-dir", default="./output", help="Output directory")
    args = parser.parse_args()
    split_checkpoint(args.model_path, args.output_dir)
