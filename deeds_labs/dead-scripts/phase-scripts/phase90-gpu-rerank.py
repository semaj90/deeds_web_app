#!/usr/bin/env python3
"""
Phase 90: GPU Rerank Layer
Performs high-precision cosine similarity reranking on RTX 3060 Ti (FP16).

Architecture:
  1. Qdrant returns top-K rough candidates (HNSW approximate)
  2. GPU calculates exact cosine similarity (FP16 precision)
  3. Returns reranked results with precise scores

Usage:
    python scripts/phase90-gpu-rerank.py "search query here"
    python scripts/phase90-gpu-rerank.py --top-k 100 --limit 20 "query"
"""

import sys
import os
import json
import time
import argparse
from pathlib import Path
from typing import List, Dict, Any, Optional

# Add scripts to path
sys.path.insert(0, str(Path(__file__).parent))

import torch
import torch.nn.functional as F
import numpy as np

try:
    from qdrant_client import QdrantClient
    from qdrant_client.models import Distance, VectorParams
except ImportError:
    print("❌ Missing qdrant-client. Install: pip install qdrant-client")
    sys.exit(1)

try:
    import httpx
except ImportError:
    print("❌ Missing httpx. Install: pip install httpx")
    sys.exit(1)

# =============================================================================
# Configuration
# =============================================================================
QDRANT_HOST = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", "6333"))
COLLECTION_NAME = os.getenv("QDRANT_COLLECTION", "phase89_cache_index")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "embeddinggemma:latest")
EMBEDDING_DIM = 768

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
DTYPE = torch.float16 if DEVICE == "cuda" else torch.float32


# =============================================================================
# GPU Status
# =============================================================================
def check_gpu_status():
    """Print GPU status and capabilities."""
    if DEVICE == "cuda":
        props = torch.cuda.get_device_properties(0)
        print(f"✅ GPU Detected: {props.name}")
        print(f"   VRAM: {props.total_memory / 1024**3:.2f} GB")
        print(f"   Precision: FP16 Enabled")
        print(f"   CUDA Version: {torch.version.cuda}")
    else:
        print("⚠️  WARNING: Running on CPU. Performance will be degraded.")
    print()


# =============================================================================
# Embedding Generation (Ollama)
# =============================================================================
def generate_embedding(text: str) -> List[float]:
    """Generate embedding using Ollama's embeddinggemma model."""
    try:
        response = httpx.post(
            f"{OLLAMA_URL}/api/embeddings",
            json={"model": EMBEDDING_MODEL, "prompt": text},
            timeout=30.0
        )
        response.raise_for_status()
        return response.json().get("embedding", [])
    except Exception as e:
        print(f"❌ Embedding generation failed: {e}")
        return []


