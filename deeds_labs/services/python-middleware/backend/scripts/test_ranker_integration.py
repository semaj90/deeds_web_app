#!/usr/bin/env python3
"""
Test C++ Code Quality Ranker Integration
"""

import asyncio
import aiohttp
import json
import numpy as np
from typing import List

RANKER_URL = "http://localhost:9092"

async def test_health():
    """Test ranker health endpoint"""
    print("🔍 Testing health endpoint...")
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(f"{RANKER_URL}/health") as response:
                data = await response.json()
                print(f"   ✅ Status: {data['status']}")
                print(f"   ✅ Model loaded: {data['model_loaded']}")
                return True
        except Exception as e:
            print(f"   ❌ Health check failed: {e}")
            return False


async def test_single_score():
    """Test scoring a single file"""
    print("\n🧪 Testing single file scoring...")

    # Create random 1024-d feature vector (simulating indexed file)
    features = np.random.randn(1024).tolist()

    async with aiohttp.ClientSession() as session:
        try:
            async with session.post(
                f"{RANKER_URL}/score",
                json={"features": features}
            ) as response:
                data = await response.json()

                print(f"   Quality:         {data['quality']:.4f}")
                print(f"   Documentation:   {data['documentation']:.4f}")
                print(f"   Complexity:      {data['complexity']:.4f}")
                print(f"   Maintainability: {data['maintainability']:.4f}")
                print(f"   Overall:         {data['overall']:.4f}")
                print(f"   Latency:         {data['latency_us']} µs")

                # Check latency target (<1000 µs = 1ms)
                if data['latency_us'] < 1000:
                    print(f"   ✅ Latency under 1ms target")
                else:
                    print(f"   ⚠️  Latency above 1ms target ({data['latency_us']} µs)")

                return data
        except Exception as e:
            print(f"   ❌ Single score failed: {e}")
            return None


async def test_batch_score(batch_size: int = 32):
    """Test batch scoring"""
    print(f"\n🚀 Testing batch scoring ({batch_size} files)...")

    # Create batch of random feature vectors
    features_batch = [np.random.randn(1024).tolist() for _ in range(batch_size)]

    async with aiohttp.ClientSession() as session:
        try:
            async with session.post(
                f"{RANKER_URL}/score/batch",
                json={"features": features_batch}
            ) as response:
                data = await response.json()

                print(f"   Batch size:   {data['batch_size']}")
                print(f"   Latency:      {data['latency_us']} µs")
                print(f"   Throughput:   {data['throughput']:.2f} files/sec")
                print(f"   Per-file avg: {data['latency_us'] / data['batch_size']:.2f} µs")

                # Show sample results
                print(f"\n   Sample results:")
                for i, result in enumerate(data['results'][:3]):
                    print(f"      File {i+1}: overall={result['overall']:.4f} "
                          f"(quality={result['quality']:.4f}, "
                          f"docs={result['documentation']:.4f})")

                # Check throughput target (>50 files/sec)
                if data['throughput'] > 50:
                    print(f"\n   ✅ Throughput exceeds 50 files/sec target")
                else:
                    print(f"\n   ⚠️  Throughput below 50 files/sec target")

                return data
        except Exception as e:
            print(f"   ❌ Batch score failed: {e}")
            return None


async def test_integration_with_indexer():
    """Test integration with FastMCP indexer"""
    print("\n🔗 Testing integration with FastMCP indexer...")

    # Simulate indexed file with feature extraction
    print("   1. Simulating file indexing...")
    # (In real usage, this would come from fastmcp_ripgrep_indexer.py)
    features = np.random.randn(1024).tolist()

    print("   2. Sending to ranker...")
    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{RANKER_URL}/score",
            json={"features": features}
        ) as response:
            scores = await response.json()

    print("   3. Processing scores...")
    # Use scores to prioritize fixes
    if scores['overall'] < 0.5:
        priority = "HIGH"
    elif scores['overall'] < 0.7:
        priority = "MEDIUM"
    else:
        priority = "LOW"

    print(f"\n   File priority: {priority}")
    print(f"   Reasoning:")
    if scores['documentation'] < 0.5:
        print(f"      - Poor documentation ({scores['documentation']:.2f})")
    if scores['complexity'] < 0.5:
        print(f"      - High complexity ({scores['complexity']:.2f})")
    if scores['maintainability'] < 0.5:
        print(f"      - Low maintainability ({scores['maintainability']:.2f})")

    print(f"\n   ✅ Integration test complete")


async def run_all_tests():
    """Run all tests"""
    print("="*80)
    print("🧪 FastMCP Code Quality Ranker Test Suite")
    print("="*80)

    # Test 1: Health check
    health_ok = await test_health()
    if not health_ok:
        print("\n❌ Ranker server not available. Please start it first:")
        print("   ./build/code_quality_ranker --port 9092")
        return

    # Test 2: Single file scoring
    await test_single_score()

    # Test 3: Batch scoring
    await test_batch_score(batch_size=32)
    await test_batch_score(batch_size=100)

    # Test 4: Integration
    await test_integration_with_indexer()

    print("\n" + "="*80)
    print("✅ ALL TESTS COMPLETE")
    print("="*80)


if __name__ == "__main__":
    asyncio.run(run_all_tests())
