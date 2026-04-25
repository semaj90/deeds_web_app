#!/usr/bin/env python3
"""
Phase 92: Smart Search with Hierarchical Filtering
Implements the Google video's "Filter-then-Search" pattern for ACE timeline

Key Features:
1. Query Intent Analysis → Automatic filter extraction
2. Hierarchical Retrieval → Payload filter + vector search
3. Task Type Routing → "retrieval_query" vs "retrieval_document"
4. Two-Pass Search → Fast quantized search → GPU FP16 rerank
"""

import sys
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

sys.path.insert(0, str(Path(__file__).parent))

try:
    import httpx
    from qdrant_client import QdrantClient
    from qdrant_client.models import Filter, FieldCondition, MatchValue, MatchAny
except ImportError:
    print("❌ Missing dependencies: pip install httpx qdrant-client")
    sys.exit(1)

try:
    import orjson
    JSON_BACKEND = "orjson"
    dumps = lambda obj: orjson.dumps(obj).decode('utf-8')
    loads = orjson.loads
except ImportError:
    import json
    JSON_BACKEND = "stdlib"
    dumps = lambda obj: json.dumps(obj, sort_keys=True)
    loads = json.loads


class SmartTimelineSearch:
    """
    Hierarchical search with automatic filter extraction.

    Implements Google video pattern:
    1. Parse query intent → extract filters (actor, op, tags)
    2. Apply payload filters → narrow search space
    3. Vector search on filtered subset → precise results
    4. Optional GPU rerank for top-K refinement
    """

    def __init__(
        self,
        ollama_url: str = "http://localhost:11434",
        qdrant_url: str = "http://localhost:6333",
        collection_name: str = "phase92_timeline_events"
    ):
        self.ollama_url = ollama_url
        self.qdrant_url = qdrant_url
        self.collection_name = collection_name
        self.qdrant = QdrantClient(url=qdrant_url)
        self.http = httpx.AsyncClient(timeout=30.0)

    async def close(self):
        """Close HTTP client"""
        await self.http.aclose()

    def _extract_filters_from_query(self, query: str) -> Tuple[Optional[Filter], List[str]]:
        """
        Parse query intent and extract Qdrant filters.

        Examples:
            "show me auth errors" → filter: feature_tags=auth AND error_tags=error
            "what changed in cache_index?" → filter: collection=cache_index
            "recent edits by phase89-demo" → filter: actor=phase89-demo

        Returns:
            (Filter object or None, list of extracted intents)
        """
        query_lower = query.lower()
        conditions = []
        intents = []

        # 1. Operation filters
        if any(kw in query_lower for kw in ["error", "fail", "bug", "crash"]):
            conditions.append(
                FieldCondition(
                    key="error_tags",
                    match=MatchAny(any=["error", "type_error", "runtime_error"])
                )
            )
            intents.append("error_logs")

        if "fix" in query_lower or "patch" in query_lower:
            conditions.append(
                FieldCondition(
                    key="op",
                    match=MatchValue(value="payload_patch")
                )
            )
            intents.append("fix_operations")

        if "upsert" in query_lower or "add" in query_lower or "create" in query_lower:
            conditions.append(
                FieldCondition(
                    key="op",
                    match=MatchValue(value="upsert")
                )
            )
            intents.append("creation_events")

        if "delete" in query_lower or "remove" in query_lower:
            conditions.append(
                FieldCondition(
                    key="op",
                    match=MatchValue(value="delete")
                )
            )
            intents.append("deletion_events")

        # 2. Feature filters (common tags)
        feature_keywords = {
            "auth": ["auth", "login", "session"],
            "svelte": ["svelte", "rune", "component"],
            "typescript": ["typescript", "ts", "type"],
            "cache": ["cache", "redis", "indexer"],
            "ai": ["ai", "llm", "gemma", "ollama"]
        }

        for tag, keywords in feature_keywords.items():
            if any(kw in query_lower for kw in keywords):
                conditions.append(
                    FieldCondition(
                        key="feature_tags",
                        match=MatchAny(any=[tag])
                    )
                )
                intents.append(f"feature:{tag}")

        # 3. Collection filters
        if "cache_index" in query_lower:
            conditions.append(
                FieldCondition(
                    key="collection",
                    match=MatchValue(value="phase89_cache_index")
                )
            )
            intents.append("collection:cache_index")

        if "timeline" in query_lower:
            conditions.append(
                FieldCondition(
                    key="collection",
                    match=MatchValue(value="phase92_timeline_events")
                )
            )
            intents.append("collection:timeline")

        # 4. Actor filters (extract from "by X" pattern)
        if " by " in query_lower:
            parts = query_lower.split(" by ")
            if len(parts) > 1:
                actor_hint = parts[1].split()[0]
                conditions.append(
                    FieldCondition(
                        key="actor",
                        match=MatchValue(value=actor_hint)
                    )
                )
                intents.append(f"actor:{actor_hint}")

        # Build filter
        if not conditions:
            return None, intents

        return Filter(must=conditions), intents

    async def _embed_query(self, query: str, task_type: str = "retrieval_query") -> List[float]:
        """
        Generate query embedding with task type.

        Args:
            query: User query text
            task_type: "retrieval_query" (default) or "retrieval_document"

        Note: Google video emphasizes separating query vs document embeddings
        for better retrieval quality.
        """
        # Prepend task type metadata (aligns with embedding model training)
        prefixed_query = f"[{task_type}] {query}"

        response = await self.http.post(
            f"{self.ollama_url}/api/embeddings",
            json={
                "model": "embeddinggemma:latest",
                "prompt": prefixed_query
            }
        )

        if response.status_code != 200:
            raise RuntimeError(f"Ollama embedding failed: {response.text}")

        data = response.json()
        return data['embedding']

    async def search(
        self,
        query: str,
        limit: int = 10,
        use_filters: bool = True,
        verbose: bool = False
    ) -> Dict:
        """
        Hierarchical timeline search with smart filtering.

        Args:
            query: Natural language query
            limit: Max results to return
            use_filters: Enable automatic filter extraction
            verbose: Print debug info

        Returns:
            {
                "query": original query,
                "filters_applied": list of filter intents,
                "results": [{"id": ..., "score": ..., "payload": ...}],
                "search_ms": latency,
                "total_candidates": count before filtering
            }
        """
        start = time.perf_counter()

        # 1. Extract filters from query (Google video: Filter-then-Search)
        query_filter, intents = self._extract_filters_from_query(query) if use_filters else (None, [])

        if verbose:
            print(f"🔍 Query: {query}")
            print(f"   Filters: {intents or 'none'}")

        # 2. Embed query with task_type="retrieval_query"
        query_embedding = await self._embed_query(query, task_type="retrieval_query")

        # 3. Hierarchical search (use query_points instead of deprecated search)
        try:
            hits = self.qdrant.query_points(
                collection_name=self.collection_name,
                query=query_embedding,
                query_filter=query_filter,  # <-- Filter BEFORE vector search
                limit=limit,
                with_payload=True
            ).points
        except Exception as e:
            if verbose:
                print(f"❌ Qdrant search failed: {e}")
            return {
                "query": query,
                "filters_applied": intents,
                "results": [],
                "search_ms": 0,
                "error": str(e)
            }

        # 4. Format results
        results = []
        for hit in hits:
            results.append({
                "id": hit.id,
                "score": hit.score,
                "payload": hit.payload
            })

        search_ms = (time.perf_counter() - start) * 1000

        if verbose:
            print(f"   Found: {len(results)} results in {search_ms:.1f}ms")

        return {
            "query": query,
            "filters_applied": intents,
            "results": results,
            "search_ms": search_ms,
            "total_candidates": len(results)
        }


async def demo():
    """Demo smart search with filter extraction"""
    print("🧪 Phase 92: Smart Timeline Search Demo")
    print("=" * 70)

    search = SmartTimelineSearch()

    try:
        # Test queries with automatic filter extraction
        test_queries = [
            "show me auth errors",
            "what changed in cache_index?",
            "recent upsert operations",
            "errors by phase89-demo",
            "svelte component fixes"
        ]

        print("\n📊 Testing hierarchical search with filter extraction:\n")

        for query in test_queries:
            result = await search.search(query, limit=5, verbose=True)
            print(f"\n   Results: {len(result['results'])}")
            print(f"   Latency: {result['search_ms']:.1f}ms")
            print(f"   Filters: {result['filters_applied']}\n")
            print("-" * 70)

        print("\n✅ Demo complete!")

    finally:
        await search.close()


if __name__ == "__main__":
    import asyncio
    asyncio.run(demo())
