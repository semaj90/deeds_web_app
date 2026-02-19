#!/usr/bin/env python3
"""
Phase 44 Tensor Loader — GPU-Accelerated Error Clustering
----------------------------------------------------------
Loads Redis embeddings into CUDA tensors for batch processing

Features:
- Load embeddings from Redis (FLOAT16[768])
- Batch into CUDA tensors (GPU memory)
- Compute mean embeddings per error cluster
- K-means clustering on GPU (cuML)
- Export cluster summaries for LLM context

Usage:
    python scripts/phase44-tensor-loader.py --redis-db 2 --batch-size 1000
    python scripts/phase44-tensor-loader.py --cluster --k 50
"""

import argparse
import json
import time
import numpy as np
import redis
import torch
from typing import List, Dict, Tuple
import os

# Optional: CUDA acceleration
try:
    from cuml import KMeans
    CUML_AVAILABLE = True
except ImportError:
    from sklearn.cluster import KMeans
    CUML_AVAILABLE = False
    print("⚠️  cuML not available, using sklearn (CPU)")

# Configuration
class Config:
    def __init__(self, args):
        self.redis_host = os.getenv('REDIS_HOST', 'localhost')
        self.redis_port = int(os.getenv('REDIS_PORT', '6379'))
        self.redis_password = os.getenv('REDIS_PASSWORD', 'redis')
        self.redis_db = args.redis_db or 2
        
        self.batch_size = args.batch_size or 1000
        self.embedding_dim = args.embedding_dim or 768
        self.k_clusters = args.k or 50
        
        self.cuda_device = int(os.getenv('CUDA_DEVICE', '0'))
        self.gpu_enabled = torch.cuda.is_available() and not args.cpu_only
        
        if self.gpu_enabled:
            torch.cuda.set_device(self.cuda_device)
            print(f"✓ GPU enabled: {torch.cuda.get_device_name(self.cuda_device)}")
        else:
            print("⚠️  GPU disabled, using CPU")

