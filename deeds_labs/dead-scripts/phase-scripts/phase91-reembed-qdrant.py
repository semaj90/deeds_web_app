#!/usr/bin/env python3
"""
Phase 91: Re-Embed Qdrant Collection
Populates zero vectors in phase89_cache_index with real embeddinggemma embeddings

Usage:
    python scripts/phase91-reembed-qdrant.py --batch-size 16
    python scripts/phase91-reembed-qdrant.py --limit 50 --dry-run
"""

import argparse
import asyncio
import time
from typing import List

import httpx
import numpy as np
from qdrant_client import QdrantClient
from qdrant_client.http import models
from tqdm import tqdm

# =============================================================================
# Configuration
# =============================================================================
OLLAMA_URL = "http://localhost:11434"
OLLAMA_MODEL = "embeddinggemma:latest"
QDRANT_HOST = "localhost"
QDRANT_PORT = 6333
COLLECTION_NAME = "phase89_cache_index"
BATCH_SIZE = 16

# =============================================================================
# Ollama Embedding
# =============================================================================
async def get_embedding(text: str, task_type: str = "retrieval_document") -> np.ndarray:
    """Get 768-dim embedding from Ollama.

    Args:
        text: Text to embed
        task_type: 'retrieval_document' (storage) or 'retrieval_query' (search)
                   Video [08:59] - Typed Artifacts Philosophy
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{OLLAMA_URL}/api/embeddings",
            json={
                'model': OLLAMA_MODEL,
                'prompt': text,
                'options': {'task_type': task_type}  # Video [08:59]
            }
        )
        response.raise_for_status()
        embedding = response.json().get('embedding', [])
        return np.array(embedding, dtype=np.float32)

async def embed_batch(texts: List[str]) -> List[np.ndarray]:
    """Embed batch of texts concurrently."""
    tasks = [get_embedding(text) for text in texts]
    return await asyncio.gather(*tasks)

# =============================================================================
# Re-Embedding Pipeline
# =============================================================================
async def reembed_collection(
    batch_size: int = BATCH_SIZE,
    limit: int = None,
    dry_run: bool = False
):
    """Re-embed all points in Qdrant collection."""

    print(f"🔄 Re-Embedding Qdrant Collection: {COLLECTION_NAME}")
    print("=" * 70)
    print()

    # Connect to Qdrant
    client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)

    # Get all points
    print(f"📥 Loading points from Qdrant...")
    points, next_offset = client.scroll(
        collection_name=COLLECTION_NAME,
        limit=limit or 10000,
        with_payload=True,
        with_vectors=False  # Don't need old zero vectors
    )

    if not points:
        print("❌ No points found in collection")
        return

    print(f"   Found {len(points)} points")
    print()

    # Extract signature texts for embedding
    print(f"🧠 Embedding with {OLLAMA_MODEL}...")

    updated_points = []
    total_time = 0

    for i in tqdm(range(0, len(points), batch_size)):
        batch_points = points[i:i+batch_size]

        # Extract signature texts
        texts = [
            point.payload.get('signature_text', '') or
            point.payload.get('content_hash', '')[:100] or
            f"point_{point.id}"
            for point in batch_points
        ]

        # Embed batch
        t0 = time.perf_counter()
        embeddings = await embed_batch(texts)
        batch_time = (time.perf_counter() - t0) * 1000
        total_time += batch_time

        # Create updated points
        for point, embedding in zip(batch_points, embeddings):
            updated_points.append(models.PointStruct(
                id=point.id,
                vector=embedding.tolist(),
                payload=point.payload
            ))

    print()
    print(f"✅ Embedded {len(updated_points)} points in {total_time/1000:.2f}s")
    print(f"   Average: {total_time/len(updated_points):.2f}ms per embedding")
    print()

    if dry_run:
        print("🔍 Dry run - showing sample:")
        sample = updated_points[0]
        vec_norm = np.linalg.norm(np.array(sample.vector))
        print(f"   Point ID: {sample.id}")
        print(f"   Vector dims: {len(sample.vector)}")
        print(f"   Vector norm: {vec_norm:.4f}")
        print(f"   Payload keys: {list(sample.payload.keys())}")
        print()
        print("⏭️  Skipping Qdrant update (dry-run mode)")
        return

    # Update Qdrant
    print(f"💾 Updating Qdrant collection...")
    client.upsert(
        collection_name=COLLECTION_NAME,
        points=updated_points
    )

    print(f"✅ Collection re-embedded successfully!")
    print()

    # Verify
    print(f"🔍 Verifying first point...")
    verify_points = client.scroll(
        collection_name=COLLECTION_NAME,
        limit=1,
        with_vectors=True
    )[0]

    if verify_points:
        vec = np.array(verify_points[0].vector)
        vec_norm = np.linalg.norm(vec)
        print(f"   Vector dims: {len(vec)}")
        print(f"   Vector norm: {vec_norm:.4f}")

        if vec_norm > 0.1:
            print(f"   ✅ Vectors populated correctly!")
        else:
            print(f"   ⚠️  Vector still appears to be zero")

    print()

# =============================================================================
# CLI
# =============================================================================
def main():
    parser = argparse.ArgumentParser(description='Re-embed Qdrant collection with embeddinggemma')
    parser.add_argument('--batch-size', type=int, default=BATCH_SIZE, help='Batch size for embedding')
    parser.add_argument('--limit', type=int, default=None, help='Limit number of points (for testing)')
    parser.add_argument('--dry-run', action='store_true', help='Test without updating Qdrant')

    args = parser.parse_args()

    asyncio.run(reembed_collection(
        batch_size=args.batch_size,
        limit=args.limit,
        dry_run=args.dry_run
    ))

if __name__ == "__main__":
    main()
