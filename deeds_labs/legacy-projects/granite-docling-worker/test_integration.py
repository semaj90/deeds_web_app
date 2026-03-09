"""
Granite-Docling Worker - Integration Test
==========================================

Validates worker can connect to existing Phase 66/87 infrastructure:
- PostgreSQL (phase66-postgres:5434)
- Redis (phase66-redis:6379)
- Qdrant (phase66-qdrant:6333)
- MinIO (phase66-minio:9000)
- RabbitMQ (phase66-rabbitmq:5672)
- RAG Middleware (phase87-rag-middleware:8765)

Usage:
    python test_integration.py
    python test_integration.py --verbose
"""

import asyncio
import logging
import sys
from pathlib import Path

# Test connection functions
async def test_postgres():
    """Test PostgreSQL connection (phase66-postgres:5434)"""
    try:
        import asyncpg
        conn = await asyncpg.connect(
            host='localhost',
            port=5434,
            user='user',
            password='pass',
            database='legal'
        )

        # Test query
        result = await conn.fetchval('SELECT COUNT(*) FROM information_schema.tables')
        await conn.close()

        print(f"✅ PostgreSQL: Connected (Tables: {result})")
        return True
    except Exception as e:
        print(f"❌ PostgreSQL: Failed - {e}")
        return False


async def test_redis():
    """Test Redis connection (phase66-redis:6379)"""
    try:
        import redis.asyncio as redis
        client = redis.Redis(host='localhost', port=6379, decode_responses=True)

        # Test ping
        await client.ping()

        # Test set/get
        await client.set('granite_test', 'ok', ex=60)
        value = await client.get('granite_test')

        await client.close()

        print(f"✅ Redis: Connected (Test value: {value})")
        return True
    except Exception as e:
        print(f"❌ Redis: Failed - {e}")
        return False


async def test_qdrant():
    """Test Qdrant connection (phase66-qdrant:6333)"""
    try:
        from qdrant_client import QdrantClient
        client = QdrantClient(url="http://localhost:6333")

        # List collections
        collections = client.get_collections()
        phase_collections = [c.name for c in collections.collections if 'phase' in c.name]

        print(f"✅ Qdrant: Connected (Phase collections: {len(phase_collections)})")
        return True
    except Exception as e:
        print(f"❌ Qdrant: Failed - {e}")
        return False


async def test_minio():
    """Test MinIO connection (phase66-minio:9000)"""
    try:
        from minio import Minio
        # Try actual Phase 66 credentials from docker-compose
        credentials = [
            ("admin", "password"),  # Phase 66 actual credentials
            ("minioadmin", "minioadmin"),
            ("minio", "minio123"),
        ]

        client = None
        for access_key, secret_key in credentials:
            try:
                client = Minio(
                    "localhost:9000",
                    access_key=access_key,
                    secret_key=secret_key,
                    secure=False
                )
                # Test connection
                buckets = client.list_buckets()
                break
            except:
                continue

        if not client:
            print(f"⚠️ MinIO: Connection failed (check credentials)")
            return False        # List buckets
        buckets = client.list_buckets()
        bucket_names = [b.name for b in buckets]

        print(f"✅ MinIO: Connected (Buckets: {', '.join(bucket_names)})")
        return True
    except Exception as e:
        print(f"❌ MinIO: Failed - {e}")
        return False


async def test_rabbitmq():
    """Test RabbitMQ connection (phase66-rabbitmq:5672)"""
    try:
        import aio_pika
        connection = await aio_pika.connect_robust(
            "amqp://guest:guest@localhost:5672/"
        )

        channel = await connection.channel()

        # List queues (via HTTP API)
        import aiohttp
        async with aiohttp.ClientSession() as session:
            async with session.get(
                'http://localhost:15672/api/queues',
                auth=aiohttp.BasicAuth('guest', 'guest')
            ) as resp:
                queues = await resp.json()

        await connection.close()

        print(f"✅ RabbitMQ: Connected (Queues: {len(queues)})")
        return True
    except Exception as e:
        print(f"❌ RabbitMQ: Failed - {e}")
        return False


async def test_rag_middleware():
    """Test RAG Middleware (phase79-rag-middleware:8765)"""
    try:
        import aiohttp
        async with aiohttp.ClientSession() as session:
            async with session.get('http://localhost:8765/api/health') as resp:
                if resp.status == 200:
                    data = await resp.json()
                    print(f"✅ Phase 79 RAG Middleware: Connected (Status: {data.get('status', 'ok')})")
                    return True
                else:
                    print(f"⚠️ Phase 79 RAG Middleware: HTTP {resp.status}")
                    return False
    except Exception as e:
        print(f"❌ Phase 79 RAG Middleware: Failed - {e}")
        return False


