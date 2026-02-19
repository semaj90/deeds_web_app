#!/usr/bin/env python3
"""
Phase 90: Glyph Indexer
=======================
Populates Redis with compact glyph encodings from Qdrant embeddings.
Enables fast lookup for agentic tool function calling.

Glyph = 20-byte compact encoding of error signature
- 4 bytes: error code (TS2345)
- 1 byte: severity (1=error, 2=warning)
- 1 byte: category (0=type, 1=module, 2=syntax, 3=semantic)
- 2 bytes: cluster ID
- 8 bytes: file path hash
- 4 bytes: line range (start, end)

This enables:
- Redis-cached fast lookup by error code
- Cluster-based batch retrieval
- Minimal memory footprint (20 bytes vs ~768 float32 = 3KB)
"""

import json
import hashlib
import struct
import sys
import io
from typing import Dict, Any, List, Optional
from dataclasses import dataclass

# Fix Windows console
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# Redis
try:
    import redis
    REDIS = redis.Redis(host='localhost', port=6379, db=0, decode_responses=False)
except Exception:
    REDIS = None
    print("[WARN] Redis not available")

# Qdrant
try:
    from qdrant_client import QdrantClient
    QDRANT = QdrantClient(host="localhost", port=6333)
except Exception:
    QDRANT = None
    print("[WARN] Qdrant not available")


@dataclass
class Glyph:
    """Compact 20-byte encoding of error signature"""
    code: str           # TS2345, TS2322, etc.
    severity: int       # 1=error, 2=warning
    category: int       # 0=type, 1=module, 2=syntax, 3=semantic
    cluster_id: int     # Which cluster (0-11)
    file_hash: str      # First 8 chars of file path hash
    line: int           # Line number
    point_id: int       # Qdrant point ID for retrieval

    def to_bytes(self) -> bytes:
        """Encode to 24 bytes for Redis storage"""
        code_bytes = self.code[:6].encode().ljust(6, b'\x00')
        return struct.pack(
            ">6sbbH8sII",
            code_bytes,
            self.severity,
            self.category,
            self.cluster_id,
            self.file_hash[:8].encode(),
            self.line,
            self.point_id
        )

    @classmethod
    def from_bytes(cls, data: bytes) -> 'Glyph':
        """Decode from bytes"""
        code, sev, cat, cid, fhash, line, pid = struct.unpack(">6sbbH8sII", data)
        return cls(
            code=code.decode().strip('\x00'),
            severity=sev,
            category=cat,
            cluster_id=cid,
            file_hash=fhash.decode(),
            line=line,
            point_id=pid
        )

    def to_tool_param(self) -> Dict[str, Any]:
        """Convert to agentic tool function parameter"""
        return {
            "error_code": self.code,
            "severity": "error" if self.severity == 1 else "warning",
            "category": ["type", "module", "syntax", "semantic", "unknown"][min(self.category, 4)],
            "cluster": self.cluster_id,
            "file_signature": self.file_hash,
            "line": self.line,
            "point_id": self.point_id
        }


def categorize_error(message: str, code: str) -> int:
    """Categorize error into 0-4 based on message content"""
    msg_lower = message.lower()

    if "not assignable" in msg_lower or "cannot assign" in msg_lower:
        return 0  # type
    elif "cannot find module" in msg_lower or "module not found" in msg_lower:
        return 1  # module
    elif "expected" in msg_lower or "syntax" in msg_lower or code == "SYNTAX":
        return 2  # syntax
    elif "property" in msg_lower or "does not exist" in msg_lower:
        return 3  # semantic
    else:
        return 4  # unknown


def index_glyphs_from_qdrant(batch_size: int = 1000, limit: Optional[int] = None):
    """Index all embeddings from Qdrant into Redis as glyphs"""

    if not QDRANT or not REDIS:
        print("[ERROR] Qdrant or Redis not available")
        return

    print("[GLYPH] Starting glyph indexing from Qdrant...")

    collection = "phase90_cuda_embeddings"

    # Get collection info
    info = QDRANT.get_collection(collection)
    total_points = info.points_count
    print(f"[INFO] Collection has {total_points} points")

    if limit:
        total_points = min(total_points, limit)
        print(f"[INFO] Limiting to {total_points} points")

    indexed = 0
    offset = None

    # Redis pipeline for batch writes
    pipe = REDIS.pipeline()

    while indexed < total_points:
        # Scroll through points
        points, offset = QDRANT.scroll(
            collection_name=collection,
            limit=batch_size,
            offset=offset,
            with_payload=True,
            with_vectors=False
        )

        if not points:
            break

        for point in points:
            payload = point.payload

            # Extract glyph data
            code = payload.get("errorCode", "UNKNOWN")
            message = payload.get("message", "")
            file_path = payload.get("filePath", "")
            line = payload.get("line", 0)
            cluster_id = payload.get("cluster_id", 0)
            severity = 1 if payload.get("severity", "error") == "error" else 2

            # Create file hash
            file_hash = hashlib.sha256(file_path.encode()).hexdigest()[:8]

            # Create glyph
            glyph = Glyph(
                code=code,
                severity=severity,
                category=categorize_error(message, code),
                cluster_id=cluster_id,
                file_hash=file_hash,
                line=line,
                point_id=point.id
            )

            # Store in Redis with multiple indexes
            glyph_bytes = glyph.to_bytes()

            # Primary key: by point ID
            pipe.set(f"glyph:id:{point.id}", glyph_bytes)

            # Secondary index: by error code (sorted set with score = cluster_id)
            pipe.zadd(f"glyph:code:{code}", {str(point.id): cluster_id})

            # Secondary index: by cluster (set)
            pipe.sadd(f"glyph:cluster:{cluster_id}", str(point.id))

            # Secondary index: by file hash (set)
            pipe.sadd(f"glyph:file:{file_hash}", str(point.id))

            indexed += 1

        # Execute batch
        pipe.execute()
        pipe = REDIS.pipeline()

        print(f"[PROGRESS] Indexed {indexed} / {total_points} glyphs ({100*indexed/total_points:.1f}%)")

    # Final stats
    print(f"\n[DONE] Indexed {indexed} glyphs into Redis")

    # Count indexes
    code_keys = list(REDIS.scan_iter("glyph:code:*", count=1000))
    cluster_keys = list(REDIS.scan_iter("glyph:cluster:*", count=1000))
    file_keys = list(REDIS.scan_iter("glyph:file:*", count=1000))

    print(f"[STATS] Error code indexes: {len(code_keys)}")
    print(f"[STATS] Cluster indexes: {len(cluster_keys)}")
    print(f"[STATS] File indexes: {len(file_keys)}")


