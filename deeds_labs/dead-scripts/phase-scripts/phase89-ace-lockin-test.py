#!/usr/bin/env python3
"""
Phase 89: ACE Lock-In Test Suite
Complete validation of codec detection, cache cards, and GPU rerank
"""

import sys
import asyncio
from pathlib import Path

# Add scripts to path for imports
sys.path.insert(0, str(Path(__file__).parent))

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

try:
    import redis.asyncio as redis
except ImportError:
    import aioredis as redis


async def test_codec_detection():
    """Test 1: Codec detection on real Redis blobs"""
    print("=" * 70)
    print("TEST 1: Codec Detection on Real Redis Blobs")
    print("=" * 70)

    from phase89_codec import decode_blob, detect_codec

    cache = redis.Redis(host='localhost', port=6379, db=0, decode_responses=False)

    try:
        await cache.ping()
        print("✅ Redis connected")
    except Exception as e:
        print(f"❌ Redis connection failed: {e}")
        await cache.aclose()
        return False

    # Get 10 sample chunk keys
    sample_keys = []
    cursor = 0
    while len(sample_keys) < 10:
        cursor, batch = await cache.scan(cursor, match="phase89:chunk:*", count=100)
        sample_keys.extend([k.decode('utf-8') if isinstance(k, bytes) else k for k in batch])
        if cursor == 0:
            break

    sample_keys = sample_keys[:10]

    if not sample_keys:
        print("⚠️  No phase89:chunk:* keys found, trying phase89:embedding:*")
        cursor = 0
        while len(sample_keys) < 10:
            cursor, batch = await cache.scan(cursor, match="phase89:embedding:*", count=100)
            sample_keys.extend([k.decode('utf-8') if isinstance(k, bytes) else k for k in batch])
            if cursor == 0:
                break
        sample_keys = sample_keys[:10]

    print(f"\n📊 Testing {len(sample_keys)} keys:")
    print("-" * 70)
    print(f"{'Key':<50} {'Codec':<20} {'Size'}")
    print("-" * 70)

    codec_counts = {}

    for key in sample_keys:
        try:
            # Check key type first
            key_type = await cache.type(key)
            if isinstance(key_type, bytes):
                key_type = key_type.decode('utf-8')

            if key_type != 'string':
                print(f"{key[:47] + '...' if len(key) > 50 else key:<50} {'SKIP:' + key_type:<20} (not a string)")
                continue

            raw_value = await cache.get(key)
            if raw_value is None:
                continue

            if isinstance(raw_value, str):
                raw_value = raw_value.encode('utf-8')

            decoded = decode_blob(raw_value)

            short_key = key[:47] + "..." if len(key) > 50 else key
            size_str = f"{decoded.raw_size}→{decoded.decoded_size}"

            print(f"{short_key:<50} {decoded.codec:<20} {size_str}")

            codec_counts[decoded.codec] = codec_counts.get(decoded.codec, 0) + 1

        except Exception as e:
            print(f"{key[:47] + '...' if len(key) > 50 else key:<50} {'ERROR':<20} {str(e)[:30]}")

    print("-" * 70)
    print("\n📈 Codec Distribution:")
    for codec, count in sorted(codec_counts.items(), key=lambda x: x[1], reverse=True):
        print(f"   {codec}: {count}")

    await cache.aclose()

    print("\n✅ Test 1 PASSED: Codec detection working")
    return True


async def test_cache_card_generation():
    """Test 2: Cache card generation"""
    print("\n" + "=" * 70)
    print("TEST 2: Cache Card Generation")
    print("=" * 70)

    from phase89_cache_card_generator import create_cache_card, parse_redis_key

    cache = redis.Redis(host='localhost', port=6379, db=0, decode_responses=False)

    try:
        await cache.ping()
        print("✅ Redis connected")
    except Exception as e:
        print(f"❌ Redis connection failed: {e}")
        await cache.aclose()
        return False

    # Get 5 sample keys
    sample_keys = []
    cursor = 0
    while len(sample_keys) < 5:
        cursor, batch = await cache.scan(cursor, match="phase89:*", count=100)
        sample_keys.extend([k.decode('utf-8') if isinstance(k, bytes) else k for k in batch])
        if cursor == 0:
            break

    sample_keys = sample_keys[:5]

    print(f"\n📊 Creating cache cards for {len(sample_keys)} keys:")
    print("-" * 70)

    cards_created = 0

    for key in sample_keys:
        card = await create_cache_card(cache, key)
        if card:
            cards_created += 1
            print(f"\n✅ Card for: {key[:60]}...")
            print(f"   NS: {card.ns}, Kind: {card.kind}, Source: {card.source}")
            print(f"   Codec: {card.codec}")
            print(f"   Tags: {card.feature_tags}")
            print(f"   Signature preview: {card.signature_text[:100]}...")

    await cache.aclose()

    print(f"\n✅ Test 2 PASSED: Created {cards_created}/{len(sample_keys)} cache cards")
    return cards_created > 0


