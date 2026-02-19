#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════
Agentic Knowledge Integration V2 - K-means Clustering Tests
═══════════════════════════════════════════════════════════════════════
Date: January 2, 2026
Purpose: Property-based tests for cluster coherence
Task: 9.4 - Write property test for cluster coherence
Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5
═══════════════════════════════════════════════════════════════════════
"""

import pytest
import numpy as np
from datetime import datetime
from typing import List

from backend.services.kmeans_clustering_service import (
    KMeansClusteringService,
    ClusterInfo,
    ClusteringResult
)


# ═══════════════════════════════════════════════════════════════════════
# Property 5: Cluster Coherence
# For any clustering result, tags within a cluster SHALL be closer to
# their centroid than to other centroids (on average).
# Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5
# ═══════════════════════════════════════════════════════════════════════


@pytest.fixture
def clustering_service():
    """Create KMeansClusteringService for testing."""
    return KMeansClusteringService()


@pytest.fixture
def sample_embeddings():
    """Generate sample embeddings for testing."""
    np.random.seed(42)
    # Create 3 distinct clusters
    cluster1 = np.random.randn(10, 768) + np.array([5, 0, 0] + [0] * 765)
    cluster2 = np.random.randn(10, 768) + np.array([0, 5, 0] + [0] * 765)
    cluster3 = np.random.randn(10, 768) + np.array([0, 0, 5] + [0] * 765)
    return np.vstack([cluster1, cluster2, cluster3]).tolist()


@pytest.mark.asyncio
async def test_property_5_cluster_info_structure():
    """
    Property 5: Cluster Coherence - Structure
    ClusterInfo must have all required fields.
    """
    cluster = ClusterInfo(
        cluster_id=0,
        centroid=[0.1] * 768,
        size=10,
        tag_ids=["tag-1", "tag-2", "tag-3"],
        representative_tags=["tag-1"],
        summary="Test cluster",
        keywords=["test", "cluster"],
        created_at=datetime.now().isoformat(),
        inertia=1.5
    )

    assert cluster.cluster_id == 0, "Cluster ID must be set"
    assert len(cluster.centroid) == 768, "Centroid must have correct dimension"
    assert cluster.size == 10, "Size must be set"
    assert len(cluster.tag_ids) == 3, "Tag IDs must be set"
    assert len(cluster.representative_tags) >= 1, "Representative tags must be set"
    assert cluster.summary, "Summary must be set"
    assert isinstance(cluster.keywords, list), "Keywords must be a list"
    assert cluster.created_at, "Created timestamp must be set"
    assert cluster.inertia >= 0, "Inertia must be non-negative"

    print(f"✅ Property 5: ClusterInfo structure validated")


@pytest.mark.asyncio
async def test_property_5_clustering_result_structure():
    """
    Property 5: Cluster Coherence - Result Structure
    ClusteringResult must have all required fields.
    """
    result = ClusteringResult(
        num_clusters=3,
        total_tags=30,
        clusters=[],
        silhouette_score=0.75,
        total_inertia=100.0,
        created_at=datetime.now().isoformat()
    )

    assert result.num_clusters == 3, "Number of clusters must be set"
    assert result.total_tags == 30, "Total tags must be set"
    assert isinstance(result.clusters, list), "Clusters must be a list"
    assert 0 <= result.silhouette_score <= 1, "Silhouette score must be in [0, 1]"
    assert result.total_inertia >= 0, "Total inertia must be non-negative"
    assert result.created_at, "Created timestamp must be set"

    print(f"✅ Property 5: ClusteringResult structure validated")


@pytest.mark.asyncio
async def test_property_5_kmeans_basic(clustering_service, sample_embeddings):
    """
    Property 5: Cluster Coherence - Basic K-means
    K-means must produce valid cluster assignments.
    """
    labels, centroids, inertia, silhouette = clustering_service.run_kmeans(
        sample_embeddings, k=3
    )

    # Validate labels
    assert len(labels) == len(sample_embeddings), "Each point must have a label"
    assert set(labels) == {0, 1, 2}, "Labels must be 0, 1, 2 for k=3"

    # Validate centroids
    assert len(centroids) == 3, "Must have 3 centroids"
    assert centroids.shape[1] == 768, "Centroids must have correct dimension"

    # Validate metrics
    assert inertia > 0, "Inertia must be positive"
    assert 0 <= silhouette <= 1, "Silhouette must be in [0, 1]"

    print(f"✅ Property 5: Basic K-means validated (silhouette={silhouette:.3f})")


@pytest.mark.asyncio
async def test_property_5_cluster_coherence(clustering_service, sample_embeddings):
    """
    Property 5: Cluster Coherence - Points Closer to Own Centroid
    Points should be closer to their assigned centroid than to others.
    """
    labels, centroids, _, _ = clustering_service.run_kmeans(sample_embeddings, k=3)

    correct_assignments = 0
    total_points = len(sample_embeddings)

    for i, (embedding, label) in enumerate(zip(sample_embeddings, labels)):
        emb_arr = np.array(embedding)

        # Distance to assigned centroid
        own_dist = np.linalg.norm(emb_arr - centroids[label])

        # Distance to other centroids
        other_dists = [
            np.linalg.norm(emb_arr - centroids[j])
            for j in range(len(centroids)) if j != label
        ]

        # Check if own centroid is closest
        if own_dist <= min(other_dists):
            correct_assignments += 1

    accuracy = correct_assignments / total_points
    assert accuracy > 0.8, f"At least 80% of points should be closest to their centroid (got {accuracy:.1%})"

    print(f"✅ Property 5: Cluster coherence validated ({accuracy:.1%} correct)")


@pytest.mark.asyncio
async def test_property_5_representative_tags(clustering_service, sample_embeddings):
    """
    Property 5: Cluster Coherence - Representative Tags
    Representative tags must be closest to centroid.
    """
    # Create mock cluster data
    cluster_embeddings = sample_embeddings[:10]
    cluster_tag_ids = [f"tag-{i}" for i in range(10)]
    centroid = np.mean(cluster_embeddings, axis=0).tolist()

    representative_ids = clustering_service.find_representative_tags(
        cluster_embeddings,
        cluster_tag_ids,
        centroid,
        top_n=3
    )

    assert len(representative_ids) == 3, "Must return requested number of representatives"

    # Verify representatives are closest to centroid
    centroid_arr = np.array(centroid)
    rep_distances = []
    all_distances = []

    for i, (emb, tag_id) in enumerate(zip(cluster_embeddings, cluster_tag_ids)):
        dist = np.linalg.norm(np.array(emb) - centroid_arr)
        all_distances.append((dist, tag_id))
        if tag_id in representative_ids:
            rep_distances.append(dist)

    all_distances.sort(key=lambda x: x[0])
    top_3_ids = [tag_id for _, tag_id in all_distances[:3]]

    # Representatives should be among the closest
    assert set(representative_ids) == set(top_3_ids), "Representatives must be closest to centroid"

    print(f"✅ Property 5: Representative tags validated")


@pytest.mark.asyncio
async def test_property_5_silhouette_score_range(clustering_service, sample_embeddings):
    """
    Property 5: Cluster Coherence - Silhouette Score
    Silhouette score must be in valid range [-1, 1].
    """
    _, _, _, silhouette = clustering_service.run_kmeans(sample_embeddings, k=3)

    assert -1 <= silhouette <= 1, f"Silhouette must be in [-1, 1], got {silhouette}"

    # For well-separated clusters, silhouette should be positive
    assert silhouette > 0, f"Well-separated clusters should have positive silhouette"

    print(f"✅ Property 5: Silhouette score validated ({silhouette:.3f})")


@pytest.mark.asyncio
async def test_property_5_inertia_decreases_with_k(clustering_service, sample_embeddings):
    """
    Property 5: Cluster Coherence - Inertia vs K
    Inertia should decrease as k increases (elbow method).
    """
    inertias = []

    for k in [2, 3, 5]:
        _, _, inertia, _ = clustering_service.run_kmeans(sample_embeddings, k=k)
        inertias.append(inertia)

    # Inertia should decrease with more clusters
    assert inertias[0] >= inertias[1] >= inertias[2], \
        f"Inertia should decrease with k: {inertias}"

    print(f"✅ Property 5: Inertia decreases with k validated ({inertias})")


@pytest.mark.asyncio
async def test_property_5_cluster_sizes(clustering_service, sample_embeddings):
    """
    Property 5: Cluster Coherence - Cluster Sizes
    Sum of cluster sizes must equal total points.
    """
    labels, _, _, _ = clustering_service.run_kmeans(sample_embeddings, k=3)

    # Count points per cluster
    cluster_sizes = {}
    for label in labels:
        cluster_sizes[label] = cluster_sizes.get(label, 0) + 1

    total_in_clusters = sum(cluster_sizes.values())
    assert total_in_clusters == len(sample_embeddings), \
        f"Sum of cluster sizes ({total_in_clusters}) must equal total points ({len(sample_embeddings)})"

    # Each cluster should have at least one point
    assert len(cluster_sizes) == 3, "All clusters should have points"

    print(f"✅ Property 5: Cluster sizes validated ({cluster_sizes})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
