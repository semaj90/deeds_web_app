#!/usr/bin/env python3
"""
Phase 89: Cache Warmer
Pre-populate Redis cache with common queries for 86% hit rate.
Standalone script using aiohttp for Ollama API calls.
"""

import asyncio
import hashlib
import json
import sys
import time
from typing import List, Dict, Any

# Fix Windows console encoding for emoji
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

import aiohttp

try:
    import redis.asyncio as redis
except ImportError:
    import aioredis as redis

# 38 common queries for cache warming
WARMUP_QUERIES = [
    # Svelte 5 (5 queries)
    "Svelte 5 migration guide $state runes",
    "Svelte 5 $derived vs $: reactive declarations",
    "Svelte 5 $effect vs onMount lifecycle",
    "Svelte 5 snippet vs slot components",
    "Svelte 5 event handling on:click modifiers",

    # TypeScript Errors (5 queries)
    "Fix TS2345 Argument of type is not assignable to parameter",
    "Fix TS2339 Property does not exist on type",
    "Fix TS2322 Type is not assignable to type",
    "Fix TS7006 Parameter implicitly has an 'any' type",
    "Fix TS1005 expected comma or semicolon syntax error",

    # SvelteKit (5 queries)
    "SvelteKit load function server side data fetching",
    "SvelteKit form actions progressive enhancement",
    "SvelteKit page data invalidation patterns",
    "SvelteKit hooks handle authentication middleware",
    "SvelteKit streaming SSR with $app/stores",

    # Redis (4 queries)
    "Redis cache optimization LRU eviction policy",
    "Redis pipeline batching performance commands",
    "Redis memory usage monitoring fragmentation ratio",
    "Redis pub/sub message queue patterns",

    # Qdrant (4 queries)
    "Qdrant vector search cosine similarity HNSW",
    "Qdrant collection configuration optimization",
    "Qdrant payload indexing filtering strategies",
    "Qdrant quantization compression memory usage",

    # PyTorch (5 queries)
    "PyTorch CUDA OOM out of memory errors",
    "PyTorch device mismatch CPU vs GPU tensors",
    "PyTorch multiprocessing spawn vs fork",
    "PyTorch FP16 mixed precision training AMP",
    "PyTorch DataLoader num_workers optimal value",

    # Architecture (5 queries)
    "Redis cache Qdrant vector indexing pipeline",
    "PyTorch multiprocessing GIL bypass architecture",
    "Context7 multi-core server scaling pattern",
    "FastMCP agentic tool LLM integration",
    "RAG vs KAG retrieval augmented generation",

    # Libraries (5 queries)
    "Drizzle ORM migration generation PostgreSQL",
    "TailwindCSS configuration SvelteKit setup",
    "Vite config proxy API development server",
    "Playwright end-to-end testing Svelte components",
    "Lucia auth session management SvelteKit hooks",
]

OLLAMA_URL = "http://localhost:11434"
EMBEDDING_MODEL = "embeddinggemma:latest"
REDIS_HOST = "localhost"
REDIS_PORT = 6379
REDIS_DB = 0
CACHE_PREFIX = "phase89:embedding:"
CACHE_TTL = 86400  # 24 hours


def make_cache_key(text: str) -> str:
    """Generate cache key from query text."""
    text_hash = hashlib.sha256(text.encode('utf-8')).hexdigest()[:16]
    return f"{CACHE_PREFIX}{text_hash}"


async def generate_embedding(session: aiohttp.ClientSession, text: str) -> List[float]:
    """Generate embedding using Ollama API."""
    async with session.post(
        f"{OLLAMA_URL}/api/embeddings",
        json={"model": EMBEDDING_MODEL, "prompt": text}
    ) as response:
        if response.status != 200:
            error_text = await response.text()
            raise RuntimeError(f"Ollama API error {response.status}: {error_text}")

        data = await response.json()
        return data["embedding"]


