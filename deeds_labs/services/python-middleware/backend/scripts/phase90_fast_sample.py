#!/usr/bin/env python3
"""
Phase 90 - Fast Sample-Based Clustering
Process 5,000 representative errors instead of all 73k
Results in 5-10 minutes instead of hours
"""

import os
import sys
import json
import asyncio
import random
from pathlib import Path
from typing import List, Dict
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent))
from phase90_unified_diagnostics import DiagnosticCard, DiagnosticParser
from phase90_gpu_kmeans import kmeans_cosine_cuda

import torch
import aiohttp
import numpy as np
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct

async def embed_one_with_retry(session: aiohttp.ClientSession, text: str, model: str, base_url: str, max_retries: int = 3) -> List[float]:
    """Embed single text with retry logic"""
    for attempt in range(max_retries):
        try:
            payload = {"model": model, "prompt": text[:8000]}
            async with session.post(
                f"{base_url}/api/embeddings",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=60)  # Increased to 60s
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    emb = data.get("embedding", [])
                    if len(emb) == 768:
                        return emb
        except asyncio.TimeoutError:
            if attempt < max_retries - 1:
                await asyncio.sleep(2 ** attempt)  # Exponential backoff
                continue
        except Exception:
            if attempt < max_retries - 1:
                await asyncio.sleep(1)
                continue
    return []


async def embed_batch(texts: List[str], batch_size: int = 50) -> List[List[float]]:
    """Fast batch embedding with retry and progress saving"""
    base_url = "http://localhost:11434"
    model = "embeddinggemma:latest"
    embeddings = []
    success_count = 0

    async with aiohttp.ClientSession() as session:
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]

            # Process batch with retry
            batch_embeddings = []
            for text in batch:
                emb = await embed_one_with_retry(session, text, model, base_url)
                batch_embeddings.append(emb)
                if len(emb) == 768:
                    success_count += 1

            embeddings.extend(batch_embeddings)

            # Progress update
            total_done = min(i + batch_size, len(texts))
            success_rate = (success_count / total_done * 100) if total_done > 0 else 0
            print(f"   Embedded {total_done} / {len(texts)} ({success_rate:.1f}% success)")

    return embeddings
async def main():
    print("\n[Phase 90] Fast Sample-Based Clustering Pipeline")
    print("=" * 70)

    # 1. Parse all diagnostics
    print("\n[1/5] Parsing diagnostics...")
    input_file = Path(__file__).parent.parent.parent / "sveltekit-frontend" / "check_output.txt"

    parser = DiagnosticParser()
    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()

    all_cards = parser.parse(content, tool="svelte-check", run_id="phase90_sample")
    print(f"   Found {len(all_cards)} total diagnostics")

    # 2. Smart sampling - get representative errors
    print("\n[2/5] Sampling 5,000 representative errors...")

    # Group by error code
    by_code = {}
    for card in all_cards:
        code = card.errorCode
        if code not in by_code:
            by_code[code] = []
        by_code[code].append(card)

    # Sample proportionally from each error code
    sample_size = 5000
    sampled_cards = []

    for code, cards in by_code.items():
        proportion = len(cards) / len(all_cards)
        n_samples = max(1, int(proportion * sample_size))
        n_samples = min(n_samples, len(cards))
        sampled_cards.extend(random.sample(cards, n_samples))

    # Trim to exact sample size
    random.shuffle(sampled_cards)
    sampled_cards = sampled_cards[:sample_size]

    print(f"   Sampled {len(sampled_cards)} errors from {len(by_code)} error codes")

    # 3. Generate embeddings with checkpointing
    print("\n[3/5] Generating embeddings...")

    # Check for checkpoint
    checkpoint_file = Path(__file__).parent / "phase90_checkpoint.json"
    start_idx = 0
    embeddings = []

    if checkpoint_file.exists():
        print("   Found checkpoint, resuming...")
        with open(checkpoint_file, 'r') as f:
            checkpoint = json.load(f)
            start_idx = checkpoint.get('completed', 0)
            embeddings = checkpoint.get('embeddings', [])

    # Generate signatures
    signatures = [
        f"{card.errorCode}|{card.filePath}|{card.message[:100]}"
        for card in sampled_cards
    ]

    # Embed remaining
    if start_idx < len(signatures):
        remaining_sigs = signatures[start_idx:]
        new_embeddings = await embed_batch(remaining_sigs, batch_size=50)
        embeddings.extend(new_embeddings)

        # Save checkpoint
        with open(checkpoint_file, 'w') as f:
            json.dump({
                'completed': len(embeddings),
                'embeddings': embeddings
            }, f)

    # Clean up checkpoint on success
    if checkpoint_file.exists():
        checkpoint_file.unlink()    # Filter out failures
    valid_pairs = [(card, emb) for card, emb in zip(sampled_cards, embeddings) if len(emb) == 768]
    print(f"   Success: {len(valid_pairs)} / {len(sampled_cards)} embedded")

    # 4. GPU clustering
    print("\n[4/5] Running GPU K-Means clustering...")
    embeddings_array = np.array([emb for _, emb in valid_pairs], dtype=np.float32)
    embeddings_tensor = torch.from_numpy(embeddings_array).cuda()

    n_clusters = 12
    labels = kmeans_cosine_cuda(embeddings_tensor, n_clusters, max_iters=100)
    labels_np = labels.cpu().numpy()

    print(f"   Clustered into {n_clusters} patterns")

    # 5. Store in Qdrant
    print("\n[5/5] Storing in Qdrant...")
    qdrant = QdrantClient(url="http://localhost:6333")

    # Store error cards
    points = []
    for idx, (card, emb) in enumerate(valid_pairs):
        cluster_id = int(labels_np[idx])

        point = PointStruct(
            id=idx,
            vector=emb,
            payload={
                "errorCode": card.errorCode,
                "filePath": card.filePath,
                "line": card.line,
                "col": card.col,
                "message": card.message[:500],
                "surface": card.surface,
                "tech": card.tech,
                "severity": card.severity,
                "clusterId": f"cluster_{cluster_id}",
                "indexed_at": datetime.utcnow().isoformat()
            }
        )
        points.append(point)

    # Batch upsert
    for i in range(0, len(points), 100):
        batch = points[i:i + 100]
        qdrant.upsert(collection_name="phase90_error_cards", points=batch)

    print(f"   Stored {len(points)} error cards")

    # Create cluster summaries
    print("\n[Summary] Cluster distribution:")
    for cluster_id in range(n_clusters):
        cluster_cards = [card for card, label in zip([c for c, _ in valid_pairs], labels_np) if label == cluster_id]
        if cluster_cards:
            top_code = max(set(c.errorCode for c in cluster_cards), key=lambda x: sum(1 for c in cluster_cards if c.errorCode == x))
            print(f"   Cluster {cluster_id}: {len(cluster_cards)} errors (dominant: {top_code})")

    print("\n" + "=" * 70)
    print("[COMPLETE] Phase 90 clustering finished!")
    print(f"  Processed: {len(valid_pairs)} errors")
    print(f"  Clusters: {n_clusters}")
    print(f"  Collection: phase90_error_cards")
    print("\nQuery with: node scripts/phase90-query-clusters.mjs")
    print("=" * 70 + "\n")


if __name__ == "__main__":
    asyncio.run(main())
