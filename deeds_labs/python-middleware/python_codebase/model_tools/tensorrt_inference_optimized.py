#!/usr/bin/env python3
"""
Optimized TensorRT inference engine for legal AI
Targets sub-1ms inference latency for legal document processing
"""

import os
import time
import json
import asyncio
from pathlib import Path
from typing import Dict, List, Optional, Union
import numpy as np

try:
    import tensorrt_llm
    from tensorrt_llm.runtime import ModelRunner, ModelRunnerCpp
    from tensorrt_llm.runtime.generation import GenerationSession
    import torch
    TENSORRT_AVAILABLE = True
except ImportError:
    TENSORRT_AVAILABLE = False
    print("⚠️ TensorRT-LLM not available. Install with: pip install tensorrt-llm")

class OptimizedTensorRTInference:
    """Highly optimized TensorRT inference engine for legal AI"""

    def __init__(self, engine_dir: str = "/home/james/gemma3_optimized_engine"):
        self.engine_dir = Path(engine_dir)
        self.model_runner = None
        self.tokenizer = None
        self.generation_session = None
        self.optimization_config = {}
        self.performance_stats = {
            "total_requests": 0,
            "avg_latency_ms": 0,
            "min_latency_ms": float('inf'),
            "max_latency_ms": 0,
            "sub_1ms_requests": 0
        }

    def load_optimization_config(self):
        """Load optimization configuration"""
        config_path = self.engine_dir / "optimization_config.json"
        if config_path.exists():
            with open(config_path, 'r') as f:
                self.optimization_config = json.load(f)
                print(f"✅ Loaded optimization config: {self.optimization_config['engine_name']}")
        else:
            print("⚠️ No optimization config found, using defaults")

    def initialize_engine(self):
        """Initialize the TensorRT engine with optimizations"""
        if not TENSORRT_AVAILABLE:
            raise RuntimeError("TensorRT-LLM is required for optimized inference")

        print("🚀 Initializing optimized TensorRT engine...")

        # Load optimization config
        self.load_optimization_config()

        # Check if engine exists
        engine_path = self.engine_dir / "rank0.engine"
        if not engine_path.exists():
            raise FileNotFoundError(f"Engine not found: {engine_path}")

        # Initialize model runner with optimizations
        try:
            self.model_runner = ModelRunnerCpp.from_dir(
                engine_dir=str(self.engine_dir),
                lora_dir=None,
                rank=0,
                debug_mode=False,
                stream_mode=True  # Enable streaming for faster response
            )
            print("✅ TensorRT engine initialized successfully")

            # Warm up the engine with a small prompt
            self.warmup_engine()

        except Exception as e:
            print(f"❌ Failed to initialize TensorRT engine: {e}")
            raise

    def warmup_engine(self):
        """Warm up the engine to achieve optimal performance"""
        print("🔥 Warming up engine for optimal performance...")

        warmup_prompts = [
            "Legal analysis:",
            "Contract review:",
            "Case summary:"
        ]

        for prompt in warmup_prompts:
            try:
                start_time = time.perf_counter()
                _ = self.generate_sync(prompt, max_tokens=10, temperature=0.1)
                warmup_latency = (time.perf_counter() - start_time) * 1000
                print(f"  Warmup latency: {warmup_latency:.2f}ms")
            except Exception as e:
                print(f"  Warmup warning: {e}")

        print("✅ Engine warmup complete")

    def generate_sync(self,
                     prompt: str,
                     max_tokens: int = 256,
                     temperature: float = 0.7,
                     top_p: float = 0.9) -> Dict:
        """Synchronous generation with performance tracking"""

        if not self.model_runner:
            raise RuntimeError("Engine not initialized. Call initialize_engine() first.")

        start_time = time.perf_counter()

        try:
            # Prepare inputs
            inputs = [prompt]

            # Generate with optimizations
            outputs = self.model_runner.generate(
                batch_input_ids=inputs,
                max_new_tokens=max_tokens,
                max_attention_window_size=512,  # Optimized for legal docs
                sink_token_length=4,
                end_id=None,
                pad_id=None,
                temperature=temperature,
                top_k=40,
                top_p=top_p,
                num_beams=1,  # Greedy for speed
                length_penalty=1.0,
                early_stopping=1,
                repetition_penalty=1.0,
                presence_penalty=0.0,
                frequency_penalty=0.0,
                output_sequence_lengths=True,
                return_dict=True
            )

            # Calculate latency
            end_time = time.perf_counter()
            latency_ms = (end_time - start_time) * 1000

            # Update performance stats
            self.update_performance_stats(latency_ms)

            # Extract response
            if outputs and len(outputs) > 0:
                response_text = outputs[0] if isinstance(outputs[0], str) else str(outputs[0])
            else:
                response_text = ""

            return {
                "response": response_text,
                "latency_ms": latency_ms,
                "tokens_generated": len(response_text.split()),
                "tokens_per_second": len(response_text.split()) / (latency_ms / 1000) if latency_ms > 0 else 0,
                "sub_1ms": latency_ms < 1.0
            }

        except Exception as e:
            end_time = time.perf_counter()
            latency_ms = (end_time - start_time) * 1000

            return {
                "error": str(e),
                "latency_ms": latency_ms,
                "response": "",
                "tokens_generated": 0,
                "tokens_per_second": 0,
                "sub_1ms": False
            }

    async def generate_async(self,
                           prompt: str,
                           max_tokens: int = 256,
                           temperature: float = 0.7) -> Dict:
        """Asynchronous generation for concurrent requests"""

        # Run in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            self.generate_sync,
            prompt,
            max_tokens,
            temperature
        )

    def update_performance_stats(self, latency_ms: float):
        """Update performance statistics"""
        self.performance_stats["total_requests"] += 1
        self.performance_stats["min_latency_ms"] = min(
            self.performance_stats["min_latency_ms"],
            latency_ms
        )
        self.performance_stats["max_latency_ms"] = max(
            self.performance_stats["max_latency_ms"],
            latency_ms
        )

        # Update average latency
        n = self.performance_stats["total_requests"]
        current_avg = self.performance_stats["avg_latency_ms"]
        self.performance_stats["avg_latency_ms"] = (
            (current_avg * (n - 1) + latency_ms) / n
        )

        # Track sub-1ms requests
        if latency_ms < 1.0:
            self.performance_stats["sub_1ms_requests"] += 1

    def get_performance_report(self) -> Dict:
        """Get detailed performance report"""
        total = self.performance_stats["total_requests"]
        sub_1ms = self.performance_stats["sub_1ms_requests"]

        return {
            **self.performance_stats,
            "sub_1ms_percentage": (sub_1ms / total * 100) if total > 0 else 0,
            "optimization_config": self.optimization_config
        }

    def benchmark_legal_ai(self, num_tests: int = 10) -> Dict:
        """Benchmark with legal AI specific prompts"""

        legal_prompts = [
            "Analyze this contract clause for potential risks:",
            "Summarize the key legal issues in this case:",
            "Review this patent application for novelty:",
            "Identify compliance requirements for:",
            "Draft a brief summary of this legal document:",
            "Assess the liability exposure in this situation:",
            "Determine the legal precedent for:",
            "Evaluate the enforceability of this agreement:",
            "Analyze the intellectual property implications:",
            "Review regulatory compliance requirements:"
        ]

        print(f"🧪 Running legal AI benchmark ({num_tests} tests)...")

        results = []
        for i in range(num_tests):
            prompt = legal_prompts[i % len(legal_prompts)]
            result = self.generate_sync(prompt, max_tokens=50, temperature=0.1)
            results.append(result)

            if result.get("sub_1ms", False):
                print(f"  Test {i+1}: ⚡ {result['latency_ms']:.3f}ms (SUB-1MS!)")
            else:
                print(f"  Test {i+1}: {result['latency_ms']:.3f}ms")

        return {
            "benchmark_results": results,
            "performance_summary": self.get_performance_report()
        }

def main():
    """Main function for testing optimized inference"""

    if not TENSORRT_AVAILABLE:
        print("❌ TensorRT-LLM not available. Please install it first.")
        return

    # Initialize optimized inference engine
    engine = OptimizedTensorRTInference()

    try:
        # Initialize the engine
        engine.initialize_engine()

        # Run benchmark
        benchmark_results = engine.benchmark_legal_ai(num_tests=5)

        # Print results
        print("\n📊 Benchmark Results:")
        print(f"  Total requests: {engine.performance_stats['total_requests']}")
        print(f"  Average latency: {engine.performance_stats['avg_latency_ms']:.3f}ms")
        print(f"  Min latency: {engine.performance_stats['min_latency_ms']:.3f}ms")
        print(f"  Max latency: {engine.performance_stats['max_latency_ms']:.3f}ms")
        print(f"  Sub-1ms requests: {engine.performance_stats['sub_1ms_requests']}")

        # Save benchmark results
        with open("tensorrt_benchmark_results.json", "w") as f:
            json.dump(benchmark_results, f, indent=2)

        print("✅ Benchmark complete! Results saved to tensorrt_benchmark_results.json")

    except Exception as e:
        print(f"❌ Benchmark failed: {e}")

if __name__ == "__main__":
    main()