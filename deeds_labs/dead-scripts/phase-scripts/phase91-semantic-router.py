#!/usr/bin/env python3
"""
Phase 91: Semantic Routing Engine
Uses cluster centroids for fast pre-filtering before HNSW search

Architecture:
  Query → Find nearest centroid → Filter to cluster → HNSW search

Speed Gain:
  - Without routing: Search all 36k+ vectors
  - With routing: Search only ~4.5k vectors (8 clusters) → 8x faster
  - With deep routing: Search only ~2.25k vectors (16 clusters) → 16x faster

Usage:
    python scripts/phase91-semantic-router.py "Fix memory leak in React hooks"
    python scripts/phase91-semantic-router.py "Docker compose configuration" --top-clusters 2
"""

import argparse
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from typing import Any, Dict, List, Optional, Tuple

import torch
import numpy as np
from qdrant_client import QdrantClient
from qdrant_client.http import models

try:
    import httpx
except ImportError:
    print("❌ Missing httpx. Install: pip install httpx")
    sys.exit(1)

# Import shared JSON helper
from phase89_json import loads_bytes, loads_str, dumps, BACKEND

# =============================================================================
# Configuration
# =============================================================================
QDRANT_URL = "http://127.0.0.1:6333"
OLLAMA_URL = "http://localhost:11434"
COLLECTION_NAME = "phase91_clustered_index"
EMBEDDING_MODEL = "embeddinggemma:latest"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# =============================================================================
# Semantic Router
# =============================================================================
class SemanticRouter:
    """Route queries to relevant clusters before vector search."""

    def __init__(
        self,
        qdrant_url: str = QDRANT_URL,
        collection: str = COLLECTION_NAME
    ):
        self.qdrant = QdrantClient(url=qdrant_url)
        self.collection = collection
        self.centroids: Optional[torch.Tensor] = None
        self.cluster_metadata: Optional[Dict[int, Dict]] = None

    def load_centroids(self):
        """Load cluster centroids from Qdrant payloads."""
        print("📥 Loading cluster centroids...")

        # Get all unique cluster IDs
        # We'll query a few points from each cluster to get centroids
        scroll_result = self.qdrant.scroll(
            collection_name=self.collection,
            limit=1000,  # Should cover all clusters
            with_payload=True,
            with_vectors=False
        )

        centroids_dict = {}
        cluster_info = {}

        for point in scroll_result[0]:
            cluster_id = point.payload.get('cluster_id')
            if cluster_id is None:
                continue

            if cluster_id not in centroids_dict:
                centroid = point.payload.get('cluster_centroid')
                if centroid:
                    centroids_dict[cluster_id] = centroid

                    # Store metadata
                    cluster_info[cluster_id] = {
                        'dominant_kind': point.payload.get('kind', 'unknown'),
                        'dominant_source': point.payload.get('source', 'unknown'),
                        'tags': point.payload.get('tags', [])[:5]
                    }

        # Convert to tensor
        num_clusters = len(centroids_dict)
        dim = len(next(iter(centroids_dict.values())))

        centroids_list = [centroids_dict[k] for k in sorted(centroids_dict.keys())]
        self.centroids = torch.tensor(centroids_list, device=DEVICE, dtype=torch.float32)
        self.cluster_metadata = cluster_info

        print(f"   Loaded {num_clusters} centroids ({dim} dims)")
        print()

    def route_query(
        self,
        query_vector: List[float],
        top_k: int = 1
    ) -> List[Tuple[int, float]]:
        """
        Find the top-k most relevant clusters for a query.

        Args:
            query_vector: Query embedding (768-dim)
            top_k: Number of clusters to return

        Returns:
            List of (cluster_id, similarity_score)
        """
        if self.centroids is None:
            self.load_centroids()

        # Convert query to tensor
        q = torch.tensor([query_vector], device=DEVICE, dtype=torch.float32)

        # Normalize
        q_norm = torch.nn.functional.normalize(q, p=2, dim=1)
        c_norm = torch.nn.functional.normalize(self.centroids, p=2, dim=1)

        # Cosine similarity
        similarities = torch.mm(q_norm, c_norm.t()).squeeze(0)

        # Get top-k
        topk_vals, topk_ids = torch.topk(similarities, min(top_k, len(similarities)))

        results = [
            (int(topk_ids[i].item()), float(topk_vals[i].item()))
            for i in range(len(topk_ids))
        ]

        return results

    def search_with_routing(
        self,
        query: str,
        top_clusters: int = 1,
        limit: int = 10
    ) -> Dict[str, Any]:
        """
        Perform routed search: query → find clusters → filter search.

        Args:
            query: Search query text
            top_clusters: Number of clusters to search
            limit: Max results to return

        Returns:
            Search results with routing metadata
        """
        # 1. Get query embedding
        print(f"🔍 Query: {query}")
        print()

        query_vector = self._embed_text(query)

        # 2. Route to clusters
        print(f"🎯 Routing to top {top_clusters} clusters...")
        cluster_routes = self.route_query(query_vector, top_k=top_clusters)

        for cluster_id, score in cluster_routes:
            metadata = self.cluster_metadata.get(cluster_id, {})
            print(f"   Cluster {cluster_id} (similarity: {score:.3f})")
            print(f"      Kind: {metadata.get('dominant_kind')}")
            print(f"      Source: {metadata.get('dominant_source')}")
            print(f"      Tags: {', '.join(metadata.get('tags', [])[:3])}")
        print()

        # 3. Build filter for selected clusters
        cluster_ids = [c[0] for c in cluster_routes]

        # 4. Search with cluster filter
        print(f"🔎 Searching within {len(cluster_ids)} cluster(s)...")

        search_result = self.qdrant.search(
            collection_name=self.collection,
            query_vector=query_vector,
            query_filter=models.Filter(
                should=[
                    models.FieldCondition(
                        key="cluster_id",
                        match=models.MatchValue(value=cid)
                    )
                    for cid in cluster_ids
                ]
            ),
            limit=limit,
            with_payload=True
        )

        print(f"   Found {len(search_result)} results")
        print()

        # Format results
        results = []
        for hit in search_result:
            results.append({
                'id': hit.id,
                'score': hit.score,
                'cluster_id': hit.payload.get('cluster_id'),
                'kind': hit.payload.get('kind'),
                'source': hit.payload.get('source'),
                'signature': hit.payload.get('signature_text', '')[:100],
                'tags': hit.payload.get('tags', [])[:5]
            })

        return {
            'query': query,
            'routed_clusters': [
                {'cluster_id': cid, 'similarity': score}
                for cid, score in cluster_routes
            ],
            'total_results': len(results),
            'results': results
        }

    def _embed_text(self, text: str) -> List[float]:
        """Get embedding from Ollama."""
        import requests

        response = requests.post(
            f"{OLLAMA_URL}/api/embeddings",
            json={
                'model': EMBEDDING_MODEL,
                'prompt': text
            },
            timeout=30
        )

        if response.status_code != 200:
            raise Exception(f"Ollama error: {response.status_code}")

        return response.json()['embedding']

