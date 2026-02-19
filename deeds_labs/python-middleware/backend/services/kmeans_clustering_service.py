#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════
Agentic Knowledge Integration V2 - K-means Clustering Service
═══════════════════════════════════════════════════════════════════════
Date: January 2, 2026
Purpose: K-means clustering for enhanced tags with AI summaries
Task: 9.1 - Create KMeansClusteringService class
Task: 9.2 - Create cluster summary generation
Task: 9.3 - Store cluster metadata
═══════════════════════════════════════════════════════════════════════
"""

import os
import json
import logging
import asyncio
from datetime import datetime
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, asdict, field
import numpy as np
import aiohttp
import psycopg2
from psycopg2.extras import RealDictCursor
import redis
from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Try sklearn for clustering
try:
    from sklearn.cluster import KMeans
    from sklearn.metrics import silhouette_score
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    logger.warning("⚠️ scikit-learn not installed, clustering unavailable")


@dataclass
class ClusterInfo:
    """Information about a cluster."""
    cluster_id: int
    centroid: List[float]
    size: int
    tag_ids: List[str]
    representative_tags: List[str]  # Top 5 most central tags
    summary: str
    keywords: List[str]
    created_at: str
    inertia: float  # Within-cluster sum of squares


@dataclass
class ClusteringResult:
    """Result of clustering operation."""
    num_clusters: int
    total_tags: int
    clusters: List[ClusterInfo]
    silhouette_score: float
    total_inertia: float
    created_at: str


class KMeansClusteringService:
    """
    K-means Clustering Service - Cluster enhanced tags by embedding similarity.

    Features:
    - Fetch embeddings from Qdrant
    - K-means clustering with configurable k
    - AI-generated cluster summaries via Gemma
    - Store results in PostgreSQL and Redis
    """

    QDRANT_COLLECTION = "fastmcp_file_profiles"
    DEFAULT_K = 10
    OLLAMA_URL = "http://localhost:11434"
    GEMMA_MODEL = "gemma3-legal:latest"

    def __init__(
        self,
        qdrant_url: Optional[str] = None,
        postgres_url: Optional[str] = None,
        redis_url: Optional[str] = None,
        ollama_url: Optional[str] = None
    ):
        """Initialize clustering service."""
        self.qdrant_url = qdrant_url or os.getenv("QDRANT_URL", "http://localhost:6333")
        self.postgres_url = postgres_url or os.getenv(
            "DATABASE_URL",
            "postgresql://postgres:postgres@localhost:5434/legal_ai_db"
        )
        self.redis_url = redis_url or os.getenv("REDIS_URL", "redis://localhost:6379")
        self.ollama_url = ollama_url or os.getenv("OLLAMA_URL", self.OLLAMA_URL)

        # Initialize clients
        self.qdrant = QdrantClient(url=self.qdrant_url)
        self.redis_client = redis.from_url(self.redis_url, decode_responses=True)

        logger.info(f"🔮 KMeansClusteringService initialized")

    def _get_postgres_connection(self):
        """Get PostgreSQL connection."""
        return psycopg2.connect(self.postgres_url)

    async def fetch_embeddings_from_qdrant(
        self,
        limit: int = 10000
    ) -> Tuple[List[str], List[List[float]], List[Dict]]:
        """
        Fetch all embeddings from Qdrant collection.

        Returns:
            Tuple of (tag_ids, embeddings, payloads)
        """
        logger.info(f"📥 Fetching embeddings from Qdrant ({self.QDRANT_COLLECTION})")

        tag_ids = []
        embeddings = []
        payloads = []

        # Scroll through all points
        offset = None
        batch_size = 100

        while True:
            results = self.qdrant.scroll(
                collection_name=self.QDRANT_COLLECTION,
                limit=batch_size,
                offset=offset,
                with_vectors=True,
                with_payload=True
            )

            points, next_offset = results

            if not points:
                break

            for point in points:
                tag_ids.append(str(point.id))
                embeddings.append(point.vector)
                payloads.append(point.payload or {})

            offset = next_offset

            if len(tag_ids) >= limit:
                break

            if next_offset is None:
                break

        logger.info(f"  ✓ Fetched {len(tag_ids)} embeddings")
        return tag_ids, embeddings, payloads

    def run_kmeans(
        self,
        embeddings: List[List[float]],
        k: int = None
    ) -> Tuple[np.ndarray, np.ndarray, float, float]:
        """
        Run K-means clustering on embeddings.

        Args:
            embeddings: List of embedding vectors
            k: Number of clusters (default: 10)

        Returns:
            Tuple of (labels, centroids, inertia, silhouette)
        """
        if not SKLEARN_AVAILABLE:
            raise RuntimeError("scikit-learn not installed")

        k = k or self.DEFAULT_K
        k = min(k, len(embeddings))  # Can't have more clusters than points

        logger.info(f"🔮 Running K-means clustering (k={k}, n={len(embeddings)})")

        X = np.array(embeddings)

        kmeans = KMeans(
            n_clusters=k,
            random_state=42,
            n_init=10,
            max_iter=300
        )
        labels = kmeans.fit_predict(X)
        centroids = kmeans.cluster_centers_

        # Calculate silhouette score (if more than 1 cluster)
        if k > 1:
            silhouette = silhouette_score(X, labels)
        else:
            silhouette = 0.0

        logger.info(f"  ✓ Clustering complete (inertia={kmeans.inertia_:.2f}, silhouette={silhouette:.3f})")

        return labels, centroids, kmeans.inertia_, silhouette

    def find_representative_tags(
        self,
        cluster_embeddings: List[List[float]],
        cluster_tag_ids: List[str],
        centroid: List[float],
        top_n: int = 5
    ) -> List[str]:
        """
        Find the most representative tags (closest to centroid).

        Args:
            cluster_embeddings: Embeddings in this cluster
            cluster_tag_ids: Tag IDs in this cluster
            centroid: Cluster centroid
            top_n: Number of representative tags

        Returns:
            List of representative tag IDs
        """
        # Calculate distances to centroid
        centroid_arr = np.array(centroid)
        distances = []

        for emb, tag_id in zip(cluster_embeddings, cluster_tag_ids):
            dist = np.linalg.norm(np.array(emb) - centroid_arr)
            distances.append((dist, tag_id))

        # Sort by distance and take top N
        distances.sort(key=lambda x: x[0])
        return [tag_id for _, tag_id in distances[:top_n]]

    async def generate_cluster_summary(
        self,
        cluster_id: int,
        representative_payloads: List[Dict]
    ) -> Tuple[str, List[str]]:
        """
        Generate AI summary for a cluster using Gemma.

        Args:
            cluster_id: Cluster ID
            representative_payloads: Payloads of representative tags

        Returns:
            Tuple of (summary, keywords)
        """
        # Build context from representative tags
        context_parts = []
        for payload in representative_payloads[:5]:
            file_path = payload.get("file_path", "unknown")
            category = payload.get("category", "unknown")
            summary = payload.get("summary", "")[:200]
            context_parts.append(f"- {file_path} ({category}): {summary}")

        context = "\n".join(context_parts)

        prompt = f"""Analyze this cluster of code files and provide:
