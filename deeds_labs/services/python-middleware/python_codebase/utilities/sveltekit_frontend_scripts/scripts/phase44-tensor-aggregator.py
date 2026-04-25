#!/usr/bin/env python3
"""
Phase 44 CUDA Tensor Aggregator
Loads cached embeddings from Redis and aggregates them into GPU tensors
for fast matrix operations (PCA, clustering, similarity search).

Usage:
    python scripts/phase44-tensor-aggregator.py [--limit 10000] [--output logs/phase44-batch.pt]
"""

import argparse
import json
import os
import time
from typing import List, Optional
from urllib.parse import urlparse, urlunparse
from dotenv import load_dotenv

load_dotenv()

import numpy as np
import redis
import torch
import torch.nn.functional as F
from datetime import datetime
from pathlib import Path
from tqdm import tqdm


class CUDATensorStore:
    """GPU-resident tensor store with optional CUDA graph capture."""

    def __init__(
        self,
        dim: int,
        dtype: torch.dtype = torch.float16,
        device: Optional[str] = None,
        capture_graph: bool = False,
        graph_batch_size: Optional[int] = None,
    ):
        self.dim = dim
        self.dtype = dtype
        self.device = torch.device(device or ('cuda' if torch.cuda.is_available() else 'cpu'))
        self.capture_graph = capture_graph and self.device.type == 'cuda'
        self.graph_batch_size = graph_batch_size

        self.vectors: Optional[torch.Tensor] = None
        self.metadata: List[dict] = []

        # CUDA graph internals
        self._graph: Optional[torch.cuda.CUDAGraph] = None
        self._graph_in: Optional[torch.Tensor] = None
        self._graph_out: Optional[torch.Tensor] = None
        self._normalized_vectors: Optional[torch.Tensor] = None

    def build_from(self, tensors: List[torch.Tensor], metadata: List[dict]) -> torch.Tensor:
        if not tensors:
            raise ValueError("No tensors supplied to CUDA store")
        cpu_tensor = torch.stack([t.to('cpu', dtype=self.dtype) for t in tensors], dim=0)
        # Ensure the store knows the actual embedding dimensionality from the data
        if cpu_tensor.dim() != 2:
            raise ValueError("Expected 2D tensor stack (N x D) from input tensors")
        actual_dim = cpu_tensor.size(1)
        self.dim = actual_dim
        if self.device.type == 'cuda':
            cpu_tensor = cpu_tensor.pin_memory()
            self.vectors = cpu_tensor.to(self.device, non_blocking=True)
        else:
            self.vectors = cpu_tensor

        self.metadata = metadata
        self._normalized_vectors = F.normalize(self.vectors, dim=1)

        if self.capture_graph and self.graph_batch_size:
            self._capture_similarity_graph(self.graph_batch_size)

        return self.vectors

    def _capture_similarity_graph(self, batch_size: int) -> None:
        if self.device.type != 'cuda' or self.vectors is None:
            return

        batch_size = max(1, batch_size)
        self.graph_batch_size = batch_size
        # graph_in shape: (batch_size, embedding_dim)
        self._graph_in = torch.empty((batch_size, self.dim), device=self.device, dtype=self.dtype)
        # graph_out shape: (batch_size, num_vectors)
        self._graph_out = torch.empty(
            (batch_size, self.vectors.size(0)), device=self.device, dtype=self.dtype
        )

        # Warm up cuBLAS/cuDNN context to avoid CUBLAS_STATUS_NOT_INITIALIZED
        try:
            warm_q = torch.randn((1, self.dim), device=self.device, dtype=self.dtype)
            # small warm-up matmul
            _ = torch.matmul(F.normalize(warm_q, dim=1), self._normalized_vectors.T[:1])
        except Exception:
            # Non-fatal: continue to attempt graph capture
            pass

        try:
            # Force deterministic/safe CUDA/cuDNN config for capture to reduce invalidation
            prev_allow_tf32 = getattr(torch.backends.cuda.matmul, 'allow_tf32', None)
            prev_cudnn_benchmark = torch.backends.cudnn.benchmark
            prev_cudnn_deterministic = torch.backends.cudnn.deterministic

            try:
                if prev_allow_tf32 is not None:
                    torch.backends.cuda.matmul.allow_tf32 = False
                torch.backends.cudnn.benchmark = False
                torch.backends.cudnn.deterministic = True

                # synchronize before capture
                torch.cuda.synchronize()

                graph = torch.cuda.CUDAGraph()

                # Use an explicit micro-capture around the pure matmul on a dedicated stream.
                # Capturing only the matmul reduces the chance of graph invalidation on
                # Ampere/Turing drivers compared to capturing larger contexts.
                try:
                    stream = torch.cuda.Stream()
                    with torch.cuda.stream(stream):
                        # Begin capture, perform the minimal ops, then end capture.
                        graph.capture_begin()
                        q_norm = F.normalize(self._graph_in, dim=1)
                        out = torch.matmul(q_norm, self._normalized_vectors.T)
                        self._graph_out.copy_(out)
                        graph.capture_end()

                    # Ensure capture finished and is visible to default stream
                    torch.cuda.synchronize()
                    self._graph = graph
                except Exception as e:
                    # If the micro-capture fails, disable capture gracefully and try to clean up CUDA state
                    print(f"⚠️  CUDA graph micro-capture failed: {e}. Disabling capture for this store.")
                    try:
                        torch.cuda.synchronize()
                        torch.cuda.empty_cache()
                    except Exception:
                        pass
                    self._graph = None
                    self.capture_graph = False
            finally:
                # restore previous global flags
                try:
                    if prev_allow_tf32 is not None:
                        torch.backends.cuda.matmul.allow_tf32 = prev_allow_tf32
                except Exception:
                    pass
                try:
                    torch.backends.cudnn.benchmark = prev_cudnn_benchmark
                    torch.backends.cudnn.deterministic = prev_cudnn_deterministic
                except Exception:
                    pass
        except Exception as e:
            # If graph capture fails (common on some drivers), disable capture gracefully
            print(f"⚠️  CUDA graph capture failed: {e}. Disabling capture for this store.")
            # Attempt cleanup to avoid captured-state invalidation affecting subsequent CUDA ops
            try:
                torch.cuda.synchronize()
                torch.cuda.empty_cache()
            except Exception:
                pass
            self._graph = None
            self.capture_graph = False

    def run_similarity_graph(self, queries: torch.Tensor) -> torch.Tensor:
        if not self._graph or self._graph_in is None or self._graph_out is None:
            raise RuntimeError("CUDA graph has not been captured for this store")
        # Expect queries to be 2D: (batch, dim)
        if queries.ndim != 2 or queries.shape[1] != self.dim:
            raise ValueError(f"Expected queries shape (batch,{self.dim}), got {tuple(queries.shape)}")
        if queries.shape[0] > self._graph_in.shape[0]:
            raise ValueError("Query batch larger than captured CUDA graph batch size")

        batch_n = queries.shape[0]
        self._graph_in[:batch_n].copy_(queries.to(self.device, dtype=self.dtype))
        self._graph.replay()
        return self._graph_out[:batch_n].clone()

    def similarity(self, queries: torch.Tensor) -> torch.Tensor:
        if self.vectors is None:
            raise RuntimeError("Tensor store is empty")

        queries = queries.to(self.device, dtype=self.dtype)
        q_norm = F.normalize(queries, dim=1)
        return torch.matmul(q_norm, self._normalized_vectors.T)

    def benchmark_graph(self, batch_size: int, iters: int) -> float:
        if self.device.type != 'cuda':
            raise RuntimeError("CUDA graph benchmarking requires a CUDA device")
        if self.vectors is None:
            raise RuntimeError("Tensor store has no vectors to benchmark")

        requested_batch = max(1, batch_size)
        if (
            self._graph_in is None
            or self._graph_in.shape[0] < requested_batch
            or self._graph is None
        ):
            self._capture_similarity_graph(requested_batch)

        dummy_queries = torch.randn(
            (requested_batch, self.dim), device=self.device, dtype=self.dtype
        )

        torch.cuda.synchronize()
        start = time.perf_counter()
        for _ in range(max(1, iters)):
            self.run_similarity_graph(dummy_queries)
        torch.cuda.synchronize()

        elapsed = time.perf_counter() - start
        return elapsed / max(1, iters)