# =============================================================================
# CLI
# =============================================================================
def main():
    parser = argparse.ArgumentParser(
        description='Phase 91: Semantic Routing Engine'
    )
    parser.add_argument('query', help='Search query')
    parser.add_argument('--top-clusters', type=int, default=1, help='Number of clusters to search')
    parser.add_argument('--limit', type=int, default=10, help='Max results')
    parser.add_argument('--collection', default=COLLECTION_NAME, help='Qdrant collection')

    args = parser.parse_args()

    print(f"📦 JSON Backend: {BACKEND}")
    print(f"🎮 Device: {DEVICE}")
    print()

    router = SemanticRouter(collection=args.collection)

    result = router.search_with_routing(
        query=args.query,
        top_clusters=args.top_clusters,
        limit=args.limit
    )

    # Display results
    print("📊 Results:")
    print("=" * 80)

    for i, item in enumerate(result['results'], 1):
        print(f"\n{i}. [Cluster {item['cluster_id']}] {item['kind']} (score: {item['score']:.3f})")
        print(f"   Source: {item['source']}")
        print(f"   Tags: {', '.join(item['tags'])}")
        print(f"   Signature: {item['signature']}...")

    print()
    print("=" * 80)
    print(f"Total: {result['total_results']} results from {len(result['routed_clusters'])} cluster(s)")

    # Save full results
    output_path = Path('reports/phase91_routed_search.json')
    output_path.parent.mkdir(exist_ok=True)
    output_path.write_text(dumps(result), encoding='utf-8')
    print(f"\n💾 Full results: {output_path}")

if __name__ == '__main__':
    main()
