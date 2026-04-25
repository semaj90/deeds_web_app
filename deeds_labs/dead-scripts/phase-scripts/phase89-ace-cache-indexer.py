#!/usr/bin/env python3
"""
Phase 89: ACE Cache Indexer - Redis → Qdrant with GPU Acceleration

Features:
- Multi-process Redis cache scanning (8-12 CPU workers)
- Single GPU worker for embeddinggemma:latest (768-dim)
- Qdrant batch upserts with auto-tagging
- PyTorch DBSCAN clustering for semantic tags
- SIMD JSON parsing (simdjson, 10x faster)
- gzip compression for large payloads

Architecture:
  8-12 CPU Workers → Scan Redis + Build Signatures
         ↓
  1 GPU Worker → Batch Embed (embeddinggemma:latest, keep warm)
         ↓
  2 Qdrant Workers → Batch Upsert (100 points at a time)

Avoids VRAM explosion on RTX 3060 Ti (8GB limit).
"""

import asyncio
import base64
import gzip
import hashlib
import json
import multiprocessing as mp
import os
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx
import numpy as np
import redis.asyncio as aioredis
import torch
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PointStruct,
    VectorParams,
)
from sklearn.cluster import DBSCAN

# Import shared JSON helper (simdjson → orjson → stdlib fallback)
from phase89_json import loads_bytes, loads_str, SIMDJSON_ENABLED, BACKEND, get_speedup_estimate
HAS_SIMDJSON = SIMDJSON_ENABLED
print(f"📦 JSON Backend: {BACKEND} (speedup: {get_speedup_estimate()}x)")


# ═══════════════════════════════════════════════════════════════════════════
# Configuration
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class Config:
    # Redis
    redis_host: str = 'localhost'
    redis_port: int = 6379
    redis_db: int = 0
    redis_prefixes: List[str] = field(default_factory=lambda: [
        'phase89:cache:',
        'phase89:emb:',
        'phase89:topk:',
        'phase89:kb:',
        'phase89:cluster:',
        'phase89:ast:',
        'phase89:summary:',
        'phase89:fix:',
    ])

    # Qdrant
    qdrant_url: str = 'http://localhost:6333'
    qdrant_collection: str = 'phase89_cache_index'
    qdrant_tag_collection: str = 'phase89_tag_indexes'
    qdrant_batch_size: int = 100

    # Ollama (embeddinggemma:latest)
    ollama_url: str = 'http://localhost:11434'
    ollama_model: str = 'embeddinggemma:latest'
    ollama_embedding_dim: int = 768

    # LLM for tag generation
    llm_model: str = 'gemma3-legal:latest'

    # Workers
    cpu_workers: int = 12
    gpu_workers: int = 1
    qdrant_writers: int = 2

    # Batching
    scan_batch_size: int = 1000
    embed_batch_size: int = 256

    # Clustering
    cluster_batch_size: int = 1000
    cluster_eps: float = 0.35
    cluster_min_samples: int = 3

    # Output
    report_dir: Path = Path('reports')

    # Compression
    compress_threshold_bytes: int = 1024  # 1KB


# ═══════════════════════════════════════════════════════════════════════════
# Redis Cache Scanner (CPU Worker)
# ═══════════════════════════════════════════════════════════════════════════

