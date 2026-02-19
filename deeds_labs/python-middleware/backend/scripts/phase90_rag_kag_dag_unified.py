#!/usr/bin/env python3
"""
Phase 90: RAG + KAG + DAG Unified Knowledge Base
================================================
Integrates:
- RAG: Retrieval-Augmented Generation via Qdrant embeddings
- KAG: Knowledge-Augmented Generation via Neo4j graph
- DAG: Directed Acyclic Graph for dependency analysis

Redis-cached tensor CUDA analysis → Glyph encoding → Agentic tool functions
"""

import json
import hashlib
import gzip
import asyncio
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, asdict
import struct

# CUDA / ML imports
try:
    import torch
    import numpy as np
    from sentence_transformers import SentenceTransformer
    CUDA_AVAILABLE = torch.cuda.is_available()
except ImportError:
    CUDA_AVAILABLE = False
    torch = None
    np = None

# Redis
try:
    import redis
    REDIS_CLIENT = redis.Redis(host='localhost', port=6379, db=0, decode_responses=False)
except Exception:
    REDIS_CLIENT = None

# Qdrant
try:
    from qdrant_client import QdrantClient
    from qdrant_client.models import PointStruct, VectorParams, Distance
    QDRANT = QdrantClient(host="localhost", port=6333)
except Exception:
    QDRANT = None

# Neo4j
try:
    from neo4j import GraphDatabase
    NEO4J_DRIVER = GraphDatabase.driver("bolt://localhost:7687", auth=("neo4j", "password"))
except Exception:
    NEO4J_DRIVER = None

# ============================================================================
# GLYPH ENCODING: Compact signature encoding for agentic tool parameters
# ============================================================================

@dataclass
class Glyph:
    """Compact encoding of error signature for LLM tool calling"""
    code: str           # TS2345, TS2322, etc.
    severity: int       # 1=error, 2=warning
    category: int       # 0=type, 1=module, 2=syntax, 3=semantic
    cluster_id: int     # Which cluster (0-11)
    file_hash: str      # First 8 chars of file path hash
    line_range: tuple   # (start, end) line numbers

    def to_bytes(self) -> bytes:
        """Encode to ~20 bytes for Redis storage"""
        return struct.pack(
            ">4sbbH8sHH",
            self.code[:4].encode().ljust(4, b'\x00'),
            self.severity,
            self.category,
            self.cluster_id,
            self.file_hash[:8].encode(),
            self.line_range[0] % 65536,
            self.line_range[1] % 65536
        )

    @classmethod
    def from_bytes(cls, data: bytes) -> 'Glyph':
        """Decode from bytes"""
        code, sev, cat, cid, fhash, ls, le = struct.unpack(">4sbbH8sHH", data)
        return cls(
            code=code.decode().strip('\x00'),
            severity=sev,
            category=cat,
            cluster_id=cid,
            file_hash=fhash.decode(),
            line_range=(ls, le)
        )

    def to_tool_param(self) -> Dict[str, Any]:
        """Convert to agentic tool function parameter"""
        return {
            "error_code": self.code,
            "severity": "error" if self.severity == 1 else "warning",
            "category": ["type", "module", "syntax", "semantic"][self.category],
            "cluster": self.cluster_id,
            "file_signature": self.file_hash,
            "lines": f"{self.line_range[0]}-{self.line_range[1]}"
        }


# ============================================================================
# REDIS CACHING: Fast lookup for embeddings and glyphs
# ============================================================================

