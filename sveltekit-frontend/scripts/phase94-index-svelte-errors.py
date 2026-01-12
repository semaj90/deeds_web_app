#!/usr/bin/env python3
"""
Phase 94: Index Svelte Component Errors to Qdrant with ACE Tags

Purpose: Index DocumentUploadMachineIntegration.svelte errors with:
- Error signatures (svelteHTML, Button type mismatch)
- Auto-generated tags (svelte5-migration, type-error, component-compat)
- Cluster assignments (GPU DBSCAN clustering)
- Redis cache references

Flow:
1. Extract errors from get_errors output
2. Generate embeddings (embeddinggemma:latest)
3. Auto-tag with ACE classifier
4. Cluster with PyTorch (GPU)
5. Index to Qdrant (phase89_error_chunks)
6. Cache in Redis (phase89:error:*)
"""

import asyncio
import hashlib
import json
import os
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional

try:
    import aiohttp
    import redis.asyncio as aioredis
    import torch
    from qdrant_client import QdrantClient
    from qdrant_client.models import Distance, PointStruct, VectorParams
except ImportError as e:
    print(f"❌ Missing dependency: {e}")
    print("Install with: pip install aiohttp redis[asyncio] torch qdrant-client")
    sys.exit(1)


@dataclass
class ErrorEntry:
    """Structured error from DocumentUploadMachineIntegration.svelte"""
    line: int
    code_snippet: str
    error_type: str  # compileError
    message: str
    severity: str = "error"
    file_path: str = "src/lib/components/DocumentUploadMachineIntegration.svelte"

    # Auto-generated fields
    signature: str = ""
    tags: List[str] = field(default_factory=list)
    cluster_id: int = -1
    embedding: Optional[List[float]] = None


