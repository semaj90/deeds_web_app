#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test embedding loading and clustering"""

import sys
import psycopg2
import numpy as np
from sklearn.cluster import DBSCAN
import torch

# Fix Windows console
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

CONFIG = {
    'postgres': {
        'dbname': 'legal_ai_db',
        'user': 'legal_admin',
        'password': '123456',
        'host': 'localhost',
        'port': '5434'
    }
}

print("🔬 Testing Phase 89 Embedding Loading\n")

# Connect
conn = psycopg2.connect(**CONFIG['postgres'])
cur = conn.cursor()

# Fetch first 100 errors with embeddings
print("📥 Fetching 100 errors...")
cur.execute("""
    SELECT e.id, e.message, emb.embedding
    FROM phase89_error_instances e
    INNER JOIN phase89_embeddings emb ON e.text_hash = emb.text_hash
    WHERE e.status = 'open' AND emb.model = 'embeddinggemma:latest'
    LIMIT 100
""")

rows = cur.fetchall()
print(f"   ✅ Fetched {len(rows)} errors\n")

# Parse embeddings
print("🧠 Parsing embeddings...")
embeddings = []
for error_id, message, emb in rows[:10]:
    print(f"   Error {error_id}:")
    print(f"      Type: {type(emb)}")
    print(f"      Length: {len(emb) if hasattr(emb, '__len__') else 'N/A'}")

    # Try to parse
    if isinstance(emb, memoryview):
        emb_bytes = bytes(emb)
        print(f"      Bytes length: {len(emb_bytes)}")

        # Try as float32 array
        try:
            vec = np.frombuffer(emb_bytes, dtype=np.float32)
            print(f"      ✅ Parsed as float32: shape {vec.shape}, first 5 values: {vec[:5]}")
            embeddings.append(vec)
        except Exception as e:
            print(f"      ❌ Failed to parse: {e}")

    print()

if embeddings:
    print(f"\n📊 Successfully parsed {len(embeddings)} embeddings")
    embeddings_np = np.stack(embeddings)
    print(f"   Shape: {embeddings_np.shape}")
    print(f"   Mean: {embeddings_np.mean():.4f}")
    print(f"   Std: {embeddings_np.std():.4f}")

    # Test GPU
    if torch.cuda.is_available():
        print("\n🔥 Testing GPU...")
        embeddings_torch = torch.from_numpy(embeddings_np).cuda()
        print(f"   ✅ Moved to GPU: {embeddings_torch.shape}")

        # Test cosine similarity
        embeddings_norm = torch.nn.functional.normalize(embeddings_torch, p=2, dim=1)
        similarity = torch.mm(embeddings_norm, embeddings_norm.t())
        print(f"   ✅ Similarity matrix: {similarity.shape}")
        print(f"   Similarity range: [{similarity.min():.4f}, {similarity.max():.4f}]")

        # Test clustering
        distance = 1.0 - similarity
        distance_cpu = distance.cpu().numpy()

        # Make symmetric (handle numerical precision)
        distance_cpu = (distance_cpu + distance_cpu.T) / 2
        np.fill_diagonal(distance_cpu, 0)  # Ensure diagonal is 0

        print(f"   Distance matrix stats:")
        print(f"      Min: {distance_cpu.min():.4f}")
        print(f"      Max: {distance_cpu.max():.4f}")
        print(f"      Mean: {distance_cpu.mean():.4f}")

        clustering = DBSCAN(eps=0.35, min_samples=2, metric='precomputed')
        labels = clustering.fit_predict(distance_cpu)

        unique_labels = len(set(labels)) - (1 if -1 in labels else 0)
        noise_count = list(labels).count(-1)

        print(f"\n✅ DBSCAN Results:")
        print(f"   Clusters: {unique_labels}")
        print(f"   Noise points: {noise_count}")
        print(f"   Labels: {labels}")

cur.close()
conn.close()