class RedisEmbeddingCache:
    """Redis cache for CUDA embeddings with glyph indexing"""

    EMBED_PREFIX = "embed:"
    GLYPH_PREFIX = "glyph:"
    CLUSTER_PREFIX = "cluster:"
    TTL_SECONDS = 7 * 24 * 3600  # 7 days

    def __init__(self):
        self.redis = REDIS_CLIENT
        self.hits = 0
        self.misses = 0

    def _hash_signature(self, signature: str) -> str:
        """Create consistent hash for signature lookup"""
        return hashlib.sha256(signature.encode()).hexdigest()[:16]

    def get_embedding(self, signature: str) -> Optional[np.ndarray]:
        """Get cached embedding from Redis"""
        if not self.redis:
            return None
        key = f"{self.EMBED_PREFIX}{self._hash_signature(signature)}"
        data = self.redis.get(key)
        if data:
            self.hits += 1
            # Decompress and convert back to numpy
            arr = np.frombuffer(gzip.decompress(data), dtype=np.float32)
            return arr
        self.misses += 1
        return None

    def set_embedding(self, signature: str, embedding: np.ndarray):
        """Cache embedding in Redis with compression"""
        if not self.redis or embedding is None:
            return
        key = f"{self.EMBED_PREFIX}{self._hash_signature(signature)}"
        # Compress for storage (768 floats → ~1KB compressed)
        compressed = gzip.compress(embedding.astype(np.float32).tobytes(), compresslevel=6)
        self.redis.setex(key, self.TTL_SECONDS, compressed)

    def set_glyph(self, signature: str, glyph: Glyph):
        """Store glyph encoding"""
        if not self.redis:
            return
        key = f"{self.GLYPH_PREFIX}{self._hash_signature(signature)}"
        self.redis.setex(key, self.TTL_SECONDS, glyph.to_bytes())

    def get_glyph(self, signature: str) -> Optional[Glyph]:
        """Retrieve glyph encoding"""
        if not self.redis:
            return None
        key = f"{self.GLYPH_PREFIX}{self._hash_signature(signature)}"
        data = self.redis.get(key)
        if data:
            return Glyph.from_bytes(data)
        return None

    def get_cluster_glyphs(self, cluster_id: int, limit: int = 100) -> List[Glyph]:
        """Get all glyphs for a cluster"""
        if not self.redis:
            return []
        pattern = f"{self.GLYPH_PREFIX}*"
        glyphs = []
        for key in self.redis.scan_iter(pattern, count=1000):
            data = self.redis.get(key)
            if data:
                try:
                    g = Glyph.from_bytes(data)
                    if g.cluster_id == cluster_id:
                        glyphs.append(g)
                        if len(glyphs) >= limit:
                            break
                except Exception:
                    pass
        return glyphs

    def stats(self) -> Dict[str, Any]:
        """Cache statistics"""
        return {
            "hits": self.hits,
            "misses": self.misses,
            "hit_rate": self.hits / max(1, self.hits + self.misses),
            "redis_keys": self.redis.dbsize() if self.redis else 0
        }


# ============================================================================
# RAG: Retrieval-Augmented Generation via Qdrant
# ============================================================================