class ErrorIndexer:
    """Index Svelte errors to Qdrant + Redis"""

    def __init__(self):
        self.ollama_url = "http://localhost:11434"
        self.qdrant = QdrantClient(url="http://localhost:6333")
        self.redis: Optional[aioredis.Redis] = None
        self.collection_name = "phase89_error_chunks"

        # GPU check
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        if torch.cuda.is_available():
            print(f"✅ GPU: {torch.cuda.get_device_name(0)}")
        else:
            print("⚠️  Running on CPU (slower)")

    async def connect(self):
        """Connect to Redis"""
        self.redis = await aioredis.from_url("redis://localhost:6379/0")
        await self.redis.ping()
        print("✅ Redis connected")

    def ensure_collection(self):
        """Create Qdrant collection if needed"""
        try:
            self.qdrant.get_collection(self.collection_name)
            print(f"✅ Collection exists: {self.collection_name}")
        except:
            self.qdrant.create_collection(
                collection_name=self.collection_name,
                vectors_config=VectorParams(size=768, distance=Distance.COSINE)
            )
            print(f"✅ Created collection: {self.collection_name}")

    def build_signature(self, error: ErrorEntry) -> str:
        """Build minimal signature for embedding"""
        # Extract key error pattern
        if "svelteHTML" in error.message:
            pattern = "svelteHTML_not_found"
        elif "SvelteComponentTyped" in error.message:
            pattern = "component_type_mismatch"
        elif "Argument of type 'unknown'" in error.message:
            pattern = "unknown_type_iteration"
        else:
            pattern = "generic_compile_error"

        return f"{pattern}|{error.file_path.split('/')[-1]}|line_{error.line}"

    def auto_tag(self, error: ErrorEntry) -> List[str]:
        """Auto-generate tags based on error content"""
        tags = ["svelte5", "typescript", "compile-error"]

        # Svelte 5 migration patterns
        if "svelteHTML" in error.message:
            tags.append("svelte5-html-types")

        # Component compatibility
        if "SvelteComponentTyped" in error.message or "Component<any" in error.message:
            tags.append("svelte5-component-compat")
            tags.append("button-component")

        # Type errors
        if "unknown" in error.message.lower():
            tags.append("type-inference-error")

        # File-based tags
        if "DocumentUpload" in error.file_path:
            tags.append("document-upload")

        return list(set(tags))

    async def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding via embeddinggemma:latest"""
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.ollama_url}/api/embeddings",
                json={"model": "embeddinggemma:latest", "prompt": text}
            ) as resp:
                if resp.status != 200:
                    raise RuntimeError(f"Ollama error: {await resp.text()}")
                data = await resp.json()
                return data["embedding"]

    def cluster_errors(self, embeddings: torch.Tensor) -> torch.Tensor:
        """GPU-accelerated DBSCAN clustering"""
        if len(embeddings) < 3:
            return torch.zeros(len(embeddings), dtype=torch.long)

        # Move to GPU
        emb_gpu = embeddings.to(self.device)

        # Cosine similarity
        sim = torch.mm(emb_gpu, emb_gpu.t())
        norms = torch.norm(emb_gpu, dim=1, keepdim=True)
        sim = sim / (norms * norms.t() + 1e-8)

        # Simple clustering: group similar errors (sim > 0.8)
        labels = torch.zeros(len(embeddings), dtype=torch.long)
        cluster_id = 0

        for i in range(len(embeddings)):
            if labels[i] == 0:  # Unassigned
                similar = (sim[i] > 0.8).nonzero(as_tuple=True)[0]
                labels[similar] = cluster_id
                cluster_id += 1

        return labels.cpu()

    async def index_errors(self, errors: List[ErrorEntry]):
        """Main indexing pipeline"""
        print(f"\n🔍 Indexing {len(errors)} errors...")

        # Step 1: Build signatures
        for error in errors:
            error.signature = self.build_signature(error)
            error.tags = self.auto_tag(error)

        # Step 2: Generate embeddings
        print("🧠 Generating embeddings...")
        embeddings = []
        for error in errors:
            emb = await self.generate_embedding(error.signature)
            error.embedding = emb
            embeddings.append(emb)

        embeddings_tensor = torch.tensor(embeddings)

        # Step 3: Cluster
        print("🔬 Clustering errors (GPU)...")
        cluster_labels = self.cluster_errors(embeddings_tensor)

        for i, error in enumerate(errors):
            error.cluster_id = int(cluster_labels[i])

        # Step 4: Index to Qdrant
        print("💾 Indexing to Qdrant...")
        points = []
        for i, error in enumerate(errors):
            # Convert hex to integer for Qdrant
            point_id = int(hashlib.sha256(error.signature.encode()).hexdigest()[:16], 16)

            points.append(PointStruct(
                id=point_id,
                vector=error.embedding,
                payload={
                    "file_path": error.file_path,
                    "line": error.line,
                    "error_type": error.error_type,
                    "message": error.message[:500],  # Truncate
                    "signature": error.signature,
                    "tags": error.tags,
                    "cluster_id": error.cluster_id,
                    "severity": error.severity,
                    "indexed_at": datetime.now().isoformat()
                }
            ))

        self.qdrant.upsert(
            collection_name=self.collection_name,
            points=points
        )
        print(f"✅ Upserted {len(points)} points to Qdrant")

        # Step 5: Cache in Redis
        print("💾 Caching in Redis...")
        for error in errors:
            redis_key = f"phase89:error:{error.signature}"
            await self.redis.setex(
                redis_key,
                86400,  # 24 hours
                json.dumps({
                    "file": error.file_path,
                    "line": error.line,
                    "message": error.message,
                    "tags": error.tags,
                    "cluster_id": error.cluster_id,
                    "cached_at": datetime.now().isoformat()
                })
            )

        print(f"✅ Cached {len(errors)} errors in Redis")

        # Summary
        print("\n" + "=" * 70)
        print("📊 Indexing Summary")
        print("=" * 70)
        print(f"  Total Errors:     {len(errors)}")
        print(f"  Unique Clusters:  {len(set(e.cluster_id for e in errors))}")
        print(f"  Top Tags:")

        all_tags = [tag for e in errors for tag in e.tags]
        tag_counts = {}
        for tag in all_tags:
            tag_counts[tag] = tag_counts.get(tag, 0) + 1

        for tag, count in sorted(tag_counts.items(), key=lambda x: -x[1])[:5]:
            print(f"    - {tag}: {count}")

        print()


async def main():
    """Main entry point"""

    # DocumentUploadMachineIntegration.svelte errors
    errors = [
        ErrorEntry(
            line=65,
            code_snippet="<div class=\"upload-container...",
            error_type="compileError",
            message="Cannot find name 'svelteHTML'."
        ),
        ErrorEntry(
            line=71,
            code_snippet="<div role=\"button\"...",
            error_type="compileError",
            message="Cannot find name 'svelteHTML'."
        ),
        ErrorEntry(
            line=133,
            code_snippet="<Button variant=\"outline\"...",
            error_type="compileError",
            message="Argument of type 'SvelteComponentTyped<{ [key: string]: unknown; }, ...>' is not assignable to parameter of type 'ConstructorOfATypedSvelteComponent | Component<any, any, any>'."
        ),
        ErrorEntry(
            line=123,
            code_snippet="{#each msgs as msg}",
            error_type="compileError",
            message="Argument of type 'unknown' is not assignable to parameter of type 'ArrayLike<unknown> | Iterable<unknown>'."
        ),
    ]

    indexer = ErrorIndexer()
    await indexer.connect()
    indexer.ensure_collection()
    await indexer.index_errors(errors)

    await indexer.redis.close()


if __name__ == "__main__":
    asyncio.run(main())
