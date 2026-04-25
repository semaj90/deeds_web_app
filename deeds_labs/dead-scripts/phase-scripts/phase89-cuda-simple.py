#!/usr/bin/env python3
"""
Phase 89: Simple CUDA Clustering (No Pooling)
Simplified version for testing without psycopg2.pool dependency
"""

import torch
import numpy as np
import psycopg2
import json
from sklearn.cluster import DBSCAN
import sys

class SimpleCUDAClustering:
    def __init__(self):
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA not available!")

        self.device = torch.device('cuda:0')
        torch.cuda.empty_cache()

        print(f"✅ CUDA Device: {torch.cuda.get_device_name(0)}")
        print(f"✅ CUDA Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.2f} GB")

    def load_embeddings(self):
        """Load embeddings from PostgreSQL"""
        print("\n🔍 Loading embeddings from PostgreSQL...")

        conn = psycopg2.connect(
            host='127.0.0.1',
            port=5432,
            database='legal',
            user='user',
            password='pass'
        )

        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, source, line_number, raw_text, embedding
            FROM raw_error_embeddings
            LIMIT 10000
        """)

        errors = []
        embeddings = []

        for row in cursor.fetchall():
            error_id, source, line_number, raw_text, embedding = row

            # Parse embedding
            if isinstance(embedding, str):
                embedding = embedding.strip().replace('{', '[').replace('}', ']')
                emb = np.array(json.loads(embedding), dtype=np.float32)
            else:
                emb = np.array(embedding, dtype=np.float32)

            if len(emb) > 0:
                embeddings.append(emb)
                errors.append({
                    'id': error_id,
                    'source': source,
                    'line': line_number,
                    'message': raw_text
                })

        cursor.close()
        conn.close()

        print(f"   ✅ Loaded {len(embeddings)} embeddings")
        return embeddings, errors

    def cluster_cuda(self, embeddings, errors, eps=0.3, min_samples=2):
        """Cluster embeddings on GPU"""
        print(f"\n🔬 Clustering {len(embeddings)} embeddings...")

        # Convert to tensor
        mat = np.stack(embeddings, axis=0).astype(np.float32)
        embeddings_tensor = torch.from_numpy(mat).to(self.device)

        # Normalize
        embeddings_norm = torch.nn.functional.normalize(embeddings_tensor, p=2, dim=1)

        # Cosine similarity
        similarity_matrix = torch.mm(embeddings_norm, embeddings_norm.t())
        similarity_matrix = torch.clamp(similarity_matrix, -1.0, 1.0)

        # Distance matrix
        distance_matrix = torch.clamp(1.0 - similarity_matrix, 0.0, 2.0).cpu().numpy()

        print(f"   GPU Memory Used: {torch.cuda.memory_allocated(0) / 1e9:.2f} GB")

        # DBSCAN clustering
        clustering = DBSCAN(eps=eps, min_samples=min_samples, metric='precomputed')
        labels = clustering.fit_predict(distance_matrix)

        # Group by cluster
        clusters = {}
        for idx, label in enumerate(labels):
            if label == -1:
                continue

            if label not in clusters:
                clusters[label] = []

            clusters[label].append(errors[idx])

        print(f"   ✅ Found {len(clusters)} clusters")
        return clusters

    def store_clusters(self, clusters):
        """Store clusters in PostgreSQL"""
        print(f"\n💾 Storing {len(clusters)} clusters...")

        conn = psycopg2.connect(
            host='127.0.0.1',
            port=5434,
            database='legal_ai_db',
            user='legal_admin',
            password='123456'
        )

        cursor = conn.cursor()

        # First, get error instance IDs
        instance_map = {}
        cursor.execute("SELECT instance_hash, id FROM phase89_error_instances")
        for row in cursor.fetchall():
            instance_map[row[0]] = row[1]

        stored_count = 0

        for cluster_id, cluster_errors in clusters.items():
            pattern = f"cluster_{cluster_id}"

            for error in cluster_errors:
                # Create instance hash
                import hashlib
                hash_input = f"{error['source']}:{error['line']}:{error['message']}"
                instance_hash = hashlib.sha256(hash_input.encode()).hexdigest()[:32]

                # Get instance ID
                instance_id = instance_map.get(instance_hash)

                if instance_id:
                    try:
                        cursor.execute("""
                            INSERT INTO phase89_error_clusters
                            (cluster_id, cluster_pattern, error_instance_id, confidence)
                            VALUES (%s, %s, %s, %s)
                            ON CONFLICT DO NOTHING
                        """, (int(cluster_id), pattern, instance_id, 0.95))
                        stored_count += 1
                    except Exception as e:
                        print(f"   ⚠️ Error storing cluster entry: {e}")
                        continue

        conn.commit()
        cursor.close()
        conn.close()

        print(f"   ✅ Stored {stored_count} cluster mappings")
        return stored_count

if __name__ == '__main__':
    try:
        pipeline = SimpleCUDAClustering()
        embeddings, errors = pipeline.load_embeddings()
        clusters = pipeline.cluster_cuda(embeddings, errors)
        pipeline.store_clusters(clusters)

        print(f"\n🏁 Clustering complete!")
        print(f"   Total clusters: {len(clusters)}")

    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