class RAGRetriever:
    """Semantic search over error embeddings"""

    COLLECTION = "phase90_cuda_embeddings"
    CLUSTER_COLLECTION = "phase90_error_clusters"
    FIX_COLLECTION = "phase90_fix_recommendations"

    def __init__(self, model_name: str = "sentence-transformers/all-mpnet-base-v2"):
        self.qdrant = QDRANT
        self.cache = RedisEmbeddingCache()

        if CUDA_AVAILABLE:
            self.model = SentenceTransformer(model_name, device="cuda")
            self.model.half()  # FP16 for RTX 3060 Ti
            print(f"✅ RAG: CUDA enabled on {torch.cuda.get_device_name(0)}")
        else:
            self.model = None
            print("⚠️  RAG: CPU mode (no CUDA)")

    def embed(self, text: str) -> np.ndarray:
        """Generate embedding with cache check"""
        cached = self.cache.get_embedding(text)
        if cached is not None:
            return cached

        if self.model is None:
            return np.zeros(768, dtype=np.float32)

        with torch.no_grad():
            embedding = self.model.encode(text, convert_to_numpy=True)

        self.cache.set_embedding(text, embedding)
        return embedding

    def search(self, query: str, top_k: int = 10) -> List[Dict]:
        """Semantic search for similar errors"""
        if not self.qdrant:
            return []

        embedding = self.embed(query)

        results = self.qdrant.search(
            collection_name=self.COLLECTION,
            query_vector=embedding.tolist(),
            limit=top_k,
            with_payload=True
        )

        return [
            {
                "score": r.score,
                "message": r.payload.get("message", ""),
                "file": r.payload.get("filePath", ""),
                "code": r.payload.get("errorCode", "UNKNOWN"),
                "line": r.payload.get("line", 0),
                "cluster_id": r.payload.get("cluster_id", -1),
                "tech": r.payload.get("tech", [])
            }
            for r in results
        ]

    def get_cluster_summary(self, cluster_id: int) -> Optional[Dict]:
        """Get LLM-generated cluster summary"""
        if not self.qdrant:
            return None

        try:
            results = self.qdrant.scroll(
                collection_name=self.CLUSTER_COLLECTION,
                scroll_filter={
                    "must": [{"key": "cluster_id", "match": {"value": cluster_id}}]
                },
                limit=1,
                with_payload=True
            )
            if results and results[0]:
                return results[0][0].payload
        except Exception as e:
            print(f"⚠️  Cluster query failed: {e}")
        return None

    def get_fix_recommendation(self, cluster_id: int) -> Optional[Dict]:
        """Get fix recommendation for cluster"""
        if not self.qdrant:
            return None

        try:
            results = self.qdrant.scroll(
                collection_name=self.FIX_COLLECTION,
                scroll_filter={
                    "must": [{"key": "cluster_id", "match": {"value": cluster_id}}]
                },
                limit=1,
                with_payload=True
            )
            if results and results[0]:
                return results[0][0].payload
        except Exception:
            pass
        return None


# ============================================================================
# KAG: Knowledge-Augmented Generation via Neo4j
# ============================================================================

class KAGGraph:
    """Knowledge graph operations for error relationships"""

    def __init__(self):
        self.driver = NEO4J_DRIVER

    def get_related_errors(self, error_code: str, limit: int = 20) -> List[Dict]:
        """Find errors related by file, technology, or pattern"""
        if not self.driver:
            return []

        query = """
        MATCH (e:ErrorCode {code: $code})-[:BELONGS_TO]->(c:ErrorCluster)
        MATCH (c)-[:AFFECTS]->(t:Technology)
        MATCH (c)-[:SURFACE]->(s:Surface)
        RETURN c.id as cluster_id, c.summary as summary,
               collect(DISTINCT t.name) as technologies,
               collect(DISTINCT s.name) as surfaces
        LIMIT $limit
        """

        with self.driver.session() as session:
            result = session.run(query, code=error_code, limit=limit)
            return [dict(r) for r in result]

    def get_cluster_dependencies(self, cluster_id: int) -> Dict:
        """Get DAG dependencies for a cluster"""
        if not self.driver:
            return {"nodes": [], "edges": []}

        query = """
        MATCH (c:ErrorCluster {id: $cluster_id})
        OPTIONAL MATCH (c)-[r]->(related)
        RETURN c, type(r) as rel_type, related
        """

        nodes = []
        edges = []

        with self.driver.session() as session:
            result = session.run(query, cluster_id=cluster_id)
            for record in result:
                if record["related"]:
                    related = dict(record["related"])
                    nodes.append({
                        "id": str(related.get("id", related.get("name", "unknown"))),
                        "type": list(record["related"].labels)[0] if record["related"].labels else "Node"
                    })
                    edges.append({
                        "from": str(cluster_id),
                        "to": str(related.get("id", related.get("name", "unknown"))),
                        "type": record["rel_type"]
                    })

        return {"nodes": nodes, "edges": edges}

    def find_fix_path(self, from_cluster: int, to_cluster: int) -> List[Dict]:
        """Find path between clusters for fix ordering (DAG)"""
        if not self.driver:
            return []

        query = """
        MATCH path = shortestPath(
            (a:ErrorCluster {id: $from})-[*..5]-(b:ErrorCluster {id: $to})
        )
        RETURN [n in nodes(path) | {id: n.id, type: labels(n)[0]}] as path_nodes
        """

        with self.driver.session() as session:
            result = session.run(query, {"from": from_cluster, "to": to_cluster})
            record = result.single()
            if record:
                return record["path_nodes"]
        return []


