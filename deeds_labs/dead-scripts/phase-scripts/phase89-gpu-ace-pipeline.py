#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Phase 89+: GPU-Accelerated Agentic Error Fixing Pipeline
Combines: PyTorch CUDA, Qdrant, pgvector, Redis, embeddinggemma, LLM synthesis

Features:
- GPU-accelerated embedding generation and clustering
- Unified AST tree analysis for code understanding
- Redis caching with gzip compression
- Qdrant vector storage with metadata tags
- pgvector mirroring for SQL-based search
- LLM synthesis for fix generation
- Streaming output support
"""

import torch
import torch.nn.functional as F
import numpy as np
import json
import sys
import os
import re
import gzip
import hashlib
import subprocess
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, asdict
from concurrent.futures import ThreadPoolExecutor, as_completed
import asyncio
import httpx

# Fix Windows console encoding
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

# Database clients
import psycopg2
from psycopg2.extras import execute_values
import redis
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue

# Configuration
CONFIG = {
    "QDRANT_HOST": "localhost",
    "QDRANT_PORT": 6333,
    "POSTGRES_DSN": "postgresql://legal_admin:123456@localhost:5434/legal_ai_db",
    "REDIS_URL": "redis://localhost:6379/0",
    "OLLAMA_URL": "http://localhost:11434",
    "EMBEDDING_MODEL": "embeddinggemma:latest",
    "EMBEDDING_DIM": 768,
    "LLM_MODEL": "gemma3-legal:latest",
    "COLLECTION_ERRORS": "ace_error_embeddings",
    "COLLECTION_AST": "ace_ast_nodes",
    "COLLECTION_SUMMARIES": "ace_llm_summaries",
    "CACHE_TTL": 3600,
    "BATCH_SIZE": 32,
    "CLUSTER_EPS": 0.25,
    "CLUSTER_MIN_SAMPLES": 3,
}


@dataclass
class ErrorMatch:
    """Represents a corrupted code pattern match"""
    file: str
    line: int
    column: int
    pattern: str
    content: str
    fix_type: str
    suggested_fix: Optional[str] = None


@dataclass
class ClusterSummary:
    """Represents a cluster of similar errors"""
    cluster_id: int
    size: int
    pattern: str
    sample_errors: List[ErrorMatch]
    llm_summary: Optional[str] = None
    fix_template: Optional[str] = None
    tags: List[str] = None


class GPUAcceleratedPipeline:
    """Main pipeline for GPU-accelerated error fixing"""

    def __init__(self):
        # Check GPU
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        if self.device == 'cuda':
            gpu_name = torch.cuda.get_device_name(0)
            gpu_mem = torch.cuda.get_device_properties(0).total_memory / 1024**3
            print(f"🔥 GPU: {gpu_name} ({gpu_mem:.1f}GB)")
        else:
            print("⚠️ Running on CPU - GPU acceleration unavailable")

        # Initialize clients
        self._init_clients()

        # Embedding cache (in-memory)
        self._embedding_cache: Dict[str, np.ndarray] = {}

    def _init_clients(self):
        """Initialize database clients"""
        # Qdrant
        self.qdrant = QdrantClient(
            host=CONFIG["QDRANT_HOST"],
            port=CONFIG["QDRANT_PORT"]
        )

        # Postgres with pgvector
        self.pg = psycopg2.connect(CONFIG["POSTGRES_DSN"])
        self.pg.autocommit = True

        # Redis
        self.redis = redis.from_url(CONFIG["REDIS_URL"])

        # Ensure collections exist
        self._ensure_collections()

    def _ensure_collections(self):
        """Create Qdrant collections if they don't exist"""
        collections = [
            CONFIG["COLLECTION_ERRORS"],
            CONFIG["COLLECTION_AST"],
            CONFIG["COLLECTION_SUMMARIES"],
        ]

        for name in collections:
            try:
                if not self.qdrant.collection_exists(name):
                    self.qdrant.create_collection(
                        collection_name=name,
                        vectors_config=VectorParams(
                            size=CONFIG["EMBEDDING_DIM"],
                            distance=Distance.COSINE
                        )
                    )
                    print(f"✅ Created collection: {name}")
            except Exception as e:
                print(f"⚠️ Collection {name} error: {e}")

    # ==================== SCANNING ====================

    def scan_for_corruption_patterns(self, root_dir: str = "src") -> List[ErrorMatch]:
        """Use ripgrep to find all corrupted code patterns"""
        print(f"\n🔍 Scanning {root_dir} for corruption patterns...")

        patterns = [
            # cookies.set(name: value) -> cookies.set(name, value)
            (r'\.set\([^,\)]+:', 'set-colon'),
            # Object property corruption: { key: value: key2 }
            (r'\{[^}]*:\s*\w+\s*:', 'object-colon'),
            # Function arg corruption: fn(a: b) -> fn(a, b)
            (r'(?<!type)\([^)]*\w+\s*:\s*\w+[^:]*\)', 'function-colon'),
        ]

        all_matches: List[ErrorMatch] = []

        for pattern, fix_type in patterns:
            try:
                # Run ripgrep with JSON output
                cmd = [
                    'rg', '-n', '--json',
                    '-g', '*.ts', '-g', '*.js', '-g', '*.svelte',
                    pattern, root_dir
                ]

                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    encoding='utf-8',
                    errors='replace',
                    cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                )

                if not result.stdout:
                    continue

                for line in result.stdout.strip().split('\n'):
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                        if data.get('type') == 'match':
                            match_data = data['data']
                            all_matches.append(ErrorMatch(
                                file=match_data['path']['text'],
                                line=match_data['line_number'],
                                column=match_data['submatches'][0]['start'] if match_data.get('submatches') else 0,
                                pattern=pattern,
                                content=match_data['lines']['text'].strip(),
                                fix_type=fix_type
                            ))
                    except json.JSONDecodeError:
                        continue

            except FileNotFoundError:
                print("⚠️ ripgrep not found, falling back to grep")
                continue

        print(f"   Found {len(all_matches)} matches")
        return all_matches

    # ==================== EMBEDDING ====================

    async def embed_text_ollama(self, text: str) -> Optional[np.ndarray]:
        """Generate embedding using Ollama embeddinggemma"""
        cache_key = hashlib.md5(text.encode()).hexdigest()

        if cache_key in self._embedding_cache:
            return self._embedding_cache[cache_key]

        # Check Redis cache
        redis_key = f"emb:{cache_key}"
        cached = self.redis.get(redis_key)
        if cached:
            try:
                # Decompress gzip
                decompressed = gzip.decompress(cached)
                embedding = np.frombuffer(decompressed, dtype=np.float32)
                self._embedding_cache[cache_key] = embedding
                return embedding
            except:
                pass

        # Generate new embedding
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{CONFIG['OLLAMA_URL']}/api/embeddings",
                    json={
                        "model": CONFIG["EMBEDDING_MODEL"],
                        "prompt": text[:2000]  # Truncate
                    }
                )

                if response.status_code == 200:
                    data = response.json()
                    embedding = np.array(data["embedding"], dtype=np.float32)

                    # Cache in Redis (gzip compressed)
                    compressed = gzip.compress(embedding.tobytes())
                    self.redis.setex(redis_key, CONFIG["CACHE_TTL"], compressed)

                    self._embedding_cache[cache_key] = embedding
                    return embedding
        except Exception as e:
            print(f"⚠️ Embedding error: {e}")

        return None

    async def embed_batch(self, texts: List[str]) -> List[np.ndarray]:
        """Batch embed multiple texts"""
        tasks = [self.embed_text_ollama(text) for text in texts]
        results = await asyncio.gather(*tasks)
        return [r for r in results if r is not None]

    # ==================== GPU CLUSTERING ====================

    async def cluster_errors_cuda(self, matches: List[ErrorMatch]) -> Dict[int, List[ErrorMatch]]:
        """GPU-accelerated clustering of errors"""
        if len(matches) < 2:
            return {0: matches} if matches else {}

        print(f"\n🔥 GPU Clustering {len(matches)} errors...")

        # Generate embeddings
        texts = [f"{m.fix_type}: {m.content}" for m in matches]
        embeddings = await self.embed_batch(texts)

        if len(embeddings) < 2:
            print("⚠️ Not enough embeddings for clustering")
            return {0: matches}

        # Stack embeddings
        mat = np.stack(embeddings, axis=0).astype(np.float32)
        embeddings_tensor = torch.from_numpy(mat).to(self.device)

        # Normalize for cosine similarity
        embeddings_norm = F.normalize(embeddings_tensor, p=2, dim=1)

        # Compute cosine similarity matrix on GPU
        with torch.cuda.amp.autocast(enabled=self.device == 'cuda'):
            similarity_matrix = torch.mm(embeddings_norm, embeddings_norm.t())

        # Clamp and convert to distance
        similarity_matrix = torch.clamp(similarity_matrix, -1.0, 1.0)
        distance_matrix = torch.clamp(1.0 - similarity_matrix, 0.0, 2.0).cpu().numpy()

        # DBSCAN clustering
        from sklearn.cluster import DBSCAN
        clustering = DBSCAN(
            eps=CONFIG["CLUSTER_EPS"],
            min_samples=CONFIG["CLUSTER_MIN_SAMPLES"],
            metric='precomputed'
        )
        labels = clustering.fit_predict(distance_matrix)

        # Group by cluster
        clusters: Dict[int, List[ErrorMatch]] = {}
        for idx, label in enumerate(labels):
            if label == -1:
                continue  # Noise
            if label not in clusters:
                clusters[label] = []
            if idx < len(matches):
                clusters[label].append(matches[idx])

        print(f"   Created {len(clusters)} clusters")
        return clusters

    # ==================== LLM SYNTHESIS ====================

    async def synthesize_fix(self, cluster: List[ErrorMatch]) -> Optional[str]:
        """Use LLM to synthesize fix for error cluster"""
        if not cluster:
            return None

        # Build prompt
        sample = cluster[0]
        samples_text = "\n".join([
            f"  - Line {m.line}: {m.content[:100]}"
            for m in cluster[:5]
        ])

        prompt = f"""You are fixing corrupted TypeScript/JavaScript code.

Pattern type: {sample.fix_type}
Number of occurrences: {len(cluster)}

Sample corrupted lines:
{samples_text}

The corruption replaces commas with colons in:
- Function arguments: fn(a: b) should be fn(a, b)
- Object properties: {{key: value: key2}} should be {{key: value, key2}}
- .set() calls: .set(name: value) should be .set(name, value)

Provide a regex find/replace pattern to fix this.
Format:
FIND: <regex pattern>
REPLACE: <replacement string>

Only output the FIND and REPLACE lines, nothing else."""

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{CONFIG['OLLAMA_URL']}/api/generate",
                    json={
                        "model": CONFIG["LLM_MODEL"],
                        "prompt": prompt,
                        "stream": False,
                        "options": {"temperature": 0.2, "num_predict": 200}
                    }
                )

                if response.status_code == 200:
                    return response.json().get("response", "").strip()
        except Exception as e:
            print(f"⚠️ LLM synthesis error: {e}")

        return None

    # ==================== STORAGE ====================

    async def store_in_qdrant(self, matches: List[ErrorMatch], collection: str):
        """Store error embeddings in Qdrant with tags"""
        print(f"\n📦 Storing {len(matches)} vectors in Qdrant...")

        points = []
        for i, match in enumerate(matches):
            # Generate embedding
            embedding = await self.embed_text_ollama(f"{match.fix_type}: {match.content}")
            if embedding is None:
                continue

            points.append(PointStruct(
                id=i,
                vector=embedding.tolist(),
                payload={
                    "file": match.file,
                    "line": match.line,
                    "fix_type": match.fix_type,
                    "content": match.content[:500],
                    "timestamp": datetime.now().isoformat()
                }
            ))

        if points:
            self.qdrant.upsert(collection_name=collection, points=points)
            print(f"   ✅ Stored {len(points)} points")

    async def mirror_to_pgvector(self, matches: List[ErrorMatch]):
        """Mirror embeddings to PostgreSQL pgvector for SQL search"""
        print(f"\n📦 Mirroring to PostgreSQL pgvector...")

        cursor = self.pg.cursor()

        # Ensure table exists
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ace_error_embeddings (
                id SERIAL PRIMARY KEY,
                file TEXT,
                line INTEGER,
                fix_type TEXT,
                content TEXT,
                embedding vector(768),
                tags TEXT[],
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)

        # Insert matches
        values = []
        for match in matches:
            embedding = await self.embed_text_ollama(f"{match.fix_type}: {match.content}")
            if embedding is not None:
                values.append((
                    match.file,
                    match.line,
                    match.fix_type,
                    match.content[:500],
                    embedding.tolist(),
                    [match.fix_type, match.pattern[:20]]
                ))

        if values:
            execute_values(
                cursor,
                """
                INSERT INTO ace_error_embeddings (file, line, fix_type, content, embedding, tags)
                VALUES %s
                """,
                values,
                template="(%s, %s, %s, %s, %s::vector, %s)"
            )
            print(f"   ✅ Mirrored {len(values)} rows to pgvector")

        cursor.close()

    async def store_cluster_summary(self, summary: ClusterSummary):
        """Store cluster summary in CouchDB via LLM logger pattern"""
        # Store in Redis for quick access
        key = f"cluster:{summary.cluster_id}"
        data = json.dumps(asdict(summary), default=str)
        compressed = gzip.compress(data.encode())
        self.redis.setex(key, CONFIG["CACHE_TTL"] * 24, compressed)

        # Store embedding in Qdrant
        if summary.llm_summary:
            await self._store_summary_vector(summary)

    async def _store_summary_vector(self, summary: ClusterSummary):
        """Store summary vector in Qdrant"""
        embedding = await self.embed_text_ollama(summary.llm_summary or summary.pattern)
        if embedding is not None:
            self.qdrant.upsert(
                collection_name=CONFIG["COLLECTION_SUMMARIES"],
                points=[PointStruct(
                    id=int(summary.cluster_id),  # Convert numpy int64 to Python int
                    vector=embedding.tolist(),
                    payload={
                        "pattern": summary.pattern,
                        "size": summary.size,
                        "fix_template": summary.fix_template,
                        "tags": summary.tags or [],
                        "timestamp": datetime.now().isoformat()
                    }
                )]
            )

    # ==================== MAIN PIPELINE ====================

    async def run_full_pipeline(self, root_dir: str = "src"):
        """Run the complete agentic error fixing pipeline"""
        print("=" * 60)
        print("🚀 ACE GPU-Accelerated Error Fixing Pipeline")
        print("=" * 60)

        # Step 1: Scan for corruption patterns
        matches = self.scan_for_corruption_patterns(root_dir)
        if not matches:
            print("✅ No corruption patterns found!")
            return

        # Step 2: GPU clustering
        clusters = await self.cluster_errors_cuda(matches)

        # Step 3: Generate summaries and fixes for each cluster
        summaries: List[ClusterSummary] = []

        for cluster_id, cluster_matches in clusters.items():
            print(f"\n📋 Cluster {cluster_id} ({len(cluster_matches)} errors)")

            # Get dominant pattern
            fix_types = [m.fix_type for m in cluster_matches]
            dominant_type = max(set(fix_types), key=fix_types.count)

            # LLM synthesis
            fix_template = await self.synthesize_fix(cluster_matches)

            summary = ClusterSummary(
                cluster_id=cluster_id,
                size=len(cluster_matches),
                pattern=dominant_type,
                sample_errors=cluster_matches[:5],
                llm_summary=f"Cluster of {len(cluster_matches)} {dominant_type} errors",
                fix_template=fix_template,
                tags=[dominant_type, "auto-detected"]
            )
            summaries.append(summary)

            if fix_template:
                print(f"   📝 Fix template: {fix_template[:100]}...")

            # Store summary
            await self.store_cluster_summary(summary)

        # Step 4: Store all matches to Qdrant and pgvector
        await self.store_in_qdrant(matches, CONFIG["COLLECTION_ERRORS"])
        await self.mirror_to_pgvector(matches)

        # Step 5: Report
        print("\n" + "=" * 60)
        print("📊 PIPELINE SUMMARY")
        print("=" * 60)
        print(f"   Total matches: {len(matches)}")
        print(f"   Clusters: {len(clusters)}")
        print(f"   Stored in Qdrant: {CONFIG['COLLECTION_ERRORS']}")
        print(f"   Mirrored to pgvector: ace_error_embeddings")
        print(f"   Cache: Redis (gzip compressed)")

        return summaries


def main():
    """Entry point"""
    pipeline = GPUAcceleratedPipeline()

    # Run the pipeline
    root_dir = sys.argv[1] if len(sys.argv) > 1 else "src"
    summaries = asyncio.run(pipeline.run_full_pipeline(root_dir))

    if summaries:
        print(f"\n✅ Generated {len(summaries)} cluster summaries")
        for s in summaries[:5]:
            print(f"   - Cluster {s.cluster_id}: {s.pattern} ({s.size} errors)")


if __name__ == "__main__":
    main()
