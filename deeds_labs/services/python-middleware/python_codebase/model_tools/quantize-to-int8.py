#!/usr/bin/env python3
"""
Quantize Gemma3 checkpoint to INT8 for TensorRT-LLM
"""
import os
import torch
import safetensors.torch
from pathlib import Path

def quantize_to_int8(input_path, output_path):
    """Convert BF16 checkpoint to INT8 quantized version"""

    print(f"Loading checkpoint from {input_path}")
    checkpoint = safetensors.torch.load_file(input_path)

    print(f"Original checkpoint: {len(checkpoint)} tensors")
    total_params = sum(t.numel() for t in checkpoint.values())
    print(f"Total parameters: {total_params:,}")

    # Calculate sizes
    bf16_size = sum(t.numel() * 2 for t in checkpoint.values()) / 1e9
    print(f"BF16 size: {bf16_size:.1f} GB")

    # Quantize to INT8
    quantized = {}
    for name, tensor in checkpoint.items():
        if 'weight' in name and tensor.dtype in [torch.bfloat16, torch.float16, torch.float32]:
            # Quantize weights to INT8
            # Scale to INT8 range
            scale = tensor.abs().max() / 127.0
            quantized_tensor = (tensor / scale).round().to(torch.int8)

            # Store scale for dequantization
            quantized[name] = quantized_tensor
            quantized[name + '_scale'] = scale.to(torch.float16)
        else:
            # Keep non-weight tensors as-is (layer norms, biases, etc)
            quantized[name] = tensor

    print(f"\nQuantized checkpoint: {len(quantized)} tensors")
    int8_size = sum(
        t.numel() * (1 if t.dtype == torch.int8 else 2)
        for t in quantized.values()
    ) / 1e9
    print(f"INT8 size: {int8_size:.1f} GB")
    print(f"Compression ratio: {bf16_size/int8_size:.1f}x")

    # Save quantized checkpoint
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    print(f"\nSaving to {output_path}")
    safetensors.torch.save_file(quantized, output_path)
    print("Done!")

    return quantized

if __name__ == "__main__":
    input_checkpoint = "/home/james/gemma3_trtllm_checkpoint/rank0.safetensors"
    output_checkpoint = "/home/james/gemma3_checkpoint_int8/rank0.safetensors"

    quantize_to_int8(input_checkpoint, output_checkpoint)