# ============================================================================
# DAG: Directed Acyclic Graph for Fix Priority Ordering
# ============================================================================

class DAGPrioritizer:
    """Compute fix order based on dependencies"""

    def __init__(self, rag: RAGRetriever, kag: KAGGraph):
        self.rag = rag
        self.kag = kag

    def compute_priority(self, clusters: List[int]) -> List[Dict]:
        """
        Compute fix priority order using:
        1. Error count (more = higher priority)
        2. Dependency depth (fix dependencies first)
        3. Technology spread (isolated = easier to fix)
        """
        priorities = []

        for cid in clusters:
            summary = self.rag.get_cluster_summary(cid)
            deps = self.kag.get_cluster_dependencies(cid)

            error_count = summary.get("error_count", 0) if summary else 0
            dep_count = len(deps.get("edges", []))

            # Priority score (higher = fix first)
            score = error_count * 10 - dep_count * 5

            priorities.append({
                "cluster_id": cid,
                "error_count": error_count,
                "dependencies": dep_count,
                "priority_score": score,
                "summary": summary.get("summary", "") if summary else ""
            })

        # Sort by priority score descending
        priorities.sort(key=lambda x: x["priority_score"], reverse=True)

        return priorities

    def get_fix_order(self) -> List[int]:
        """Get ordered list of cluster IDs to fix"""
        all_clusters = list(range(12))  # Phase 90 has 12 clusters
        priorities = self.compute_priority(all_clusters)
        return [p["cluster_id"] for p in priorities]


# ============================================================================
# AGENTIC TOOL FUNCTIONS: For LLM function calling
# ============================================================================

class AgenticToolRegistry:
    """
    Tools that can be called by LLMs for error fixing.
    Each tool returns structured data for the next step.
    """

    def __init__(self):
        self.rag = RAGRetriever()
        self.kag = KAGGraph()
        self.dag = DAGPrioritizer(self.rag, self.kag)
        self.cache = RedisEmbeddingCache()

    def list_tools(self) -> List[Dict]:
        """Return tool definitions for LLM function calling"""
        return [
            {
                "name": "search_errors",
                "description": "Semantic search for similar TypeScript errors",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Error message or code pattern to search"},
                        "top_k": {"type": "integer", "default": 10}
                    },
                    "required": ["query"]
                }
            },
            {
                "name": "get_cluster_info",
                "description": "Get detailed information about an error cluster",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "cluster_id": {"type": "integer", "description": "Cluster ID (0-11)"}
                    },
                    "required": ["cluster_id"]
                }
            },
            {
                "name": "get_fix_recommendation",
                "description": "Get LLM-generated fix recommendation for a cluster",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "cluster_id": {"type": "integer"}
                    },
                    "required": ["cluster_id"]
                }
            },
            {
                "name": "get_fix_order",
                "description": "Get priority-ordered list of clusters to fix",
                "parameters": {"type": "object", "properties": {}}
            },
            {
                "name": "get_related_by_code",
                "description": "Find errors related to a specific error code",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "error_code": {"type": "string", "description": "e.g., TS2345, TS2322"}
                    },
                    "required": ["error_code"]
                }
            },
            {
                "name": "get_cluster_dependencies",
                "description": "Get DAG dependencies for a cluster",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "cluster_id": {"type": "integer"}
                    },
                    "required": ["cluster_id"]
                }
            },
            {
                "name": "get_cache_stats",
                "description": "Get Redis cache statistics",
                "parameters": {"type": "object", "properties": {}}
            }
        ]

    def execute(self, tool_name: str, params: Dict) -> Dict:
        """Execute a tool and return result"""
        if tool_name == "search_errors":
            return {"results": self.rag.search(params["query"], params.get("top_k", 10))}

        elif tool_name == "get_cluster_info":
            summary = self.rag.get_cluster_summary(params["cluster_id"])
            deps = self.kag.get_cluster_dependencies(params["cluster_id"])
            return {
                "cluster_id": params["cluster_id"],
                "summary": summary,
                "dependencies": deps
            }

        elif tool_name == "get_fix_recommendation":
            return self.rag.get_fix_recommendation(params["cluster_id"]) or {}

        elif tool_name == "get_fix_order":
            return {"fix_order": self.dag.get_fix_order()}

        elif tool_name == "get_related_by_code":
            return {"related": self.kag.get_related_errors(params["error_code"])}

        elif tool_name == "get_cluster_dependencies":
            return self.kag.get_cluster_dependencies(params["cluster_id"])

        elif tool_name == "get_cache_stats":
            return self.cache.stats()

        else:
            return {"error": f"Unknown tool: {tool_name}"}