1. A brief summary (1-2 sentences) describing what these files have in common
2. 3-5 keywords that characterize this cluster

Files in cluster {cluster_id}:
{context}

Respond in JSON format:
{{"summary": "...", "keywords": ["...", "..."]}}"""

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.ollama_url}/api/generate",
                    json={
                        "model": self.GEMMA_MODEL,
                        "prompt": prompt,
                        "stream": False
                    },
                    timeout=aiohttp.ClientTimeout(total=60)
                ) as response:
                    if response.status != 200:
                        logger.warning(f"Gemma API error: {await response.text()}")
                        return f"Cluster {cluster_id}", ["code", "files"]

                    data = await response.json()
                    response_text = data.get("response", "")

                    # Parse JSON from response
                    try:
                        # Find JSON in response
                        start = response_text.find("{")
                        end = response_text.rfind("}") + 1
                        if start >= 0 and end > start:
                            result = json.loads(response_text[start:end])
                            return result.get("summary", f"Cluster {cluster_id}"), result.get("keywords", [])
                    except json.JSONDecodeError:
                        pass

                    return f"Cluster {cluster_id}", ["code", "files"]

        except Exception as e:
            logger.warning(f"Failed to generate summary: {e}")
            return f"Cluster {cluster_id}", ["code", "files"]

    async def cluster_tags(
        self,
        k: int = None,
        generate_summaries: bool = True
    ) -> ClusteringResult:
        """
        Main clustering pipeline.

        Args:
            k: Number of clusters
            generate_summaries: Whether to generate AI summaries

        Returns:
            ClusteringResult with all cluster information
        """
        k = k or self.DEFAULT_K

        # Fetch embeddings
        tag_ids, embeddings, payloads = await self.fetch_embeddings_from_qdrant()

        if len(embeddings) < k:
            k = max(1, len(embeddings) // 2)
            logger.warning(f"Reduced k to {k} due to limited data")

        # Run clustering
        labels, centroids, inertia, silhouette = self.run_kmeans(embeddings, k)

        # Build cluster info
        clusters = []
        for cluster_id in range(k):
            # Get tags in this cluster
            cluster_mask = labels == cluster_id
            cluster_tag_ids = [tag_ids[i] for i in range(len(tag_ids)) if cluster_mask[i]]
            cluster_embeddings = [embeddings[i] for i in range(len(embeddings)) if cluster_mask[i]]
            cluster_payloads = [payloads[i] for i in range(len(payloads)) if cluster_mask[i]]

            if not cluster_tag_ids:
                continue

            # Find representative tags
            representative_ids = self.find_representative_tags(
                cluster_embeddings,
                cluster_tag_ids,
                centroids[cluster_id].tolist(),
                top_n=5
            )

            # Get payloads for representative tags
            representative_payloads = [
                payloads[tag_ids.index(tid)]
                for tid in representative_ids
                if tid in tag_ids
            ]

            # Generate summary
            if generate_summaries:
                summary, keywords = await self.generate_cluster_summary(
                    cluster_id,
                    representative_payloads
                )
            else:
                summary = f"Cluster {cluster_id}"
                keywords = []

            # Calculate cluster inertia
            cluster_centroid = centroids[cluster_id]
            cluster_inertia = sum(
                np.linalg.norm(np.array(emb) - cluster_centroid) ** 2
                for emb in cluster_embeddings
            )

            cluster_info = ClusterInfo(
                cluster_id=cluster_id,
                centroid=centroids[cluster_id].tolist(),
                size=len(cluster_tag_ids),
                tag_ids=cluster_tag_ids,
                representative_tags=representative_ids,
                summary=summary,
                keywords=keywords,
                created_at=datetime.now().isoformat(),
                inertia=cluster_inertia
            )
            clusters.append(cluster_info)

        result = ClusteringResult(
            num_clusters=len(clusters),
            total_tags=len(tag_ids),
            clusters=clusters,
            silhouette_score=silhouette,
            total_inertia=inertia,
            created_at=datetime.now().isoformat()
        )

        logger.info(f"✅ Clustering complete: {result.num_clusters} clusters, {result.total_tags} tags")

        return result

    def store_clusters_postgresql(self, result: ClusteringResult) -> int:
        """
        Store cluster metadata in PostgreSQL.

        Args:
            result: ClusteringResult to store

        Returns:
            Number of clusters stored
        """
        conn = self._get_postgres_connection()
        cursor = conn.cursor()

        try:
            # Create clusters table if not exists
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS kb_clusters (
                    id SERIAL PRIMARY KEY,
                    cluster_id INTEGER NOT NULL,
                    centroid JSONB,
                    size INTEGER,
                    tag_ids JSONB,
                    representative_tags JSONB,
                    summary TEXT,
                    keywords JSONB,
                    inertia FLOAT,
                    silhouette_score FLOAT,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            """)

            # Clear existing clusters
            cursor.execute("DELETE FROM kb_clusters")

            # Insert new clusters
            for cluster in result.clusters:
                cursor.execute("""
                    INSERT INTO kb_clusters
                    (cluster_id, centroid, size, tag_ids, representative_tags,
                     summary, keywords, inertia, silhouette_score, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    cluster.cluster_id,
                    json.dumps(cluster.centroid),
                    cluster.size,
                    json.dumps(cluster.tag_ids),
                    json.dumps(cluster.representative_tags),
                    cluster.summary,
                    json.dumps(cluster.keywords),
                    cluster.inertia,
                    result.silhouette_score,
                    cluster.created_at
                ))

            conn.commit()
            logger.info(f"  ✓ Stored {len(result.clusters)} clusters in PostgreSQL")
            return len(result.clusters)

        except Exception as e:
            conn.rollback()
            logger.error(f"❌ Failed to store clusters: {e}")
            raise
        finally:
            cursor.close()
            conn.close()

    def cache_clusters_redis(self, result: ClusteringResult, ttl: int = 3600) -> int:
        """
        Cache cluster summaries in Redis.

        Args:
            result: ClusteringResult to cache
            ttl: Time to live in seconds (default: 1 hour)

        Returns:
            Number of clusters cached
        """
        cached = 0
        pipe = self.redis_client.pipeline()

        for cluster in result.clusters:
            key = f"kb:v2:cluster:{cluster.cluster_id}"
            data = {
                "cluster_id": cluster.cluster_id,
                "size": cluster.size,
                "summary": cluster.summary,
                "keywords": cluster.keywords,
                "representative_tags": cluster.representative_tags,
                "created_at": cluster.created_at
            }
            pipe.setex(key, ttl, json.dumps(data))
            cached += 1

        # Store clustering metadata
        meta_key = "kb:v2:clustering:meta"
        meta = {
            "num_clusters": result.num_clusters,
            "total_tags": result.total_tags,
            "silhouette_score": result.silhouette_score,
            "total_inertia": result.total_inertia,
            "created_at": result.created_at
        }
        pipe.setex(meta_key, ttl, json.dumps(meta))

        pipe.execute()
        logger.info(f"  ✓ Cached {cached} clusters in Redis (TTL={ttl}s)")
        return cached

    def get_cluster_from_cache(self, cluster_id: int) -> Optional[Dict]:
        """Get cluster info from Redis cache."""
        key = f"kb:v2:cluster:{cluster_id}"
        data = self.redis_client.get(key)
        if data:
            return json.loads(data)
        return None

    def get_clustering_metadata(self) -> Optional[Dict]:
        """Get clustering metadata from Redis cache."""
        key = "kb:v2:clustering:meta"
        data = self.redis_client.get(key)
        if data:
            return json.loads(data)
        return None


# Example usage
async def example_usage():
    """Example of using the KMeansClusteringService."""
    service = KMeansClusteringService()

    # Run clustering
    result = await service.cluster_tags(k=5, generate_summaries=False)

    print(f"\n✅ Clustering Result:")
    print(f"   Clusters: {result.num_clusters}")
    print(f"   Total Tags: {result.total_tags}")
    print(f"   Silhouette Score: {result.silhouette_score:.3f}")

    for cluster in result.clusters:
        print(f"\n   Cluster {cluster.cluster_id}:")
        print(f"     Size: {cluster.size}")
        print(f"     Summary: {cluster.summary}")
        print(f"     Keywords: {cluster.keywords}")

    # Store results
    service.store_clusters_postgresql(result)
    service.cache_clusters_redis(result)


if __name__ == "__main__":
    asyncio.run(example_usage())
