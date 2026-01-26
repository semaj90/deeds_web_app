#!/usr/bin/env python3
"""
Phase 90 - GPU Error Clustering Pipeline
Integrates with svelte-check output, clusters errors, creates ACE prompt packets
"""

import os
import sys
import json
import asyncio
import re
from pathlib import Path
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict
from datetime import datetime

# Import GPU k-means
sys.path.insert(0, str(Path(__file__).parent))
from phase90_gpu_kmeans import kmeans_cosine_cuda

import torch
import aiohttp
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

@dataclass
class ErrorSignature:
    """Parsed TypeScript error"""
    file_path: str
    line: int
    col: int
    error_code: str  # TS1005, TS2304, etc.
    message: str
    severity: str = "error"

@dataclass
class ErrorCluster:
    """GPU-clustered error group"""
    cluster_id: int
    error_code: str
    count: int
    top_files: List[str]
    top_messages: List[str]
    centroid: List[float]  # 768d embedding
    summary: str  # LLM-generated summary

class ErrorParser:
    """Parse svelte-check / tsc output"""

    # Event Log format: <epoch_ms> ERROR "<filePath>" <line>:<col> "<message>"
    # Example: 1767398430921 ERROR "src\lib\ClientEmbeddingGemma.ts" 100:3 "',' expected."
    EVENT_ERR = re.compile(
        r'^(?P<ts>\d+)\s+ERROR\s+"(?P<file>[^"]+)"\s+(?P<line>\d+):(?P<col>\d+)\s+"(?P<msg>.*)"\s*$',
        re.MULTILINE
    )

    # Legacy svelte-check format (fallback)
    # src/lib/file.ts:10:5 error: message
    LEGACY_ERR = re.compile(
        r'^(?P<file>.+):(?P<line>\d+):(?P<col>\d+)\s+\w+:\s+(?P<msg>.*)$'
    )

    # TSC format: file.ts(line,col): error TSxxxx: message
    TSC_ERR = re.compile(
        r'^(?P<file>[^(]+)\((?P<line>\d+),(?P<col>\d+)\):\s+error\s+(?P<msg>.*)$'
    )

    def parse(self, check_output: str) -> List[ErrorSignature]:
        """Parse TypeScript errors from svelte-check output (Event Log format)"""
        errors = []

        # Iterate line by line for robustness against mixed streams
        for line in check_output.splitlines():
            line = line.strip()
            if not line:
                continue

            # Try timestamped event format first
            match = self.EVENT_ERR.match(line)
            if match:
                file_path = match.group("file").replace("\\\\", "\\")
                line_num = int(match.group("line"))
                col_num = int(match.group("col"))
                message = match.group("msg")

                # Extract TS code if present in message, or normalize message
                error_code = self._extract_error_code(message)

                errors.append(ErrorSignature(
                    file_path=file_path,
                    line=line_num,
                    col=col_num,
                    error_code=error_code,
                    message=message,
                    severity="error"
                ))
                continue

            # 2. Try TSC format (file(line,col): error ...)
            match_tsc = self.TSC_ERR.match(line)
            if match_tsc:
                file_path = match_tsc.group("file").replace("\\\\", "\\").strip()
                line_num = int(match_tsc.group("line"))
                col_num = int(match_tsc.group("col"))
                message = match_tsc.group("msg")

                error_code = self._extract_error_code(message)

                errors.append(ErrorSignature(
                    file_path=file_path,
                    line=line_num,
                    col=col_num,
                    error_code=error_code,
                    message=message,
                    severity="error"
                ))
                continue

            # 3. Try legacy format fallback
            match_legacy = self.LEGACY_ERR.match(line)
            if match_legacy:
                file_path = match_legacy.group("file").replace("\\\\", "\\").strip()
                line_num = int(match_legacy.group("line"))
                col_num = int(match_legacy.group("col"))
                message = match_legacy.group("msg")

                error_code = self._extract_error_code(message)

                errors.append(ErrorSignature(
                    file_path=file_path,
                    line=line_num,
                    col=col_num,
                    error_code=error_code,
                    message=message,
                    severity="error"
                ))

        print(f"   ℹ️  Parsed {len(errors)} errors using regex matchers")
        return errors

    def _extract_error_code(self, message: str) -> str:
        """Helper to extract or normalize error code from message"""
        if not message:
            return "UNKNOWN"

        # 1. Extract TS code if present (e.g., TS2305)
        ts_match = re.search(r'(TS\d+)', message)
        if ts_match:
            return ts_match.group(1)

        # 2. Signature Normalization for common syntax errors
        if "expected" in message or "Unexpected" in message:
            if "','" in message: return "SYNTAX_COMMA_EXPECTED"
            if "';'" in message: return "SYNTAX_SEMICOLON_EXPECTED"
            if "'}'" in message: return "SYNTAX_BRACE_EXPECTED"
            return "SYNTAX_ERROR"

        if "Cannot redeclare block-scoped variable" in message:
            return "REDECLARE_BLOCK_SCOPED"

        if "Cannot find name" in message:
            return "CANNOT_FIND_NAME"

        if "Cannot find module" in message:
            return "CANNOT_FIND_MODULE"

        if "is not assignable to" in message:
            return "TYPE_MISMATCH"

        if "Property" in message and "does not exist on type" in message:
            return "PROPERTY_MISSING"

        return "UNKNOWN"

