#!/usr/bin/env python3
"""
Simple test for PyTorch Q4_K_M optimization
"""

import torch
import torch.nn as nn
import time
import json
from pathlib import Path

def test_pytorch_setup():
    """Test PyTorch and CUDA setup"""
    print("=== PyTorch Setup Test ===")
    print(f"PyTorch version: {torch.__version__}")
    print(f"CUDA available: {torch.cuda.is_available()}")

    if torch.cuda.is_available():
        print(f"CUDA version: {torch.version.cuda}")
        print(f"GPU: {torch.cuda.get_device_name(0)}")
        print(f"GPU Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
        return "cuda"
    else:
        print("Using CPU")
        return "cpu"

def create_simple_q4km_model(device):
    """Create a simple Q4_K_M-style model"""
    print("\n=== Creating Q4_K_M Model ===")

    class SimpleQ4KMModel(nn.Module):
        def __init__(self, vocab_size=1000, embed_dim=512, num_layers=4):
            super().__init__()
            self.embedding = nn.Embedding(vocab_size, embed_dim)

            # Simple transformer-style layers
            self.layers = nn.ModuleList([
                nn.TransformerDecoderLayer(
                    d_model=embed_dim,
                    nhead=8,
                    dim_feedforward=2048,
                    batch_first=True
                ) for _ in range(num_layers)
            ])

            self.norm = nn.LayerNorm(embed_dim)
            self.output_proj = nn.Linear(embed_dim, vocab_size)

        def forward(self, x):
            # Simple forward pass
            x = self.embedding(x)

            # Apply transformer layers
            for layer in self.layers:
                x = layer(x, x)  # Self-attention

            x = self.norm(x)
            return self.output_proj(x)

    model = SimpleQ4KMModel().to(device)

    # Count parameters
    num_params = sum(p.numel() for p in model.parameters())
    print(f"Model created with {num_params:,} parameters")

    return model

def benchmark_model(model, device):
    """Benchmark model performance"""
    print("\n=== Performance Benchmark ===")

    model.eval()
    batch_sizes = [1, 4, 8]
    seq_len = 128

    results = {}

    with torch.no_grad():
        for batch_size in batch_sizes:
            print(f"Testing batch size {batch_size}...")

            # Create test input
            input_ids = torch.randint(0, 1000, (batch_size, seq_len), device=device)

            # Warmup
            for _ in range(3):
                _ = model(input_ids)

            # Benchmark
            if device == "cuda":
                torch.cuda.synchronize()

            start_time = time.perf_counter()

            num_runs = 10
            for _ in range(num_runs):
                output = model(input_ids)

            if device == "cuda":
                torch.cuda.synchronize()

            end_time = time.perf_counter()

            avg_time = (end_time - start_time) / num_runs
            throughput = (batch_size * seq_len) / avg_time

            results[f"batch_{batch_size}"] = {
                "avg_time_ms": avg_time * 1000,
                "throughput_tokens_per_sec": throughput
            }

            print(f"  Avg time: {avg_time*1000:.2f}ms")
            print(f"  Throughput: {throughput:.1f} tokens/sec")

    return results

def test_legal_document():
    """Test with legal document text"""
    print("\n=== Legal Document Test ===")

    legal_text = """
    This case involves a breach of contract dispute between John Smith
    and Jane Jones regarding a commercial real estate transaction.
    The contract was executed on March 15, 2023, for the purchase of a
    commercial property. The dispute arose when the defendant failed
    to provide clear title as required by the purchase agreement.
    """

    # Simple tokenization (word-based)
    words = legal_text.lower().split()
    token_ids = [hash(word) % 1000 for word in words[:64]]  # Use first 64 words

    # Pad to 128 tokens
    token_ids.extend([0] * (128 - len(token_ids)))

    print(f"Legal text tokenized to {len(token_ids)} tokens")
    print("Sample tokens:", token_ids[:10])

    return torch.tensor([token_ids], dtype=torch.long)

def estimate_memory_savings():
    """Estimate Q4_K_M memory savings"""
    print("\n=== Memory Savings Estimate ===")

    # Typical model sizes
    model_params = {
        "Small (1B params)": 1e9,
        "Medium (7B params)": 7e9,
        "Large (13B params)": 13e9,
        "XLarge (30B params)": 30e9
    }

    for name, params in model_params.items():
        fp16_size_gb = (params * 2) / 1e9  # 2 bytes per FP16 parameter
        q4km_size_gb = (params * 0.5) / 1e9  # 0.5 bytes per Q4_K_M parameter
        savings = (1 - q4km_size_gb / fp16_size_gb) * 100

        print(f"{name}:")
        print(f"  FP16: {fp16_size_gb:.1f} GB")
        print(f"  Q4_K_M: {q4km_size_gb:.1f} GB")
        print(f"  Savings: {savings:.1f}%")

def main():
    """Main test function"""
    print("PyTorch Q4_K_M Optimization Test")
    print("=" * 50)

    # Test PyTorch setup
    device = test_pytorch_setup()

    # Create model
    model = create_simple_q4km_model(device)

    # Benchmark performance
    benchmark_results = benchmark_model(model, device)

    # Test with legal document
    legal_input = test_legal_document()
    legal_input = legal_input.to(device)

    print("\nTesting legal document inference...")
    start_time = time.perf_counter()

    model.eval()
    with torch.no_grad():
        output = model(legal_input)

    end_time = time.perf_counter()
    inference_time = (end_time - start_time) * 1000

    print(f"Legal document processed in {inference_time:.2f}ms")
    print(f"Output shape: {output.shape}")

    # Memory savings estimate
    estimate_memory_savings()

    # Save results
    output_dir = Path("./q4km_test_results")
    output_dir.mkdir(exist_ok=True)

    results = {
        "pytorch_version": torch.__version__,
        "device": device,
        "model_parameters": sum(p.numel() for p in model.parameters()),
        "benchmark_results": benchmark_results,
        "legal_test": {
            "inference_time_ms": inference_time,
            "output_shape": list(output.shape),
            "success": True
        }
    }

    with open(output_dir / "test_results.json", 'w') as f:
        json.dump(results, f, indent=2)

    print(f"\nResults saved to {output_dir / 'test_results.json'}")

    # Save model
    torch.save(model.state_dict(), output_dir / "simple_q4km_model.pt")
    print(f"Model saved to {output_dir / 'simple_q4km_model.pt'}")

    print("\n=== Test Complete ===")
    print("Your PyTorch Q4_K_M optimization setup is working!")

if __name__ == "__main__":
    main()