def query_by_code(error_code: str, limit: int = 20) -> List[Glyph]:
    """Query glyphs by error code"""
    if not REDIS:
        return []

    # Get point IDs from sorted set
    point_ids = REDIS.zrange(f"glyph:code:{error_code}", 0, limit-1)

    glyphs = []
    for pid in point_ids:
        data = REDIS.get(f"glyph:id:{pid.decode() if isinstance(pid, bytes) else pid}")
        if data:
            glyphs.append(Glyph.from_bytes(data))

    return glyphs


def query_by_cluster(cluster_id: int, limit: int = 100) -> List[Glyph]:
    """Query glyphs by cluster ID"""
    if not REDIS:
        return []

    # Get point IDs from set
    point_ids = list(REDIS.smembers(f"glyph:cluster:{cluster_id}"))[:limit]

    glyphs = []
    for pid in point_ids:
        data = REDIS.get(f"glyph:id:{pid.decode() if isinstance(pid, bytes) else pid}")
        if data:
            glyphs.append(Glyph.from_bytes(data))

    return glyphs


def get_glyph_stats() -> Dict[str, Any]:
    """Get glyph index statistics"""
    if not REDIS:
        return {"error": "Redis not available"}

    stats = {
        "total_glyphs": 0,
        "error_codes": [],
        "clusters": {},
        "top_codes": []
    }

    # Count by error code
    code_counts = {}
    for key in REDIS.scan_iter("glyph:code:*", count=1000):
        code = key.decode().split(":")[-1]
        count = REDIS.zcard(key)
        code_counts[code] = count
        stats["total_glyphs"] += count

    stats["error_codes"] = list(code_counts.keys())
    stats["top_codes"] = sorted(code_counts.items(), key=lambda x: x[1], reverse=True)[:10]

    # Count by cluster
    for i in range(12):
        count = REDIS.scard(f"glyph:cluster:{i}")
        stats["clusters"][i] = count

    return stats


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Phase 90: Glyph Indexer")
    parser.add_argument("--index", action="store_true", help="Index all glyphs from Qdrant")
    parser.add_argument("--limit", type=int, help="Limit number of glyphs to index")
    parser.add_argument("--query-code", type=str, help="Query by error code")
    parser.add_argument("--query-cluster", type=int, help="Query by cluster ID")
    parser.add_argument("--stats", action="store_true", help="Show glyph index stats")
    args = parser.parse_args()

    print("[PHASE90] Glyph Indexer")
    print("=" * 60)

    if args.index:
        index_glyphs_from_qdrant(limit=args.limit)

    elif args.query_code:
        glyphs = query_by_code(args.query_code)
        print(f"\n[QUERY] Error code '{args.query_code}': {len(glyphs)} glyphs")
        for g in glyphs[:10]:
            print(f"  - Cluster {g.cluster_id} | Line {g.line} | {g.file_hash}")

    elif args.query_cluster is not None:
        glyphs = query_by_cluster(args.query_cluster)
        print(f"\n[QUERY] Cluster {args.query_cluster}: {len(glyphs)} glyphs")

        # Group by code
        by_code = {}
        for g in glyphs:
            if g.code not in by_code:
                by_code[g.code] = 0
            by_code[g.code] += 1

        print("  Error codes:")
        for code, count in sorted(by_code.items(), key=lambda x: x[1], reverse=True)[:10]:
            print(f"    {code}: {count}")

    elif args.stats:
        stats = get_glyph_stats()
        print(f"\n[STATS] Glyph Index Statistics")
        print(f"  Total glyphs: {stats.get('total_glyphs', 0)}")
        print(f"  Unique error codes: {len(stats.get('error_codes', []))}")
        print(f"\n  Top error codes:")
        for code, count in stats.get('top_codes', []):
            print(f"    {code}: {count}")
        print(f"\n  By cluster:")
        for cid, count in stats.get('clusters', {}).items():
            print(f"    Cluster {cid}: {count}")

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
