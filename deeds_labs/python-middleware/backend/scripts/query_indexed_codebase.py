#!/usr/bin/env python3
"""
Query FastMCP Indexed Codebase
Search by natural language, tags, or file patterns
"""

import os
import sys
import asyncio
import json
import hashlib
from pathlib import Path
from typing import List, Dict, Optional
import aiohttp

sys.path.insert(0, str(Path(__file__).parent.parent))

class FastMCPQueryEngine:
    """Query engine for indexed codebase"""

    def __init__(self):
        self.qdrant_url = os.getenv("QDRANT_URL", "http://localhost:6333")
        self.redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        self.ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
        self.collection = "fastmcp_file_profiles"

    async def embed_query(self, query: str) -> List[float]:
        """Generate embedding for search query"""
        try:
            async with aiohttp.ClientSession() as session:
                payload = {
                    "model": "embeddinggemma:latest",
                    "prompt": query
                }

                async with session.post(
                    f"{self.ollama_url}/api/embeddings",
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return data.get("embedding", [])
        except Exception as e:
            print(f"❌ Embedding error: {e}")
        return []

    async def semantic_search(
        self,
        query: str,
        limit: int = 10,
        role_filter: Optional[str] = None,
        surface_filter: Optional[str] = None
    ) -> List[Dict]:
        """Semantic search using natural language query"""

        print(f"🔍 Searching: '{query}'")
        print(f"   Filters: role={role_filter}, surface={surface_filter}")

        # Generate query embedding
        vector = await self.embed_query(query)
        if not vector:
            return []

        # Build filter
        filter_dict = {"must": []}
        if role_filter:
            filter_dict["must"].append({
                "key": "role",
                "match": {"value": role_filter}
            })
        if surface_filter:
            filter_dict["must"].append({
                "key": "surface",
                "match": {"any": [surface_filter]}
            })

        # Search Qdrant
        try:
            async with aiohttp.ClientSession() as session:
                payload = {
                    "vector": vector,
                    "limit": limit,
                    "with_payload": True,
                    "score_threshold": 0.5
                }

                if filter_dict["must"]:
                    payload["filter"] = filter_dict

                async with session.post(
                    f"{self.qdrant_url}/collections/{self.collection}/points/search",
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return data.get("result", [])
                    else:
                        print(f"❌ Search error: {resp.status}")
        except Exception as e:
            print(f"❌ Search failed: {e}")

        return []

    async def get_by_tag(self, tag: str) -> List[str]:
        """Get all files with specific tag from Redis"""
        try:
            import redis.asyncio as redis

            r = redis.from_url(self.redis_url)
            files = await r.smembers(f"tag:{tag}")
            await r.aclose()

            return [f.decode() if isinstance(f, bytes) else f for f in files]
        except Exception as e:
            print(f"❌ Redis error: {e}")
            return []

    async def get_collection_stats(self) -> Dict:
        """Get collection statistics"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.qdrant_url}/collections/{self.collection}",
                    timeout=aiohttp.ClientTimeout(total=5)
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return data.get("result", {})
        except Exception as e:
            print(f"❌ Stats error: {e}")
        return {}

    def format_result(self, result: Dict, rank: int):
        """Format search result for display"""
        score = result.get("score", 0)
        payload = result.get("payload", {})

        file_path = payload.get("file_path", "unknown")
        role = payload.get("role", "unknown")
        tags = payload.get("tags", [])
        summary = payload.get("summary", "No summary")
        comments = payload.get("comments", [])

        print(f"\n{rank}. {file_path}")
        print(f"   Score: {score:.3f} | Role: {role} | Tags: {', '.join(tags)}")
        print(f"   Summary: {summary[:100]}...")
        if comments:
            print(f"   Comments: {len(comments)} extracted")

async def main():
    import argparse

    parser = argparse.ArgumentParser(description="Query indexed codebase")
    parser.add_argument("query", nargs="?", help="Search query")
    parser.add_argument("--role", help="Filter by role (component, api_route, service)")
    parser.add_argument("--surface", help="Filter by surface (ui, api, rag, ace)")
    parser.add_argument("--tag", help="Get files by tag (from Redis)")
    parser.add_argument("--stats", action="store_true", help="Show collection stats")
    parser.add_argument("--limit", type=int, default=10, help="Max results")

    args = parser.parse_args()

    engine = FastMCPQueryEngine()

    print("=" * 70)
    print("🔍 FastMCP Codebase Query Engine")
    print("=" * 70)
    print()

    # Show stats
    if args.stats:
        print("📊 Collection Statistics...")
        stats = await engine.get_collection_stats()
        if stats:
            print(f"   Collection: {engine.collection}")
            print(f"   Points: {stats.get('points_count', 0):,}")
            print(f"   Vectors: {stats.get('vectors_count', 0):,}")
            config = stats.get('config', {})
            vec_config = config.get('params', {}).get('vectors', {})
            print(f"   Dimension: {vec_config.get('size', 0)}d")
            print(f"   Distance: {vec_config.get('distance', 'unknown')}")
        print()
        return

    # Query by tag
    if args.tag:
        print(f"🏷️  Files tagged '{args.tag}':")
        files = await engine.get_by_tag(args.tag)
        for i, f in enumerate(files[:args.limit], 1):
            print(f"   {i}. {f}")
        if len(files) > args.limit:
            print(f"   ... and {len(files) - args.limit} more")
        print(f"\n   Total: {len(files)} files")
        return

    # Semantic search
    if args.query:
        results = await engine.semantic_search(
            args.query,
            limit=args.limit,
            role_filter=args.role,
            surface_filter=args.surface
        )

        if results:
            print(f"\n✅ Found {len(results)} results:")
            for i, result in enumerate(results, 1):
                engine.format_result(result, i)
        else:
            print("❌ No results found")

        print()
        return

    # No arguments - show help
    parser.print_help()
    print()
    print("Examples:")
    print("  python query_indexed_codebase.py 'authentication service'")
    print("  python query_indexed_codebase.py 'button component' --role component")
    print("  python query_indexed_codebase.py 'vector database' --surface rag")
    print("  python query_indexed_codebase.py --tag ui --limit 20")
    print("  python query_indexed_codebase.py --stats")
    print()

if __name__ == "__main__":
    asyncio.run(main())
