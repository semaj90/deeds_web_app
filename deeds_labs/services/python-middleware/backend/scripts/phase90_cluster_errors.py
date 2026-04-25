#!/usr/bin/env python3
"""
Phase 90 - Cluster 73k Errors from Qdrant using GPU K-Means
Pulls embeddings from Qdrant, clusters them, and updates Qdrant with cluster IDs
"""

import json
import torch
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct, Filter, FieldCondition, MatchValue
from phase90_gpu_kmeans import kmeans_cosine_cuda
from datetime import datetime
import sys

# Configuration
QDRANT_URL = "http://localhost:6333"
COLLECTION = "phase90_cuda_embeddings"
N_CLUSTERS = 12  # Number of error pattern clusters
BATCH_SIZE = 5000  # Batch size for Qdrant scrolling

def main():
    print("=" * 80)
    print("Phase 90: GPU Clustering for 73k TypeScript Errors")
    print("=" * 80)
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    # Check CUDA
    if not torch.cuda.is_available():
        print("❌ CUDA not available")
        sys.exit(1)

    print(f"✅ CUDA: {torch.cuda.get_device_name(0)}")
    print(f"✅ VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.2f} GB")

    # Connect to Qdrant
    client = QdrantClient(url=QDRANT_URL)

    # Get collection info
    info = client.get_collection(COLLECTION)
    total_points = info.points_count
    vector_dim = info.config.params.vectors.size

    print(f"✅ Collection: {COLLECTION}")
    print(f"✅ Points: {total_points:,}")
    print(f"✅ Dimension: {vector_dim}")
    print()

    # Step 1: Fetch all vectors from Qdrant
    print("[1/4] Fetching vectors from Qdrant...")
    all_points = []
    all_vectors = []
    all_ids = []

    offset = None
    batch_count = 0

    while True:
        results, next_offset = client.scroll(
            collection_name=COLLECTION,
            limit=BATCH_SIZE,
            offset=offset,
            with_vectors=True,
            with_payload=True
        )

        if not results:
            break

        for point in results:
            all_points.append(point)
            all_vectors.append(point.vector)
            all_ids.append(point.id)

        batch_count += 1
        print(f"   Batch {batch_count}: {len(all_ids):,} / {total_points:,} ({100*len(all_ids)/total_points:.1f}%)")

        if next_offset is None:
            break
        offset = next_offset

    print(f"   ✅ Fetched: {len(all_vectors):,} vectors")
    print()

    # Step 2: Move to GPU tensor
    print("[2/4] Moving vectors to GPU...")
    X = torch.tensor(all_vectors, dtype=torch.float32, device='cuda')
    print(f"   ✅ GPU tensor shape: {X.shape}")
    print(f"   ✅ GPU memory used: {torch.cuda.memory_allocated()/1e9:.2f} GB")
    print()

    # Step 3: Run K-Means clustering
    print(f"[3/4] Running GPU K-Means clustering (k={N_CLUSTERS})...")
    import time
    start = time.time()

    result = kmeans_cosine_cuda(X, k=N_CLUSTERS, iters=25, seed=42)

    elapsed = time.time() - start
    print(f"   ✅ Clustering completed in {elapsed:.2f}s")
    print(f"   ✅ Inertia (avg distance): {result.inertia:.4f}")

    # Count errors per cluster
    labels = result.labels.cpu().numpy()
    cluster_counts = {}
    for label in labels:
        cluster_counts[int(label)] = cluster_counts.get(int(label), 0) + 1

    print(f"\n   📊 Cluster Distribution:")
    for cluster_id in sorted(cluster_counts.keys()):
        count = cluster_counts[cluster_id]
        pct = 100 * count / len(labels)
        bar = "█" * int(pct / 2)
        print(f"      Cluster {cluster_id:2d}: {count:6,} ({pct:5.1f}%) {bar}")
    print()

    # Step 4: Update Qdrant with cluster IDs
    print("[4/4] Updating Qdrant with cluster IDs...")

    # Prepare updates in batches
    update_batch_size = 1000
    updates_done = 0

    for i in range(0, len(all_ids), update_batch_size):
        batch_ids = all_ids[i:i+update_batch_size]
        batch_labels = labels[i:i+update_batch_size]

        # Update payloads with cluster_id
        for point_id, cluster_id in zip(batch_ids, batch_labels):
            client.set_payload(
                collection_name=COLLECTION,
                payload={"cluster_id": int(cluster_id)},
                points=[point_id]
            )

        updates_done += len(batch_ids)
        if updates_done % 5000 == 0:
            print(f"   Updated: {updates_done:,} / {len(all_ids):,}")

    print(f"   ✅ Updated: {len(all_ids):,} points with cluster IDs")
    print()

    # Save cluster summary
    summary = {
        "timestamp": datetime.now().isoformat(),
        "total_errors": len(all_ids),
        "n_clusters": N_CLUSTERS,
        "inertia": result.inertia,
        "cluster_distribution": cluster_counts,
        "centroids_shape": list(result.centroids.shape)
    }

    summary_path = "reports/phase90_cluster_summary.json"
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2)

    print("=" * 80)
    print("📊 CLUSTERING COMPLETE")
    print("=" * 80)
    print(f"✅ Clustered: {len(all_ids):,} errors into {N_CLUSTERS} patterns")
    print(f"✅ Inertia: {result.inertia:.4f}")
    print(f"✅ Summary: {summary_path}")
    print(f"✅ Collection: {COLLECTION} (updated with cluster_id)")
    print("=" * 80)
    print()
    print("🎯 Next Steps:")
    print("   1. Query by cluster: python query_phase90.py --cluster 0")
    print("   2. Analyze patterns: python phase90_analyze_clusters.py")
    print("   3. Visualize: Open http://localhost:5175/phase90/clusters")

if __name__ == "__main__":
    main()