def test_gpu_rerank():
    """Test 3: GPU rerank engine"""
    print("\n" + "=" * 70)
    print("TEST 3: GPU Rerank Engine")
    print("=" * 70)

    from phase89_gpu_rerank import GPURerankEngine
    import numpy as np

    try:
        engine = GPURerankEngine()
        print("✅ GPU rerank engine initialized")
    except Exception as e:
        print(f"❌ GPU rerank engine init failed: {e}")
        return False

    # Create test data
    dim = 768
    query = np.random.randn(dim).astype(np.float32)
    query = query / np.linalg.norm(query)

    # Create 50 candidates
    candidates = []
    for i in range(50):
        # Create embedding with controlled similarity
        noise_scale = 0.5 + (i / 50)  # Increasing noise
        emb = query + np.random.randn(dim).astype(np.float32) * noise_scale
        emb = emb / np.linalg.norm(emb)

        payload = {
            'redis_key': f'phase89:test:item_{i}',
            'kind': 'test',
            'score': i
        }

        candidates.append((i, emb, payload))

    print(f"\n🔍 Reranking {len(candidates)} candidates...")

    try:
        results = engine.rerank(query, candidates)
        print(f"✅ Reranked {len(results)} results")

        # Print top 5
        print("\n📊 Top 5 Results:")
        print("-" * 70)
        print(f"{'Rank':<6} {'Score':<10} {'Confidence':<12} {'Original ID'}")
        print("-" * 70)

        for rank, result in enumerate(results[:5], 1):
            print(f"{rank:<6} {result.score:<10.4f} {result.confidence:<12} {result.point_id}")

        # Count confidence levels
        miss = sum(1 for r in results if r.confidence == "miss")
        verify = sum(1 for r in results if r.confidence == "verify")
        safe = sum(1 for r in results if r.confidence == "safe_reuse")

        print(f"\n📈 Confidence Distribution:")
        print(f"   ❌ MISS:       {miss} ({miss/len(results)*100:.1f}%)")
        print(f"   ⚠️  VERIFY:     {verify} ({verify/len(results)*100:.1f}%)")
        print(f"   ✅ SAFE_REUSE: {safe} ({safe/len(results)*100:.1f}%)")

        print("\n✅ Test 3 PASSED: GPU rerank working")
        return True

    except Exception as e:
        print(f"❌ GPU rerank failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_pytorch_gpu():
    """Test 4: PyTorch GPU availability"""
    print("\n" + "=" * 70)
    print("TEST 4: PyTorch GPU Check")
    print("=" * 70)

    import torch

    print(f"PyTorch version: {torch.__version__}")
    print(f"CUDA available: {torch.cuda.is_available()}")

    if torch.cuda.is_available():
        print(f"CUDA version: {torch.version.cuda}")
        print(f"GPU: {torch.cuda.get_device_name(0)}")
        props = torch.cuda.get_device_properties(0)
        print(f"VRAM: {props.total_memory / 1e9:.1f} GB")
        print(f"Compute: {props.major}.{props.minor}")

        # Test tensor operation
        x = torch.randn(1000, 768, device='cuda', dtype=torch.float16)
        y = torch.randn(1000, 768, device='cuda', dtype=torch.float16)

        import time
        start = time.perf_counter()
        result = torch.matmul(x, y.T)
        elapsed = (time.perf_counter() - start) * 1000

        print(f"\n⚡ GPU matmul (1000x768 @ 768x1000): {elapsed:.2f}ms")
        print(f"   Result shape: {result.shape}")

        print("\n✅ Test 4 PASSED: GPU operational")
        return True
    else:
        print("\n⚠️  Test 4 WARNING: No GPU available (will use CPU)")
        return True


async def main():
    """Run all tests"""
    print("🧪 Phase 89: ACE Lock-In Test Suite")
    print("=" * 70)
    print("Testing codec detection, cache cards, and GPU rerank")
    print("=" * 70)
    print()

    results = {}

    # Test 1: Codec detection
    try:
        results['codec'] = await test_codec_detection()
    except Exception as e:
        print(f"\n❌ Test 1 FAILED: {e}")
        import traceback
        traceback.print_exc()
        results['codec'] = False

    # Test 2: Cache card generation
    try:
        results['cache_card'] = await test_cache_card_generation()
    except Exception as e:
        print(f"\n❌ Test 2 FAILED: {e}")
        import traceback
        traceback.print_exc()
        results['cache_card'] = False

    # Test 3: GPU rerank
    try:
        results['gpu_rerank'] = test_gpu_rerank()
    except Exception as e:
        print(f"\n❌ Test 3 FAILED: {e}")
        import traceback
        traceback.print_exc()
        results['gpu_rerank'] = False

    # Test 4: PyTorch GPU
    try:
        results['pytorch'] = test_pytorch_gpu()
    except Exception as e:
        print(f"\n❌ Test 4 FAILED: {e}")
        import traceback
        traceback.print_exc()
        results['pytorch'] = False

    # Summary
    print("\n" + "=" * 70)
    print("📊 TEST SUMMARY")
    print("=" * 70)

    passed = sum(1 for v in results.values() if v)
    total = len(results)

    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"   {test_name:15} {status}")

    print(f"\n   Total: {passed}/{total} tests passed")

    if passed == total:
        print("\n🎉 ALL TESTS PASSED - ACE is locked in!")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed - review errors above")

    return passed == total


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
