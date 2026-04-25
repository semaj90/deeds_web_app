#!/usr/bin/env python3
"""
Phase 90 - Complete GPU Error Clustering Pipeline
Uses unified DiagnosticCard schema + enhanced Qdrant tagging
"""

import os
import sys
import json
import asyncio
from pathlib import Path
from typing import List, Dict, Any
from datetime import datetime
import numpy as np

# Add scripts to path
sys.path.insert(0, str(Path(__file__).parent))

from phase90_unified_diagnostics import (
    DiagnosticCard,
    ClusterCard,
    DiagnosticParser,
    generate_run_id
)
from phase90_gpu_kmeans import kmeans_cosine_cuda

import torch
import aiohttp
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct


class EmbeddingService:
    """Generate 768d embeddings via embeddinggemma"""

    def __init__(self):
        self.base_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
        self.model = "embeddinggemma:latest"

    async def embed(self, text: str) -> List[float]:
        """Single embedding"""
        try:
            async with aiohttp.ClientSession() as session:
                payload = {"model": self.model, "prompt": text}
                async with session.post(
                    f"{self.base_url}/api/embeddings",
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return data.get("embedding", [])
                    return []
        except Exception as e:
            print(f"⚠️  Embedding failed: {e}")
            return []

    async def embed_batch(
        self,
        texts: List[str],
        batch_size: int = 32,
        show_progress: bool = True
    ) -> List[List[float]]:
        """Batch embeddings with progress"""
        embeddings = []

        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]

            # Parallel batch processing
            tasks = [self.embed(text) for text in batch]
            batch_embeddings = await asyncio.gather(*tasks)
            embeddings.extend(batch_embeddings)

            if show_progress and i % 320 == 0:  # Every 10 batches
                print(f"   Embedded {min(i + batch_size, len(texts))} / {len(texts)} signatures")

        return embeddings


class LLMService:
    """Generate cluster summaries via gemma3:270m"""

    def __init__(self):
        self.base_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
        self.model = "gemma3:270m"

    async def summarize_cluster(
        self,
        error_code: str,
        top_files: List[str],
        top_messages: List[str]
    ) -> Dict[str, str]:
        """
        Generate cluster summary and fix suggestion.
        Returns: {summary: str, fix_suggestion: str}
        """
        prompt = f"""Analyze this error pattern cluster:

Error Code: {error_code}

Top Affected Files:
{chr(10).join(f'- {f}' for f in top_files[:5])}

Common Error Messages:
{chr(10).join(f'- {m}' for m in top_messages[:3])}

Provide:
1. SUMMARY (one sentence describing the pattern)
2. FIX_SUGGESTION (one automated fix rule that could resolve this)

Format:
SUMMARY: <text>
FIX_SUGGESTION: <text>
"""

        try:
            async with aiohttp.ClientSession() as session:
                payload = {
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.3, "num_predict": 150}
                }

                async with session.post(
                    f"{self.base_url}/api/generate",
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=20)
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        response = data.get("response", "")

                        # Parse output
                        summary = ""
                        fix_suggestion = ""

                        for line in response.split('\n'):
                            if line.startswith("SUMMARY:"):
                                summary = line.replace("SUMMARY:", "").strip()
                            elif line.startswith("FIX_SUGGESTION:"):
                                fix_suggestion = line.replace("FIX_SUGGESTION:", "").strip()

                        return {
                            "summary": summary or "Error pattern cluster",
                            "fix_suggestion": fix_suggestion or "Manual review required"
                        }
        except Exception as e:
            print(f"⚠️  LLM summary failed: {e}")

        return {
            "summary": f"{error_code} pattern cluster",
            "fix_suggestion": "Automated fix not available"
        }