async def test_ollama():
    """Test Ollama (localhost:11434)"""
    try:
        import aiohttp
        async with aiohttp.ClientSession() as session:
            async with session.get('http://localhost:11434/api/tags') as resp:
                if resp.status == 200:
                    data = await resp.json()
                    models = [m['name'] for m in data.get('models', [])]
                    granite_models = [m for m in models if 'gemma' in m or 'granite' in m]

                    print(f"✅ Ollama: Connected (Models: {', '.join(granite_models[:3])}...)")
                    return True
                else:
                    print(f"⚠️ Ollama: HTTP {resp.status}")
                    return False
    except Exception as e:
        print(f"❌ Ollama: Failed - {e}")
        return False


async def test_gpu_availability():
    """Test GPU/CUDA availability"""
    try:
        import torch

        if torch.cuda.is_available():
            gpu_name = torch.cuda.get_device_name(0)
            total_memory = torch.cuda.get_device_properties(0).total_memory / (1024**3)
            allocated = torch.cuda.memory_allocated(0) / (1024**3)

            print(f"✅ GPU: {gpu_name} ({total_memory:.1f}GB total, {allocated:.2f}GB used)")
            return True
        else:
            print(f"⚠️ GPU: CUDA not available (CPU fallback enabled)")
            return False
    except Exception as e:
        print(f"❌ GPU: Failed - {e}")
        return False


async def run_integration_tests(verbose=False):
    """Run all integration tests"""
    print(f"\n{'='*60}")
    print("GRANITE-DOCLING WORKER - INTEGRATION TEST")
    print(f"{'='*60}\n")

    print("Testing connections to Phase 66/87 infrastructure...\n")

    results = {}

    # Core infrastructure
    print("📦 Core Infrastructure:")
    results['postgres'] = await test_postgres()
    results['redis'] = await test_redis()
    results['qdrant'] = await test_qdrant()
    results['minio'] = await test_minio()
    results['rabbitmq'] = await test_rabbitmq()

    print("\n🤖 AI Services:")
    results['rag_middleware'] = await test_rag_middleware()
    results['ollama'] = await test_ollama()
    results['gpu'] = await test_gpu_availability()

    # Summary
    print(f"\n{'='*60}")
    print("INTEGRATION TEST SUMMARY")
    print(f"{'='*60}")

    total = len(results)
    passed = sum(results.values())

    for service, status in results.items():
        symbol = "✅" if status else "❌"
        print(f"{symbol} {service:20s}")

    print(f"\n{'='*60}")
    print(f"RESULT: {passed}/{total} services connected ({passed/total:.1%})")
    print(f"{'='*60}\n")

    if passed >= total - 2:  # Allow 2 optional services to fail
        print("✅ Integration test PASSED - Worker ready for production")
        return True
    else:
        print("⚠️ Integration test WARNING - Some services unavailable")
        return False


async def test_worker_initialization():
    """Test worker can initialize with existing services"""
    print(f"\n{'='*60}")
    print("WORKER INITIALIZATION TEST")
    print(f"{'='*60}\n")

    try:
        # Add project paths
        sys.path.insert(0, str(Path(__file__).parent))

        from main import GraniteDoclingWorker

        # Initialize worker with all services
        worker = GraniteDoclingWorker(
            enable_storage=True,
            enable_chunking=True,
            enable_rag=True,
            enable_events=True,
        )

        print("✅ Worker initialized successfully!")
        print(f"   Pipeline:   {'✅' if worker.pipeline else '❌'}")
        print(f"   Storage:    {'✅' if worker.storage else '⚠️  (optional)'}")
        print(f"   Chunking:   {'✅' if worker.chunker else '⚠️  (optional)'}")
        print(f"   RAG:        {'✅' if worker.rag else '⚠️  (optional)'}")
        print(f"   Events:     {'✅' if worker.emitter else '❌'}")

        return True

    except Exception as e:
        print(f"❌ Worker initialization failed: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Test Granite-Docling Worker Integration")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    parser.add_argument("--worker-only", action="store_true", help="Test worker initialization only")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    async def main():
        if args.worker_only:
            success = await test_worker_initialization()
        else:
            # Full integration test
            success = await run_integration_tests(verbose=args.verbose)

            if success:
                # Test worker initialization
                print("\n")
                await test_worker_initialization()

        return 0 if success else 1

    sys.exit(asyncio.run(main()))
