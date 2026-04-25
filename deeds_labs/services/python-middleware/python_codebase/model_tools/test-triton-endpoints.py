#!/usr/bin/env python3
"""
Test script for NVIDIA Triton Inference Server endpoints
Validates legal AI model deployment and performance
"""

import asyncio
import aiohttp
import json
import time
import numpy as np
from typing import Dict, List, Optional
import argparse
import sys


class TritonLegalAITester:
    """Test suite for Triton Legal AI deployment"""

    def __init__(self, triton_host: str = "localhost", triton_port: int = 8000):
        self.base_url = f"http://{triton_host}:{triton_port}"
        self.grpc_url = f"{triton_host}:{triton_port + 1}"

        # Sample legal texts for testing
        self.legal_test_cases = [
            "This contract between parties establishes terms for software licensing agreement.",
            "The defendant is charged with breach of fiduciary duty under corporate law.",
            "Intellectual property rights include patents, trademarks, and copyrights.",
            "Employment contract contains non-compete clause valid for two years.",
            "Real estate purchase agreement includes contingencies for financing approval.",
        ]

    async def test_server_health(self) -> bool:
        """Test if Triton server is running and healthy"""
        print("🔍 Testing Triton server health...")

        try:
            async with aiohttp.ClientSession() as session:
                # Test server readiness
                async with session.get(f"{self.base_url}/v2/health/ready") as response:
                    if response.status == 200:
                        print("✅ Triton server is ready")

                        # Test server liveness
                        async with session.get(f"{self.base_url}/v2/health/live") as live_response:
                            if live_response.status == 200:
                                print("✅ Triton server is live")
                                return True

                print(f"❌ Server health check failed: {response.status}")
                return False

        except Exception as e:
            print(f"❌ Server connection failed: {e}")
            return False

    async def test_model_availability(self) -> Dict[str, bool]:
        """Test if legal AI models are loaded and available"""
        print("🔍 Testing model availability...")

        models_status = {}
        expected_models = ["legal_embedding", "legal_generation"]

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{self.base_url}/v2/models") as response:
                    if response.status == 200:
                        models_data = await response.json()
                        available_models = [model["name"] for model in models_data.get("models", [])]

                        for model in expected_models:
                            is_available = model in available_models
                            models_status[model] = is_available
                            status = "✅" if is_available else "❌"
                            print(f"{status} Model '{model}': {'Available' if is_available else 'Not Found'}")

                            if is_available:
                                # Test model readiness
                                async with session.get(f"{self.base_url}/v2/models/{model}/ready") as model_response:
                                    is_ready = model_response.status == 200
                                    ready_status = "✅" if is_ready else "❌"
                                    print(f"  {ready_status} Model '{model}' ready status: {is_ready}")
                    else:
                        print(f"❌ Failed to fetch models list: {response.status}")

        except Exception as e:
            print(f"❌ Model availability check failed: {e}")

        return models_status

    async def test_embedding_inference(self) -> Dict[str, float]:
        """Test legal document embedding inference"""
        print("🔍 Testing legal embedding inference...")

        metrics = {"success_rate": 0.0, "avg_latency_ms": 0.0, "throughput_docs_per_sec": 0.0}

        try:
            # Simulate tokenized input (would normally come from tokenizer)
            # Using dummy token IDs for testing
            input_ids = [101, 1188, 3899, 2090, 4243, 16034, 3408, 2005, 4007, 10548, 4428, 102] + [0] * 244  # Pad to 256
            attention_mask = [1] * 12 + [0] * 244  # Attention for real tokens only

            inference_payload = {
                "inputs": [
                    {
                        "name": "input_ids",
                        "shape": [1, 256],
                        "datatype": "INT32",
                        "data": input_ids
                    },
                    {
                        "name": "attention_mask",
                        "shape": [1, 256],
                        "datatype": "INT32",
                        "data": attention_mask
                    }
                ],
                "outputs": [
                    {"name": "embeddings"}
                ]
            }

            successful_requests = 0
            total_requests = 10
            latencies = []

            async with aiohttp.ClientSession() as session:
                for i in range(total_requests):
                    start_time = time.time()

                    try:
                        async with session.post(
                            f"{self.base_url}/v2/models/legal_embedding/infer",
                            json=inference_payload,
                            headers={"Content-Type": "application/json"}
                        ) as response:

                            if response.status == 200:
                                result = await response.json()
                                embeddings = result["outputs"][0]["data"]

                                if len(embeddings) == 768:  # Expected embedding dimension
                                    successful_requests += 1
                                    latency = (time.time() - start_time) * 1000
                                    latencies.append(latency)
                                    print(f"  ✅ Request {i+1}: {latency:.2f}ms, embedding dim: {len(embeddings)}")
                                else:
                                    print(f"  ❌ Request {i+1}: Unexpected embedding dimension: {len(embeddings)}")
                            else:
                                print(f"  ❌ Request {i+1}: HTTP {response.status}")

                    except Exception as e:
                        print(f"  ❌ Request {i+1}: Exception: {e}")

            if latencies:
                metrics["success_rate"] = successful_requests / total_requests
                metrics["avg_latency_ms"] = np.mean(latencies)
                metrics["throughput_docs_per_sec"] = 1000 / metrics["avg_latency_ms"] if metrics["avg_latency_ms"] > 0 else 0

                print(f"📊 Embedding Performance:")
                print(f"   Success Rate: {metrics['success_rate']*100:.1f}%")
                print(f"   Average Latency: {metrics['avg_latency_ms']:.2f}ms")
                print(f"   Throughput: {metrics['throughput_docs_per_sec']:.1f} docs/sec")

        except Exception as e:
            print(f"❌ Embedding inference test failed: {e}")

        return metrics

    async def test_batch_inference(self) -> Dict[str, float]:
        """Test batch processing performance"""
        print("🔍 Testing batch inference performance...")

        metrics = {"batch_latency_ms": 0.0, "batch_throughput": 0.0}

        try:
            # Create batch of 4 legal documents
            batch_size = 4
            max_length = 256

            batch_input_ids = []
            batch_attention_mask = []

            for i in range(batch_size):
                # Simulate different legal document tokens
                base_tokens = [101, 1188, 3899, 2090, 4243, 16034, 3408, 2005, 4007, 10548, 4428, 102]
                # Add some variation
                tokens = base_tokens + [1000 + i*10 + j for j in range(20)] + [0] * (max_length - len(base_tokens) - 20)
                attention = [1] * (len(base_tokens) + 20) + [0] * (max_length - len(base_tokens) - 20)

                batch_input_ids.extend(tokens)
                batch_attention_mask.extend(attention)

            batch_payload = {
                "inputs": [
                    {
                        "name": "input_ids",
                        "shape": [batch_size, max_length],
                        "datatype": "INT32",
                        "data": batch_input_ids
                    },
                    {
                        "name": "attention_mask",
                        "shape": [batch_size, max_length],
                        "datatype": "INT32",
                        "data": batch_attention_mask
                    }
                ],
                "outputs": [
                    {"name": "embeddings"}
                ]
            }

            start_time = time.time()

            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.base_url}/v2/models/legal_embedding/infer",
                    json=batch_payload,
                    headers={"Content-Type": "application/json"}
                ) as response:

                    if response.status == 200:
                        result = await response.json()
                        embeddings = result["outputs"][0]["data"]

                        expected_total_dims = batch_size * 768
                        if len(embeddings) == expected_total_dims:
                            batch_latency = (time.time() - start_time) * 1000
                            metrics["batch_latency_ms"] = batch_latency
                            metrics["batch_throughput"] = batch_size / (batch_latency / 1000)

                            print(f"📊 Batch Performance:")
                            print(f"   Batch Size: {batch_size} documents")
                            print(f"   Batch Latency: {batch_latency:.2f}ms")
                            print(f"   Per-Document Latency: {batch_latency/batch_size:.2f}ms")
                            print(f"   Batch Throughput: {metrics['batch_throughput']:.1f} docs/sec")
                            print(f"   ✅ Embedding dimensions: {len(embeddings)} (expected: {expected_total_dims})")
                        else:
                            print(f"❌ Unexpected batch embedding dimensions: {len(embeddings)}")
                    else:
                        print(f"❌ Batch inference failed: HTTP {response.status}")

        except Exception as e:
            print(f"❌ Batch inference test failed: {e}")

        return metrics

    async def test_gpu_metrics(self) -> Dict[str, float]:
        """Test GPU utilization and metrics collection"""
        print("🔍 Testing GPU metrics collection...")

        gpu_metrics = {}

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{self.base_url}:2/metrics") as response:
                    if response.status == 200:
                        metrics_text = await response.text()

                        # Parse Triton metrics
                        gpu_utilization = self._extract_metric(metrics_text, "nv_gpu_utilization")
                        gpu_memory_used = self._extract_metric(metrics_text, "nv_gpu_memory_used_bytes")
                        gpu_memory_total = self._extract_metric(metrics_text, "nv_gpu_memory_total_bytes")

                        gpu_metrics = {
                            "gpu_utilization": gpu_utilization,
                            "gpu_memory_used_mb": gpu_memory_used / 1024 / 1024 if gpu_memory_used else 0,
                            "gpu_memory_total_mb": gpu_memory_total / 1024 / 1024 if gpu_memory_total else 0,
                        }

                        print(f"📊 GPU Metrics:")
                        print(f"   GPU Utilization: {gpu_utilization:.1f}%" if gpu_utilization else "   GPU Utilization: N/A")
                        print(f"   GPU Memory Used: {gpu_metrics['gpu_memory_used_mb']:.1f}MB")
                        print(f"   GPU Memory Total: {gpu_metrics['gpu_memory_total_mb']:.1f}MB")

                        if gpu_memory_total and gpu_memory_used:
                            memory_usage_percent = (gpu_memory_used / gpu_memory_total) * 100
                            print(f"   Memory Usage: {memory_usage_percent:.1f}%")

                    else:
                        print(f"❌ Metrics endpoint failed: HTTP {response.status}")

        except Exception as e:
            print(f"❌ GPU metrics test failed: {e}")

        return gpu_metrics

    def _extract_metric(self, metrics_text: str, metric_name: str) -> Optional[float]:
        """Extract metric value from Prometheus format"""
        try:
            for line in metrics_text.split('\n'):
                if line.startswith(metric_name):
                    # Extract the numeric value
                    parts = line.split()
                    if len(parts) >= 2:
                        return float(parts[-1])
        except:
            pass
        return None

    async def run_full_test_suite(self) -> Dict[str, any]:
        """Run complete test suite for Triton Legal AI deployment"""
        print("🚀 Starting Triton Legal AI Test Suite...")
        print("=" * 60)

        results = {}

        # Test 1: Server Health
        results["server_healthy"] = await self.test_server_health()
        print()

        if not results["server_healthy"]:
            print("❌ Server health check failed. Stopping tests.")
            return results

        # Test 2: Model Availability
        results["models_available"] = await self.test_model_availability()
        print()

        # Test 3: Embedding Inference
        if results["models_available"].get("legal_embedding", False):
            results["embedding_metrics"] = await self.test_embedding_inference()
            print()

            # Test 4: Batch Inference
            results["batch_metrics"] = await self.test_batch_inference()
            print()
        else:
            print("⚠️  Skipping inference tests - legal_embedding model not available")

        # Test 5: GPU Metrics
        results["gpu_metrics"] = await self.test_gpu_metrics()
        print()

        # Summary
        print("=" * 60)
        print("🎯 TEST SUMMARY")
        print("=" * 60)

        if results["server_healthy"]:
            print("✅ Triton server is operational")
        else:
            print("❌ Triton server has issues")

        embedding_available = results["models_available"].get("legal_embedding", False)
        if embedding_available:
            print("✅ Legal embedding model is available")

            if "embedding_metrics" in results:
                embed_metrics = results["embedding_metrics"]
                if embed_metrics["success_rate"] > 0.8:
                    print(f"✅ Embedding inference working ({embed_metrics['success_rate']*100:.0f}% success)")
                    print(f"⚡ Performance: {embed_metrics['avg_latency_ms']:.1f}ms avg latency")
                else:
                    print(f"⚠️  Embedding inference issues ({embed_metrics['success_rate']*100:.0f}% success)")
        else:
            print("❌ Legal embedding model not available")

        # Performance assessment
        if "embedding_metrics" in results:
            latency = results["embedding_metrics"]["avg_latency_ms"]
            if latency < 10:
                print("🚀 EXCELLENT: Sub-10ms latency achieved!")
            elif latency < 50:
                print("✅ GOOD: Production-ready latency")
            elif latency < 200:
                print("⚠️  FAIR: Acceptable latency")
            else:
                print("❌ POOR: High latency detected")

        return results


async def main():
    parser = argparse.ArgumentParser(description="Test Triton Legal AI deployment")
    parser.add_argument("--host", default="localhost", help="Triton server host")
    parser.add_argument("--port", type=int, default=8000, help="Triton server HTTP port")
    parser.add_argument("--quick", action="store_true", help="Run quick tests only")

    args = parser.parse_args()

    tester = TritonLegalAITester(args.host, args.port)

    try:
        results = await tester.run_full_test_suite()

        # Save results
        with open("triton_test_results.json", "w") as f:
            json.dump(results, f, indent=2, default=str)

        print(f"\n📁 Test results saved to: triton_test_results.json")

        # Exit code based on health
        if results.get("server_healthy", False) and results.get("models_available", {}).get("legal_embedding", False):
            print("🎉 All critical tests passed!")
            sys.exit(0)
        else:
            print("❌ Critical tests failed!")
            sys.exit(1)

    except KeyboardInterrupt:
        print("\n⏹️  Tests interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n💥 Test suite failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())