# ============================================================================
# CLI
# ============================================================================

def main():
    import argparse
    import sys
    import io

    # Fix Windows console encoding for emojis
    if sys.platform == 'win32':
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

    parser = argparse.ArgumentParser(description="Phase 90: RAG+KAG+DAG Unified Knowledge Base")
    parser.add_argument("--search", type=str, help="Semantic search query")
    parser.add_argument("--cluster", type=int, help="Get cluster info")
    parser.add_argument("--fix-order", action="store_true", help="Get priority fix order")
    parser.add_argument("--list-tools", action="store_true", help="List agentic tools")
    parser.add_argument("--execute", type=str, help="Execute tool by name")
    parser.add_argument("--params", type=str, default="{}", help="Tool params as JSON")
    parser.add_argument("--stats", action="store_true", help="Show system stats")
    args = parser.parse_args()

    print("[PHASE90] RAG+KAG+DAG Unified Knowledge Base")
    print("=" * 60)

    registry = AgenticToolRegistry()

    if args.list_tools:
        tools = registry.list_tools()
        print(f"\n[TOOLS] Available Agentic Tools ({len(tools)}):")
        for t in tools:
            print(f"  - {t['name']}: {t['description']}")

    elif args.search:
        result = registry.execute("search_errors", {"query": args.search})
        print(f"\n[SEARCH] Results for '{args.search}':")
        for r in result.get("results", [])[:5]:
            print(f"  [{r['score']:.3f}] {r['code']} in {r['file']}:{r['line']}")
            print(f"          Cluster {r['cluster_id']}: {r['message'][:80]}...")

    elif args.cluster is not None:
        result = registry.execute("get_cluster_info", {"cluster_id": args.cluster})
        print(f"\n[CLUSTER] Cluster {args.cluster} Info:")
        if result.get("summary"):
            print(f"  Summary: {result['summary'].get('summary', 'N/A')[:200]}...")
            print(f"  Errors: {result['summary'].get('error_count', 0)}")
        deps = result.get("dependencies", {})
        print(f"  Dependencies: {len(deps.get('edges', []))} edges")

    elif args.fix_order:
        result = registry.execute("get_fix_order", {})
        print("\n[PRIORITY] Fix Order:")
        for i, cid in enumerate(result.get("fix_order", []), 1):
            print(f"  {i}. Cluster {cid}")

    elif args.execute:
        params = json.loads(args.params)
        result = registry.execute(args.execute, params)
        print(f"\n[EXECUTE] {args.execute} Result:")
        print(json.dumps(result, indent=2, default=str))

    elif args.stats:
        stats = registry.cache.stats()
        print(f"\n[STATS] Cache Stats:")
        print(f"  Redis keys: {stats['redis_keys']}")
        print(f"  Hit rate: {stats['hit_rate']:.1%}")
        print(f"  Hits: {stats['hits']}, Misses: {stats['misses']}")

        # Qdrant stats
        if QDRANT:
            for col in ["phase90_cuda_embeddings", "phase90_error_clusters", "phase90_fix_recommendations"]:
                try:
                    info = QDRANT.get_collection(col)
                    print(f"  Qdrant {col}: {info.points_count} points")
                except Exception:
                    pass

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
