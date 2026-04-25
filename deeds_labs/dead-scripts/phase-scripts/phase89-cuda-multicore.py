#!/usr/bin/env python3
"""
Phase 89: Multi-Core CUDA Pipeline with Redis Cache
Enhancements:
- torch.multiprocessing instead of threading (bypass GIL)
- DataLoader with num_workers for GPU batching
- Redis cache for embeddinggemma results
- Chunked streaming to prevent OOM
- GPU utilization monitoring
"""

import torch
import torch.multiprocessing as mp
from torch.utils.data import Dataset, DataLoader
import numpy as np
import psycopg2
from psycopg2 import pool
import redis
import json
import hashlib
from datetime import datetime
from sklearn.cluster import DBSCAN
import sys
import os

# Force CUDA device selection
os.environ['CUDA_VISIBLE_DEVICES'] = '0'  # RTX 3060 Ti

class EmbeddingDataset(Dataset):
    """PyTorch Dataset for batched embedding processing"""
    def __init__(self, embeddings):
        self.embeddings = torch.tensor(embeddings, dtype=torch.float32)

    def __len__(self):
        return len(self.embeddings)

    def __getitem__(self, idx):
        return self.embeddings[idx]

class Phase89MultiCoreCUDA:
    def __init__(self):
        # CUDA Setup
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA not available! Check GPU drivers.")

        self.device = torch.device('cuda:0')
        torch.cuda.set_device(0)

        # Clear cache
        torch.cuda.empty_cache()

        # Redis Cache Setup
        self.redis_client = redis.Redis(
            host='127.0.0.1',
            port=6379,
            db=0,
            decode_responses=False  # Keep binary for numpy arrays
        )
        self.cache_ttl = 3600 * 24  # 24 hours

        # PostgreSQL Connections (use connection pooling)
        self.legal_pool = pool.SimpleConnectionPool(
            2, 10,  # min/max connections
            host='127.0.0.1',
            port=5434,
            database='legal_ai_db',
            user='legal_admin',
            password='123456'
        )

        self.ai_pool = pool.SimpleConnectionPool(
            2, 10,
            host='127.0.0.1',
            port=5434,
            database='legal_ai_db',
            user='legal_admin',
            password='123456'
        )

        print(f"✅ CUDA Device: {torch.cuda.get_device_name(0)}")
        print(f"✅ CUDA Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.2f} GB")
        print(f"✅ Redis Connected: {self.redis_client.ping()}")

    def get_cached_embedding(self, text):
        """Get embedding from Redis cache"""
        cache_key = f"emb:{hashlib.sha256(text.encode()).hexdigest()}"
        cached = self.redis_client.get(cache_key)

        if cached:
            return np.frombuffer(cached, dtype=np.float32)
        return None

    def set_cached_embedding(self, text, embedding):
        """Store embedding in Redis cache"""
        cache_key = f"emb:{hashlib.sha256(text.encode()).hexdigest()}"
        self.redis_client.setex(
            cache_key,
            self.cache_ttl,
            embedding.astype(np.float32).tobytes()
        )

    def migrate_legacy_errors(self):
        """Migrate errors from raw_error_embeddings to phase89 tables"""
        print("🔄 Migrating legacy errors...")
        conn = self.ai_pool.getconn()
        cursor = conn.cursor()

        # Check if migration needed
        cursor.execute("SELECT COUNT(*) FROM phase89_error_instances")
        if cursor.fetchone()[0] > 0:
            print("   ✅ Migration already done (or partial). Skipping.")
            cursor.close()
            self.ai_pool.putconn(conn)
            return

        legal_conn = self.legal_pool.getconn()
        legal_cursor = legal_conn.cursor(name='migration_cursor')
        legal_cursor.execute("SELECT id, source, line_number, raw_text, tags, embedding FROM raw_error_embeddings")

        ai_cursor = conn.cursor()

        count = 0
        while True:
            rows = legal_cursor.fetchmany(1000)
            if not rows:
                break

            for row in rows:
                old_id, source, line, text, tags, embedding = row

                # Parse embedding
                if isinstance(embedding, str):
                    embedding = embedding.strip().replace('{', '[').replace('}', ']')
                    emb_array = np.array(json.loads(embedding), dtype=np.float32)
                else:
                    emb_array = np.array(embedding, dtype=np.float32)

                emb_bytes = emb_array.tobytes()
                text_hash = hashlib.sha256(text.encode()).hexdigest()

                # Insert into phase89_embeddings
                ai_cursor.execute("""
                    INSERT INTO phase89_embeddings (model, text_hash, dim, embedding)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (model, text_hash) DO UPDATE SET created_at = NOW()
                    RETURNING id
                """, ('embeddinggemma:latest', text_hash, 768, emb_bytes))

                emb_id = ai_cursor.fetchone()[0]

                instance_hash = hashlib.sha256(f"{source}:{line}:{text}".encode()).hexdigest()

                ai_cursor.execute("""
                    INSERT INTO phase89_error_instances (
                        source, file_path, line, message, instance_hash, model, text_hash, embedding_id, tags
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (instance_hash) DO NOTHING
                """, (
                    source, source, line, text, instance_hash, 'embeddinggemma:latest', text_hash, emb_id, tags
                ))

                count += 1

            conn.commit()
            print(f"   Migrated {count} errors...", end='\r')

        print(f"\n✅ Migrated {count} errors.")

        legal_cursor.close()
        self.legal_pool.putconn(legal_conn)

        ai_cursor.close()
        self.ai_pool.putconn(conn)

    def load_embeddings_streamed(self, batch_size=1000):
        """Stream embeddings from PostgreSQL in chunks"""
        conn = self.ai_pool.getconn()
        cursor = conn.cursor(name='streaming_cursor')  # Server-side cursor

        cursor.execute("""
            SELECT i.id, i.source, i.line, i.message, i.tags, e.embedding
            FROM phase89_error_instances i
            JOIN phase89_embeddings e ON i.embedding_id = e.id
            ORDER BY i.source, i.line
        """)

        while True:
            rows = cursor.fetchmany(batch_size)
            if not rows:
                break

            batch_embeddings = []
            batch_metadata = []

            for row in rows:
                error_id, source, line_number, raw_text, tags, embedding = row

                # Try cache first
                cached_emb = self.get_cached_embedding(raw_text)
                if cached_emb is not None:
                    emb = cached_emb
                else:
                    # Parse embedding from database (bytea)
                    emb = np.frombuffer(embedding, dtype=np.float32)

                    # Cache it
                    self.set_cached_embedding(raw_text, emb)

                # Validate embedding shape
                if emb.shape != (768,):
                    continue

                batch_embeddings.append(emb)
                batch_metadata.append({
                    'id': error_id,
                    'source': source,
                    'line_number': line_number,
                    'raw_text': raw_text,
                    'tags': tags or []
                })

            yield batch_embeddings, batch_metadata

        cursor.close()
        self.ai_pool.putconn(conn)

    def cluster_batch_cuda(self, embeddings, metadata, eps=0.3, min_samples=2):
        """Cluster a batch of embeddings on GPU"""
        # Create DataLoader for GPU batching
        # Convert list of arrays to single array first to avoid warning and improve performance
        embeddings_array = np.array(embeddings)
        dataset = EmbeddingDataset(embeddings_array)
        loader = DataLoader(
            dataset,
            batch_size=512,  # GPU batch size
            shuffle=False,
            num_workers=4,  # Multi-core CPU loading
            pin_memory=True  # Faster GPU transfer
        )

        all_embeddings = []

        with torch.no_grad():  # Disable gradient tracking
            for batch_emb in loader:
                # Move to GPU
                batch_emb = batch_emb.to(self.device, non_blocking=True)

                # Normalize
                batch_emb_norm = torch.nn.functional.normalize(batch_emb, p=2, dim=1)

                all_embeddings.append(batch_emb_norm)

        # Concatenate all batches
        embeddings_tensor = torch.cat(all_embeddings, dim=0)

        # Compute similarity matrix on GPU (chunked to avoid OOM)
        similarity_matrix = self._chunked_similarity(embeddings_tensor)

        # Clamp and convert to distance
        similarity_matrix = torch.clamp(similarity_matrix, -1.0, 1.0)
        distance_matrix = torch.clamp(1.0 - similarity_matrix, 0.0, 2.0).cpu().numpy()

        # DBSCAN on CPU (no GPU implementation available)
        clustering = DBSCAN(eps=eps, min_samples=min_samples, metric='precomputed')
        labels = clustering.fit_predict(distance_matrix)

        # Group by cluster
        clusters = {}
        for idx, label in enumerate(labels):
            if label == -1:
                continue  # Skip noise

            if label not in clusters:
                clusters[label] = []

            clusters[label].append(metadata[idx])

        # Log GPU utilization
        print(f"   GPU Memory Used: {torch.cuda.memory_allocated(0) / 1e9:.2f} GB")
        try:
            print(f"   GPU Utilization: {torch.cuda.utilization(0)}%")
        except:
            pass

        return clusters

    def _chunked_similarity(self, embeddings, chunk_size=5000):
        """Compute similarity matrix in chunks to prevent OOM"""
        n = embeddings.shape[0]
        similarity = torch.zeros(n, n, device=self.device)

        for i in range(0, n, chunk_size):
            end_i = min(i + chunk_size, n)
            for j in range(0, n, chunk_size):
                end_j = min(j + chunk_size, n)

                chunk_sim = torch.mm(embeddings[i:end_i], embeddings[j:end_j].t())
                similarity[i:end_i, j:end_j] = chunk_sim

        return similarity

    def cluster_all_streamed(self):
        """Cluster all embeddings with streaming"""
        print("🚀 Starting Multi-Core CUDA Clustering Pipeline...")

        all_clusters = {}
        cluster_offset = 0
        cache_hits = 0
        cache_misses = 0

        for batch_embeddings, batch_metadata in self.load_embeddings_streamed():
            print(f"   Processing batch of {len(batch_embeddings)} embeddings...")

            # Count cache hits
            cache_hits += sum(1 for m in batch_metadata if self.get_cached_embedding(m['raw_text']) is not None)
            cache_misses += len(batch_metadata) - cache_hits

            # Cluster this batch
            batch_clusters = self.cluster_batch_cuda(batch_embeddings, batch_metadata)

            # Merge with global clusters (renumber to avoid conflicts)
            for label, errors in batch_clusters.items():
                all_clusters[cluster_offset + label] = errors

            cluster_offset += len(batch_clusters)

            # Clear GPU cache between batches
            torch.cuda.empty_cache()

        print(f"\n✅ Clustering Complete!")
        print(f"   Total Clusters: {len(all_clusters)}")
        print(f"   Cache Hits: {cache_hits} ({cache_hits/(cache_hits+cache_misses)*100:.1f}%)")
        print(f"   Cache Misses: {cache_misses}")

        return all_clusters

    def save_clusters_to_db(self, clusters):
        """Save clusters to PostgreSQL"""
        print("💾 Saving clusters to database...")
        conn = self.ai_pool.getconn()
        cursor = conn.cursor()

        # Clear existing clusters
        cursor.execute("TRUNCATE TABLE phase89_error_clusters CASCADE")

        count = 0
        for cluster_id, errors in clusters.items():
            for error in errors:
                cursor.execute("""
                    INSERT INTO phase89_error_clusters (
                        cluster_id, cluster_pattern, error_instance_id, confidence, metadata
                    ) VALUES (%s, %s, %s, %s, %s)
                """, (
                    int(cluster_id),
                    f"Cluster {cluster_id}",
                    error['id'],
                    1.0,
                    json.dumps({'source': error['source'], 'tags': error['tags']})
                ))
                count += 1

        conn.commit()
        cursor.close()
        self.ai_pool.putconn(conn)
        print(f"✅ Saved {count} cluster assignments")

    def cleanup(self):
        """Clean up resources"""
        self.legal_pool.closeall()
        self.ai_pool.closeall()
        self.redis_client.close()
        torch.cuda.empty_cache()

if __name__ == '__main__':
    # Set multiprocessing start method
    mp.set_start_method('spawn', force=True)

    try:
        pipeline = Phase89MultiCoreCUDA()
        pipeline.migrate_legacy_errors()
        clusters = pipeline.cluster_all_streamed()
        pipeline.save_clusters_to_db(clusters)
        pipeline.cleanup()

        print(f"\n[DONE] Pipeline finished successfully!")

    except Exception as e:
        print(f"[ERROR] Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