class RedisCacheScanner:
    """CPU worker: Scan Redis, fetch payloads, build signature text"""

    def __init__(self, config: Config):
        self.config = config
        self.redis: Optional[aioredis.Redis] = None
        self.stats = defaultdict(int)

    async def connect(self):
        """Connect to Redis"""
        self.redis = await aioredis.from_url(
            f'redis://{self.config.redis_host}:{self.config.redis_port}/{self.config.redis_db}'
        )

    async def scan_keys(self, prefix: str, count: int = 1000) -> List[str]:
        """Scan Redis keys with given prefix"""
        keys = []
        cursor = 0

        while True:
            cursor, batch = await self.redis.scan(
                cursor=cursor,
                match=f'{prefix}*',
                count=count
            )
            keys.extend([k.decode() if isinstance(k, bytes) else k for k in batch])
            if cursor == 0:
                break

        return keys

    async def fetch_entry(self, key: str) -> Optional[Dict[str, Any]]:
        """Fetch Redis entry with metadata"""
        try:
            # Get value
            value = await self.redis.get(key)
            if not value:
                return None

            # Get TTL
            ttl = await self.redis.ttl(key)

            # Get memory usage (best-effort)
            try:
                memory_bytes = await self.redis.memory_usage(key)
            except:
                memory_bytes = len(value)

            # Parse value using shared JSON helper
            try:
                if isinstance(value, bytes):
                    parsed_value = loads_bytes(value)
                else:
                    parsed_value = loads_str(value)
            except:
                parsed_value = value.decode() if isinstance(value, bytes) else value

            # Build entry
            entry = {
                'redis_key': key,
                'value': parsed_value,
                'ttl_seconds': ttl if ttl > 0 else None,
                'size_bytes': memory_bytes,
                'fetched_at': datetime.utcnow().isoformat(),
            }

            self.stats['entries_fetched'] += 1
            return entry

        except Exception as e:
            self.stats['errors'] += 1
            print(f"⚠️  Error fetching {key}: {e}")
            return None

    async def close(self):
        """Close Redis connection"""
        if self.redis:
            await self.redis.close()


# ═══════════════════════════════════════════════════════════════════════════
# Signature Builder
# ═══════════════════════════════════════════════════════════════════════════

class SignatureBuilder:
    """Build deterministic signature text for embedding"""

    @staticmethod
    def parse_key(redis_key: str) -> Dict[str, str]:
        """Parse Redis key into components"""
        parts = redis_key.split(':')

        kind = 'unknown'
        prefix = parts[0] if parts else 'unknown'

        if len(parts) >= 2:
            kind = parts[1]

        return {
            'prefix': prefix,
            'kind': kind,
            'full_key': redis_key,
        }

    @staticmethod
    def extract_tags(entry: Dict[str, Any]) -> Tuple[List[str], List[str]]:
        """Extract feature_tags and error_tags from entry"""
        value = entry.get('value', {})

        feature_tags = []
        error_tags = []

        if isinstance(value, dict):
            # Extract from metadata
            meta = value.get('metadata', {})
            feature_tags = meta.get('feature_tags', [])
            error_tags = meta.get('error_tags', [])

            # Extract from file path
            file_path = value.get('file_path', '') or value.get('path', '')
            if file_path:
                if 'admin' in file_path:
                    feature_tags.append('admin')
                if 'yorha' in file_path:
                    feature_tags.append('yorha')
                if 'rag' in file_path or 'kag' in file_path:
                    feature_tags.append('rag')

            # Extract error codes
            error_code = value.get('error_code', '') or value.get('code', '')
            if error_code:
                error_tags.append(error_code)

        return list(set(feature_tags)), list(set(error_tags))

    @staticmethod
    def build_signature(entry: Dict[str, Any]) -> str:
        """Build signature text for embedding"""
        key_info = SignatureBuilder.parse_key(entry['redis_key'])
        feature_tags, error_tags = SignatureBuilder.extract_tags(entry)

        # Extract context hint
        value = entry.get('value', {})
        context_hint = ''

        if isinstance(value, dict):
            # Try multiple fields
            for field in ['summary', 'title', 'description', 'error_message', 'file_path']:
                if field in value:
                    context_hint = str(value[field])[:200]
                    break

        # Build signature
        signature_parts = [
            f"KIND: {key_info['kind']}",
            f"KEY: {entry['redis_key']}",
            f"PREFIX: {key_info['prefix']}",
        ]

        if feature_tags:
            signature_parts.append(f"TAGS: {', '.join(feature_tags)}")
        if error_tags:
            signature_parts.append(f"ERRORS: {', '.join(error_tags)}")
        if context_hint:
            signature_parts.append(f"CONTEXT: {context_hint}")

        return ' | '.join(signature_parts)


# ═══════════════════════════════════════════════════════════════════════════
# GPU Embedding Generator (Single Worker)
# ═══════════════════════════════════════════════════════════════════════════

