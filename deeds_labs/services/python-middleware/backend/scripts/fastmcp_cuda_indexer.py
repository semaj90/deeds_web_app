#!/usr/bin/env python3
"""
FastMCP CUDA Indexer - GPU-Accelerated Codebase Indexing
Uses sentence-transformers on GPU for 100x faster embedding
"""

import os
import sys
import asyncio
import json
import hashlib
import re
from pathlib import Path
from typing import List, Dict, Optional
from dataclasses import dataclass, asdict, field
from datetime import datetime, timezone
from tqdm import tqdm
import torch

@dataclass
class FileProfile:
    """File profile with migration detection"""
    file_path: str
    role: str
    surface: List[str]
    tech_stack: List[str]
    comments: List[str]
    summary: str
    risk: str
    tags: List[str]
    vector_dim: int
    indexed_at: str

    # Migration flags
    needs_svelte5_migration: bool = False
    needs_bits_ui_migration: bool = False
    needs_melt_ui_migration: bool = False
    has_export_let: bool = False
    has_reactive_statements: bool = False
    has_legacy_lifecycle: bool = False

class CUDACodebaseIndexer:
    """GPU-accelerated codebase indexer using sentence-transformers"""

    def __init__(self, batch_size: int = 64):
        print("🚀 Initializing CUDA Codebase Indexer...")

        # Check CUDA
        if torch.cuda.is_available():
            self.device = "cuda"
            print(f"   ✅ CUDA: {torch.cuda.get_device_name(0)}")
            print(f"   ✅ VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.2f} GB")
        else:
            self.device = "cpu"
            print("   ⚠️  CUDA not available, using CPU")

        # Load sentence-transformers
        print("   📦 Loading sentence-transformers...")
        from sentence_transformers import SentenceTransformer
        self.model = SentenceTransformer('sentence-transformers/all-mpnet-base-v2', device=self.device)
        self.model.max_seq_length = 512

        self.batch_size = batch_size
        print(f"   ✅ Model loaded on {self.device}")
        print(f"   ✅ Batch size: {batch_size}")

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """Embed batch on GPU"""
        texts = [t[:8000] for t in texts]  # Truncate
        embeddings = self.model.encode(
            texts,
            batch_size=self.batch_size,
            show_progress_bar=False,
            convert_to_numpy=True,
            device=self.device
        )
        return embeddings.tolist()

    def detect_migrations(self, content: str, file_path: str) -> Dict[str, bool]:
        """Detect Svelte 5 migration patterns"""
        flags = {
            "needs_svelte5_migration": False,
            "needs_bits_ui_migration": False,
            "needs_melt_ui_migration": False,
            "has_export_let": False,
            "has_reactive_statements": False,
            "has_legacy_lifecycle": False,
        }

        if "export let" in content:
            flags["needs_svelte5_migration"] = True
            flags["has_export_let"] = True

        if "$:" in content and ".svelte" in file_path:
            flags["needs_svelte5_migration"] = True
            flags["has_reactive_statements"] = True

        if "onMount" in content or "onDestroy" in content:
            flags["has_legacy_lifecycle"] = True

        if "melt-ui" in content.lower():
            flags["needs_melt_ui_migration"] = True

        if "bits-ui" in content.lower():
            flags["needs_bits_ui_migration"] = True

        return flags

    def extract_file_info(self, file_path: str) -> Optional[FileProfile]:
        """Extract file info without embedding"""
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()

            # Extract comments
            comments = []
            for match in re.finditer(r"//(.+?)$", content, re.MULTILINE):
                c = match.group(1).strip()
                if len(c) > 3:
                    comments.append(c)

            # Detect migrations
            migrations = self.detect_migrations(content, file_path)

            # Determine role
            role = "unknown"
            if "+page.svelte" in file_path:
                role = "route"
            elif "+server.ts" in file_path:
                role = "api"
            elif ".svelte" in file_path:
                role = "component"
            elif "schema" in file_path.lower():
                role = "schema"

            # Surface detection
            surface = []
            if "src/routes/" in file_path:
                surface.append("ui")
            if "/api/" in file_path:
                surface.append("api")
            if "rag" in file_path.lower():
                surface.append("rag")

            # Tech stack
            tech_stack = []
            if "drizzle" in content.lower():
                tech_stack.append("drizzle")
            if "qdrant" in content.lower():
                tech_stack.append("qdrant")
            if ".svelte" in file_path:
                tech_stack.append("svelte")

            return FileProfile(
                file_path=file_path,
                role=role,
                surface=surface,
                tech_stack=tech_stack,
                comments=comments[:10],
                summary=f"File with {len(comments)} comments",
                risk="low",
                tags=[role] + surface + tech_stack,
                vector_dim=768,
                indexed_at=datetime.now(timezone.utc).isoformat(),
                **migrations
            )
        except Exception as e:
            return None

    def generate_signature(self, profile: FileProfile) -> str:
        """Generate embedding signature"""
        return (
            f"FILE: {profile.file_path}\n"
            f"ROLE: {profile.role}\n"
            f"SURFACE: {', '.join(profile.surface)}\n"
            f"TECH: {', '.join(profile.tech_stack)}\n"
            f"COMMENTS:\n" + "\n".join(profile.comments[:5])
        )

