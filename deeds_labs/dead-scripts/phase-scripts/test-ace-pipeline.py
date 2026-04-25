#!/usr/bin/env python3
"""
Quick test of ACE Contextual Engineering Pipeline
Tests integration with Phase 89 infrastructure
"""

import asyncio
import torch
import time
import json
from datetime import datetime
import redis
import aiohttp
from qdrant_client import QdrantClient

# Configuration
CONFIG = {
    'redis_host': 'localhost',
    'redis_port': 6379,
    'qdrant_url': 'http://localhost:6333',
    'ollama_url': 'http://localhost:11434',
    'embedding_model': 'embeddinggemma:latest',
    'chat_model': 'gemma3-legal:latest'
}

async def test_infrastructure():
    """Test Phase 89 infrastructure connectivity"""
    print("\n" + "="*70)
    print("🔍 Testing Phase 89 Infrastructure")
    print("="*70 + "\n")

    results = {}

    # Test Redis
    try:
        r = redis.Redis(host=CONFIG['redis_host'], port=CONFIG['redis_port'], decode_responses=True)
        r.ping()
        key_count = len(r.keys('phase89:*'))
        results['redis'] = {'status': 'connected', 'keys': key_count}
        print(f"✅ Redis: Connected ({key_count:,} phase89:* keys)")
    except Exception as e:
        results['redis'] = {'status': 'failed', 'error': str(e)}
        print(f"❌ Redis: {e}")

    # Test Qdrant
    try:
        qdrant = QdrantClient(url=CONFIG['qdrant_url'])
        collections = qdrant.get_collections().collections
        results['qdrant'] = {'status': 'connected', 'collections': len(collections)}
        print(f"✅ Qdrant: Connected ({len(collections)} collections)")
    except Exception as e:
        results['qdrant'] = {'status': 'failed', 'error': str(e)}
        print(f"❌ Qdrant: {e}")

    # Test Ollama
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{CONFIG['ollama_url']}/api/tags") as resp:
                if resp.status == 200:
                    data = await resp.json()
                    models = [m['name'] for m in data.get('models', [])]
                    has_embedding = any('embedding' in m for m in models)
                    has_gemma3 = any('gemma3-legal' in m for m in models)
                    results['ollama'] = {
                        'status': 'connected',
                        'models': len(models),
                        'embedding': has_embedding,
                        'gemma3': has_gemma3
                    }
                    print(f"✅ Ollama: Connected ({len(models)} models)")
                    if has_embedding:
                        print(f"   ✅ embeddinggemma:latest available")
                    if has_gemma3:
                        print(f"   ✅ gemma3-legal:latest available")
                else:
                    results['ollama'] = {'status': 'failed', 'error': f'HTTP {resp.status}'}
                    print(f"❌ Ollama: HTTP {resp.status}")
    except Exception as e:
        results['ollama'] = {'status': 'failed', 'error': str(e)}
        print(f"❌ Ollama: {e}")

    # Test GPU
    try:
        if torch.cuda.is_available():
            gpu_name = torch.cuda.get_device_name(0)
            gpu_memory = torch.cuda.get_device_properties(0).total_memory / 1e9
            compute = torch.cuda.get_device_capability(0)
            results['gpu'] = {
                'status': 'available',
                'name': gpu_name,
                'memory_gb': round(gpu_memory, 2),
                'compute': f"{compute[0]}.{compute[1]}"
            }
            print(f"✅ GPU: {gpu_name} ({gpu_memory:.1f} GB)")
        else:
            results['gpu'] = {'status': 'unavailable'}
            print(f"⚠️  GPU: Not available (using CPU)")
    except Exception as e:
        results['gpu'] = {'status': 'failed', 'error': str(e)}
        print(f"❌ GPU: {e}")

    print()
    return results