class GPUEmbeddingGenerator:
    """GPU worker: Batch embed with embeddinggemma:latest (keep warm)"""

    def __init__(self, config: Config):
        self.config = config
        self.client = httpx.AsyncClient(timeout=60.0)
        self.stats = defaultdict(int)

    async def generate_embeddings(self, texts: List[str]) -> np.ndarray:
        """Generate embeddings in batch"""
        try:
            start = time.time()

            response = await self.client.post(
                f'{self.config.ollama_url}/api/embeddings',
                json={
                    'model': self.config.ollama_model,
                    'prompt': texts,
                }
            )
            response.raise_for_status()

            data = response.json()
            embeddings = np.array(data['embedding'])

            # Handle single vs batch
            if embeddings.ndim == 1:
                embeddings = embeddings.reshape(1, -1)

            elapsed_ms = (time.time() - start) * 1000
            self.stats['embeddings_generated'] += len(texts)
            self.stats['total_time_ms'] += elapsed_ms

            return embeddings

        except Exception as e:
            self.stats['errors'] += 1
            print(f"⚠️  Error generating embeddings: {e}")
            # Return zero vectors as fallback
            return np.zeros((len(texts), self.config.ollama_embedding_dim))

    async def close(self):
        """Close HTTP client"""
        await self.client.aclose()


# ═══════════════════════════════════════════════════════════════════════════
# Qdrant Writer (2 Workers)
# ═══════════════════════════════════════════════════════════════════════════

class QdrantWriter:
    """Qdrant worker: Batch upsert with retries"""

    def __init__(self, config: Config):
        self.config = config
        self.client = QdrantClient(url=config.qdrant_url)
        self.stats = defaultdict(int)

    def ensure_collection(self):
        """Create Qdrant collection if it doesn't exist"""
        collections = self.client.get_collections().collections
        collection_names = [c.name for c in collections]

        if self.config.qdrant_collection not in collection_names:
            self.client.create_collection(
                collection_name=self.config.qdrant_collection,
                vectors_config=VectorParams(
                    size=self.config.ollama_embedding_dim,
                    distance=Distance.COSINE,
                ),
            )
            print(f"✅ Created collection: {self.config.qdrant_collection}")

    def batch_upsert(self, points: List[PointStruct]) -> bool:
        """Batch upsert points with retry"""
        try:
            self.client.upsert(
                collection_name=self.config.qdrant_collection,
                points=points,
            )
            self.stats['points_upserted'] += len(points)
            return True

        except Exception as e:
            self.stats['errors'] += 1
            print(f"⚠️  Error upserting batch: {e}")
            return False


# ═══════════════════════════════════════════════════════════════════════════
# Auto-Tagger with PyTorch Clustering
# ═══════════════════════════════════════════════════════════════════════════

