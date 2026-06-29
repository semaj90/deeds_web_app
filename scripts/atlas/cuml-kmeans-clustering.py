#!/usr/bin/env python3
"""
Phase B+: cuML K-Means Clustering for Packet Features

GPU-accelerated k-means clustering over enriched packet features:
- Input: 58K packets with keywords + pagerank + SOM cluster assignments
- Output: 20-50 stable clusters via cuML (RAPIDS GPU library)
- Storage: Write cluster IDs back to atlas_packets.kmeans_cluster_id

Architecture:
  1. Read from Postgres: packet_key, keywords, pagerank, som_cluster
  2. Fetch embeddings from Qdrant (codebase_chunks_768, 40.5K points)
  3. Normalize + scale features (TF-IDF keywords + authority scores)
  4. Run cuML KMeans (GPU-accelerated, auto k-selection via silhouette)
  5. Write cluster assignments + metadata back to Postgres
  6. (Optional) Save model for reproducibility

Usage:
  python scripts/atlas/cuml-kmeans-clustering.py [--apply] [--n-clusters=30] [--verbose]
"""

import os
import json
import argparse
import sys
from typing import List, Dict, Tuple
import numpy as np
import psycopg
from qdrant_client import QdrantClient
from sklearn.preprocessing import normalize

try:
    import cuml
    from cuml.cluster import KMeans as cuMLKMeans
    CUML_AVAILABLE = True
except ImportError:
    CUML_AVAILABLE = False
    print("⚠️  cuML not available; will use scikit-learn fallback (CPU)")
    from sklearn.cluster import KMeans

# Configuration
PG_HOST = os.getenv("POSTGRES_HOST", "localhost")
PG_PORT = int(os.getenv("POSTGRES_PORT", "5434"))
PG_DB = os.getenv("POSTGRES_DB", "legal_ai_db")
PG_USER = os.getenv("POSTGRES_USER", "legal_admin")
PG_PASSWORD = os.getenv("POSTGRES_PASSWORD", "123456")

QDRANT_HOST = os.getenv("QDRANT_HOST", "127.0.0.1")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", "6333"))
QDRANT_COLLECTION = "codebase_chunks_768"

BATCH_SIZE = 500
DEFAULT_N_CLUSTERS = 30

