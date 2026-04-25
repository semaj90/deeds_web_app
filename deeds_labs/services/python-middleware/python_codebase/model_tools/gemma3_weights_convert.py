#!/usr/bin/env python3
"""
Convert Gemma3 HuggingFace model to TensorRT-LLM weights using GemmaForCausalLM
Uses load_gemma_weights_from_hf_model approach
"""
import os
import sys
from pathlib import Path
import torch

# HuggingFace imports
from transformers import AutoModelForCausalLM, AutoTokenizer

# TensorRT-LLM imports
from tensorrt_llm.models.gemma.config import GemmaConfig
from tensorrt_llm.models.gemma.convert import load_gemma_weights_from_hf_model
from tensorrt_llm.models.gemma.model import GemmaForCausalLM
from tensorrt_llm import logger
from tensorrt_llm.mapping import Mapping

def main():
    # === Config ===
    HF_MODEL_PATH = "/mnt/c/Users/james/Videos/deeds-web-app/model_unsloth_hf_f16"
    CHECKPOINT_DIR = "/home/james/gemma3_trtllm_checkpoint"

    print(f"🔹 Converting Gemma3 using GemmaForCausalLM...")
    print(f"🔹 Source: {HF_MODEL_PATH}")
    print(f"🔹 Target: {CHECKPOINT_DIR}")

    # Create output directory
    os.makedirs(CHECKPOINT_DIR, exist_ok=True)

    # Set logging level
    logger.set_level("info")

    try:
        # Load HuggingFace model
        print("🔹 Loading HuggingFace Gemma3 model...")
        hf_model = AutoModelForCausalLM.from_pretrained(
            HF_MODEL_PATH,
            torch_dtype=torch.float16,
            device_map="cpu"  # Load on CPU to avoid GPU memory issues
        )

        # Load tokenizer to get vocab size
        tokenizer = AutoTokenizer.from_pretrained(HF_MODEL_PATH)
        vocab_size = len(tokenizer.vocab)

        print(f"✅ HF model loaded, vocab size: {vocab_size}")

        # Create TensorRT-LLM Gemma configuration
        print("🔹 Creating TensorRT-LLM Gemma configuration...")

        # Get HF config
        hf_config = hf_model.config

        # Create tensor parallel mapping (single GPU)
        mapping = Mapping(world_size=1, rank=0, tp_size=1, pp_size=1)

        # Create TensorRT-LLM config
        trt_llm_config = GemmaConfig(
            hidden_size=hf_config.hidden_size,
            intermediate_size=hf_config.intermediate_size,
            num_hidden_layers=hf_config.num_hidden_layers,
            num_attention_heads=hf_config.num_attention_heads,
            num_key_value_heads=getattr(hf_config, 'num_key_value_heads', hf_config.num_attention_heads),
            vocab_size=vocab_size,
            max_position_embeddings=hf_config.max_position_embeddings,
            dtype="float16",
            mapping=mapping,
            use_parallel_embedding=False,
            embedding_sharding_dim=0
        )

        print(f"✅ TensorRT-LLM config created")
        print(f"   - Hidden size: {trt_llm_config.hidden_size}")
        print(f"   - Layers: {trt_llm_config.num_hidden_layers}")
        print(f"   - Attention heads: {trt_llm_config.num_attention_heads}")
        print(f"   - Max position: {trt_llm_config.max_position_embeddings}")

        # Convert weights from HF model to TensorRT-LLM format
        print("🔹 Converting weights to TensorRT-LLM format...")
        weights = load_gemma_weights_from_hf_model(hf_model, trt_llm_config)

        print(f"✅ Converted {len(weights)} weight tensors")

        # Save weights and config
        print("🔹 Saving TensorRT-LLM checkpoint...")

        # Save weights as safetensors
        import safetensors.torch
        weights_path = Path(CHECKPOINT_DIR) / "model.safetensors"
        safetensors.torch.save_file(weights, weights_path)

        # Save config
        config_path = Path(CHECKPOINT_DIR) / "config.json"
        trt_llm_config.save_to_file(config_path)

        # Create rank mapping file
        rank_mapping = {"model.safetensors": [0]}
        rank_mapping_path = Path(CHECKPOINT_DIR) / "rank_mapping.json"
        import json
        with open(rank_mapping_path, 'w') as f:
            json.dump(rank_mapping, f, indent=2)

        print(f"✅ Checkpoint saved to: {CHECKPOINT_DIR}")

        # Verify saved files
        checkpoint_files = list(Path(CHECKPOINT_DIR).glob("*"))
        print(f"✅ Generated {len(checkpoint_files)} files:")

        for file in sorted(checkpoint_files):
            if file.is_file():
                size_mb = file.stat().st_size / (1024*1024)
                print(f"   {file.name} ({size_mb:.1f}MB)")

        return True

    except Exception as e:
        print(f"❌ Conversion failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("Starting Gemma3 TensorRT-LLM weights conversion...")

    success = main()

    if success:
        print("\n🎉 Gemma3 TensorRT-LLM checkpoint ready!")
        print("Next steps:")
        print("1. Use trtllm-build to create engine from checkpoint")
        print("2. Test inference performance")
        print("3. Compare with Ollama baseline")
    else:
        print("\n💡 Conversion failed - check errors above")

    sys.exit(0 if success else 1)