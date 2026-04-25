#!/usr/bin/env python3
"""Quick ACE infrastructure test"""

import asyncio
import json
from datetime import datetime

async def test_redis():
    """Test Redis"""
    try:
        import redis
        r = redis.Redis(host='localhost', port=6379, decode_responses=True)
        r.ping()
        keys = len(r.keys('phase89:*'))
        print(f"✅ Redis: {keys:,} phase89:* keys")
        return {'status': 'ok', 'keys': keys}
    except Exception as e:
        print(f"❌ Redis: {e}")
        return {'status': 'failed', 'error': str(e)}

async def test_qdrant():
    """Test Qdrant"""
    try:
        from qdrant_client import QdrantClient
        client = QdrantClient(url='http://localhost:6333')
        collections = client.get_collections().collections
        print(f"✅ Qdrant: {len(collections)} collections")
        return {'status': 'ok', 'collections': len(collections)}
    except Exception as e:
        print(f"❌ Qdrant: {e}")
        return {'status': 'failed', 'error': str(e)}

async def test_ollama():
    """Test Ollama"""
    try:
        import aiohttp
        async with aiohttp.ClientSession() as session:
            async with session.get('http://localhost:11434/api/tags') as resp:
                if resp.status == 200:
                    data = await resp.json()
                    models = [m['name'] for m in data.get('models', [])]
                    has_embedding = any('embedding' in m for m in models)
                    has_gemma3 = any('gemma3-legal' in m for m in models)
                    print(f"✅ Ollama: {len(models)} models")
                    if has_embedding:
                        print(f"   ✅ embeddinggemma:latest")
                    if has_gemma3:
                        print(f"   ✅ gemma3-legal:latest")
                    return {'status': 'ok', 'models': len(models), 'embedding': has_embedding, 'gemma3': has_gemma3}
                else:
                    print(f"❌ Ollama: HTTP {resp.status}")
                    return {'status': 'failed', 'error': f'HTTP {resp.status}'}
    except Exception as e:
        print(f"❌ Ollama: {e}")
        return {'status': 'failed', 'error': str(e)}

async def test_gpu():
    """Test GPU (lazy import)"""
    try:
        import torch
        if torch.cuda.is_available():
            name = torch.cuda.get_device_name(0)
            memory = torch.cuda.get_device_properties(0).total_memory / 1e9
            print(f"✅ GPU: {name} ({memory:.1f} GB)")
            return {'status': 'ok', 'name': name, 'memory_gb': round(memory, 2)}
        else:
            print(f"⚠️  GPU: CUDA not available")
            return {'status': 'unavailable'}
    except Exception as e:
        print(f"❌ GPU: {e}")
        return {'status': 'failed', 'error': str(e)}

async def main():
    print("\n" + "="*60)
    print("🔍 ACE Infrastructure Test")
    print("="*60 + "\n")

    results = {}
    results['redis'] = await test_redis()
    results['qdrant'] = await test_qdrant()
    results['ollama'] = await test_ollama()
    results['gpu'] = await test_gpu()

    # Summary
    print("\n" + "="*60)
    all_ok = all(r.get('status') in ['ok', 'unavailable'] for r in results.values())

    if all_ok:
        print("✅ All systems operational!")
    else:
        print("⚠️  Some systems need attention")

    print("="*60 + "\n")

    # Save
    report = {
        'timestamp': datetime.now().isoformat(),
        'results': results
    }

    with open('reports/ace-infra-test.json', 'w') as f:
        json.dump(report, f, indent=2)

    print(f"💾 Report: reports/ace-infra-test.json\n")

if __name__ == '__main__':
    asyncio.run(main())