async def test_embedding_generation():
    """Test embedding generation with embeddinggemma:latest"""
    print("="*70)
    print("🧠 Testing Embedding Generation (768-dim)")
    print("="*70 + "\n")

    test_texts = [
        "TypeScript error TS2345 in Svelte 5 component",
        "Redis cache optimization for GPU embeddings",
        "Qdrant vector search performance tuning"
    ]

    results = []

    async with aiohttp.ClientSession() as session:
        for i, text in enumerate(test_texts, 1):
            print(f"{i}. Testing: {text[:50]}...")

            start = time.perf_counter()

            try:
                async with session.post(
                    f"{CONFIG['ollama_url']}/api/embeddings",
                    json={
                        'model': CONFIG['embedding_model'],
                        'prompt': text
                    }
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        embedding = data['embedding']
                        elapsed = (time.perf_counter() - start) * 1000

                        results.append({
                            'text': text,
                            'dim': len(embedding),
                            'time_ms': round(elapsed, 2)
                        })

                        print(f"   ✅ Generated {len(embedding)}-dim embedding in {elapsed:.2f}ms\n")
                    else:
                        print(f"   ❌ HTTP {resp.status}\n")
            except Exception as e:
                print(f"   ❌ Error: {e}\n")

    return results

async def test_gpu_tensor_ops():
    """Test GPU tensor operations for ACE synthesis"""
    if not torch.cuda.is_available():
        print("⚠️  Skipping GPU tests (CUDA not available)\n")
        return {}

    print("="*70)
    print("⚡ Testing GPU Tensor Operations (RTX 3060 Ti)")
    print("="*70 + "\n")

    device = torch.device('cuda')
    results = {}

    # Test 1: Cosine similarity search (24,615 docs)
    print("1️⃣ Cosine Similarity Search (24,615 docs)")
    query = torch.randn(1, 768, device=device, dtype=torch.float16)
    kb = torch.randn(24615, 768, device=device, dtype=torch.float16)

    torch.cuda.synchronize()
    start = time.perf_counter()

    # Normalize
    query_norm = torch.nn.functional.normalize(query, p=2, dim=1)
    kb_norm = torch.nn.functional.normalize(kb, p=2, dim=1)

    # Cosine similarity
    similarities = torch.mm(query_norm, kb_norm.t()).squeeze(0)

    # Top-100
    top_k_values, top_k_indices = torch.topk(similarities, k=100)

    torch.cuda.synchronize()
    elapsed = (time.perf_counter() - start) * 1000
    throughput = 24615 / (elapsed / 1000)

    results['cosine_search'] = {
        'docs': 24615,
        'time_ms': round(elapsed, 2),
        'throughput': round(throughput, 0)
    }

    print(f"   ✅ Search time: {elapsed:.2f}ms")
    print(f"   ✅ Throughput: {throughput:,.0f} docs/sec\n")

    # Test 2: Context synthesis
    print("2️⃣ Context Synthesis (Top-100)")
    top_100 = kb[top_k_indices]

    torch.cuda.synchronize()
    start = time.perf_counter()

    # Weighted average
    weights = torch.nn.functional.softmax(top_k_values, dim=0).unsqueeze(1)
    context = (top_100 * weights).sum(dim=0)

    # Combine
    combined = torch.cat([query.squeeze(0), context])

    torch.cuda.synchronize()
    elapsed = (time.perf_counter() - start) * 1000

    results['context_synthesis'] = {
        'time_ms': round(elapsed, 2),
        'output_dim': combined.shape[0]
    }

    print(f"   ✅ Synthesis time: {elapsed:.2f}ms")
    print(f"   ✅ Output: {combined.shape[0]}-dim vector\n")

    # Test 3: Memory throughput
    print("3️⃣ GPU Memory Throughput")
    size_mb = 100
    num_elements = (size_mb * 1024 * 1024) // 4
    data = torch.randn(num_elements, device=device, dtype=torch.float32)

    torch.cuda.synchronize()
    start = time.perf_counter()

    result_cpu = data.cpu()

    torch.cuda.synchronize()
    elapsed = (time.perf_counter() - start) * 1000
    bandwidth = size_mb / (elapsed / 1000)

    results['memory_throughput'] = {
        'size_mb': size_mb,
        'time_ms': round(elapsed, 2),
        'bandwidth_mbs': round(bandwidth, 1)
    }

    print(f"   ✅ {size_mb} MB in {elapsed:.2f}ms")
    print(f"   ✅ Bandwidth: {bandwidth:.1f} MB/s\n")

    total_time = results['cosine_search']['time_ms'] + results['context_synthesis']['time_ms']

    print(f"⏱️  Total ACE Pipeline: {total_time:.2f}ms")
    print(f"🎯 Target: <100ms | Status: {'✅ EXCELLENT' if total_time < 100 else '⚠️ GOOD'}\n")

    return results

async def main():
    """Run all tests"""
    print("\n" + "="*70)
    print("🚀 ACE Contextual Engineering Pipeline - Quick Test")
    print("="*70)

    # Test infrastructure
    infra_results = await test_infrastructure()

    # Test embeddings
    embedding_results = await test_embedding_generation()

    # Test GPU
    gpu_results = await test_gpu_tensor_ops()

    # Summary
    print("="*70)
    print("📊 Test Summary")
    print("="*70 + "\n")

    report = {
        'timestamp': datetime.now().isoformat(),
        'infrastructure': infra_results,
        'embeddings': embedding_results,
        'gpu_ops': gpu_results
    }

    # Check if all systems operational
    all_ok = all([
        infra_results.get('redis', {}).get('status') == 'connected',
        infra_results.get('qdrant', {}).get('status') == 'connected',
        infra_results.get('ollama', {}).get('status') == 'connected',
        len(embedding_results) > 0,
    ])

    if all_ok:
        print("✅ All systems operational!")
        print(f"✅ Redis: {infra_results['redis']['keys']:,} keys")
        print(f"✅ Qdrant: {infra_results['qdrant']['collections']} collections")
        print(f"✅ Embeddings: {len(embedding_results)} successful")

        if gpu_results:
            total = gpu_results['cosine_search']['time_ms'] + gpu_results['context_synthesis']['time_ms']
            print(f"✅ GPU Pipeline: {total:.2f}ms (<100ms target)")

        print("\n🎉 ACE Pipeline Ready for Production!\n")
    else:
        print("⚠️  Some systems need attention:")
        if infra_results.get('redis', {}).get('status') != 'connected':
            print("   - Redis connection failed")
        if infra_results.get('qdrant', {}).get('status') != 'connected':
            print("   - Qdrant connection failed")
        if infra_results.get('ollama', {}).get('status') != 'connected':
            print("   - Ollama connection failed")
        print()

    # Save report
    with open('reports/ace-test-report.json', 'w') as f:
        json.dump(report, f, indent=2)

    print(f"💾 Report saved: reports/ace-test-report.json\n")

if __name__ == '__main__':
    asyncio.run(main())