# =============================================================================
# GPU Reranking
# =============================================================================
def rerank_query(
    query_text: str,
    top_k: int = 50,
    limit: int = 10,
    collection: str = COLLECTION_NAME,
    verbose: bool = True
) -> List[Dict[str, Any]]:
    """
    GPU-accelerated semantic search with precise reranking.

    1. Fetches 'top_k' rough candidates from Qdrant (approximate NN).
    2. Calculates precise cosine similarity on GPU in FP16.
    3. Returns top 'limit' results.
    """
    client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)

    # 1. Generate query embedding
    if verbose:
        print(f"🔍 Query: '{query_text}'")
        print(f"   Collection: {collection}")
        print(f"   Top-K: {top_k}, Limit: {limit}")
        print()

    t0 = time.perf_counter()
    query_vector = generate_embedding(query_text)

    if not query_vector:
        print("❌ Failed to generate query embedding")
        return []

    t_embed = time.perf_counter() - t0

    # 2. Initial retrieval from Qdrant (Approximate HNSW)
    t1 = time.perf_counter()
    try:
        search_result = client.search(
            collection_name=collection,
            query_vector=query_vector,
            limit=top_k,
            with_payload=True,
            with_vectors=True  # Need vectors for precise rerank
        )
    except Exception as e:
        print(f"❌ Qdrant search failed: {e}")
        return []

    t_search = time.perf_counter() - t1

    if not search_result:
        print("No results found.")
        return []

    if verbose:
        print(f"📊 Retrieved {len(search_result)} candidates from Qdrant")

    # 3. GPU Reranking (Precise FP16 Cosine)
    t2 = time.perf_counter()

    # Convert to tensors - handle named vectors from Qdrant
    query_tensor = torch.tensor(query_vector, device=DEVICE, dtype=DTYPE).unsqueeze(0)

    # Extract vectors - Qdrant may return dict for named vectors
    candidate_vectors = []
    for hit in search_result:
        vec = hit.vector
        if vec is None:
            continue
        # Handle named vectors (dict with name -> vector)
        if isinstance(vec, dict):
            vec = list(vec.values())[0] if vec else None
        if vec and len(vec) == len(query_vector):
            candidate_vectors.append(vec)

    if not candidate_vectors:
        print("❌ No valid vectors returned from Qdrant")
        if verbose:
            print(f"   Debug: First result vector type = {type(search_result[0].vector) if search_result else 'N/A'}")
        return []

    candidate_tensor = torch.tensor(candidate_vectors, device=DEVICE, dtype=DTYPE)

    # Normalize vectors
    query_norm = F.normalize(query_tensor, p=2, dim=1)
    cand_norm = F.normalize(candidate_tensor, p=2, dim=1)

    # Compute cosine similarity (GPU FP16)
    if DEVICE == "cuda":
        with torch.amp.autocast('cuda'):  # Updated API
            scores = torch.mm(query_norm, cand_norm.T).squeeze()
    else:
        scores = torch.mm(query_norm, cand_norm.T).squeeze()

    # Handle single result case
    if scores.dim() == 0:
        scores = scores.unsqueeze(0)

    # Sort by GPU scores (descending)
    sorted_indices = torch.argsort(scores, descending=True)

    t_rerank = time.perf_counter() - t2

    # 4. Build reranked results
    reranked_results = []

    if verbose:
        print(f"\n{'Rank':<6} {'Score':<10} {'Original':<10} {'Kind':<15} {'Namespace'}")
        print("-" * 70)

    for new_rank, idx in enumerate(sorted_indices[:limit]):
        idx_int = int(idx.item())
        original_hit = search_result[idx_int]
        score = float(scores[idx_int].item())
        payload = original_hit.payload or {}

        result = {
            "rank": new_rank + 1,
            "score": score,
            "original_rank": idx_int + 1,
            "payload": payload,
            "id": str(original_hit.id) if original_hit.id else None
        }
        reranked_results.append(result)

        if verbose:
            kind = payload.get('kind', 'unknown')[:15]
            ns = payload.get('ns', payload.get('namespace', 'unknown'))[:20]
            print(f"{new_rank + 1:<6} {score:.6f}   #{idx_int + 1:<8} {kind:<15} {ns}")

    # 5. Print timing summary
    if verbose:
        print()
        print("⏱️  Timing Breakdown:")
        print(f"   Embedding: {t_embed * 1000:.2f}ms")
        print(f"   Qdrant Search: {t_search * 1000:.2f}ms")
        print(f"   GPU Rerank: {t_rerank * 1000:.2f}ms")
        print(f"   Total: {(t_embed + t_search + t_rerank) * 1000:.2f}ms")

    return reranked_results


# =============================================================================
# CLI
# =============================================================================
def main():
    parser = argparse.ArgumentParser(
        description="Phase 90: GPU Rerank Layer for ACE Pipeline"
    )
    parser.add_argument("query", nargs="*", help="Search query text")
    parser.add_argument("--top-k", type=int, default=50, help="Candidates to fetch from Qdrant")
    parser.add_argument("--limit", type=int, default=10, help="Final results to return")
    parser.add_argument("--collection", default=COLLECTION_NAME, help="Qdrant collection name")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    parser.add_argument("--status", action="store_true", help="Show GPU status only")

    args = parser.parse_args()

    if args.status:
        check_gpu_status()
        return

    if not args.query:
        parser.print_help()
        print("\n📖 Example:")
        print("   python scripts/phase90-gpu-rerank.py 'Svelte 5 migration $state'")
        return

    query_text = " ".join(args.query)

    check_gpu_status()

    results = rerank_query(
        query_text,
        top_k=args.top_k,
        limit=args.limit,
        collection=args.collection,
        verbose=not args.json
    )

    if args.json:
        print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