class TensorLoader:
    def __init__(self, config: Config):
        self.config = config
        self.redis_client = redis.Redis(
            host=config.redis_host,
            port=config.redis_port,
            password=config.redis_password,
            db=config.redis_db,
            decode_responses=False  # Binary mode for embeddings
        )
        
        self.device = torch.device(
            f'cuda:{config.cuda_device}' if config.gpu_enabled else 'cpu'
        )
        
        self.stats = {
            'embeddings_loaded': 0,
            'bytes_loaded': 0,
            'cache_hits': 0,
            'cache_misses': 0,
            'gpu_transfers': 0
        }
    
    def load_embeddings(self, pattern='ai:embedding:*') -> Tuple[torch.Tensor, List[str]]:
        """Load embeddings from Redis into CUDA tensor"""
        print(f"\n📦 Loading embeddings from Redis (pattern: {pattern})...")
        
        # Scan for embedding keys
        keys = []
        cursor = 0
        while True:
            cursor, batch = self.redis_client.scan(
                cursor,
                match=pattern,
                count=1000
            )
            keys.extend(batch)
            
            if cursor == 0:
                break
        
        print(f"Found {len(keys)} embedding keys")
        
        if len(keys) == 0:
            print("⚠️  No embeddings found in Redis")
            return None, []
        
        # Load embeddings in batches
        embeddings = []
        embedding_ids = []
        
        for i in range(0, len(keys), self.config.batch_size):
            batch_keys = keys[i:i + self.config.batch_size]
            
            # Pipeline for efficient batch loading
            pipe = self.redis_client.pipeline()
            for key in batch_keys:
                pipe.get(key)
            
            batch_values = pipe.execute()
            
            for key, value in zip(batch_keys, batch_values):
                if value:
                    try:
                        embedding = json.loads(value)
                        if len(embedding) == self.config.embedding_dim:
                            embeddings.append(embedding)
                            embedding_ids.append(key.decode('utf-8'))
                            self.stats['embeddings_loaded'] += 1
                            self.stats['bytes_loaded'] += len(value)
                    except Exception as e:
                        print(f"⚠️  Failed to parse {key}: {e}")
            
            if (i + self.config.batch_size) % 5000 == 0:
                print(f"  Loaded {len(embeddings)} embeddings...")
        
        print(f"✓ Loaded {len(embeddings)} valid embeddings")
        
        # Convert to tensor
        tensor = torch.tensor(embeddings, dtype=torch.float32)
        
        # Transfer to GPU
        if self.config.gpu_enabled:
            tensor = tensor.to(self.device)
            self.stats['gpu_transfers'] += 1
            print(f"✓ Transferred to GPU: {tensor.shape}")
        
        return tensor, embedding_ids
    
    def compute_cluster_means(self, tensor: torch.Tensor, labels: List[int]) -> torch.Tensor:
        """Compute mean embedding for each cluster"""
        labels_tensor = torch.tensor(labels, device=self.device)
        num_clusters = len(set(labels))
        
        cluster_means = torch.zeros(
            (num_clusters, self.config.embedding_dim),
            device=self.device,
            dtype=torch.float32
        )
        
        for cluster_id in range(num_clusters):
            mask = labels_tensor == cluster_id
            if mask.sum() > 0:
                cluster_means[cluster_id] = tensor[mask].mean(dim=0)
        
        return cluster_means
    
    def cluster_errors(self, tensor: torch.Tensor, k: int = None) -> Tuple[np.ndarray, torch.Tensor]:
        """K-means clustering on GPU (if available)"""
        k = k or self.config.k_clusters
        
        print(f"\n🧮 Clustering {tensor.shape[0]} embeddings into {k} clusters...")
        
        start_time = time.time()
        
        if CUML_AVAILABLE and self.config.gpu_enabled:
            # GPU-accelerated clustering
            print("Using cuML (GPU-accelerated)")
            kmeans = KMeans(n_clusters=k, random_state=42)
            
            # cuML expects numpy array on CPU, transfers to GPU internally
            tensor_cpu = tensor.cpu().numpy()
            labels = kmeans.fit_predict(tensor_cpu)
            centroids = torch.from_numpy(kmeans.cluster_centers_).to(self.device)
            
        else:
            # CPU clustering
            print("Using sklearn (CPU)")
            kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
            
            tensor_cpu = tensor.cpu().numpy()
            labels = kmeans.fit_predict(tensor_cpu)
            centroids = torch.from_numpy(kmeans.cluster_centers_).to(self.device)
        
        elapsed = time.time() - start_time
        print(f"✓ Clustering complete in {elapsed:.2f}s")
        
        return labels, centroids
    
    def export_clusters(
        self,
        labels: np.ndarray,
        centroids: torch.Tensor,
        embedding_ids: List[str],
        output_path: str
    ):
        """Export cluster assignments and summaries"""
        print(f"\n💾 Exporting cluster data to {output_path}...")
        
        # Build cluster summary
        clusters = {}
        for cluster_id in range(centroids.shape[0]):
            mask = labels == cluster_id
            cluster_embeddings = [embedding_ids[i] for i, m in enumerate(mask) if m]
            
            # Extract error info from embedding IDs
            errors = []
            for emb_id in cluster_embeddings[:100]:  # Sample
                # Parse embedding ID back to error info
                # Format: ai:embedding:<hash>
                # Need to look up original error from Redis
                error_keys = self.redis_client.keys(f'ai:error:*')
                for error_key in error_keys:
                    error_data = self.redis_client.hgetall(error_key)
                    if error_data.get(b'embedding_hash') and \
                       error_data[b'embedding_hash'].decode() in emb_id:
                        errors.append({
                            'id': error_key.decode(),
                            'entities': json.loads(error_data.get(b'entities', b'[]'))
                        })
                        break
            
            clusters[cluster_id] = {
                'size': int(mask.sum()),
                'centroid': centroids[cluster_id].cpu().tolist(),
                'sample_errors': errors[:10]
            }
        
        # Save to JSON
        with open(output_path, 'w') as f:
            json.dump({
                'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
                'num_clusters': len(clusters),
                'total_embeddings': len(labels),
                'clusters': clusters,
                'stats': self.stats
            }, f, indent=2)
        
        print(f"✓ Exported {len(clusters)} clusters")
        
        # Print summary
        print(f"\n📊 Cluster Summary:")
        for cluster_id, data in sorted(clusters.items(), key=lambda x: -x[1]['size'])[:10]:
            print(f"  Cluster {cluster_id}: {data['size']} errors")

def main():
    parser = argparse.ArgumentParser(description='Phase 44 Tensor Loader')
    parser.add_argument('--redis-db', type=int, default=2, help='Redis database number')
    parser.add_argument('--batch-size', type=int, default=1000, help='Batch size for loading')
    parser.add_argument('--embedding-dim', type=int, default=768, help='Embedding dimension')
    parser.add_argument('--cluster', action='store_true', help='Run clustering')
    parser.add_argument('--k', type=int, default=50, help='Number of clusters')
    parser.add_argument('--cpu-only', action='store_true', help='Disable GPU')
    parser.add_argument('--output', type=str, default='phase44-clusters.json', help='Output file')
    
    args = parser.parse_args()
    
    print("🚀 Phase 44 Tensor Loader\n")
    
    # Initialize
    config = Config(args)
    loader = TensorLoader(config)
    
    # Load embeddings
    tensor, embedding_ids = loader.load_embeddings()
    
    if tensor is None:
        print("❌ No embeddings to process")
        return
    
    # Cluster if requested
    if args.cluster:
        labels, centroids = loader.cluster_errors(tensor, args.k)
        loader.export_clusters(labels, centroids, embedding_ids, args.output)
    else:
        print("\n✓ Embeddings loaded into tensor")
        print(f"  Shape: {tensor.shape}")
        print(f"  Device: {tensor.device}")
        print(f"  Memory: {tensor.element_size() * tensor.nelement() / 1024 / 1024:.2f} MB")
    
    print("\n✅ Phase 44 Tensor Loader Complete")

if __name__ == '__main__':
    main()
