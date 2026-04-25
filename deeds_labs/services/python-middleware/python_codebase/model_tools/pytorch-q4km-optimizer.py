#!/usr/bin/env python3
"""
PyTorch-based Q4_K_M Optimizer with FlashAttention
Alternative to TensorRT for immediate deployment
"""

import os
import sys
import time
import json
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Dict, List, Optional, Tuple, Any
import argparse
from pathlib import Path

# Check for FlashAttention
try:
    from flash_attn import flash_attn_func
    FLASH_ATTN_AVAILABLE = True
    print("FlashAttention available")
except ImportError:
    FLASH_ATTN_AVAILABLE = False
    print("FlashAttention not available, using PyTorch attention")

class Q4KMQuantization:
    """Q4_K_M quantization utilities"""

    @staticmethod
    def pack_q4km(weights: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """Pack FP16 weights to Q4_K_M format"""
        # Reshape to blocks of 32
        orig_shape = weights.shape
        weights_flat = weights.flatten()

        # Pad to multiple of 32
        pad_size = (32 - len(weights_flat) % 32) % 32
        if pad_size > 0:
            weights_flat = torch.cat([weights_flat, torch.zeros(pad_size, device=weights.device)])

        # Reshape to blocks
        weights_blocks = weights_flat.view(-1, 32)

        # Quantize each block
        scales = torch.zeros(weights_blocks.size(0), dtype=torch.float16, device=weights.device)
        mins = torch.zeros(weights_blocks.size(0), dtype=torch.float16, device=weights.device)
        quantized = torch.zeros(weights_blocks.size(0), 16, dtype=torch.uint8, device=weights.device)

        for i, block in enumerate(weights_blocks):
            block_min = block.min()
            block_max = block.max()

            scale = (block_max - block_min) / 15.0
            scales[i] = scale
            mins[i] = block_min

            # Quantize to 4-bit
            if scale > 0:
                q_vals = ((block - block_min) / scale).clamp(0, 15).round().to(torch.uint8)
            else:
                q_vals = torch.zeros_like(block, dtype=torch.uint8)

            # Pack 2 values per byte
            for j in range(16):
                val1 = q_vals[j*2] if j*2 < 32 else 0
                val2 = q_vals[j*2+1] if j*2+1 < 32 else 0
                quantized[i, j] = val1 | (val2 << 4)

        return scales, mins, quantized

    @staticmethod
    def unpack_q4km(scales: torch.Tensor, mins: torch.Tensor, quantized: torch.Tensor,
                    orig_shape: torch.Size) -> torch.Tensor:
        """Unpack Q4_K_M format to FP16 weights"""
        num_blocks = scales.size(0)
        unpacked = torch.zeros(num_blocks, 32, dtype=torch.float16, device=scales.device)

        for i in range(num_blocks):
            scale = scales[i]
            min_val = mins[i]

            # Unpack 4-bit values
            for j in range(16):
                byte_val = quantized[i, j]
                val1 = byte_val & 0x0F
                val2 = (byte_val >> 4) & 0x0F

                unpacked[i, j*2] = min_val + scale * val1
                if j*2+1 < 32:
                    unpacked[i, j*2+1] = min_val + scale * val2

        # Reshape back to original
        unpacked_flat = unpacked.flatten()
        total_elements = torch.prod(torch.tensor(orig_shape)).item()
        return unpacked_flat[:total_elements].view(orig_shape)

class OptimizedQ4KMLinear(nn.Module):
    """Optimized Q4_K_M quantized linear layer"""

    def __init__(self, in_features: int, out_features: int, bias: bool = True):
        super().__init__()
        self.in_features = in_features
        self.out_features = out_features

        # Q4_K_M quantized parameters
        num_blocks = (in_features * out_features + 31) // 32
        self.register_buffer('scales', torch.empty(num_blocks, dtype=torch.float16))
        self.register_buffer('mins', torch.empty(num_blocks, dtype=torch.float16))
        self.register_buffer('quantized_weight', torch.empty(num_blocks, 16, dtype=torch.uint8))

        if bias:
            self.bias = nn.Parameter(torch.empty(out_features))
        else:
            self.register_parameter('bias', None)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Dequantize weights on-the-fly
        weight = Q4KMQuantization.unpack_q4km(
            self.scales, self.mins, self.quantized_weight,
            (self.out_features, self.in_features)
        )
        return F.linear(x, weight, self.bias)

class FlashAttentionQ4KM(nn.Module):
    """FlashAttention with Q4_K_M optimization"""

    def __init__(self, embed_dim: int, num_heads: int, dropout: float = 0.0):
        super().__init__()
        self.embed_dim = embed_dim
        self.num_heads = num_heads
        self.head_dim = embed_dim // num_heads
        self.dropout = dropout

        assert self.head_dim * num_heads == embed_dim, "embed_dim must be divisible by num_heads"

        # Q4_K_M quantized projections
        self.q_proj = OptimizedQ4KMLinear(embed_dim, embed_dim)
        self.k_proj = OptimizedQ4KMLinear(embed_dim, embed_dim)
        self.v_proj = OptimizedQ4KMLinear(embed_dim, embed_dim)
        self.out_proj = OptimizedQ4KMLinear(embed_dim, embed_dim)

    def forward(self, x: torch.Tensor, attn_mask: Optional[torch.Tensor] = None) -> torch.Tensor:
        batch_size, seq_len, embed_dim = x.shape

        # Project to Q, K, V
        q = self.q_proj(x).view(batch_size, seq_len, self.num_heads, self.head_dim)
        k = self.k_proj(x).view(batch_size, seq_len, self.num_heads, self.head_dim)
        v = self.v_proj(x).view(batch_size, seq_len, self.num_heads, self.head_dim)

        # Transpose for attention computation
        q = q.transpose(1, 2)  # [batch, num_heads, seq_len, head_dim]
        k = k.transpose(1, 2)
        v = v.transpose(1, 2)

        if FLASH_ATTN_AVAILABLE:
            # Use FlashAttention if available
            # Reshape for flash_attn_func: [batch, seq_len, num_heads, head_dim]
            q = q.transpose(1, 2).contiguous()
            k = k.transpose(1, 2).contiguous()
            v = v.transpose(1, 2).contiguous()

            attn_output = flash_attn_func(q, k, v, dropout_p=self.dropout, softmax_scale=1.0/np.sqrt(self.head_dim))
            attn_output = attn_output.view(batch_size, seq_len, embed_dim)
        else:
            # Use PyTorch scaled dot-product attention
            attn_output = F.scaled_dot_product_attention(
                q, k, v,
                attn_mask=attn_mask,
                dropout_p=self.dropout if self.training else 0.0,
                scale=1.0/np.sqrt(self.head_dim)
            )
            attn_output = attn_output.transpose(1, 2).contiguous().view(batch_size, seq_len, embed_dim)

        return self.out_proj(attn_output)

class OptimizedQ4KMTransformerBlock(nn.Module):
    """Optimized transformer block with Q4_K_M"""

    def __init__(self, embed_dim: int, num_heads: int, ffn_dim: int, dropout: float = 0.1):
        super().__init__()
        self.attention = FlashAttentionQ4KM(embed_dim, num_heads, dropout)
        self.norm1 = nn.LayerNorm(embed_dim)
        self.norm2 = nn.LayerNorm(embed_dim)

        # Q4_K_M quantized FFN
        self.ffn_up = OptimizedQ4KMLinear(embed_dim, ffn_dim)
        self.ffn_gate = OptimizedQ4KMLinear(embed_dim, ffn_dim)
        self.ffn_down = OptimizedQ4KMLinear(ffn_dim, embed_dim)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x: torch.Tensor, attn_mask: Optional[torch.Tensor] = None) -> torch.Tensor:
        # Attention block
        residual = x
        x = self.norm1(x)
        x = self.attention(x, attn_mask)
        x = residual + self.dropout(x)

        # FFN block (SwiGLU activation)
        residual = x
        x = self.norm2(x)
        gate = F.silu(self.ffn_gate(x))
        up = self.ffn_up(x)
        x = gate * up
        x = self.ffn_down(x)
        x = residual + self.dropout(x)

        return x