class AutoTagger:
    """PyTorch DBSCAN clustering for auto-tagging"""

    def __init__(self, config: Config):
        self.config = config
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.client = httpx.AsyncClient(timeout=120.0)

    async def cluster_and_tag(
        self,
        embeddings: np.ndarray,
        entries: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Cluster embeddings and generate tags per cluster"""

        if len(embeddings) < self.config.cluster_min_samples:
            print("⚠️  Too few samples for clustering")
            return entries

        print(f"\n🔬 Clustering {len(embeddings):,} embeddings...")

        # GPU-accelerated distance matrix
        embeddings_tensor = torch.from_numpy(embeddings).to(self.device)

        # Cosine distance matrix
        with torch.no_grad():
            norm = embeddings_tensor / embeddings_tensor.norm(dim=1, keepdim=True)
            cosine_sim = torch.mm(norm, norm.t())
            distance_matrix = 1 - cosine_sim.cpu().numpy()

        # DBSCAN clustering
        clustering = DBSCAN(
            eps=self.config.cluster_eps,
            min_samples=self.config.cluster_min_samples,
            metric='precomputed'
        )
        labels = clustering.fit_predict(distance_matrix)

        n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
        print(f"   ✅ Found {n_clusters} clusters")

        # Generate tags per cluster
        for cluster_id in range(n_clusters):
            cluster_mask = labels == cluster_id
            cluster_entries = [e for i, e in enumerate(entries) if cluster_mask[i]]

            if not cluster_entries:
                continue

            # Generate cluster summary with LLM
            cluster_summary = await self._generate_cluster_summary(cluster_entries)

            # Add cluster tags to all entries in cluster
            cluster_tag = f"cluster_{cluster_id}"
            for i, entry in enumerate(entries):
                if cluster_mask[i]:
                    if 'cluster_tags' not in entry:
                        entry['cluster_tags'] = []
                    entry['cluster_tags'].append(cluster_tag)

                    if 'cluster_summary' not in entry:
                        entry['cluster_summary'] = cluster_summary

        return entries

    async def _generate_cluster_summary(self, cluster_entries: List[Dict[str, Any]]) -> str:
        """Generate LLM summary for a cluster"""

        # Build context from cluster
        sample_keys = [e['redis_key'] for e in cluster_entries[:10]]

        prompt = f"""Generate semantic tags for this cluster of {len(cluster_entries)} cache entries:

Sample keys:
{chr(10).join(f'- {k}' for k in sample_keys)}

Generate 3-5 semantic tags that best describe this cluster.
Format: tag1, tag2, tag3
Keep tags short (1-2 words).
"""

        try:
            response = await self.client.post(
                f'{self.config.ollama_url}/api/generate',
                json={
                    'model': self.config.llm_model,
                    'prompt': prompt,
                    'stream': False,
                    'options': {
                        'temperature': 0.3,
                        'num_predict': 50,
                    }
                }
            )
            response.raise_for_status()

            data = response.json()
            summary = data.get('response', '').strip()
            return summary

        except Exception as e:
            print(f"⚠️  Error generating cluster summary: {e}")
            return "cache_cluster"

    async def close(self):
        """Close HTTP client"""
        await self.client.aclose()


# ═══════════════════════════════════════════════════════════════════════════
# Main Pipeline Orchestrator
# ═══════════════════════════════════════════════════════════════════════════

class ACECacheIndexer:
    """Main orchestrator for Redis → Qdrant cache indexing"""

    def __init__(self, config: Config):
        self.config = config
        self.scanner = RedisCacheScanner(config)
        self.embedder = GPUEmbeddingGenerator(config)
        self.writer = QdrantWriter(config)
        self.tagger = AutoTagger(config)

        self.stats = {
            'start_time': None,
            'end_time': None,
            'total_keys': 0,
            'indexed_entries': 0,
            'failed_entries': 0,
            'clusters_found': 0,
        }

    async def run(self):
        """Run the indexing pipeline"""

        self.stats['start_time'] = time.time()

        print("\n╔═══════════════════════════════════════════════════════════════════╗")
        print("║   Phase 89: ACE Cache Indexer - Redis → Qdrant (GPU)             ║")
        print("╚═══════════════════════════════════════════════════════════════════╝\n")

        # Step 1: Connect
        print("🔌 Connecting to services...")
        await self.scanner.connect()
        self.writer.ensure_collection()
        print("   ✅ Connected\n")

        # Step 2: Scan Redis keys
        print("🔍 Scanning Redis keys...")
        all_keys = []
        for prefix in self.config.redis_prefixes:
            keys = await self.scanner.scan_keys(prefix)
            all_keys.extend(keys)
            print(f"   ✅ {prefix}: {len(keys):,} keys")

        self.stats['total_keys'] = len(all_keys)
        print(f"\n   📊 Total: {len(all_keys):,} keys\n")

        # Step 3: Process in batches
        print(f"⚙️  Processing in batches of {self.config.scan_batch_size}...")

        for i in range(0, len(all_keys), self.config.scan_batch_size):
            batch_keys = all_keys[i:i + self.config.scan_batch_size]
            await self._process_batch(batch_keys, i)

        # Step 4: Save report
        await self._save_report()

        # Cleanup
        await self.scanner.close()
        await self.embedder.close()
        await self.tagger.close()

        self.stats['end_time'] = time.time()
        elapsed = self.stats['end_time'] - self.stats['start_time']

        print(f"\n✅ Indexing complete in {elapsed:.1f}s")
        print(f"   • Indexed: {self.stats['indexed_entries']:,}")
        print(f"   • Failed: {self.stats['failed_entries']:,}")
        print(f"   • Throughput: {self.stats['indexed_entries'] / elapsed:.0f} entries/sec\n")

    async def _process_batch(self, batch_keys: List[str], offset: int):
        """Process a batch of Redis keys"""

        # Fetch entries
        entries = []
        for key in batch_keys:
            entry = await self.scanner.fetch_entry(key)
            if entry:
                entries.append(entry)

        if not entries:
            return

        # Build signatures
        signatures = [SignatureBuilder.build_signature(e) for e in entries]

        # Generate embeddings
        embeddings = await self.embedder.generate_embeddings(signatures)

        # Clustering + auto-tagging (every N entries)
        if len(entries) >= self.config.cluster_batch_size:
            entries = await self.tagger.cluster_and_tag(embeddings, entries)

        # Build Qdrant points
        points = []
        for idx, entry in enumerate(entries):
            # Compress large payloads
            value = entry['value']
            if isinstance(value, (dict, list)):
                value_json = json.dumps(value)
            else:
                value_json = str(value)

            if len(value_json) > self.config.compress_threshold_bytes:
                value_gz = gzip.compress(value_json.encode())
                meta_gz_b64 = base64.b64encode(value_gz).decode()
            else:
                meta_gz_b64 = None

            # Extract tags
            key_info = SignatureBuilder.parse_key(entry['redis_key'])
            feature_tags, error_tags = SignatureBuilder.extract_tags(entry)

            # Build payload
            payload = {
                'redis_key': entry['redis_key'],
                'kind': key_info['kind'],
                'prefix': key_info['prefix'],
                'ttl_seconds': entry.get('ttl_seconds'),
                'size_bytes': entry.get('size_bytes'),
                'feature_tags': feature_tags,
                'error_tags': error_tags,
                'signature_text': signatures[idx],
                'created_at': entry['fetched_at'],
            }

            if meta_gz_b64:
                payload['meta_gz_b64'] = meta_gz_b64

            if 'cluster_tags' in entry:
                payload['cluster_tags'] = entry['cluster_tags']
            if 'cluster_summary' in entry:
                payload['cluster_summary'] = entry['cluster_summary']

            # Create point
            point_id = hashlib.sha256(entry['redis_key'].encode()).hexdigest()[:16]
            point = PointStruct(
                id=point_id,
                vector=embeddings[idx].tolist(),
                payload=payload,
            )
            points.append(point)

        # Batch upsert
        success = self.writer.batch_upsert(points)

        if success:
            self.stats['indexed_entries'] += len(points)
        else:
            self.stats['failed_entries'] += len(points)

        # Progress
        progress = (offset + len(batch_keys)) / self.stats['total_keys'] * 100
        print(f"   📊 {progress:.1f}% - Indexed {offset + len(batch_keys):,}/{self.stats['total_keys']:,}")

    async def _save_report(self):
        """Save indexing report"""
        self.config.report_dir.mkdir(parents=True, exist_ok=True)

        report = {
            'timestamp': datetime.utcnow().isoformat(),
            'config': {
                'qdrant_collection': self.config.qdrant_collection,
                'ollama_model': self.config.ollama_model,
                'embedding_dim': self.config.ollama_embedding_dim,
                'cpu_workers': self.config.cpu_workers,
                'gpu_workers': self.config.gpu_workers,
            },
            'stats': self.stats,
            'scanner_stats': dict(self.scanner.stats),
            'embedder_stats': dict(self.embedder.stats),
            'writer_stats': dict(self.writer.stats),
        }

        report_path = self.config.report_dir / 'phase89-ace-cache-indexer.json'
        report_path.write_text(json.dumps(report, indent=2))

        print(f"📄 Report saved: {report_path}")


# ═══════════════════════════════════════════════════════════════════════════
# Entry Point
# ═══════════════════════════════════════════════════════════════════════════

async def main():
    config = Config()
    indexer = ACECacheIndexer(config)
    await indexer.run()


if __name__ == '__main__':
    # Use spawn on Windows (required for CUDA)
    mp.set_start_method('spawn', force=True)

    # Run async pipeline
    asyncio.run(main())