class EmbeddingService:
    """embeddinggemma for error embeddings"""

    def __init__(self):
        self.base_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
        self.model = "embeddinggemma:latest"

    async def embed(self, text: str) -> List[float]:
        """Generate 768d embedding"""
        try:
            async with aiohttp.ClientSession() as session:
                payload = {"model": self.model, "prompt": text}

                async with session.post(
                    f"{self.base_url}/api/embeddings",
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return data.get("embedding", [])
                    return []
        except Exception as e:
            print(f"⚠️  Embedding failed: {e}")
            return []

    async def embed_batch(self, texts: List[str], batch_size: int = 32) -> List[List[float]]:
        """Batch embed error signatures"""
        embeddings = []

        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            tasks = [self.embed(text) for text in batch]
            batch_embeds = await asyncio.gather(*tasks)
            embeddings.extend(batch_embeds)

            if (i // batch_size) % 10 == 0:
                print(f"   Embedded {i + len(batch)} / {len(texts)} errors")

        return embeddings

class LLMService:
    """gemma3:270m for cluster summaries"""

    def __init__(self):
        self.base_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
        self.model = "gemma3:270m"

    async def summarize_cluster(self, error_code: str, top_messages: List[str]) -> str:
        """Generate cluster summary"""
        prompt = f"""Error Code: {error_code}

Top Error Messages:
{chr(10).join(f'- {msg}' for msg in top_messages[:5])}

Generate a 1-2 sentence summary of this error pattern and suggested fix approach."""

        try:
            async with aiohttp.ClientSession() as session:
                payload = {
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.1, "num_predict": 100}
                }

                async with session.post(
                    f"{self.base_url}/api/generate",
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return data.get("response", "").strip()
                    return "Summary generation failed."
        except Exception as e:
            return f"Error: {e}"

async def cluster_errors(
    errors: List[ErrorSignature],
    num_clusters: int = None
) -> List[ErrorCluster]:
    """GPU-cluster errors by embedding similarity"""

    if not errors:
        return []

    # Auto-determine cluster count
    if num_clusters is None:
        import math
        num_clusters = max(8, int(math.sqrt(len(errors))))

    print(f"\n📊 GPU Error Clustering:")
    print(f"   Total errors: {len(errors)}")
    print(f"   Target clusters: {num_clusters}")
    print()

    # 1. Create error signatures for embedding
    embedder = EmbeddingService()
    signatures = [
        f"{err.error_code}: {err.message}"
        for err in errors
    ]

    print("🔮 Generating embeddings...")
    embeddings = await embedder.embed_batch(signatures)

    # Filter out failed embeddings
    valid_pairs = [(err, emb) for err, emb in zip(errors, embeddings) if emb]
    if not valid_pairs:
        print("❌ No valid embeddings generated")
        return []

    errors_valid, embeddings_valid = zip(*valid_pairs)

    # 2. GPU k-means clustering
    print(f"\n🚀 Running GPU k-means (CUDA)...")
    X = torch.tensor(embeddings_valid, dtype=torch.float32)
    result = kmeans_cosine_cuda(X, num_clusters, iters=25, fp16=True)

    print(f"   ✅ Clustered {len(errors_valid)} errors")
    print(f"   📉 Inertia: {result.inertia:.4f}")
    print()

    # 3. Build cluster cards
    clusters = []
    llm = LLMService()

    for cluster_id in range(num_clusters):
        mask = result.labels == cluster_id
        cluster_errors = [errors_valid[i] for i, m in enumerate(mask) if m]

        if not cluster_errors:
            continue

        # Count by error code
        error_codes = {}
        for err in cluster_errors:
            error_codes[err.error_code] = error_codes.get(err.error_code, 0) + 1

        dominant_code = max(error_codes.items(), key=lambda x: x[1])[0]

        # Top files and messages
        top_files = list(set(err.file_path for err in cluster_errors))[:10]
        top_messages = list(set(err.message for err in cluster_errors))[:10]

        # LLM summary
        summary = await llm.summarize_cluster(dominant_code, top_messages)

        centroid = result.centroids[cluster_id].cpu().float().tolist()

        cluster = ErrorCluster(
            cluster_id=cluster_id,
            error_code=dominant_code,
            count=len(cluster_errors),
            top_files=top_files,
            top_messages=top_messages,
            centroid=centroid,
            summary=summary
        )

        clusters.append(cluster)

    return clusters

async def store_clusters_qdrant(clusters: List[ErrorCluster]):
    """Store error clusters in Qdrant with enhanced tagging schema"""
    client = QdrantClient(url="http://localhost:6333")
    collection_name = "phase90_error_clusters"

    # Create collection if needed
    try:
        client.get_collection(collection_name)
    except:
        client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(size=768, distance=Distance.COSINE)
        )

    # Upsert cluster cards with enhanced schema
    points = []
    for cluster in clusters:
        # Extract tech keywords from file paths
        tech_keywords = set()
        surface_areas = set()

        for file_path in cluster.top_files:
            # Detect tech stack
            if 'drizzle' in file_path.lower() or 'schema' in file_path.lower():
                tech_keywords.add('drizzle')
            if 'qdrant' in file_path.lower():
                tech_keywords.add('qdrant')
            if 'redis' in file_path.lower():
                tech_keywords.add('redis')
            if 'embedding' in file_path.lower():
                tech_keywords.add('embeddings')
            if 'svelte' in file_path.lower():
                tech_keywords.add('svelte')
            if 'phase' in file_path.lower():
                match = re.search(r'phase(\d+)', file_path.lower())
                if match:
                    tech_keywords.add(f'phase{match.group(1)}')

            # Detect surface areas
            if 'routes' in file_path:
                surface_areas.add('routes')
            if 'lib/server' in file_path:
                surface_areas.add('server')
            if 'lib/services' in file_path:
                surface_areas.add('services')
            if 'components' in file_path:
                surface_areas.add('components')
            if 'evidence' in file_path.lower():
                surface_areas.add('evidence')
            if 'cases' in file_path.lower():
                surface_areas.add('cases')
            if 'admin' in file_path.lower():
                surface_areas.add('admin')

        # Enhanced payload with all ACE-required fields
        payload = {
            # Core identity
            "id": cluster.cluster_id,
            "kind": "error_cluster",  # category
            "name": f"{cluster.error_code}_cluster_{cluster.cluster_id}",

            # Cluster metadata
            "cluster_id": cluster.cluster_id,
            "errorCode": cluster.error_code,
            "count": cluster.count,

            # Context
            "top_files": cluster.top_files[:10],  # Limit payload size
            "top_messages": cluster.top_messages[:5],
            "summary": cluster.summary,

            # Enhanced fields for filtering
            "tech": list(tech_keywords),
            "surface": list(surface_areas),

            # Coordinates (placeholder for future UMAP/TSNE projection)
            "coordinates": None,

            # Timestamps
            "timestamp": datetime.utcnow().isoformat(),
            "generated_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }

        points.append(PointStruct(
            id=cluster.cluster_id,
            vector=cluster.centroid,
            payload=payload
        ))

    if points:
        client.upsert(collection_name=collection_name, points=points)
        print(f"✅ Stored {len(points)} error clusters with enhanced tags in Qdrant")
        print(f"   📊 Enhanced fields: id, kind, name, cluster_id, errorCode, tech, surface, coordinates, timestamp")

async def main():
    """Main pipeline"""
    import argparse

    parser = argparse.ArgumentParser(description="GPU Error Clustering Pipeline")
    parser.add_argument("--input", default="check_output.txt", help="svelte-check output file")
    parser.add_argument("--clusters", type=int, help="Number of clusters (auto if not set)")

    args = parser.parse_args()

    print("=" * 70)
    print("🔬 Phase 90: GPU Error Clustering Pipeline")
    print("=" * 70)
    print()

    # 1. Parse errors
    if not Path(args.input).exists():
        print(f"❌ Input file not found: {args.input}")
        print("💡 Run: npx svelte-check --threshold error > check_output.txt 2>&1")
        return

    with open(args.input, 'r', encoding='utf-8') as f:
        check_output = f.read()

    parser = ErrorParser()
    errors = parser.parse(check_output)

    print(f"📊 Parsed {len(errors)} errors from {args.input}")

    if not errors:
        print("✅ No errors found!")
        return

    # 2. GPU cluster
    clusters = await cluster_errors(errors, num_clusters=args.clusters)

    # 3. Store in Qdrant
    await store_clusters_qdrant(clusters)

    # 4. Print summary
    print("\n" + "=" * 70)
    print("📊 Cluster Summary:")
    print("=" * 70)

    for cluster in sorted(clusters, key=lambda c: c.count, reverse=True):
        print(f"\nCluster {cluster.cluster_id}: {cluster.error_code} ({cluster.count} errors)")
        print(f"   📝 {cluster.summary}")
        print(f"   📂 Top files: {', '.join(cluster.top_files[:3])}")

    print("\n✅ GPU error clustering complete!")
    print(f"🔍 Query clusters: curl http://localhost:6333/collections/phase90_error_clusters")

if __name__ == "__main__":
    asyncio.run(main())