class OptimizedQ4KMModel(nn.Module):
    """Complete optimized Q4_K_M model"""

    def __init__(self,
                 vocab_size: int = 50000,
                 embed_dim: int = 4096,
                 num_layers: int = 32,
                 num_heads: int = 32,
                 max_seq_len: int = 4096,
                 dropout: float = 0.1):
        super().__init__()

        self.embed_dim = embed_dim
        self.max_seq_len = max_seq_len

        # Embeddings (keep in FP16 for accuracy)
        self.token_embedding = nn.Embedding(vocab_size, embed_dim)
        self.position_embedding = nn.Embedding(max_seq_len, embed_dim)

        # Transformer layers with Q4_K_M
        self.layers = nn.ModuleList([
            OptimizedQ4KMTransformerBlock(
                embed_dim, num_heads, embed_dim * 4, dropout
            ) for _ in range(num_layers)
        ])

        self.norm = nn.LayerNorm(embed_dim)
        self.dropout = nn.Dropout(dropout)

    def forward(self, input_ids: torch.Tensor, attention_mask: Optional[torch.Tensor] = None) -> torch.Tensor:
        batch_size, seq_len = input_ids.shape

        # Create position indices
        position_ids = torch.arange(seq_len, device=input_ids.device).unsqueeze(0).expand(batch_size, -1)

        # Embeddings
        token_embeds = self.token_embedding(input_ids)
        pos_embeds = self.position_embedding(position_ids)
        x = self.dropout(token_embeds + pos_embeds)

        # Transformer layers
        for layer in self.layers:
            x = layer(x, attention_mask)

        x = self.norm(x)
        return x

