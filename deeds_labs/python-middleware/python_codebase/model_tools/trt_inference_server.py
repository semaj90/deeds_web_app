#!/usr/bin/env python3
"""
TensorRT Inference Server for Gemma 3 270M
High-performance GPU inference with CUDA acceleration
"""
import numpy as np
import torch
import tensorrt as trt
import time
from pathlib import Path
from typing import List, Optional
import asyncio
import json

class GemmaTRTServer:
    def __init__(self, engine_path: str, tokenizer_path: str = None):
        self.engine_path = Path(engine_path)
        self.tokenizer_path = tokenizer_path
        self.logger = trt.Logger(trt.Logger.WARNING)
        self.runtime = trt.Runtime(self.logger)
        self.engine = None
        self.context = None

        # Load tokenizer if provided
        self.tokenizer = None
        if tokenizer_path:
            try:
                from transformers import AutoTokenizer
                self.tokenizer = AutoTokenizer.from_pretrained(tokenizer_path)
                print(f"Loaded tokenizer from {tokenizer_path}")
            except ImportError:
                print("Warning: transformers not available, tokenizer functionality disabled")

        self.load_engine()

    def load_engine(self):
        """Load TensorRT engine"""
        if not self.engine_path.exists():
            raise FileNotFoundError(f"Engine not found: {self.engine_path}")

        print(f"Loading TensorRT engine: {self.engine_path}")
        with open(self.engine_path, "rb") as f:
            engine_data = f.read()

        self.engine = self.runtime.deserialize_cuda_engine(engine_data)
        self.context = self.engine.create_execution_context()

        print("✅ TensorRT engine loaded successfully!")
        print(f"   Engine size: {self.engine_path.stat().st_size / (1024*1024):.1f} MB")
        print(f"   I/O tensors: {self.engine.num_io_tensors}")

        # Set optimization profile
        if self.engine.num_optimization_profiles > 0:
            self.context.set_optimization_profile_async(0, 0)

    def preprocess_input(self, text: str, max_length: int = 512) -> tuple:
        """Convert text to model inputs"""
        if self.tokenizer is None:
            raise ValueError("Tokenizer not available")

        # Tokenize input
        inputs = self.tokenizer(
            text,
            return_tensors="np",
            max_length=max_length,
            padding="max_length",
            truncation=True
        )

        input_ids = inputs["input_ids"].astype(np.int64)
        attention_mask = inputs["attention_mask"].astype(np.int64)

        return input_ids, attention_mask

    def run_inference(self, input_ids: np.ndarray, attention_mask: np.ndarray) -> np.ndarray:
        """Run inference with TensorRT"""
        batch_size, seq_len = input_ids.shape

        # Prepare output buffer
        vocab_size = 262144  # Gemma 3 vocabulary size
        output_shape = (batch_size, seq_len, vocab_size)
        output = np.empty(output_shape, dtype=np.float32)

        # Set tensor addresses
        self.context.set_tensor_address("input_ids", input_ids.ctypes.data)
        self.context.set_tensor_address("attention_mask", attention_mask.ctypes.data)
        self.context.set_tensor_address("logits", output.ctypes.data)

        # Set dynamic shapes
        self.context.set_input_shape("input_ids", input_ids.shape)
        self.context.set_input_shape("attention_mask", attention_mask.shape)

        # Execute inference
        start_time = time.time()
        success = self.context.execute_async_v3(0)
        inference_time = time.time() - start_time

        if not success:
            raise RuntimeError("TensorRT inference failed")

        return output, inference_time

    def generate_text(self, prompt: str, max_new_tokens: int = 50, temperature: float = 0.8) -> str:
        """Generate text from prompt"""
        if self.tokenizer is None:
            raise ValueError("Tokenizer required for text generation")

        # Preprocess input
        input_ids, attention_mask = self.preprocess_input(prompt)

        generated_tokens = []
        current_input_ids = input_ids.copy()
        current_attention_mask = attention_mask.copy()

        for _ in range(max_new_tokens):
            # Run inference
            logits, _ = self.run_inference(current_input_ids, current_attention_mask)

            # Get last token logits
            next_token_logits = logits[0, -1, :]

            # Apply temperature
            if temperature != 1.0:
                next_token_logits = next_token_logits / temperature

            # Sample next token (simple greedy for now)
            next_token = np.argmax(next_token_logits)

            # Check for EOS token
            if next_token == self.tokenizer.eos_token_id:
                break

            generated_tokens.append(next_token)

            # Update input for next iteration
            next_token_tensor = np.array([[next_token]], dtype=np.int64)
            current_input_ids = np.concatenate([current_input_ids, next_token_tensor], axis=1)

            # Update attention mask
            next_mask = np.array([[1]], dtype=np.int64)
            current_attention_mask = np.concatenate([current_attention_mask, next_mask], axis=1)

            # Truncate if too long
            if current_input_ids.shape[1] > 1024:
                current_input_ids = current_input_ids[:, -1024:]
                current_attention_mask = current_attention_mask[:, -1024:]

        # Decode generated tokens
        generated_text = self.tokenizer.decode(generated_tokens, skip_special_tokens=True)
        return generated_text

    async def benchmark(self, num_runs: int = 10, seq_length: int = 512) -> dict:
        """Benchmark inference performance"""
        print(f"🔬 Benchmarking TensorRT inference ({num_runs} runs, seq_len={seq_length})...")

        # Create dummy input
        input_ids = np.random.randint(0, 262144, (1, seq_length), dtype=np.int64)
        attention_mask = np.ones((1, seq_length), dtype=np.int64)

        times = []
        for i in range(num_runs):
            _, inference_time = self.run_inference(input_ids, attention_mask)
            times.append(inference_time * 1000)  # Convert to ms

        # Calculate statistics
        avg_time = np.mean(times)
        min_time = np.min(times)
        max_time = np.max(times)
        std_time = np.std(times)
        throughput = seq_length / (avg_time / 1000)  # tokens/second

        results = {
            "avg_inference_time_ms": round(avg_time, 2),
            "min_inference_time_ms": round(min_time, 2),
            "max_inference_time_ms": round(max_time, 2),
            "std_inference_time_ms": round(std_time, 2),
            "throughput_tokens_per_sec": round(throughput, 1),
            "runs": num_runs,
            "sequence_length": seq_length
        }

        print("📊 Benchmark Results:")
        print(f"   Average inference time: {results['avg_inference_time_ms']} ms")
        print(f"   Throughput: {results['throughput_tokens_per_sec']} tokens/sec")
        print(f"   Min/Max: {results['min_inference_time_ms']}/{results['max_inference_time_ms']} ms")

        return results

def main():
    import argparse

    parser = argparse.ArgumentParser(description="Gemma 3 TensorRT Inference Server")
    parser.add_argument("--engine", required=True, help="Path to TensorRT engine")
    parser.add_argument("--tokenizer", help="Path to tokenizer (optional)")
    parser.add_argument("--benchmark", action="store_true", help="Run benchmark")
    parser.add_argument("--prompt", help="Text prompt for generation")
    parser.add_argument("--max-tokens", type=int, default=50, help="Max tokens to generate")

    args = parser.parse_args()

    # Initialize server
    server = GemmaTRTServer(args.engine, args.tokenizer)

    if args.benchmark:
        # Run benchmark
        asyncio.run(server.benchmark())
    elif args.prompt:
        # Generate text
        print(f"Prompt: {args.prompt}")
        generated = server.generate_text(args.prompt, args.max_tokens)
        print(f"Generated: {generated}")
    else:
        print("Use --benchmark or --prompt to test the server")

if __name__ == "__main__":
    main()