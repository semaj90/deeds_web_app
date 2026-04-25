"""
K-means Clustering for Evidence Recommendations

Clusters similar evidence using embeddinggemma:latest embeddings
and provides intelligent recommendations based on semantic similarity.

Features:
- Automatic optimal cluster detection (Elbow method)
- GPU-accelerated clustering (if available)
- Redis caching for cluster assignments
- Integration with Qdrant for vector search
- Recommendation engine based on cluster membership

Requirements:
- scikit-learn 1.3.2+
- numpy 1.24.3+
- embeddinggemma:latest model in Ollama
"""

import os
import json
import numpy as np
from typing import List, Dict, Optional, Tuple
from sklearn.cluster import KMeans, MiniBatchKMeans
from sklearn.metrics import silhouette_score
from scipy.spatial.distance import cosine
import logging
import asyncpg
from redis import Redis
from qdrant_client import QdrantClient
from qdrant_client.http import models as qdrant_models

from ai_inference import generate_embedding

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class EvidenceClusteringEngine:
    """K-means clustering for evidence recommendations"""

    def __init__(
        self,
        n_clusters: int = 10,
        use_gpu: bool = True,
        batch_size: int = 100,
        cache_ttl: int = 86400,  # 24 hours
    ):
        self.n_clusters = n_clusters
        self.use_gpu = use_gpu
        self.batch_size = batch_size
        self.cache_ttl = cache_ttl

        # Initialize connections
        self.redis = Redis(
            host=os.getenv("REDIS_HOST", "localhost"),
            port=int(os.getenv("REDIS_PORT", 6379)),
            password=os.getenv("REDIS_PASSWORD", "redis"),
            decode_responses=True,
        )

        self.qdrant = QdrantClient(url=os.getenv("QDRANT_URL", "http://localhost:6333"))

        self.db_url = os.getenv("DATABASE_URL", "postgresql://legal_admin:123456@localhost:5432/legal_ai_db")

        self.kmeans_model = None
        self.cluster_centroids = None

    async def load_all_embeddings(self) -> Tuple[List[str], np.ndarray]:
        """
        Load all evidence embeddings from Qdrant

        Returns:
            Tuple[List[str], np.ndarray]: (evidence_ids, embeddings_matrix)
        """
        logger.info("📊 Loading evidence embeddings from Qdrant")

        collection_name = "evidence_vectors"

        # Scroll through all points in collection
        points, offset = self.qdrant.scroll(
            collection_name=collection_name,
            limit=1000,
            with_vectors=True,
        )

        evidence_ids = []
        embeddings = []

        for point in points:
            evidence_ids.append(point.id)
            embeddings.append(point.vector)

        # Continue scrolling if there are more points
        while offset:
            more_points, offset = self.qdrant.scroll(
                collection_name=collection_name,
                limit=1000,
                offset=offset,
                with_vectors=True,
            )

            for point in more_points:
                evidence_ids.append(point.id)
                embeddings.append(point.vector)

        embeddings_matrix = np.array(embeddings)

        logger.info(f"✅ Loaded {len(evidence_ids)} embeddings with {embeddings_matrix.shape[1]} dimensions")

        return evidence_ids, embeddings_matrix

    def find_optimal_clusters(
        self,
        embeddings: np.ndarray,
        min_clusters: int = 3,
        max_clusters: int = 20,
    ) -> int:
        """
        Find optimal number of clusters using Elbow method

        Args:
            embeddings: Embedding matrix (n_samples, n_dimensions)
            min_clusters: Minimum clusters to test
            max_clusters: Maximum clusters to test

        Returns:
            int: Optimal number of clusters
        """
        logger.info(f"🔍 Finding optimal clusters (range: {min_clusters}-{max_clusters})")

        inertias = []
        silhouette_scores = []

        for k in range(min_clusters, max_clusters + 1):
            kmeans = MiniBatchKMeans(
                n_clusters=k,
                batch_size=self.batch_size,
                random_state=42,
                n_init=3,
            )
            cluster_labels = kmeans.fit_predict(embeddings)

            inertias.append(kmeans.inertia_)

            # Calculate silhouette score (skip for large datasets to save time)
            if len(embeddings) < 1000:
                score = silhouette_score(embeddings, cluster_labels, sample_size=min(500, len(embeddings)))
                silhouette_scores.append(score)

        # Find elbow point (simple derivative method)
        inertia_diffs = np.diff(inertias)
        elbow_index = np.argmax(inertia_diffs) + 1  # +1 to account for diff offset
        optimal_k = min_clusters + elbow_index

        logger.info(f"✅ Optimal clusters: {optimal_k}")
        logger.info(f"   Inertia: {inertias[elbow_index]:.2f}")

        if silhouette_scores:
            logger.info(f"   Silhouette score: {silhouette_scores[elbow_index]:.4f}")

        return optimal_k

    async def train_clusters(
        self,
        embeddings: np.ndarray,
        auto_optimize: bool = True,
    ) -> Dict:
        """
        Train k-means clustering model

        Args:
            embeddings: Embedding matrix (n_samples, n_dimensions)
            auto_optimize: Automatically find optimal number of clusters

        Returns:
            dict: Clustering metrics
        """
        if auto_optimize:
            self.n_clusters = self.find_optimal_clusters(embeddings)

        logger.info(f"🧠 Training k-means with {self.n_clusters} clusters")

        # Use MiniBatchKMeans for large datasets
        if len(embeddings) > 1000:
            self.kmeans_model = MiniBatchKMeans(
                n_clusters=self.n_clusters,
                batch_size=self.batch_size,
                random_state=42,
                n_init=10,
                max_iter=100,
            )
        else:
            self.kmeans_model = KMeans(
                n_clusters=self.n_clusters,
                random_state=42,
                n_init=10,
                max_iter=300,
            )

        cluster_labels = self.kmeans_model.fit_predict(embeddings)
        self.cluster_centroids = self.kmeans_model.cluster_centers_

        # Calculate metrics
        inertia = self.kmeans_model.inertia_
        silhouette = silhouette_score(embeddings, cluster_labels, sample_size=min(500, len(embeddings)))

        # Count cluster sizes
        unique, counts = np.unique(cluster_labels, return_counts=True)
        cluster_sizes = dict(zip(unique.tolist(), counts.tolist()))

        metrics = {
            "n_clusters": self.n_clusters,
            "n_samples": len(embeddings),
            "inertia": float(inertia),
            "silhouette_score": float(silhouette),
            "cluster_sizes": cluster_sizes,
        }

        logger.info(f"✅ Clustering complete")
        logger.info(f"   Inertia: {inertia:.2f}")
        logger.info(f"   Silhouette: {silhouette:.4f}")
        logger.info(f"   Cluster sizes: {cluster_sizes}")

        return metrics

    async def assign_clusters(
        self,
        evidence_ids: List[str],
        cluster_labels: np.ndarray,
    ):
        """
        Store cluster assignments in Redis and PostgreSQL

        Args:
            evidence_ids: List of evidence IDs
            cluster_labels: Cluster assignments (same length as evidence_ids)
        """
        logger.info("💾 Storing cluster assignments")

        # Store in Redis (fast lookups)
        pipe = self.redis.pipeline()

        for evidence_id, cluster_id in zip(evidence_ids, cluster_labels):
            # evidence:cluster:{evidence_id} → cluster_id
            pipe.set(
                f"evidence:cluster:{evidence_id}",
                int(cluster_id),
                ex=self.cache_ttl,
            )

            # cluster:members:{cluster_id} → [evidence_id1, evidence_id2, ...]
            pipe.sadd(f"cluster:members:{int(cluster_id)}", evidence_id)

        pipe.execute()

        # Store in PostgreSQL (persistent)
        conn = await asyncpg.connect(self.db_url)

        # Add cluster_id column if it doesn't exist
        await conn.execute("""
            ALTER TABLE evidence
            ADD COLUMN IF NOT EXISTS cluster_id INTEGER;
        """)

        # Update cluster assignments
        for evidence_id, cluster_id in zip(evidence_ids, cluster_labels):
            await conn.execute(
                "UPDATE evidence SET cluster_id = $1 WHERE id = $2",
                int(cluster_id),
                evidence_id,
            )

        await conn.close()

        logger.info(f"✅ Stored {len(evidence_ids)} cluster assignments")

    async def get_recommendations(
        self,
        evidence_id: str,
        limit: int = 5,
        same_cluster_only: bool = True,
    ) -> List[Dict]:
        """
        Get evidence recommendations based on cluster membership

        Args:
            evidence_id: Source evidence ID
            limit: Number of recommendations
            same_cluster_only: Only recommend from same cluster

        Returns:
            List[Dict]: Recommended evidence with similarity scores
        """
        logger.info(f"🔍 Getting recommendations for evidence: {evidence_id}")

        # Get cluster assignment from Redis
        cluster_id = self.redis.get(f"evidence:cluster:{evidence_id}")

        if not cluster_id:
            logger.warning(f"No cluster assignment found for {evidence_id}")
            return []

        cluster_id = int(cluster_id)
        logger.info(f"   Cluster: {cluster_id}")

        # Get all evidence in the same cluster
        cluster_members = self.redis.smembers(f"cluster:members:{cluster_id}")
        cluster_members.discard(evidence_id)  # Remove self

        if not cluster_members:
            logger.info("   No other evidence in cluster")
            return []

        # Get embeddings from Qdrant for similarity scoring
        source_point = self.qdrant.retrieve(
            collection_name="evidence_vectors",
            ids=[evidence_id],
            with_vectors=True,
        )[0]

        source_embedding = np.array(source_point.vector)

        # Get embeddings for cluster members
        member_points = self.qdrant.retrieve(
            collection_name="evidence_vectors",
            ids=list(cluster_members),
            with_vectors=True,
        )

        # Calculate cosine similarity
        recommendations = []

        for point in member_points:
            member_embedding = np.array(point.vector)
            similarity = 1 - cosine(source_embedding, member_embedding)

            recommendations.append({
                "id": point.id,
                "score": float(similarity),
                "cluster_id": cluster_id,
                "metadata": point.payload or {},
            })

        # Sort by similarity (descending)
        recommendations.sort(key=lambda x: x["score"], reverse=True)

        # Return top-k recommendations
        top_recommendations = recommendations[:limit]

        logger.info(f"✅ Found {len(top_recommendations)} recommendations")

        return top_recommendations

    async def get_cluster_summary(self, cluster_id: int) -> Dict:
        """
        Get summary statistics for a cluster

        Args:
            cluster_id: Cluster ID

        Returns:
            dict: Cluster statistics
        """
        members = self.redis.smembers(f"cluster:members:{cluster_id}")

        if not members:
            return {"cluster_id": cluster_id, "size": 0, "members": []}

        # Get metadata from PostgreSQL
        conn = await asyncpg.connect(self.db_url)

        rows = await conn.fetch(
            """
            SELECT id, title, tags, created_at
            FROM evidence
            WHERE id = ANY($1::text[])
            ORDER BY created_at DESC
            """,
            list(members),
        )

        await conn.close()

        # Extract common tags
        all_tags = []
        for row in rows:
            if row["tags"]:
                all_tags.extend(row["tags"])

        # Count tag frequencies
        from collections import Counter
        tag_counts = Counter(all_tags)
        top_tags = tag_counts.most_common(5)

        return {
            "cluster_id": cluster_id,
            "size": len(members),
            "members": [dict(row) for row in rows],
            "top_tags": [{"tag": tag, "count": count} for tag, count in top_tags],
        }


