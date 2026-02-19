#!/usr/bin/env python3
"""
Comprehensive Performance Benchmark Suite for Q4_K_M Legal AI Pipeline
Tests TensorRT-LLM, Ollama, and Docker implementations
"""

import asyncio
import aiohttp
import time
import json
import statistics
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from pathlib import Path
import argparse

@dataclass
class BenchmarkResult:
    endpoint: str
    backend: str
    avg_latency_ms: float
    min_latency_ms: float
    max_latency_ms: float
    p95_latency_ms: float
    throughput_tps: float
    tokens_per_second: float
    requests_processed: int
    errors: int
    success_rate: float

class Q4KMPipelineBenchmark:
    def __init__(self, base_url: str = "http://localhost:8100"):
        self.base_url = base_url
        self.legal_test_cases = [
            {
                "domain": "contract",
                "prompt": "Analyze this employment contract clause: 'Employee agrees to non-compete restrictions for 24 months post-termination within 50-mile radius.' Identify potential enforceability issues.",
                "expected_tokens": 150
            },
            {
                "domain": "litigation",
                "prompt": "Review discovery request: 'Produce all documents relating to software development from 2020-2024.' Assess scope and potential objections.",
                "expected_tokens": 120
            },
            {
                "domain": "compliance",
                "prompt": "Evaluate GDPR compliance for data transfer: 'Company transfers EU customer data to US subsidiary for analytics processing.' Identify risks.",
                "expected_tokens": 180
            },
            {
                "domain": "corporate",
                "prompt": "Assess merger consideration: '$50M cash plus 2M shares for target company with $100M revenue, 15% EBITDA margin.' Structure concerns?",
                "expected_tokens": 140
            },
            {
                "domain": "general",
                "prompt": "Review intellectual property licensing terms: 'Exclusive license for pharmaceutical patents in North America, 5% royalty, 10-year term.' Key issues?",
                "expected_tokens": 160
            }
        ]

    async def check_server_health(self, session: aiohttp.ClientSession) -> Dict[str, Any]:
        """Check if server is healthy and get backend info"""
        try:
            async with session.get(f"{self.base_url}/health") as response:
                if response.status == 200:
                    return await response.json()
                else:
                    return {"status": "unhealthy", "error": f"HTTP {response.status}"}
        except Exception as e:
            return {"status": "unreachable", "error": str(e)}

    async def single_completion_test(
        self,
        session: aiohttp.ClientSession,
        test_case: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Test single completion request"""
        start_time = time.perf_counter()

        try:
            payload = {
                "prompt": test_case["prompt"],
                "max_tokens": test_case["expected_tokens"] + 50,  # Allow some buffer
                "temperature": 0.1,
                "legal_domain": test_case["domain"]
            }

            async with session.post(
                f"{self.base_url}/v1/completions",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=120)
            ) as response:
                end_time = time.perf_counter()
                latency = (end_time - start_time) * 1000

                if response.status == 200:
                    result = await response.json()
                    return {
                        "success": True,
                        "latency_ms": latency,
                        "server_latency_ms": result.get("latency_ms", 0),
                        "tokens": result.get("tokens", 0),
                        "throughput_tps": result.get("throughput_tps", 0),
                        "backend": result.get("backend", "unknown"),
                        "domain": test_case["domain"]
                    }
                else:
                    error_text = await response.text()
                    return {
                        "success": False,
                        "latency_ms": latency,
                        "error": f"HTTP {response.status}: {error_text}",
                        "domain": test_case["domain"]
                    }

        except asyncio.TimeoutError:
            latency = (time.perf_counter() - start_time) * 1000
            return {
                "success": False,
                "latency_ms": latency,
                "error": "Request timeout",
                "domain": test_case["domain"]
            }
        except Exception as e:
            latency = (time.perf_counter() - start_time) * 1000
            return {
                "success": False,
                "latency_ms": latency,
                "error": str(e),
                "domain": test_case["domain"]
            }

    async def concurrent_load_test(
        self,
        num_requests: int = 10,
        concurrency: int = 5
    ) -> List[Dict[str, Any]]:
        """Run concurrent load test"""
        print(f"Running concurrent load test: {num_requests} requests, {concurrency} concurrent")

        # Create semaphore for concurrency control
        semaphore = asyncio.Semaphore(concurrency)

        async def bounded_test(session: aiohttp.ClientSession, test_case: Dict[str, Any]):
            async with semaphore:
                return await self.single_completion_test(session, test_case)

        # Generate test cases by cycling through legal domains
        test_cases = []
        for i in range(num_requests):
            test_case = self.legal_test_cases[i % len(self.legal_test_cases)]
            test_cases.append(test_case)

        # Run concurrent tests
        async with aiohttp.ClientSession() as session:
            start_time = time.perf_counter()
            tasks = [bounded_test(session, test_case) for test_case in test_cases]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            total_time = time.perf_counter() - start_time

            # Handle exceptions
            valid_results = []
            for result in results:
                if isinstance(result, Exception):
                    valid_results.append({
                        "success": False,
                        "latency_ms": 0,
                        "error": str(result),
                        "domain": "unknown"
                    })
                else:
                    valid_results.append(result)

            print(f"Load test completed in {total_time:.2f}s")
            return valid_results

    def analyze_results(self, results: List[Dict[str, Any]]) -> BenchmarkResult:
        """Analyze benchmark results and compute statistics"""
        successful_results = [r for r in results if r.get("success", False)]
        failed_results = [r for r in results if not r.get("success", False)]

        if not successful_results:
            return BenchmarkResult(
                endpoint=self.base_url,
                backend="unknown",
                avg_latency_ms=0,
                min_latency_ms=0,
                max_latency_ms=0,
                p95_latency_ms=0,
                throughput_tps=0,
                tokens_per_second=0,
                requests_processed=0,
                errors=len(failed_results),
                success_rate=0.0
            )

        # Extract metrics
        latencies = [r["latency_ms"] for r in successful_results]
        server_latencies = [r.get("server_latency_ms", 0) for r in successful_results]
        tokens = [r.get("tokens", 0) for r in successful_results]
        throughputs = [r.get("throughput_tps", 0) for r in successful_results]

        # Calculate statistics
        avg_latency = statistics.mean(latencies)
        min_latency = min(latencies)
        max_latency = max(latencies)
        p95_latency = statistics.quantiles(latencies, n=20)[18] if len(latencies) >= 20 else max_latency

        total_tokens = sum(tokens)
        total_time = max(latencies) / 1000 if latencies else 1
        tokens_per_second = total_tokens / total_time

        avg_throughput = statistics.mean(throughputs) if throughputs else 0

        backend = successful_results[0].get("backend", "unknown") if successful_results else "unknown"

        success_rate = len(successful_results) / len(results) * 100

        return BenchmarkResult(
            endpoint=self.base_url,
            backend=backend,
            avg_latency_ms=avg_latency,
            min_latency_ms=min_latency,
            max_latency_ms=max_latency,
            p95_latency_ms=p95_latency,
            throughput_tps=avg_throughput,
            tokens_per_second=tokens_per_second,
            requests_processed=len(successful_results),
            errors=len(failed_results),
            success_rate=success_rate
        )

    def print_results(self, result: BenchmarkResult):
        """Print formatted benchmark results"""
        print("\n" + "=" * 60)
        print(f"Q4_K_M LEGAL AI PIPELINE BENCHMARK RESULTS")
        print("=" * 60)
        print(f"Endpoint:      {result.endpoint}")
        print(f"Backend:       {result.backend}")
        print(f"Success Rate:  {result.success_rate:.1f}%")
        print()
        print("LATENCY METRICS:")
        print(f"  Average:     {result.avg_latency_ms:.2f}ms")
        print(f"  Minimum:     {result.min_latency_ms:.2f}ms")
        print(f"  Maximum:     {result.max_latency_ms:.2f}ms")
        print(f"  95th %ile:   {result.p95_latency_ms:.2f}ms")
        print()
        print("THROUGHPUT METRICS:")
        print(f"  Avg Throughput:  {result.throughput_tps:.1f} tokens/sec")
        print(f"  Total Tokens/s:  {result.tokens_per_second:.1f}")
        print()
        print("REQUEST METRICS:")
        print(f"  Successful:  {result.requests_processed}")
        print(f"  Failed:      {result.errors}")
        print()

        # Performance assessment
        if result.avg_latency_ms < 1000:
            perf_grade = "EXCELLENT"
        elif result.avg_latency_ms < 5000:
            perf_grade = "GOOD"
        elif result.avg_latency_ms < 15000:
            perf_grade = "ACCEPTABLE"
        else:
            perf_grade = "NEEDS OPTIMIZATION"

        print(f"Performance Grade: {perf_grade}")
        print("=" * 60)

    async def run_comprehensive_benchmark(self):
        """Run complete benchmark suite"""
        print("Starting Q4_K_M Legal AI Pipeline Benchmark")
        print("=" * 60)

        # Health check
        async with aiohttp.ClientSession() as session:
            health = await self.check_server_health(session)
            print(f"Server Health: {health}")

            if health.get("status") != "healthy":
                print("❌ Server is not healthy, cannot run benchmarks")
                return

        # Single request tests
        print("\n📋 Running single request tests...")
        async with aiohttp.ClientSession() as session:
            single_results = []
            for test_case in self.legal_test_cases:
                print(f"  Testing {test_case['domain']} domain...")
                result = await self.single_completion_test(session, test_case)
                single_results.append(result)

        single_benchmark = self.analyze_results(single_results)
        print("\n📊 Single Request Performance:")
        self.print_results(single_benchmark)

        # Concurrent load tests
        load_tests = [
            {"requests": 5, "concurrency": 2, "name": "Light Load"},
            {"requests": 10, "concurrency": 5, "name": "Medium Load"},
            {"requests": 20, "concurrency": 8, "name": "Heavy Load"}
        ]

        for load_test in load_tests:
            print(f"\n🔄 Running {load_test['name']} Test...")
            load_results = await self.concurrent_load_test(
                load_test["requests"],
                load_test["concurrency"]
            )
            load_benchmark = self.analyze_results(load_results)
            print(f"\n📊 {load_test['name']} Performance:")
            self.print_results(load_benchmark)

        # Get final server metrics
        async with aiohttp.ClientSession() as session:
            try:
                async with session.get(f"{self.base_url}/metrics") as response:
                    if response.status == 200:
                        metrics = await response.json()
                        print("\n📈 Final Server Metrics:")
                        print(f"  Total Requests: {metrics.get('requests_processed', 0)}")
                        print(f"  Server Avg Latency: {metrics.get('avg_latency_ms', 0):.2f}ms")
                        print(f"  Total Tokens: {metrics.get('total_tokens_generated', 0)}")
                        print(f"  Server Uptime: {metrics.get('uptime_seconds', 0):.1f}s")
            except Exception as e:
                print(f"\n⚠️ Could not fetch server metrics: {e}")

        print("\n🎉 Benchmark Complete!")

async def main():
    parser = argparse.ArgumentParser(description="Q4_K_M Legal AI Pipeline Benchmark")
    parser.add_argument("--url", default="http://localhost:8100", help="Server URL")
    parser.add_argument("--quick", action="store_true", help="Run quick benchmark only")

    args = parser.parse_args()

    benchmark = Q4KMPipelineBenchmark(args.url)

    if args.quick:
        # Quick benchmark - single requests only
        print("Running Quick Benchmark...")
        async with aiohttp.ClientSession() as session:
            health = await benchmark.check_server_health(session)
            print(f"Server Health: {health}")

            if health.get("status") == "healthy":
                results = []
                for test_case in benchmark.legal_test_cases[:3]:  # Test first 3 domains
                    result = await benchmark.single_completion_test(session, test_case)
                    results.append(result)

                quick_result = benchmark.analyze_results(results)
                benchmark.print_results(quick_result)
    else:
        # Full comprehensive benchmark
        await benchmark.run_comprehensive_benchmark()

if __name__ == "__main__":
    asyncio.run(main())