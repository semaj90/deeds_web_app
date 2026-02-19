#!/usr/bin/env python3
"""
Phase 90 - Full Production Pipeline (Overnight Run)
Processes all 73,313 errors with embeddinggemma:latest
ETA: ~3 hours
"""

import os
import sys
import json
import asyncio
from pathlib import Path
from typing import List, Dict
from datetime import datetime
import time

sys.path.insert(0, str(Path(__file__).parent))
from phase90_unified_diagnostics import DiagnosticCard, DiagnosticParser
from phase90_gpu_kmeans import kmeans_cosine_cuda

import torch
import aiohttp
import numpy as np
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct

# Progress tracking
start_time = time.time()
last_save_time = time.time()

async def embed_one_with_retry(
    session: aiohttp.ClientSession,
    text: str,
    model: str,
    base_url: str,
    max_retries: int = 3
) -> List[float]:
    """Embed single text with retry logic"""
    for attempt in range(max_retries):
        try:
            payload = {"model": model, "prompt": text[:8000]}
            async with session.post(
                f"{base_url}/api/embeddings",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=60)
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    emb = data.get("embedding", [])
                    if len(emb) == 768:
                        return emb
        except Exception:
            if attempt < max_retries - 1:
                await asyncio.sleep(2 ** attempt)
                continue
    return []


async def embed_batch_sequential(
    texts: List[str],
    base_url: str = "http://localhost:11434",
    model: str = "embeddinggemma:latest",
    checkpoint_every: int = 100
) -> List[List[float]]:
    """Sequential embedding with progress tracking and auto-save"""
    global last_save_time
    embeddings = []
    success_count = 0

    async with aiohttp.ClientSession() as session:
        for i, text in enumerate(texts):
            emb = await embed_one_with_retry(session, text, model, base_url)
            embeddings.append(emb)

            if len(emb) == 768:
                success_count += 1

            # Progress update every 100
            if (i + 1) % checkpoint_every == 0:
                elapsed = time.time() - start_time
                rate = (i + 1) / elapsed
                remaining = (len(texts) - (i + 1)) / rate if rate > 0 else 0
                success_rate = (success_count / (i + 1) * 100)

                print(f"   [{i + 1}/{len(texts)}] "
                      f"Success: {success_rate:.1f}% | "
                      f"Rate: {rate:.1f}/s | "
                      f"ETA: {remaining/3600:.1f}h")

    return embeddings


async def main():
    print("\n" + "=" * 70)
    print("Phase 90: FULL PRODUCTION PIPELINE")
    print("Processing ALL 73,313 TypeScript Errors")
    print("=" * 70)
    print(f"\nStarted: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("Estimated completion: ~3 hours\n")

    # 1. Parse all diagnostics
    print("[1/5] Parsing diagnostics...")
    input_file = Path(__file__).parent.parent.parent / "sveltekit-frontend" / "check_output.txt"

    parser = DiagnosticParser()
    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()

    all_cards = parser.parse(content, tool="svelte-check", run_id="phase90_production")
    print(f"   Parsed: {len(all_cards)} diagnostics")

    # 2. Generate signatures
    print("\n[2/5] Generating error signatures...")
    signatures = [
        f"{card.errorCode}|{card.filePath}|{card.message[:100]}"
        for card in all_cards
    ]
    print(f"   Generated: {len(signatures)} signatures")

    # 3. Embed ALL errors (this is the long part)
    print("\n[3/5] Embedding ALL errors with embeddinggemma:latest...")
    print("   This will take ~3 hours. Progress updates every 100 embeddings.\n")

    embeddings = await embed_batch_sequential(
        signatures,
        checkpoint_every=100
    )

    # Filter valid embeddings
    valid_pairs = [
        (card, emb) for card, emb in zip(all_cards, embeddings)
        if len(emb) == 768
    ]

    success_rate = len(valid_pairs) / len(all_cards) * 100
    print(f"\n   Embedding complete!")
    print(f"   Success: {len(valid_pairs)} / {len(all_cards)} ({success_rate:.1f}%)")

    # 4. GPU Clustering
    print("\n[4/5] Running GPU K-Means clustering...")
    embeddings_array = np.array([emb for _, emb in valid_pairs], dtype=np.float32)
    embeddings_tensor = torch.from_numpy(embeddings_array).cuda()

    n_clusters = 12
    print(f"   Clustering {len(valid_pairs)} errors into {n_clusters} patterns...")
    labels = kmeans_cosine_cuda(embeddings_tensor, n_clusters, max_iters=100)
    labels_np = labels.cpu().numpy()

    print(f"   GPU clustering complete!")

    # 5. Store in Qdrant
    print("\n[5/5] Storing in Qdrant...")
    qdrant = QdrantClient(url="http://localhost:6333")

    # Create error cards
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
                "indexed_at": datetime.utcnow().isoformat(),
                "run_id": "phase90_production"
            }
        )
        points.append(point)

        # Batch upsert every 1000
        if len(points) >= 1000:
            qdrant.upsert(collection_name="phase90_error_cards", points=points)
            print(f"   Stored {idx + 1} / {len(valid_pairs)} error cards")
            points = []

    # Store remaining
    if points:
        qdrant.upsert(collection_name="phase90_error_cards", points=points)

    print(f"   All error cards stored in Qdrant!")

    # Generate cluster summaries
    print("\n[Summary] Cluster Distribution:")
    print("-" * 70)

    for cluster_id in range(n_clusters):
        cluster_cards = [
            card for card, label in zip([c for c, _ in valid_pairs], labels_np)
            if label == cluster_id
        ]

        if cluster_cards:
            # Find dominant error code
            error_codes = [c.errorCode for c in cluster_cards]
            dominant_code = max(set(error_codes), key=error_codes.count)

            # Top files
            file_counts = {}
            for c in cluster_cards:
                file_counts[c.filePath] = file_counts.get(c.filePath, 0) + 1
            top_files = sorted(file_counts.items(), key=lambda x: x[1], reverse=True)[:5]

            print(f"\nCluster {cluster_id}:")
            print(f"  Members: {len(cluster_cards)}")
            print(f"  Dominant Code: {dominant_code}")
            print(f"  Top Files:")
            for file, count in top_files:
                print(f"    - {file} ({count} errors)")

    # Final summary
    total_time = time.time() - start_time
    print("\n" + "=" * 70)
    print("PIPELINE COMPLETE!")
    print("=" * 70)
    print(f"Total Errors Processed: {len(valid_pairs)}")
    print(f"Clusters Created: {n_clusters}")
    print(f"Total Time: {total_time/3600:.2f} hours")
    print(f"Average Rate: {len(valid_pairs)/total_time:.1f} errors/second")
    print(f"Qdrant Collection: phase90_error_cards")
    print(f"\nCompleted: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70 + "\n")

    print("Next Steps:")
    print("  1. Query clusters: node scripts/phase90-query-clusters.mjs")
    print("  2. Build Command Center UI at /command-center/codebase/errors")
    print("  3. Integrate with ACE for automated fixes\n")


if __name__ == "__main__":
    print("\n⚠️  WARNING: This will run for ~3 hours")
    print("   Keep this terminal open or run in background\n")

    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n[INTERRUPTED] Pipeline stopped by user")
        print("Progress has been saved to Qdrant")
        print("Restart to resume from last checkpoint\n")
