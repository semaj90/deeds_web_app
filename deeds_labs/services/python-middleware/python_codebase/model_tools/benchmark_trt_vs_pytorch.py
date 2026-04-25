#!/usr/bin/env python3
"""
Benchmark TensorRT vs PyTorch performance for Gemma 3 270M
"""
import time
import numpy as np
import torch
from pathlib import Path
import sys
import os

# Add the model_tools directory to path
sys.path.append(str(Path(__file__).parent))

from trt_inference_server import GemmaTRTServer

def load_pytorch_model():
    """Load PyTorch model for comparison"""
    try:
        from transformers import AutoModelForCausalLM, AutoTokenizer

        model_path = "/workspace/models/gemma_3_270m"
        if not Path(model_path).exists():
            print("❌ PyTorch model not found for comparison")
            return None, None

        print("🔄 Loading PyTorch model...")
        start_time = time.time()

        model = AutoModelForCausalLM.from_pretrained(
            model_path,
            torch_dtype=torch.float16,
            device_map="auto",
            local_files_only=True  # Use only local files
        )
        tokenizer = AutoTokenizer.from_pretrained(
            model_path,
            local_files_only=True  # Use only local files
        )

        load_time = time.time() - start_time
        print(f"Loaded PyTorch model in {load_time:.2f} seconds")
        return model, tokenizer
    except ImportError:
        print("❌ transformers not available for PyTorch comparison")
        return None, None
    except Exception as e:
        print(f"❌ Failed to load PyTorch model: {e}")
        return None, None

def benchmark_pytorch(model, tokenizer, num_runs=5, seq_length=512):
    """Benchmark PyTorch inference"""
    if model is None or tokenizer is None:
        return None

    print(f"🔬 Benchmarking PyTorch ({num_runs} runs, seq_len={seq_length})...")

    # Create dummy input
    input_ids = torch.randint(0, tokenizer.vocab_size, (1, seq_length), dtype=torch.long).cuda()
    attention_mask = torch.ones_like(input_ids).cuda()

    # Warmup
    with torch.no_grad():
        _ = model(input_ids, attention_mask=attention_mask)

    times = []
    for i in range(num_runs):
        torch.cuda.synchronize()
        start_time = time.time()

        with torch.no_grad():
            outputs = model(input_ids, attention_mask=attention_mask)

        torch.cuda.synchronize()
        inference_time = time.time() - start_time
        times.append(inference_time * 1000)  # Convert to ms

    avg_time = np.mean(times)
    throughput = seq_length / (avg_time / 1000)  # tokens/second

    results = {
        "framework": "PyTorch",
        "avg_inference_time_ms": round(avg_time, 2),
        "throughput_tokens_per_sec": round(throughput, 1),
        "runs": num_runs,
        "sequence_length": seq_length
    }

    print("📊 PyTorch Results:")
    print(f"   Average inference time: {results['avg_inference_time_ms']} ms")
    print(f"   Throughput: {results['throughput_tokens_per_sec']} tokens/sec")

    return results

def benchmark_tensorrt(engine_path, num_runs=5, seq_length=512):
    """Benchmark TensorRT inference"""
    print(f"🔬 Benchmarking TensorRT ({num_runs} runs, seq_len={seq_length})...")

    # Create dummy input
    input_ids = np.random.randint(0, 262144, (1, seq_length), dtype=np.int64)
    attention_mask = np.ones((1, seq_length), dtype=np.int64)

    # Load engine (minimal setup for benchmarking)
    logger = __import__('tensorrt').Logger(__import__('tensorrt').Logger.WARNING)
    runtime = __import__('tensorrt').Runtime(logger)

    with open(engine_path, "rb") as f:
        engine_data = f.read()

    engine = runtime.deserialize_cuda_engine(engine_data)
    context = engine.create_execution_context()

    if engine.num_optimization_profiles > 0:
        context.set_optimization_profile_async(0, 0)

    # Prepare output buffer
    vocab_size = 262144
    output_shape = (1, seq_length, vocab_size)
    output = np.empty(output_shape, dtype=np.float32)

    # Warmup
    context.set_tensor_address("input_ids", input_ids.ctypes.data)
    context.set_tensor_address("attention_mask", attention_mask.ctypes.data)
    context.set_tensor_address("logits", output.ctypes.data)
    context.set_input_shape("input_ids", input_ids.shape)
    context.set_input_shape("attention_mask", attention_mask.shape)
    context.execute_async_v3(0)

    times = []
    for i in range(num_runs):
        start_time = time.time()
        success = context.execute_async_v3(0)
        inference_time = time.time() - start_time
        times.append(inference_time * 1000)  # Convert to ms

    avg_time = np.mean(times)
    throughput = seq_length / (avg_time / 1000)  # tokens/second

    results = {
        "framework": "TensorRT",
        "avg_inference_time_ms": round(avg_time, 2),
        "throughput_tokens_per_sec": round(throughput, 1),
        "runs": num_runs,
        "sequence_length": seq_length
    }

    print("📊 TensorRT Results:")
    print(f"   Average inference time: {results['avg_inference_time_ms']} ms")
    print(f"   Throughput: {results['throughput_tokens_per_sec']} tokens/sec")

    return results

def main():
    import argparse

    parser = argparse.ArgumentParser(description="Benchmark TensorRT vs PyTorch")
    parser.add_argument("--engine", required=True, help="Path to TensorRT engine")
    parser.add_argument("--runs", type=int, default=10, help="Number of benchmark runs")
    parser.add_argument("--seq-length", type=int, default=512, help="Sequence length for benchmarking")

    args = parser.parse_args()

    print("🚀 Gemma 3 270M Performance Benchmark")
    print("=" * 50)

    # Benchmark TensorRT
    trt_results = benchmark_tensorrt(args.engine, args.runs, args.seq_length)

    # Benchmark PyTorch
    pytorch_model, pytorch_tokenizer = load_pytorch_model()
    pytorch_results = benchmark_pytorch(pytorch_model, pytorch_tokenizer, args.runs, args.seq_length)

    print("\n" + "=" * 50)
    print("🎯 FINAL COMPARISON")
    print("=" * 50)

    if trt_results and pytorch_results:
        speedup = pytorch_results['avg_inference_time_ms'] / trt_results['avg_inference_time_ms']
        throughput_gain = trt_results['throughput_tokens_per_sec'] / pytorch_results['throughput_tokens_per_sec']

        print(f"TensorRT vs PyTorch Speedup: {speedup:.2f}x faster")
        print(f"TensorRT vs PyTorch Throughput: {throughput_gain:.2f}x higher")
        print(f"\n💡 TensorRT provides {speedup:.1f}x better performance!")
    else:
        print("TensorRT Results:")
        print(f"  - {trt_results['avg_inference_time_ms']} ms avg inference time")
        print(f"  - {trt_results['throughput_tokens_per_sec']} tokens/sec throughput")

        if pytorch_results:
            print("PyTorch Results:")
            print(f"  - {pytorch_results['avg_inference_time_ms']} ms avg inference time")
            print(f"  - {pytorch_results['throughput_tokens_per_sec']} tokens/sec throughput")

if __name__ == "__main__":
    main()