class Q4KMOptimizer:
    """Main optimizer for Q4_K_M models"""

    def __init__(self, device: str = "cuda"):
        self.device = torch.device(device if torch.cuda.is_available() else "cpu")
        self.model = None

    def create_model(self, **model_kwargs) -> OptimizedQ4KMModel:
        """Create optimized Q4_K_M model"""
        print(f"Creating optimized Q4_K_M model on {self.device}")

        self.model = OptimizedQ4KMModel(**model_kwargs).to(self.device)

        # Enable optimizations
        if hasattr(torch, 'compile'):
            print("Compiling model with PyTorch 2.0+")
            self.model = torch.compile(self.model, mode="max-autotune")

        return self.model

    def quantize_existing_model(self, model: nn.Module) -> OptimizedQ4KMModel:
        """Convert existing model to Q4_K_M format"""
        print("Converting model to Q4_K_M format...")

        # This would involve copying weights and quantizing them
        # For now, we'll create a new model and copy embeddings
        optimized_model = self.create_model()

        # Copy embeddings (keep in FP16)
        if hasattr(model, 'token_embedding'):
            optimized_model.token_embedding.weight.data.copy_(model.token_embedding.weight.data)
        if hasattr(model, 'position_embedding'):
            optimized_model.position_embedding.weight.data.copy_(model.position_embedding.weight.data)

        # Quantize linear layers
        self._quantize_linear_layers(model, optimized_model)

        return optimized_model

    def _quantize_linear_layers(self, source_model: nn.Module, target_model: nn.Module):
        """Quantize linear layers from source to target model"""
        for name, module in source_model.named_modules():
            if isinstance(module, nn.Linear):
                # Find corresponding Q4KM layer in target
                target_module = target_model
                for part in name.split('.'):
                    if hasattr(target_module, part):
                        target_module = getattr(target_module, part)
                    else:
                        break

                if isinstance(target_module, OptimizedQ4KMLinear):
                    # Quantize and copy weights
                    scales, mins, quantized = Q4KMQuantization.pack_q4km(module.weight)
                    target_module.scales.copy_(scales)
                    target_module.mins.copy_(mins)
                    target_module.quantized_weight.copy_(quantized)

                    if module.bias is not None and target_module.bias is not None:
                        target_module.bias.data.copy_(module.bias.data)

    def benchmark_model(self, model: nn.Module, batch_sizes: List[int] = [1, 4, 8]) -> Dict:
        """Benchmark model performance"""
        print("Benchmarking Q4_K_M model performance...")

        results = {}
        model.eval()

        with torch.no_grad():
            for batch_size in batch_sizes:
                seq_len = 512
                input_ids = torch.randint(0, 50000, (batch_size, seq_len), device=self.device)

                # Warmup
                for _ in range(5):
                    _ = model(input_ids)

                # Benchmark
                torch.cuda.synchronize()
                start_time = time.perf_counter()

                num_runs = 20
                for _ in range(num_runs):
                    output = model(input_ids)

                torch.cuda.synchronize()
                end_time = time.perf_counter()

                avg_time = (end_time - start_time) / num_runs
                throughput = (batch_size * seq_len) / avg_time

                results[f"batch_{batch_size}"] = {
                    "avg_time_ms": avg_time * 1000,
                    "throughput_tokens_per_sec": throughput,
                    "memory_mb": torch.cuda.max_memory_allocated() / 1e6 if torch.cuda.is_available() else 0
                }

                print(f"  Batch {batch_size}: {avg_time*1000:.2f}ms, {throughput:.1f} tokens/sec")

        return results

def main():
    parser = argparse.ArgumentParser(description="PyTorch Q4_K_M Optimizer")
    parser.add_argument("--create-model", action="store_true", help="Create new optimized model")
    parser.add_argument("--benchmark", action="store_true", help="Run performance benchmark")
    parser.add_argument("--output-dir", default="./q4km_optimized", help="Output directory")

    args = parser.parse_args()

    # Check CUDA
    if torch.cuda.is_available():
        print(f"✅ Using CUDA: {torch.cuda.get_device_name(0)}")
        print(f"   Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
    else:
        print("⚠️  CUDA not available, using CPU")

    # Initialize optimizer
    optimizer = Q4KMOptimizer()

    if args.create_model:
        # Create optimized model
        model = optimizer.create_model(
            vocab_size=50000,
            embed_dim=4096,
            num_layers=32,
            num_heads=32,
            max_seq_len=4096
        )

        print(f"Model created with {sum(p.numel() for p in model.parameters())} parameters")

        # Save model
        output_dir = Path(args.output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        torch.save(model.state_dict(), output_dir / "q4km_optimized_model.pt")
        print(f"Model saved to {output_dir / 'q4km_optimized_model.pt'}")

        if args.benchmark:
            # Benchmark performance
            results = optimizer.benchmark_model(model)

            with open(output_dir / "benchmark_results.json", 'w') as f:
                json.dump(results, f, indent=2)
            print(f"Benchmark results saved to {output_dir / 'benchmark_results.json'}")

if __name__ == "__main__":
    main()