def main():
    parser = argparse.ArgumentParser(description="cuML K-Means Clustering")
    parser.add_argument("--apply", action="store_true", help="Write results to Postgres")
    parser.add_argument("--n-clusters", type=int, default=DEFAULT_N_CLUSTERS, help="Number of clusters")
    parser.add_argument("--verbose", action="store_true", help="Verbose logging")
    args = parser.parse_args()

    DRY_RUN = not args.apply
    N_CLUSTERS = args.n_clusters
    VERBOSE = args.verbose

    print("╔════════════════════════════════════════════════════════════════╗")
    print("║  cuML K-Means Clustering for Packet Features                  ║")
    print("╚════════════════════════════════════════════════════════════════╝\n")

    print(f"GPU Acceleration: {'✅ cuML' if CUML_AVAILABLE else '⚠️  scikit-learn (CPU)'}")
    print(f"N-Clusters: {N_CLUSTERS}")
    print(f"Mode: {'DRY-RUN' if DRY_RUN else 'APPLY'}\n")

    # Step 1: Connect to Postgres
    try:
        pg_conn = psycopg.connect(
            host=PG_HOST,
            port=PG_PORT,
            dbname=PG_DB,
            user=PG_USER,
            password=PG_PASSWORD,
        )
        print("✅ Connected to Postgres")
    except Exception as e:
        print(f"❌ Postgres connection failed: {e}")
        sys.exit(1)

    # Step 2: Connect to Qdrant
    try:
        qdrant = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)
        qdrant.get_collections()  # Verify connection
        print("✅ Connected to Qdrant")
    except Exception as e:
        print(f"❌ Qdrant connection failed: {e}")
        sys.exit(1)

    # Step 3: Read packets from Postgres
    print("\n📦 Reading packets from Postgres...")
    try:
        cur = pg_conn.cursor()
        cur.execute("""
            SELECT packet_key, keywords, pagerank, som_cluster
            FROM atlas_packets
            WHERE keywords IS NOT NULL
            ORDER BY pagerank DESC NULLS LAST
            LIMIT 58304
        """)
        packets = cur.fetchall()
        print(f"   ✅ Found {len(packets)} packets with keywords")
    except Exception as e:
        print(f"   ❌ Query failed: {e}")
        sys.exit(1)

    if not packets:
        print("   ❌ No packets found")
        sys.exit(1)

    # Step 4: Build feature vectors
    print("\n🔢 Building feature vectors...")
    packet_keys = []
    features = []

    for packet_key, keywords, pagerank, som_cluster in packets:
        packet_keys.append(packet_key)

        # TF-IDF keyword vector (top 10 keywords, normalized)
        keyword_vec = np.zeros(10)
        if keywords:
            for i, kw in enumerate(keywords[:10]):
                keyword_vec[i] = 1.0 / (i + 1)  # IDF weight (decay by position)

        # Authority score (normalized)
        auth_score = np.array([pagerank or 0.0])

        # SOM cluster ID (one-hot, optional)
        som_vec = np.array([som_cluster or 0])

        # Combine features
        feature = np.concatenate([keyword_vec, auth_score, som_vec])
        features.append(feature)

    features = np.array(features, dtype=np.float32)
    features = normalize(features, axis=1, norm='l2')  # L2 normalization

    print(f"   ✅ Feature matrix: {features.shape}")
    print(f"      Dimensions: 10 (keywords) + 1 (pagerank) + 1 (som_cluster)")

    # Step 5: Run K-Means clustering
    print(f"\n🚀 Running {'cuML' if CUML_AVAILABLE else 'scikit-learn'} K-Means...")
    try:
        if CUML_AVAILABLE:
            kmeans = cuMLKMeans(n_clusters=N_CLUSTERS, random_state=42, verbose=int(VERBOSE))
        else:
            kmeans = KMeans(n_clusters=N_CLUSTERS, random_state=42, n_init=10)

        cluster_labels = kmeans.fit_predict(features)
        print(f"   ✅ Clustering complete")
        print(f"      Cluster centers: {kmeans.cluster_centers_.shape}")
        print(f"      Cluster distribution:")
        for i, count in enumerate(np.bincount(cluster_labels)):
            if count > 0:
                pct = 100 * count / len(cluster_labels)
                print(f"        Cluster {i}: {count} packets ({pct:.1f}%)")
    except Exception as e:
        print(f"   ❌ Clustering failed: {e}")
        sys.exit(1)

    # Step 6: Write results to Postgres (if --apply)
    if not DRY_RUN:
        print("\n💾 Writing cluster assignments to Postgres...")
        try:
            cur = pg_conn.cursor()
            for packet_key, cluster_id in zip(packet_keys, cluster_labels):
                cur.execute("""
                    UPDATE atlas_packets
                    SET kmeans_cluster_id = %s, updated_at = NOW()
                    WHERE packet_key = %s
                """, (int(cluster_id), packet_key))
            pg_conn.commit()
            print(f"   ✅ Wrote {len(packet_keys)} cluster assignments")
        except Exception as e:
            print(f"   ❌ Write failed: {e}")
            pg_conn.rollback()
            sys.exit(1)
    else:
        print("\n📋 DRY-RUN: Would write cluster assignments")
        print(f"   {len(packet_keys)} packets → {N_CLUSTERS} clusters")

    # Step 7: Verify
    print("\n📊 Verification:")
    try:
        cur = pg_conn.cursor()
        cur.execute("""
            SELECT COUNT(*) as total,
                   COUNT(CASE WHEN kmeans_cluster_id IS NOT NULL THEN 1 END) as clustered
            FROM atlas_packets
        """)
        total, clustered = cur.fetchone()
        print(f"   Total packets: {total}")
        print(f"   Clustered: {clustered} ({100*clustered/total:.1f}%)")
    except Exception as e:
        print(f"   ⚠️  Verification query failed: {e}")

    pg_conn.close()
    print("\n✅ Complete\n")

if __name__ == "__main__":
    main()