# CLI usage
if __name__ == "__main__":
    import asyncio
    import argparse

    parser = argparse.ArgumentParser(description="K-means clustering for evidence recommendations")
    parser.add_argument("--train", action="store_true", help="Train clustering model")
    parser.add_argument("--clusters", type=int, default=10, help="Number of clusters")
    parser.add_argument("--auto-optimize", action="store_true", help="Auto-find optimal clusters")
    parser.add_argument("--recommend", type=str, help="Get recommendations for evidence ID")
    parser.add_argument("--limit", type=int, default=5, help="Number of recommendations")

    args = parser.parse_args()

    engine = EvidenceClusteringEngine(n_clusters=args.clusters)

    async def main():
        if args.train:
            # Load embeddings
            evidence_ids, embeddings = await engine.load_all_embeddings()

            # Train clustering
            metrics = await engine.train_clusters(embeddings, auto_optimize=args.auto_optimize)

            # Assign clusters
            cluster_labels = engine.kmeans_model.labels_
            await engine.assign_clusters(evidence_ids, cluster_labels)

            logger.info(f"🎉 Clustering complete!")
            logger.info(f"📊 Metrics: {json.dumps(metrics, indent=2)}")

        elif args.recommend:
            # Get recommendations
            recommendations = await engine.get_recommendations(args.recommend, limit=args.limit)

            logger.info(f"📋 Recommendations for {args.recommend}:")
            for i, rec in enumerate(recommendations, 1):
                logger.info(f"   {i}. {rec['id']} (score: {rec['score']:.4f})")

    asyncio.run(main())