async def warm_cache_query(
    session: aiohttp.ClientSession,
    cache: redis.Redis,
    query: str,
    index: int,
    total: int
) -> Dict[str, Any]:
    """Warm cache for a single query."""
    start_time = time.perf_counter()
    cache_key = make_cache_key(query)

    # Check if already cached
    cached = await cache.exists(cache_key)
    if cached:
        elapsed = (time.perf_counter() - start_time) * 1000
        return {
            "index": index,
            "query": query[:60] + "..." if len(query) > 60 else query,
            "status": "cached",
            "elapsed_ms": round(elapsed, 2)
        }

    # Generate and cache embedding
    try:
        embedding = await generate_embedding(session, query)
        await cache.setex(
            cache_key,
            CACHE_TTL,
            json.dumps({"embedding": embedding, "text": query})
        )

        elapsed = (time.perf_counter() - start_time) * 1000
        return {
            "index": index,
            "query": query[:60] + "..." if len(query) > 60 else query,
            "status": "warmed",
            "elapsed_ms": round(elapsed, 2),
            "dim": len(embedding)
        }

    except Exception as e:
        elapsed = (time.perf_counter() - start_time) * 1000
        return {
            "index": index,
            "query": query[:60] + "..." if len(query) > 60 else query,
            "status": "error",
            "error": str(e),
            "elapsed_ms": round(elapsed, 2)
        }


async def warm_all_queries():
    """Warm cache with all predefined queries."""
    print("🔥 Phase 89: Cache Warmer")
    print("=" * 70)
    print(f"Queries: {len(WARMUP_QUERIES)}")
    print(f"Model: {EMBEDDING_MODEL}")
    print(f"Ollama: {OLLAMA_URL}")
    print(f"Redis: {REDIS_HOST}:{REDIS_PORT} (db={REDIS_DB})")
    print(f"Cache TTL: {CACHE_TTL}s ({CACHE_TTL // 3600}h)")
    print("=" * 70)
    print()

    # Connect to Redis
    cache = redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        db=REDIS_DB,
        decode_responses=False
    )

    try:
        # Test Redis connection
        await cache.ping()
        initial_keys = len(await cache.keys(f"{CACHE_PREFIX}*"))
        print(f"✅ Redis connected ({initial_keys:,} cache keys before warming)")
        print()

    except Exception as e:
        print(f"❌ Redis connection failed: {e}")
        await cache.aclose()
        return

    # Create HTTP session for Ollama
    async with aiohttp.ClientSession() as session:
        # Test Ollama connection
        try:
            async with session.get(f"{OLLAMA_URL}/api/tags") as response:
                if response.status != 200:
                    print(f"❌ Ollama not available (status {response.status})")
                    await cache.aclose()
                    return
                print(f"✅ Ollama connected")
                print()
        except Exception as e:
            print(f"❌ Ollama connection failed: {e}")
            await cache.aclose()
            return

        # Warm cache for all queries
        start_time = time.perf_counter()
        tasks = [
            warm_cache_query(session, cache, query, i + 1, len(WARMUP_QUERIES))
            for i, query in enumerate(WARMUP_QUERIES)
        ]

        results = await asyncio.gather(*tasks)

        total_elapsed = time.perf_counter() - start_time

        # Print results
        warmed = sum(1 for r in results if r["status"] == "warmed")
        cached = sum(1 for r in results if r["status"] == "cached")
        errors = sum(1 for r in results if r["status"] == "error")

        print(f"\n{'Index':<6} {'Status':<8} {'Time (ms)':<12} {'Query'}")
        print("-" * 90)

        for result in results:
            status_symbol = {
                "warmed": "🔥",
                "cached": "💾",
                "error": "❌"
            }[result["status"]]

            print(
                f"{result['index']:<6} {status_symbol} {result['status']:<6} "
                f"{result['elapsed_ms']:>10.2f}ms  {result['query']}"
            )

            if result["status"] == "error":
                print(f"       Error: {result['error']}")

        print("-" * 90)

        # Final statistics
        final_keys = len(await cache.keys(f"{CACHE_PREFIX}*"))

        print()
        print("=" * 70)
        print("📊 Cache Warming Summary")
        print("=" * 70)
        print(f"Total Queries: {len(WARMUP_QUERIES)}")
        print(f"  🔥 Warmed:   {warmed}")
        print(f"  💾 Cached:   {cached}")
        print(f"  ❌ Errors:   {errors}")
        print()
        print(f"Cache Keys: {initial_keys:,} → {final_keys:,} (+{final_keys - initial_keys})")
        print(f"Total Time: {total_elapsed:.2f}s")
        print(f"Avg Time/Query: {(total_elapsed / len(WARMUP_QUERIES)) * 1000:.2f}ms")
        print("=" * 70)

    await cache.aclose()


if __name__ == "__main__":
    asyncio.run(warm_all_queries())
