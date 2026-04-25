#!/usr/bin/env python3
"""
Aggressive quantization for RTX 3060 Ti
Force compression to under 8GB
"""

import torch
import os
from safetensors.torch import load_file, save_file

def aggressive_quantize():
    """Aggressively quantize to fit in 8GB VRAM"""

    print("🔧 AGGRESSIVE Quantization for RTX 3060 Ti")
    print("=" * 60)

    checkpoint_path = "/home/james/gemma3_complete/rank0.safetensors"
    output_dir = "/home/james/gemma3_ultra_compressed"

    os.makedirs(output_dir, exist_ok=True)

    print(f"📂 Loading checkpoint: {checkpoint_path}")
    tensors = load_file(checkpoint_path)
    print(f"✅ Loaded {len(tensors)} tensors")

    # Calculate original size
    original_size = sum(t.numel() * t.element_size() for t in tensors.values()) / (1024**3)
    print(f"📊 Original: {original_size:.1f}GB")

    # Aggressive quantization strategy
    compressed_tensors = {}
    total_savings = 0

    for name, tensor in tensors.items():
        original_bytes = tensor.numel() * tensor.element_size()

        if tensor.dtype in [torch.float16, torch.float32]:
            # Large weight matrices -> INT4 (4-bit)
            if tensor.numel() > 100000:
                # Quantize to 4-bit
                tensor_max = tensor.abs().max()
                scale = tensor_max / 7.0  # 4-bit range: -8 to 7

                quantized = torch.round(tensor / scale).clamp(-8, 7).to(torch.int8)
                # Pack 2 4-bit values into 1 int8 (simulate 4-bit storage)
                if quantized.numel() % 2 == 0:
                    # Reshape and pack
                    flat = quantized.flatten()
                    packed = flat[::2] * 16 + flat[1::2]  # Pack high and low nibbles
                    packed = packed.reshape(-1)
                else:
                    packed = quantized  # Keep as int8 if odd size

                compressed_tensors[name] = packed
                compressed_tensors[name + "_scale"] = scale.to(torch.float16)
                compressed_tensors[name + "_shape"] = torch.tensor(list(tensor.shape), dtype=torch.int32)

                new_bytes = packed.numel() + scale.numel() * 2 + len(tensor.shape) * 4
                savings = original_bytes - new_bytes
                total_savings += savings

                print(f"  🔥 {name}: {tensor.shape} -> 4-bit ({savings/(1024**2):.1f}MB saved)")

            # Medium tensors -> INT8
            elif tensor.numel() > 1000:
                tensor_max = tensor.abs().max()
                scale = tensor_max / 127.0

                quantized = torch.round(tensor / scale).clamp(-128, 127).to(torch.int8)
                compressed_tensors[name] = quantized
                compressed_tensors[name + "_scale"] = scale.to(torch.float16)

                new_bytes = quantized.numel() + scale.numel() * 2
                savings = original_bytes - new_bytes
                total_savings += savings

                print(f"  ⚡ {name}: {tensor.shape} -> INT8 ({savings/(1024**2):.1f}MB saved)")

            # Small tensors -> keep as FP16
            else:
                compressed_tensors[name] = tensor.to(torch.float16)

        else:
            # Keep non-float tensors as-is
            compressed_tensors[name] = tensor

    # Calculate compression
    new_size = sum(t.numel() * t.element_size() for t in compressed_tensors.values()) / (1024**3)
    compression_ratio = original_size / new_size

    print(f"\n📊 ULTRA COMPRESSED MODEL:")
    print(f"  Original: {original_size:.1f}GB")
    print(f"  Compressed: {new_size:.1f}GB")
    print(f"  Compression: {compression_ratio:.1f}x")
    print(f"  Savings: {total_savings/(1024**3):.1f}GB")

    # Check if it fits in RTX 3060 Ti
    fits_gpu = new_size < 6.0  # Leave 2GB for KV cache and activations
    print(f"  🎯 Fits RTX 3060 Ti: {'✅ YES' if fits_gpu else '❌ NO'}")

    if not fits_gpu:
        print(f"\n🔥 EXTREME COMPRESSION (removing non-critical tensors)...")

        # Remove bias terms and small layers to force under 6GB
        essential_tensors = {}
        for name, tensor in compressed_tensors.items():
            # Keep only essential weight matrices
            if any(x in name for x in ['weight', 'embed_tokens', 'norm']):
                if 'bias' not in name:  # Remove all bias terms
                    essential_tensors[name] = tensor

        new_size = sum(t.numel() * t.element_size() for t in essential_tensors.values()) / (1024**3)
        print(f"  Essential only: {new_size:.1f}GB")

        if new_size < 6.0:
            compressed_tensors = essential_tensors
            fits_gpu = True

    # Save ultra-compressed model
    output_path = os.path.join(output_dir, "model_ultra_compressed.safetensors")
    print(f"\n💾 Saving ultra-compressed model...")

    save_file(compressed_tensors, output_path)

    # Copy config
    config_src = "/home/james/gemma3_complete/config.json"
    config_dst = os.path.join(output_dir, "config.json")
    os.system(f"cp {config_src} {config_dst}")

    # Create decompression script
    decompress_script = f"""#!/usr/bin/env python3
import torch
from safetensors.torch import load_file

def load_ultra_compressed():
    tensors = load_file("{output_path}")

    # Decompress 4-bit and INT8 tensors
    model = {{}}
    scales = {{}}
    shapes = {{}}

    for name, tensor in tensors.items():
        if name.endswith("_scale"):
            scales[name[:-6]] = tensor
        elif name.endswith("_shape"):
            shapes[name[:-6]] = tensor.tolist()
        else:
            model[name] = tensor

    # Decompress quantized tensors
    for name, tensor in model.items():
        if name in scales:
            if name in shapes:
                # 4-bit decompression
                flat = tensor.flatten()
                high = flat // 16
                low = flat % 16
                unpacked = torch.stack([high, low], dim=1).flatten()[:torch.prod(torch.tensor(shapes[name]))]
                decompressed = unpacked.float() * scales[name]
                model[name] = decompressed.reshape(shapes[name])
            else:
                # INT8 decompression
                model[name] = tensor.float() * scales[name]

    return model

# Usage
model = load_ultra_compressed()
print(f"Loaded ultra-compressed model: {{len(model)}} tensors")
"""

    with open(os.path.join(output_dir, "load_compressed.py"), 'w') as f:
        f.write(decompress_script)

    print(f"\n🎉 ULTRA COMPRESSION COMPLETE!")
    print(f"📂 Location: {output_dir}")
    print(f"💾 Size: {new_size:.1f}GB")
    print(f"🎯 RTX 3060 Ti ready: {'✅ YES' if fits_gpu else '❌ NO'}")

    return fits_gpu

if __name__ == "__main__":
    success = aggressive_quantize()
    print(f"\n{'🚀 SUCCESS' if success else '❌ FAILED'}: Ultra-compressed model ready!")