def find_files(root_dir: str, patterns: List[str]) -> List[str]:
    """Find files to index"""
    root = Path(root_dir)
    files = []

    excludes = ['node_modules', '.svelte-kit', 'build', 'dist', '.git', '__pycache__', '.venv']

    for pattern in patterns:
        for file in root.rglob(pattern):
            if file.is_file():
                str_path = str(file)
                if not any(exc in str_path for exc in excludes):
                    files.append(str_path)

    return sorted(list(set(files)))

def main():
    import argparse
    from qdrant_client import QdrantClient
    from qdrant_client.models import PointStruct, Distance, VectorParams
    import redis

    parser = argparse.ArgumentParser(description="FastMCP CUDA Indexer")
    parser.add_argument("--root", default="sveltekit-frontend", help="Root directory")
    parser.add_argument("--patterns", nargs="+", default=["*.ts", "*.svelte"], help="File patterns")
    parser.add_argument("--batch-size", type=int, default=64, help="GPU batch size")
    parser.add_argument("--limit", type=int, help="Limit files (testing)")

    args = parser.parse_args()

    print("=" * 80)
    print("🚀 FastMCP CUDA Codebase Indexer")
    print("=" * 80)
    print()

    # Find files
    print(f"🔍 Scanning {args.root}...")
    files = find_files(args.root, args.patterns)
    print(f"   Found: {len(files)} files")

    if args.limit:
        files = files[:args.limit]
        print(f"   Limited to: {len(files)} files")

    # Initialize indexer
    print()
    indexer = CUDACodebaseIndexer(batch_size=args.batch_size)

    # Extract file info
    print(f"\n[1/3] Extracting file info...")
    profiles = []
    signatures = []

    for file in tqdm(files, desc="   Files"):
        profile = indexer.extract_file_info(file)
        if profile:
            profiles.append(profile)
            signatures.append(indexer.generate_signature(profile))

    print(f"   ✅ Extracted: {len(profiles)} profiles")

    # Embed on GPU
    print(f"\n[2/3] Embedding {len(signatures)} files on GPU...")
    start = datetime.now()

    all_embeddings = []
    for i in tqdm(range(0, len(signatures), args.batch_size), desc="   GPU Batches"):
        batch = signatures[i:i + args.batch_size]
        embeddings = indexer.embed_batch(batch)
        all_embeddings.extend(embeddings)

    elapsed = (datetime.now() - start).total_seconds()
    speed = len(signatures) / elapsed
    print(f"   ✅ Embedded: {len(all_embeddings)} vectors")
    print(f"   ⚡ Speed: {speed:.1f} files/sec")

    # Store in Qdrant
    print(f"\n[3/3] Storing in Qdrant + Redis...")

    qdrant = QdrantClient(host="localhost", port=6333)
    collection = "fastmcp_cuda_codebase"

    try:
        qdrant.delete_collection(collection)
    except:
        pass

    qdrant.create_collection(
        collection_name=collection,
        vectors_config=VectorParams(size=768, distance=Distance.COSINE)
    )

    # Batch upsert
    points = []
    for idx, (profile, emb) in enumerate(zip(profiles, all_embeddings)):
        point_id = int(hashlib.sha256(profile.file_path.encode()).hexdigest()[:15], 16) % (2**63)
        points.append(PointStruct(
            id=point_id,
            vector=emb,
            payload=asdict(profile)
        ))

        if len(points) >= 1000:
            qdrant.upsert(collection, points)
            points = []

    if points:
        qdrant.upsert(collection, points)

    print(f"   ✅ Qdrant: {len(all_embeddings)} points in {collection}")

    # Cache in Redis
    try:
        r = redis.Redis(host="localhost", port=6379)
        for profile in profiles:
            key = f"file_cuda:{hashlib.md5(profile.file_path.encode()).hexdigest()}"
            r.set(key, json.dumps(asdict(profile)), ex=86400)
        print(f"   ✅ Redis: {len(profiles)} cached")
    except Exception as e:
        print(f"   ⚠️  Redis failed: {e}")

    # Stats
    print()
    print("=" * 80)
    print("📊 INDEXING COMPLETE")
    print("=" * 80)
    print(f"✅ Files indexed: {len(profiles)}")
    print(f"⚡ Speed: {speed:.1f} files/sec (vs 0.5/sec with Ollama)")
    print(f"🚀 Speedup: {speed / 0.5:.0f}x faster than Ollama")
    print(f"⏱️  Total time: {elapsed:.1f}s ({elapsed/60:.1f} min)")
    print(f"💾 Collection: {collection}")

    # Migration stats
    svelte5 = sum(1 for p in profiles if p.needs_svelte5_migration)
    print(f"\n📈 Migration Stats:")
    print(f"   needs_svelte5_migration: {svelte5} files")
    print(f"   needs_melt_ui_migration: {sum(1 for p in profiles if p.needs_melt_ui_migration)}")
    print(f"   needs_bits_ui_migration: {sum(1 for p in profiles if p.needs_bits_ui_migration)}")

    print()
    print("🎯 Query:")
    print(f"   python backend/scripts/query_phase90.py --collection {collection} --stats")
    print(f"   curl http://localhost:6333/collections/{collection}")

if __name__ == "__main__":
    main()