class CUDATensorAggregator:
    def __init__(
        self,
        redis_url='redis://localhost:6379',
        redis_password: Optional[str] = None, # Add redis_password parameter
        device='cuda',
        embedding_dim=384,
        verbose: bool = True,
        store: Optional[CUDATensorStore] = None
    ):
        self.host = 'localhost'
        self.port = 6379

        # Parse the redis_url to extract host and port
        parsed_url = urlparse(redis_url)

        if parsed_url.hostname:
            self.host = parsed_url.hostname
        if parsed_url.port:
            self.port = parsed_url.port

        # Use provided redis_password, or fall back to environment variable
        password = redis_password or os.getenv('REDIS_PASSWORD')

        # Initialize Redis connection. Try a ping; if Redis returns AuthenticationError,
        # attempt a retry using REDIS_PASSWORD from environment (if available).
        self.redis = redis.Redis(
            host=self.host,
            port=self.port,
            password=password,
            decode_responses=False,
            socket_connect_timeout=5,
        )

        try:
            # First try: ping with the provided password (may be None)
            self.redis.ping()
            print("✅ Connected to Redis (auth OK)")
        except redis.exceptions.AuthenticationError:
            # If auth error and environment has password, retry explicitly
            env_pw = os.getenv('REDIS_PASSWORD')
            if env_pw and env_pw != password:
                print("⚠️  Redis requires authentication. Retrying with REDIS_PASSWORD from env...")
                try:
                    self.redis = redis.Redis(
                        host=self.host,
                        port=self.port,
                        password=env_pw,
                        decode_responses=False,
                        socket_connect_timeout=5,
                    )
                    self.redis.ping()
                    print("✅ Connected to Redis using REDIS_PASSWORD from environment.")
                except redis.exceptions.AuthenticationError:
                    raise RuntimeError("Redis authentication failed with REDIS_PASSWORD from environment.")
                except Exception as e:
                    print(f"⚠️  Redis connection error after retry: {e}")
                    raise
            else:
                raise RuntimeError("Redis authentication required but no REDIS_PASSWORD set in environment.")
        except Exception as e:
            print(f"⚠️  Redis connection error: {e}")
            raise

        self.device = torch.device(device if torch.cuda.is_available() else 'cpu')
        self.embedding_dim = embedding_dim  # Memory-optimized 384d
        self.verbose = verbose
        self.store = store or CUDATensorStore(dim=embedding_dim, device=self.device.type, dtype=torch.float16)

        if self.device.type == 'cuda':
            print(f"✅ CUDA available: {torch.cuda.get_device_name(0)}")
            print(f"   Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
            print(f"   Embedding dimensions: {self.embedding_dim}\n")
        else:
            print(f"⚠️  CUDA not available, using CPU")
            print(f"   Embedding dimensions: {self.embedding_dim}\n")

    def load_embeddings_from_redis(self, pattern='ai:embedding:*', limit=None):
        """Load embeddings from Redis cache into GPU tensors"""
        print(f"🔍 Scanning Redis for pattern: {pattern}")

        keys = []
        for key in self.redis.scan_iter(pattern):
            if isinstance(key, (bytes, bytearray)):
                keys.append(key.decode())
            else:
                keys.append(str(key))
            if limit and len(keys) >= limit:
                break

        print(f"🧮 Loaded {len(keys)} embeddings ({self.embedding_dim} dims)\n")

        tensors = []
        metadata = []

        print("📥 Loading embeddings to GPU...")
        for key in tqdm(keys):
            try:
                data = self.redis.hgetall(key)

                if b'vector' not in data:
                    continue

                # Parse vector
                raw_vector = data.get(b'vector', data.get('vector'))
                if isinstance(raw_vector, (bytes, bytearray)):
                    vector_payload = raw_vector.decode()
                else:
                    vector_payload = str(raw_vector)
                vector = json.loads(vector_payload)

                # Convert to tensor and leave on CPU; store promotes to GPU with pinning
                tensor = torch.tensor(vector, dtype=self.store.dtype, device='cpu')
                tensors.append(tensor)

                # Store metadata
                metadata.append({
                    'id': key.decode() if isinstance(key, (bytes, bytearray)) else str(key),
                    'summary': (data.get(b'summary') or data.get('summary', b'')).decode() if isinstance(data.get(b'summary') or data.get('summary', b''), (bytes, bytearray)) else str(data.get(b'summary') or data.get('summary', '')),
                    'file': (data.get(b'file') or data.get('file', b'')).decode() if isinstance(data.get(b'file') or data.get('file', b''), (bytes, bytearray)) else str(data.get(b'file') or data.get('file', '')),
                    'line': (data.get(b'line') or data.get('line', b'')).decode() if isinstance(data.get(b'line') or data.get('line', b''), (bytes, bytearray)) else str(data.get(b'line') or data.get('line', '')),
                    'timestamp': (data.get(b'timestamp') or data.get('timestamp', b'')).decode() if isinstance(data.get(b'timestamp') or data.get('timestamp', b''), (bytes, bytearray)) else str(data.get(b'timestamp') or data.get('timestamp', ''))
                })

            except Exception as e:
                print(f"⚠️  Error loading {key}: {e}")
                continue

        if not tensors:
            raise ValueError("No valid embeddings found in Redis")

        # Ensure all tensors share the same dimensionality (mixed runs can leave stale cache entries)
        filtered_tensors: list[torch.Tensor] = []
        expected_dim: Optional[int] = None

        for tensor in tensors:
            current_dim = tensor.shape
            if expected_dim is None:
                expected_dim = current_dim
                filtered_tensors.append(tensor)
                continue

            if current_dim != expected_dim:
                if getattr(self, 'verbose', False):
                    print(
                        f"⚠️  Skipping embedding with dimensionality {current_dim} "
                        f"(expected {expected_dim}). Redis key may be stale."
                    )
                continue

            filtered_tensors.append(tensor)

        if not filtered_tensors:
            raise ValueError("No embeddings matched the expected dimensionality.")

        # Stack into matrix
        embedding_matrix = self.store.build_from(filtered_tensors, metadata)

        print(f"\n✅ Loaded tensor matrix: {embedding_matrix.shape}")
        print(f"   Dtype: {embedding_matrix.dtype}")
        print(f"   Device: {embedding_matrix.device}")
        print(f"   Memory: {embedding_matrix.element_size() * embedding_matrix.nelement() / 1e6:.2f} MB\n")

        return embedding_matrix, metadata

    def compute_statistics(self, embedding_matrix):
        """Compute GPU-accelerated statistics"""
        print("📊 Computing statistics on GPU...")

        try:
            stats = {
                'mean': torch.mean(embedding_matrix, dim=0),
                'std': torch.std(embedding_matrix, dim=0),
                # torch.min/torch.max with dim returns (values, indices); take values
                'min': torch.min(embedding_matrix, dim=0)[0],
                'max': torch.max(embedding_matrix, dim=0)[0],
            }
        except Exception as exc:
            # If CUDA state is tainted (common after failed graph capture), fallback to CPU
            print(f"⚠️  GPU stats computation failed ({exc}), falling back to CPU computations.")
            cpu_emb = embedding_matrix.detach().cpu()
            stats = {
                'mean': torch.mean(cpu_emb, dim=0),
                'std': torch.std(cpu_emb, dim=0),
                'min': torch.min(cpu_emb, dim=0)[0],
                'max': torch.max(cpu_emb, dim=0)[0],
            }

        print(f"   Mean vector shape: {stats['mean'].shape}")
        print(f"   Std vector shape: {stats['std'].shape}")

        return stats

    def compute_similarity_matrix(self, embedding_matrix):
        """Compute pairwise cosine similarity matrix on GPU"""
        print("🔢 Computing similarity matrix (GPU-accelerated)...")

        try:
            # Normalize vectors
            norms = torch.norm(embedding_matrix, dim=1, keepdim=True)
            normalized = embedding_matrix / norms

            # Compute similarity (matrix multiplication on GPU)
            similarity = torch.mm(normalized, normalized.t())
        except Exception as exc:
            print(f"⚠️  GPU similarity computation failed ({exc}), falling back to CPU computation.")
            cpu_emb = embedding_matrix.detach().cpu()
            norms = torch.norm(cpu_emb, dim=1, keepdim=True)
            normalized = cpu_emb / norms
            similarity = torch.mm(normalized, normalized.t())

        print(f"   Similarity matrix shape: {similarity.shape}")
        print(f"   Memory: {similarity.element_size() * similarity.nelement() / 1e6:.2f} MB\n")

        return similarity

    def find_clusters(self, embedding_matrix, n_clusters=10):
        """Simple k-means clustering on GPU"""
        print(f"🎯 Finding {n_clusters} clusters (GPU-accelerated)...")

        from sklearn.cluster import KMeans
        # Move to CPU for sklearn (or use torch-based clustering)
        embeddings_cpu = embedding_matrix.cpu().numpy()

        kmeans = KMeans(n_clusters=n_clusters, random_state=42)
        labels = kmeans.fit_predict(embeddings_cpu)

        print(f"   Cluster distribution:")
        unique, counts = np.unique(labels, return_counts=True)
        for cluster_id, count in zip(unique, counts):
            print(f"     Cluster {cluster_id}: {count} points")

        return labels, kmeans.cluster_centers_

    def save_tensors(self, embedding_matrix, metadata, output_path, stats=None, similarity=None):
        """Save tensors to disk for later use"""
        print(f"\n💾 Saving tensors to: {output_path}")

        save_data = {
            'embedding_matrix': embedding_matrix.cpu(),
            'metadata': metadata,
            'timestamp': datetime.now().isoformat(),
            'shape': list(embedding_matrix.shape),
            'dtype': str(embedding_matrix.dtype)
        }

        if stats:
            # Ensure stats values are CPU tensors or serializable values
            safe_stats = {}
            for k, v in stats.items():
                try:
                    if isinstance(v, torch.Tensor):
                        safe_stats[k] = v.detach().cpu()
                    else:
                        # Try to convert numpy or python numbers to tensor
                        try:
                            safe_stats[k] = torch.tensor(v).cpu()
                        except Exception:
                            safe_stats[k] = v
                except Exception:
                    safe_stats[k] = v
            save_data['stats'] = safe_stats

        if similarity is not None:
            # Save only summary stats, full matrix is huge
            save_data['similarity_summary'] = {
                'mean': similarity.mean().item(),
                'std': similarity.std().item(),
                'min': similarity.min().item(),
                'max': similarity.max().item()
            }

        torch.save(save_data, output_path)

        # Save metadata as JSON
        json_path = Path(output_path).with_suffix('.meta.json')
        with open(json_path, 'w') as f:
            json.dump({
                'count': len(metadata),
                'timestamp': save_data['timestamp'],
                'shape': save_data['shape'],
                'samples': metadata[:10]  # First 10 samples
            }, f, indent=2)

        print(f"✅ Saved tensor: {output_path}")
        print(f"✅ Saved metadata: {json_path}\n")

    def generate_summary_report(self, embedding_matrix, metadata, stats, output_dir):
        """Generate markdown summary report"""
        report_path = Path(output_dir) / 'phase44-summary.md'

        with open(report_path, 'w') as f:
            f.write("# Phase 44 CUDA Tensor Analysis Report\n\n")
            f.write(f"**Generated:** {datetime.now().isoformat()}\n\n")

            f.write("## Tensor Statistics\n\n")
            f.write(f"- **Total Embeddings:** {len(metadata):,}\n")
            f.write(f"- **Tensor Shape:** {list(embedding_matrix.shape)}\n")
            f.write(f"- **Data Type:** {embedding_matrix.dtype}\n")
            f.write(f"- **Device:** {embedding_matrix.device}\n")
            f.write(f"- **Memory Usage:** {embedding_matrix.element_size() * embedding_matrix.nelement() / 1e6:.2f} MB\n\n")

            f.write("## Embedding Statistics\n\n")
            f.write(f"- **Mean (first 5 dims):** {stats['mean'][:5].cpu().tolist()}\n")
            f.write(f"- **Std (first 5 dims):** {stats['std'][:5].cpu().tolist()}\n")
            f.write(f"- **Min:** {stats['min'].min().item():.4f}\n")
            f.write(f"- **Max:** {stats['max'].max().item():.4f}\n\n")

            f.write("## File Distribution\n\n")
            files = [m['file'] for m in metadata if m['file']]
            if files:
                file_counts = {}
                for file in files:
                    file_counts[file] = file_counts.get(file, 0) + 1

                sorted_files = sorted(file_counts.items(), key=lambda x: x, reverse=True)
                f.write("| File | Count |\n")
                f.write("|------|-------|\n")
                for file, count in sorted_files[:20]:
                    f.write(f"| {file} | {count} |\n")

        print(f"✅ Summary report: {report_path}\n")


def main():
    parser = argparse.ArgumentParser(description='Phase 44 CUDA Tensor Aggregator')
    parser.add_argument('--limit', type=int, default=10000, help='Max embeddings to load')
    parser.add_argument('--output', default='logs/phase44-batch.pt', help='Output tensor file')
    parser.add_argument('--redis-url', default='redis://localhost:6379', help='Redis URL')
    parser.add_argument('--embedding-dim', type=int, default=384, help='Embedding dimensions (384 or 768)')
    parser.add_argument('--compute-similarity', action='store_true', help='Compute similarity matrix')
    parser.add_argument('--cluster', type=int, help='Number of clusters for k-means')
    parser.add_argument('--persist-store', action='store_true', help='Persist the GPU tensor store to disk')
    parser.add_argument('--store-path', default='logs/phase44-cache.pt', help='Path for persisted tensor store')
    parser.add_argument(
        '--store-dtype',
        default='fp16',
        choices=['fp16', 'float16', 'bf16', 'bfloat16', 'fp32', 'float32'],
        help='Tensor dtype used for the resident store',
    )
    parser.add_argument('--capture-graph', action='store_true', help='(deprecated) Capture CUDA graph for similarity batches (kept for backward compatibility)')
    parser.add_argument('--enable-graph-capture', action='store_true', help='Explicit opt-in to capture CUDA graphs for similarity batches')
    parser.add_argument('--graph-batch-size', type=int, default=256, help='Batch size for CUDA graph capture')
    parser.add_argument('--benchmark-graph', action='store_true', help='Benchmark CUDA graph replays')
    parser.add_argument('--benchmark-iters', type=int, default=25, help='Iterations to average during benchmark')
    parser.add_argument(
        '--benchmark-batch-size',
        type=int,
        default=256,
        help='Batch size to use when benchmarking CUDA graphs',
    )

    args = parser.parse_args()

    print("╔════════════════════════════════════════════════════════╗")
    print("║        PHASE 44 CUDA TENSOR AGGREGATION                ║")
    print("╚════════════════════════════════════════════════════════╝\n")

    dtype_map = {
        'fp16': torch.float16,
        'float16': torch.float16,
        'bf16': torch.bfloat16,
        'bfloat16': torch.bfloat16,
        'fp32': torch.float32,
        'float32': torch.float32,
    }

    store_device = 'cuda' if torch.cuda.is_available() else 'cpu'
    # Make graph capture opt-in. Keep --capture-graph for backward compatibility
    capture_flag = bool(args.capture_graph or args.enable_graph_capture or args.benchmark_graph)
    graph_batch = args.graph_batch_size
    if args.benchmark_graph:
        graph_batch = max(graph_batch, args.benchmark_batch_size)

    tensor_store = CUDATensorStore(
        dim=args.embedding_dim,
        dtype=dtype_map[args.store_dtype],
        device=store_device,
        capture_graph=capture_flag,
        graph_batch_size=graph_batch if capture_flag else None,
    )

    aggregator = CUDATensorAggregator(
        redis_url=args.redis_url,
        redis_password=os.getenv('REDIS_PASSWORD'), # Pass password explicitly
        embedding_dim=args.embedding_dim,
        store=tensor_store,
    )

    # Load embeddings
    embedding_matrix, metadata = aggregator.load_embeddings_from_redis(limit=args.limit)

    # Compute statistics
    stats = aggregator.compute_statistics(embedding_matrix)

    # Optional: compute similarity matrix
    similarity = None
    if args.compute_similarity:
        similarity = aggregator.compute_similarity_matrix(embedding_matrix)

    # Optional: clustering
    if args.cluster:
        labels, centers = aggregator.find_clusters(embedding_matrix, n_clusters=args.cluster)
        # Add cluster labels to metadata
        for i, label in enumerate(labels):
            metadata[i]['cluster'] = int(label)

    # Save tensors
    output_dir = Path(args.output).parent
    output_dir.mkdir(parents=True, exist_ok=True)

    aggregator.save_tensors(embedding_matrix, metadata, args.output, stats, similarity)

    if args.benchmark_graph:
        try:
            avg_seconds = aggregator.store.benchmark_graph(
                batch_size=args.benchmark_batch_size,
                iters=args.benchmark_iters,
            )
            print(
                f"⚡ CUDA graph replay avg: {avg_seconds * 1e3:.3f} ms "
                f"({args.benchmark_batch_size}×{args.embedding_dim}, {args.benchmark_iters} iters)"
            )
        except RuntimeError as exc:
            print(f"⚠️  CUDA graph benchmark skipped: {exc}")

    if args.persist_store:
        store_path = Path(args.store_path)
        store_path.parent.mkdir(parents=True, exist_ok=True)
        snapshot = {
            'vectors': aggregator.store.vectors.detach().cpu(),
            'metadata': aggregator.store.metadata,
            'dtype': str(aggregator.store.dtype),
            'dim': aggregator.store.dim,
            'timestamp': datetime.now().isoformat(),
        }
        torch.save(snapshot, store_path)
        print(f"✅ Aggregation complete — persisted {store_path}")

    # Generate report
    aggregator.generate_summary_report(embedding_matrix, metadata, stats, output_dir)

    print("✅ Phase 44 tensor aggregation complete!\n")


if __name__ == '__main__':
    main()