async def cluster_diagnostics(
    cards: List[DiagnosticCard],
    num_clusters: int,
    run_id: str
) -> List[ClusterCard]:
    """
    Main clustering pipeline:
    1. Embed signatures
    2. GPU k-means clustering
    3. LLM cluster summaries
    4. Create ClusterCard objects
    """

    print(f"\n🔮 Embedding {len(cards)} diagnostic signatures...")

    # Generate embeddings
    embedder = EmbeddingService()
    signatures = [card.signature for card in cards]
    embeddings = await embedder.embed_batch(signatures, batch_size=32)

    # Filter out failed embeddings
    valid_pairs = [(card, emb) for card, emb in zip(cards, embeddings) if len(emb) == 768]

    if len(valid_pairs) < num_clusters:
        print(f"⚠️  Only {len(valid_pairs)} valid embeddings, reducing clusters to {len(valid_pairs) // 10}")
        num_clusters = max(3, len(valid_pairs) // 10)

    cards, embeddings = zip(*valid_pairs)
    cards = list(cards)

    print(f"✅ Generated {len(embeddings)} valid 768d embeddings")

    # Convert to PyTorch tensor
    print(f"\n⚡ Running GPU k-means clustering (k={num_clusters})...")
    X = torch.tensor(np.array(embeddings), dtype=torch.float32)

    result = kmeans_cosine_cuda(X, k=num_clusters, iters=25, fp16=True)

    print(f"✅ Clustering complete:")
    print(f"   Inertia: {result.inertia:.4f}")
    print(f"   Clusters: {num_clusters}")

    # Aggregate clusters
    print(f"\n🧠 Generating LLM cluster summaries...")
    cluster_cards = []
    llm_service = LLMService()

    for cluster_id in range(num_clusters):
        # Get cluster members
        mask = result.labels == cluster_id
        cluster_members = [cards[i] for i in range(len(cards)) if mask[i]]

        if not cluster_members:
            continue

        # Aggregate metadata
        error_codes = {}
        files = {}
        messages = {}
        all_surface = set()
        all_tech = set()

        for card in cluster_members:
            error_codes[card.errorCode] = error_codes.get(card.errorCode, 0) + 1
            files[card.filePath] = files.get(card.filePath, 0) + 1
            messages[card.signature] = messages.get(card.signature, 0) + 1
            all_surface.update(card.surface)
            all_tech.update(card.tech)

        # Top items
        dominant_code = max(error_codes.items(), key=lambda x: x[1])[0]
        top_files = sorted(files.items(), key=lambda x: x[1], reverse=True)[:10]
        top_messages = sorted(messages.items(), key=lambda x: x[1], reverse=True)[:5]

        # LLM summary
        llm_result = await llm_service.summarize_cluster(
            dominant_code,
            [f for f, _ in top_files],
            [m for m, _ in top_messages]
        )

        # Create cluster card
        centroid = result.centroids[cluster_id].cpu().numpy().tolist()

        cluster_card = ClusterCard(
            id=f"cluster_{cluster_id}",
            cluster_id=f"cluster_{cluster_id}",
            name=f"{dominant_code}_cluster_{cluster_id}",
            dominant_code=dominant_code,
            member_count=len(cluster_members),
            top_files=[f for f, _ in top_files],
            top_messages=[m for m, _ in top_messages],
            representative_errors=[card.id for card in cluster_members[:10]],
            summary=llm_result["summary"],
            fix_suggestion=llm_result["fix_suggestion"],
            surface=list(all_surface),
            tech=list(all_tech),
            centroid_embedding=centroid,
            runId=run_id
        )

        cluster_cards.append(cluster_card)

        # Back-propagate clusterId to members
        for card in cluster_members:
            card.clusterId = f"cluster_{cluster_id}"

        print(f"   ✓ Cluster {cluster_id}: {dominant_code} ({len(cluster_members)} members)")

    print(f"\n✅ Created {len(cluster_cards)} cluster cards")

    return cluster_cards


async def store_to_qdrant(
    cards: List[DiagnosticCard],
    cluster_cards: List[ClusterCard],
    embeddings: List[List[float]]
):
    """Store diagnostic and cluster cards in Qdrant"""

    client = QdrantClient(url="http://localhost:6333")

    # Store diagnostic cards
    print(f"\n📦 Storing {len(cards)} diagnostic cards...")

    points = []
    for card, embedding in zip(cards, embeddings):
        if len(embedding) != 768:
            continue

        points.append(PointStruct(
            id=int(card.id[:16], 16) % (2**63),  # Convert hex to int
            vector=embedding,
            payload=card.to_qdrant_payload()
        ))

    if points:
        # Batch upsert (Qdrant handles this efficiently)
        batch_size = 100
        for i in range(0, len(points), batch_size):
            batch = points[i:i + batch_size]
            client.upsert(
                collection_name="phase90_error_cards",
                points=batch
            )

        print(f"✅ Stored {len(points)} error cards in Qdrant")

    # Store cluster cards
    print(f"\n📦 Storing {len(cluster_cards)} cluster cards...")

    cluster_points = []
    for cluster in cluster_cards:
        cluster_points.append(PointStruct(
            id=int(cluster.id.split('_')[1]),  # cluster_7 → 7
            vector=cluster.centroid_embedding,
            payload=cluster.to_qdrant_payload()
        ))

    if cluster_points:
        client.upsert(
            collection_name="phase90_error_clusters",
            points=cluster_points
        )

        print(f"✅ Stored {len(cluster_points)} cluster cards in Qdrant")


async def main():
    import argparse

    parser = argparse.ArgumentParser(description="Phase 90: GPU Error Clustering Pipeline")
    parser.add_argument("--input", required=True, help="Error output file (svelte-check/tsc)")
    parser.add_argument("--tool", default="svelte-check", help="Tool name")
    parser.add_argument("--clusters", type=int, help="Number of clusters (auto if not set)")
    parser.add_argument("--run-id", help="Run identifier (auto-generated if not set)")

    args = parser.parse_args()

    print("=" * 70)
    print("🚀 Phase 90: GPU Error Clustering Pipeline (Unified Schema)")
    print("=" * 70)
    print()

    # 1. Parse diagnostics
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"❌ Input file not found: {args.input}")
        return

    with open(input_path, 'r', encoding='utf-8', errors='ignore') as f:
        output = f.read()

    run_id = args.run_id or generate_run_id()
    print(f"📊 Run ID: {run_id}")

    parser = DiagnosticParser()
    cards = parser.parse(output, args.tool, run_id)

    print(f"📊 Parsed {len(cards)} diagnostic cards from {args.input}")

    if not cards:
        print("❌ No diagnostics found!")
        return

    # Auto-calculate clusters
    num_clusters = args.clusters or max(8, int(np.sqrt(len(cards) / 2)))
    num_clusters = min(num_clusters, len(cards) // 10)  # At least 10 members per cluster

    print(f"🎯 Target clusters: {num_clusters}")

    # 2. Cluster
    cluster_cards = await cluster_diagnostics(cards, num_clusters, run_id)

    # 3. Re-embed for storage
    print(f"\n🔮 Re-embedding for Qdrant storage...")
    embedder = EmbeddingService()
    signatures = [card.signature for card in cards]
    embeddings = await embedder.embed_batch(signatures, batch_size=32, show_progress=False)

    # 4. Store in Qdrant
    await store_to_qdrant(cards, cluster_cards, embeddings)

    # 5. Print summary
    print("\n" + "=" * 70)
    print("✅ Pipeline Complete!")
    print("=" * 70)
    print(f"\n📊 Results:")
    print(f"   Total diagnostics: {len(cards)}")
    print(f"   Clusters: {len(cluster_cards)}")
    print(f"   Run ID: {run_id}")
    print(f"\n📦 Qdrant Collections:")
    print(f"   phase90_error_cards: {len([e for e in embeddings if len(e) == 768])} points")
    print(f"   phase90_error_clusters: {len(cluster_cards)} points")
    print(f"\n💡 Query examples:")
    print(f"   curl http://localhost:6333/collections/phase90_error_clusters/points/scroll")
    print(f"   Filter by: errorCode, surface, tech, runId")


if __name__ == "__main__":
    asyncio.run(main())
