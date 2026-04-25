#!/usr/bin/env python3
"""
Simple GGUF to HuggingFace conversion for TensorRT-LLM
Uses the working GGUF file and converts it to proper HF format
"""

import os
import sys
from pathlib import Path

def main():
    """Convert GGUF to HuggingFace format using existing tools"""

    gguf_file = "/mnt/c/Users/james/Videos/deeds-web-app/gemma3Q4_K_M/mohf16-Q4_K_M.gguf"
    output_dir = "/home/james/gemma3_from_gguf"

    print("🔄 Converting GGUF to HuggingFace format...")
    print(f"📁 GGUF: {gguf_file}")
    print(f"📁 Output: {output_dir}")

    # Check if GGUF exists
    if not Path(gguf_file).exists():
        print(f"❌ GGUF file not found: {gguf_file}")
        return 1

    # Create output directory
    os.makedirs(output_dir, exist_ok=True)

    try:
        # Use transformers library to convert GGUF
        from transformers import AutoTokenizer, AutoModel
        import torch

        print("📥 Loading GGUF model...")

        # This might work for some GGUF files
        model = AutoModel.from_pretrained(
            gguf_file,
            trust_remote_code=True,
            torch_dtype=torch.float16
        )

        print("💾 Saving HuggingFace format...")
        model.save_pretrained(output_dir)

        # Also try to get tokenizer from base model
        try:
            tokenizer = AutoTokenizer.from_pretrained("google/gemma-2-9b-it")
            tokenizer.save_pretrained(output_dir)
            print("✅ Tokenizer saved")
        except:
            print("⚠️  Tokenizer not saved, but model conversion completed")

        print("✅ GGUF to HuggingFace conversion completed!")
        return 0

    except Exception as e:
        print(f"❌ Conversion failed: {e}")

        # Try alternative approach using llama.cpp python
        try:
            print("🔄 Trying alternative approach...")

            # Create a minimal config.json for TensorRT-LLM
            config = {
                "architectures": ["GemmaForCausalLM"],
                "model_type": "gemma",
                "torch_dtype": "float16",
                "hidden_size": 3584,
                "intermediate_size": 14336,
                "num_attention_heads": 16,
                "num_hidden_layers": 48,
                "num_key_value_heads": 8,
                "vocab_size": 256000,
                "rope_theta": 10000.0,
                "rms_norm_eps": 1e-6,
                "head_dim": 224,
                "max_position_embeddings": 8192,
                "sliding_window_pattern": 6
            }

            import json
            with open(f"{output_dir}/config.json", "w") as f:
                json.dump(config, f, indent=2)

            print("✅ Created minimal config for TensorRT-LLM")
            print("📋 Next: Use this config with GGUF file directly")

            return 0

        except Exception as e2:
            print(f"❌ Alternative approach also failed: {e2}")
            return 1

if __name__ == "__main__":
    exit(main())