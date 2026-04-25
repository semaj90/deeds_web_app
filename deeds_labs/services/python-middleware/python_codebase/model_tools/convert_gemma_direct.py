#!/usr/bin/env python3
"""
Direct Gemma3 FP16 to TensorRT conversion without AWQ quantization.
Uses HuggingFace model directly for RTX 3060 Ti (8GB VRAM).
"""

import argparse
import os
import torch
from pathlib import Path
from transformers import AutoTokenizer, AutoModelForCausalLM
from safetensors.torch import save_file

def convert_to_checkpoint(model_path, output_dir):
    """Convert HuggingFace model to TensorRT-LLM checkpoint format."""
    print(f"🔄 Loading model from {model_path}")

    # Load model in FP16 to save memory
    model = AutoModelForCausalLM.from_pretrained(
        model_path,
        torch_dtype=torch.float16,
        device_map="auto",
        trust_remote_code=True
    )

    tokenizer = AutoTokenizer.from_pretrained(model_path, trust_remote_code=True)

    # Create output directory
    checkpoint_dir = Path(output_dir)
    checkpoint_dir.mkdir(parents=True, exist_ok=True)

    print(f"💾 Saving checkpoint to {checkpoint_dir}")

    # Save model state dict as rank0.safetensors
    state_dict = model.state_dict()

    # Convert to FP16 if not already
    fp16_state_dict = {}
    for key, tensor in state_dict.items():
        if tensor.dtype == torch.float32:
            fp16_state_dict[key] = tensor.half()
        else:
            fp16_state_dict[key] = tensor

    # Save as safetensors format
    save_file(fp16_state_dict, checkpoint_dir / "rank0.safetensors")

    # Save config
    model.config.save_pretrained(checkpoint_dir)
    tokenizer.save_pretrained(checkpoint_dir)

    # Calculate size
    size_gb = sum(f.stat().st_size for f in checkpoint_dir.rglob('*') if f.is_file()) / (1024**3)
    print(f"✅ Checkpoint saved: {size_gb:.1f}GB")

    return checkpoint_dir

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model_path", type=str,
                       default="/mnt/c/Users/james/Videos/deeds-web-app/model_unsloth_hf_f16",
                       help="Path to HuggingFace model")
    parser.add_argument("--output_dir", type=str,
                       default="/home/james/gemma3_checkpoint_fp16",
                       help="Output directory for checkpoint")

    args = parser.parse_args()

    print("🚀 Gemma3 Direct TensorRT Conversion")
    print("===================================")
    print(f"📁 Model: {args.model_path}")
    print(f"📂 Output: {args.output_dir}")
    print()

    # Convert model
    checkpoint_dir = convert_to_checkpoint(args.model_path, args.output_dir)

    print()
    print("🎯 Next Steps:")
    print(f"   1. Build TensorRT engine:")
    print(f"      trtllm-build \\")
    print(f"        --checkpoint_dir {checkpoint_dir} \\")
    print(f"        --output_dir /home/james/gemma3_engine_fp16 \\")
    print(f"        --max_batch_size 4 \\")
    print(f"        --max_input_len 2048 \\")
    print(f"        --max_seq_len 4096 \\")
    print(f"        --use_flash_inference \\")
    print(f"        --use_gpt_attention_plugin float16 \\")
    print(f"        --use_gemm_plugin float16 \\")
    print(f"        --enable_context_fmha \\")
    print(f"        --remove_input_padding \\")
    print(f"        --strongly_typed")
    print()
    print("⚡ Performance: FP16 model optimized for RTX 3060 Ti")

if __name__ == "__main__":
    main()