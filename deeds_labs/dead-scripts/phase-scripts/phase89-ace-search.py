#!/usr/bin/env python3
"""
Phase 89: ACE Semantic Search with GPU Rerank
Complete search pipeline: Query → Ollama Embed → Qdrant Search → GPU Rerank

Usage:
    python scripts/phase89-ace-search.py "Fix TypeScript errors in UnifiedButton"
    python scripts/phase89-ace-search.py "Svelte 5 runes migration" --top-k 100
"""

import asyncio
import sys
import time
from typing import Dict, List, Any

import httpx
import numpy as np
from qdrant_client import QdrantClient

# Import GPU reranker
from phase89_gpu_rerank import GPURerankEngine

# Import JSON helper
from phase89_json import dumps

# =============================================================================
# Configuration
# =============================================================================
OLLAMA_URL = "http://localhost:11434"
OLLAMA_MODEL = "embeddinggemma:latest"
QDRANT_HOST = "localhost"
QDRANT_PORT = 6333
COLLECTION_NAME = "phase89_cache_index"

# Retrieval parameters
DEFAULT_TOP_K = 50  # Qdrant candidates
DEFAULT_LIMIT = 10  # Final results after rerank

# =============================================================================
# Ollama Embedding Client
# =============================================================================
async def get_ollama_embedding(text: str) -> np.ndarray:
    """Get 768-dim embedding from Ollama embeddinggemma."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{OLLAMA_URL}/api/embeddings",
            json={
                'model': OLLAMA_MODEL,
                'prompt': text
            }
        )
        response.raise_for_status()
        result = response.json()

        embedding = result.get('embedding', [])
        return np.array(embedding, dtype=np.float32)

# =============================================================================
# ACE Search Pipeline
# =============================================================================
async def ace_search(
    query: str,
    top_k: int = DEFAULT_TOP_K,
    limit: int = DEFAULT_LIMIT,
    verbose: bool = True
) -> List[Dict[str, Any]]:
    """
    Complete ACE search pipeline with GPU rerank.

    Steps:
    1. Embed query with Ollama (embeddinggemma)
    2. Search Qdrant for top-k candidates (approximate NN)
    3. GPU rerank candidates (precise FP16 cosine)
    4. Return top-limit results with confidence scores
    """

    if verbose:
        print(f"🔍 ACE Semantic Search")
        print("=" * 70)
        print(f"Query: {query}")
        print()

    # Step 1: Embed query
    t0 = time.perf_counter()
    query_embedding = await get_ollama_embedding(query)
    embed_time = (time.perf_counter() - t0) * 1000

    if verbose:
        print(f"✅ Ollama embedding: 768-dim in {embed_time:.2f}ms")

    # Step 2: Qdrant search (approximate)
    t1 = time.perf_counter()
    client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)

    search_results = client.search(
        collection_name=COLLECTION_NAME,
        query_vector=query_embedding.tolist(),
        limit=top_k,
        with_payload=True,
        with_vectors=True  # Need vectors for rerank
    )
    qdrant_time = (time.perf_counter() - t1) * 1000

    if not search_results:
        if verbose:
            print("❌ No results found in Qdrant")
        return []

    if verbose:
        print(f"✅ Qdrant search: {len(search_results)} candidates in {qdrant_time:.2f}ms")
        print()

    # Step 3: GPU rerank
    engine = GPURerankEngine()

    # Convert Qdrant results to reranker format
    candidates = []
    for hit in search_results:
        # Check if vector is valid
        if hit.vector is None or len(hit.vector) == 0:
            if verbose:
                print(f"⚠️  Skipping point {hit.id}: no vector data")
            continue

        vec = np.array(hit.vector, dtype=np.float32)

        # Debug: Check for zero vectors
        if verbose and len(candidates) < 3:
            vec_norm = np.linalg.norm(vec)
            print(f"   Debug candidate {len(candidates)}: vec_norm={vec_norm:.4f}, dims={len(vec)}")

        candidates.append((
            hit.id,  # point_id
            vec,  # embedding
            hit.payload  # payload
        ))

    if not candidates:
        if verbose:
            print("❌ No valid candidates with vectors")
        return []

    # Debug query vector
    if verbose:
        query_norm = np.linalg.norm(query_embedding)
        print(f"   Debug query: vec_norm={query_norm:.4f}, dims={len(query_embedding)}")
        print()

    reranked_results = engine.rerank(query_embedding, candidates)    # Step 4: Format results
    if verbose:
        print()
        print(f"📊 Top {min(limit, len(reranked_results))} Results (GPU Reranked):")
        print("-" * 70)
        print(f"{'Rank':<6} {'Score':<8} {'Conf':<12} {'Kind':<12} {'Key'}")
        print("-" * 70)

        for rank, result in enumerate(reranked_results[:limit], 1):
            kind = result.payload.get('kind', 'unknown')
            key = result.payload.get('redis_key', 'unknown')[:40]

            # Confidence emoji
            conf_emoji = {
                'safe_reuse': '✅',
                'verify': '⚠️',
                'miss': '❌'
            }.get(result.confidence, '❓')

            print(f"{rank:<6} {result.score:<8.4f} {conf_emoji} {result.confidence:<10} {kind:<12} {key}")

        print()

        # Statistics
        total_time = (time.perf_counter() - t0) * 1000
        print(f"⏱️  Total time: {total_time:.2f}ms")
        print(f"   Embedding:  {embed_time:.2f}ms")
        print(f"   Qdrant:     {qdrant_time:.2f}ms")
        print(f"   GPU rerank: ~{total_time - embed_time - qdrant_time:.2f}ms")

        # Confidence distribution
        print()
        print(f"📈 Confidence Distribution:")
        miss = sum(1 for r in reranked_results if r.confidence == "miss")
        verify = sum(1 for r in reranked_results if r.confidence == "verify")
        safe = sum(1 for r in reranked_results if r.confidence == "safe_reuse")
        total = len(reranked_results)

        print(f"   ❌ MISS (<0.38):        {miss:4} ({miss/total*100:5.1f}%)")
        print(f"   ⚠️  VERIFY (0.38-0.55): {verify:4} ({verify/total*100:5.1f}%)")
        print(f"   ✅ SAFE_REUSE (>0.55):  {safe:4} ({safe/total*100:5.1f}%)")

    # Return structured results
    return [
        {
            'rank': i + 1,
            'score': r.score,
            'confidence': r.confidence,
            'payload': r.payload
        }
        for i, r in enumerate(reranked_results[:limit])
    ]

# =============================================================================
# CLI
# =============================================================================
async def main():
    import argparse

    parser = argparse.ArgumentParser(description='Phase 89: ACE Semantic Search with GPU Rerank')
    parser.add_argument('query', nargs='+', help='Search query')
    parser.add_argument('--top-k', type=int, default=DEFAULT_TOP_K, help='Qdrant candidates (default: 50)')
    parser.add_argument('--limit', type=int, default=DEFAULT_LIMIT, help='Final results (default: 10)')
    parser.add_argument('--json', action='store_true', help='Output JSON only')
    parser.add_argument('--quiet', action='store_true', help='Minimal output')

    args = parser.parse_args()

    query = ' '.join(args.query)

    results = await ace_search(
        query,
        top_k=args.top_k,
        limit=args.limit,
        verbose=not args.quiet
    )

    if args.json:
        print(dumps({
            'query': query,
            'results': results,
            'total': len(results)
        }))

if __name__ == '__main__':
    asyncio.run(main())
