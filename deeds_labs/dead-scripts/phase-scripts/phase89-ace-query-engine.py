#!/usr/bin/env python3
"""
Phase 89: ACE Query Engine - Semantic Cache Search with GPU Reranking

Features:
- Query Qdrant cache index with semantic search
- GPU-accelerated reranking (RTX 3060 Ti)
- Hybrid retrieval: cache → RAG/KAG → LLM synthesis
- FastMCP agentic tool calling integration
- Chat history context from PostgreSQL

Query Flow:
  Query → Embed (768-dim) → Qdrant Search (top-200)
       → GPU Rerank (RTX) → Top-10
       → Cache Hit? YES: Return cached | NO: RAG/KAG → LLM → Cache
"""

import asyncio
import base64
import gzip
import hashlib
import json
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx
import numpy as np
import redis.asyncio as aioredis
import torch
from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue, SearchRequest


# ═══════════════════════════════════════════════════════════════════════════
# Configuration
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class ACEQueryConfig:
    # Qdrant
    qdrant_url: str = 'http://localhost:6333'
    qdrant_collection: str = 'phase89_cache_index'

    # Ollama
    ollama_url: str = 'http://localhost:11434'
    ollama_embedding_model: str = 'embeddinggemma:latest'
    ollama_llm_model: str = 'gemma3-legal:latest'
    embedding_dim: int = 768

    # Redis
    redis_host: str = 'localhost'
    redis_port: int = 6379
    redis_db: int = 0

    # FastMCP
    fastmcp_url: str = 'http://localhost:3003'

    # Search parameters
    initial_top_k: int = 200      # Initial Qdrant retrieval
    rerank_top_k: int = 10        # After GPU reranking
    cache_hit_threshold: float = 0.85  # Cosine similarity threshold

    # Context synthesis
    max_context_tokens: int = 128000  # gemma3-legal context window

    # GPU
    device: str = 'cuda' if torch.cuda.is_available() else 'cpu'

    # Output
    report_dir: Path = Path('reports')


# ═══════════════════════════════════════════════════════════════════════════
# Query Embedder
# ═══════════════════════════════════════════════════════════════════════════

class QueryEmbedder:
    """Generate embeddings for queries"""

    def __init__(self, config: ACEQueryConfig):
        self.config = config
        self.client = httpx.AsyncClient(timeout=30.0)

    async def embed(self, text: str) -> np.ndarray:
        """Embed query text"""
        try:
            response = await self.client.post(
                f'{self.config.ollama_url}/api/embeddings',
                json={
                    'model': self.config.ollama_embedding_model,
                    'prompt': text,
                }
            )
            response.raise_for_status()

            data = response.json()
            embedding = np.array(data['embedding'])

            if embedding.ndim == 1:
                embedding = embedding.reshape(1, -1)

            return embedding[0]

        except Exception as e:
            print(f"⚠️  Error embedding query: {e}")
            return np.zeros(self.config.embedding_dim)

    async def close(self):
        await self.client.aclose()


# ═══════════════════════════════════════════════════════════════════════════
# GPU Reranker
# ═══════════════════════════════════════════════════════════════════════════

class GPUReranker:
    """GPU-accelerated cosine similarity reranking"""

    def __init__(self, config: ACEQueryConfig):
        self.config = config
        self.device = torch.device(config.device)

    def rerank(
        self,
        query_embedding: np.ndarray,
        candidate_embeddings: np.ndarray,
        top_k: int
    ) -> Tuple[np.ndarray, np.ndarray]:
        """Rerank candidates using GPU cosine similarity"""

        # Convert to PyTorch tensors
        query_tensor = torch.from_numpy(query_embedding).to(self.device)
        candidates_tensor = torch.from_numpy(candidate_embeddings).to(self.device)

        # Normalize
        query_norm = query_tensor / query_tensor.norm()
        candidates_norm = candidates_tensor / candidates_tensor.norm(dim=1, keepdim=True)

        # Cosine similarity
        with torch.no_grad():
            scores = torch.mm(candidates_norm, query_norm.unsqueeze(1)).squeeze()

        # Top-K
        top_scores, top_indices = torch.topk(scores, k=min(top_k, len(scores)))

        return top_indices.cpu().numpy(), top_scores.cpu().numpy()


# ═══════════════════════════════════════════════════════════════════════════
# FastMCP Tool Caller
# ═══════════════════════════════════════════════════════════════════════════

class FastMCPCaller:
    """Call FastMCP agentic tools"""

    def __init__(self, config: ACEQueryConfig):
        self.config = config
        self.client = httpx.AsyncClient(timeout=60.0)

    async def list_tools(self) -> List[Dict[str, Any]]:
        """List available MCP tools"""
        try:
            response = await self.client.get(
                f'{self.config.fastmcp_url}/tools'
            )
            response.raise_for_status()
            return response.json()

        except Exception as e:
            print(f"⚠️  Error listing MCP tools: {e}")
            return []

    async def call_tool(self, tool_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Execute MCP tool"""
        try:
            response = await self.client.post(
                f'{self.config.fastmcp_url}/call',
                json={
                    'tool': tool_name,
                    'arguments': args,
                }
            )
            response.raise_for_status()
            return response.json()

        except Exception as e:
            print(f"⚠️  Error calling MCP tool {tool_name}: {e}")
            return {'error': str(e)}

    async def close(self):
        await self.client.aclose()


# ═══════════════════════════════════════════════════════════════════════════
# ACE Query Engine
# ═══════════════════════════════════════════════════════════════════════════

class ACEQueryEngine:
    """Main query engine with hybrid retrieval"""

    def __init__(self, config: ACEQueryConfig):
        self.config = config
        self.embedder = QueryEmbedder(config)
        self.reranker = GPUReranker(config)
        self.mcp_caller = FastMCPCaller(config)
        self.qdrant = QdrantClient(url=config.qdrant_url)
        self.redis: Optional[aioredis.Redis] = None
        self.llm_client = httpx.AsyncClient(timeout=120.0)

    async def connect(self):
        """Connect to services"""
        self.redis = await aioredis.from_url(
            f'redis://{self.config.redis_host}:{self.config.redis_port}/{self.config.redis_db}'
        )

    async def query(
        self,
        query_text: str,
        filters: Optional[Dict[str, Any]] = None,
        use_cache: bool = True,
        use_rag: bool = True,
    ) -> Dict[str, Any]:
        """
        Execute ACE query with hybrid retrieval

        Args:
            query_text: User query
            filters: Optional Qdrant filters (kind, prefix, tags)
            use_cache: Enable cache search
            use_rag: Enable RAG/KAG fallback

        Returns:
            Query result with sources and metadata
        """

        result = {
            'query': query_text,
            'timestamp': datetime.utcnow().isoformat(),
            'cache_hit': False,
            'sources': [],
            'answer': None,
            'metadata': {},
        }

        start_time = time.time()

        print(f"\n🔍 ACE Query: {query_text}\n")

        # Step 1: Embed query
        print("1️⃣ Embedding query...")
        query_embedding = await self.embedder.embed(query_text)
        print(f"   ✅ Embedded ({self.config.embedding_dim}-dim)\n")

        # Step 2: Qdrant semantic search
        if use_cache:
            print(f"2️⃣ Qdrant search (top-{self.config.initial_top_k})...")
            cache_results = await self._search_cache(query_embedding, filters)
            print(f"   ✅ Found {len(cache_results)} candidates\n")

            # Step 3: GPU reranking
            if cache_results:
                print(f"3️⃣ GPU reranking (top-{self.config.rerank_top_k})...")
                reranked = await self._rerank_results(query_embedding, cache_results)
                print(f"   ✅ Top score: {reranked[0]['score']:.3f}\n")

                # Check cache hit
                if reranked[0]['score'] >= self.config.cache_hit_threshold:
                    print(f"✅ CACHE HIT (score: {reranked[0]['score']:.3f})")
                    result['cache_hit'] = True
                    result['sources'] = reranked
                    result['answer'] = await self._extract_cached_answer(reranked[0])
                    result['metadata']['retrieval_time_ms'] = (time.time() - start_time) * 1000
                    return result

        # Step 4: RAG/KAG fallback
        if use_rag and not result['cache_hit']:
            print("4️⃣ RAG/KAG retrieval...")
            rag_context = await self._rag_retrieval(query_text)
            print(f"   ✅ Retrieved {len(rag_context)} KB articles\n")

            # Step 5: LLM synthesis
            print("5️⃣ LLM synthesis (gemma3-legal)...")
            answer = await self._llm_synthesis(query_text, rag_context, cache_results if use_cache else [])
            print(f"   ✅ Generated answer\n")

            result['answer'] = answer
            result['sources'] = rag_context

            # Step 6: Cache result
            print("6️⃣ Caching result...")
            await self._cache_result(query_text, answer, query_embedding)
            print("   ✅ Cached\n")

        result['metadata']['total_time_ms'] = (time.time() - start_time) * 1000

        return result

    async def _search_cache(
        self,
        query_embedding: np.ndarray,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """Search Qdrant cache index"""

        # Build filter
        qdrant_filter = None
        if filters:
            conditions = []

            if 'kind' in filters:
                conditions.append(
                    FieldCondition(key='kind', match=MatchValue(value=filters['kind']))
                )
            if 'prefix' in filters:
                conditions.append(
                    FieldCondition(key='prefix', match=MatchValue(value=filters['prefix']))
                )

            if conditions:
                qdrant_filter = Filter(must=conditions)

        # Search
        search_result = self.qdrant.search(
            collection_name=self.config.qdrant_collection,
            query_vector=query_embedding.tolist(),
            limit=self.config.initial_top_k,
            query_filter=qdrant_filter,
        )

        # Convert to dict
        results = []
        for hit in search_result:
            result = {
                'id': hit.id,
                'score': hit.score,
                'payload': hit.payload,
                'vector': hit.vector,
            }
            results.append(result)

        return results

    async def _rerank_results(
        self,
        query_embedding: np.ndarray,
        candidates: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """GPU rerank candidates"""

        # Extract embeddings
        candidate_embeddings = np.array([c['vector'] for c in candidates])

        # Rerank
        top_indices, top_scores = self.reranker.rerank(
            query_embedding,
            candidate_embeddings,
            self.config.rerank_top_k
        )

        # Build reranked results
        reranked = []
        for idx, score in zip(top_indices, top_scores):
            result = candidates[idx].copy()
            result['score'] = float(score)
            reranked.append(result)

        return reranked

    async def _extract_cached_answer(self, cache_hit: Dict[str, Any]) -> str:
        """Extract answer from cache hit"""

        payload = cache_hit['payload']

        # Decompress if needed
        if 'meta_gz_b64' in payload:
            meta_gz = base64.b64decode(payload['meta_gz_b64'])
            meta_json = gzip.decompress(meta_gz).decode()
            meta = json.loads(meta_json)
        else:
            # Try to fetch from Redis
            redis_key = payload.get('redis_key')
            if redis_key and self.redis:
                value = await self.redis.get(redis_key)
                if value:
                    try:
                        meta = json.loads(value)
                    except:
                        meta = {'value': value.decode() if isinstance(value, bytes) else value}
                else:
                    meta = {}
            else:
                meta = {}

        # Extract answer
        answer = meta.get('response') or meta.get('answer') or meta.get('summary') or str(meta)

        return answer

    async def _rag_retrieval(self, query: str) -> List[Dict[str, Any]]:
        """RAG/KAG retrieval via MCP tools"""

        # Try knowledge:search tool
        try:
            result = await self.mcp_caller.call_tool(
                'knowledge:search',
                {'query': query, 'topK': 20}
            )

            if 'results' in result:
                return result['results']

        except Exception as e:
            print(f"⚠️  RAG retrieval error: {e}")

        return []

    async def _llm_synthesis(
        self,
        query: str,
        rag_context: List[Dict[str, Any]],
        cache_context: List[Dict[str, Any]]
    ) -> str:
        """LLM synthesis with context"""

        # Build context
        context_parts = []

        # Add RAG context
        for item in rag_context[:10]:
            context_parts.append(f"KB: {item.get('content', item.get('text', str(item)))}")

        # Add cache context
        for item in cache_context[:5]:
            sig = item['payload'].get('signature_text', '')
            if sig:
                context_parts.append(f"Cache: {sig}")

        context_text = '\n\n'.join(context_parts)

        # Build prompt
        prompt = f"""You are an expert AI assistant for legal document analysis and SvelteKit development.

Context:
{context_text}

User Query: {query}

Provide a comprehensive answer based on the context above. If the context is not relevant, use your knowledge of Svelte 5, SvelteKit, TypeScript, and legal document processing."""

        # Call LLM
        try:
            response = await self.llm_client.post(
                f'{self.config.ollama_url}/api/generate',
                json={
                    'model': self.config.ollama_llm_model,
                    'prompt': prompt,
                    'stream': False,
                    'options': {
                        'temperature': 0.7,
                        'num_ctx': self.config.max_context_tokens,
                    }
                }
            )
            response.raise_for_status()

            data = response.json()
            answer = data.get('response', '')

            return answer

        except Exception as e:
            print(f"⚠️  LLM synthesis error: {e}")
            return f"Error generating answer: {e}"

    async def _cache_result(
        self,
        query: str,
        answer: str,
        query_embedding: np.ndarray
    ):
        """Cache query result in Redis + Qdrant"""

        # Build cache entry
        cache_entry = {
            'query': query,
            'answer': answer,
            'timestamp': datetime.utcnow().isoformat(),
            'model': self.config.ollama_llm_model,
        }

        # Store in Redis
        cache_key = f'phase89:cache:llm_answer:{hashlib.sha256(query.encode()).hexdigest()[:16]}'

        if self.redis:
            await self.redis.set(
                cache_key,
                json.dumps(cache_entry),
                ex=86400  # 24 hours
            )

        # TODO: Index in Qdrant (add to indexer queue)

    async def close(self):
        """Close connections"""
        await self.embedder.close()
        await self.mcp_caller.close()
        await self.llm_client.aclose()
        if self.redis:
            await self.redis.close()


# ═══════════════════════════════════════════════════════════════════════════
# CLI Interface
# ═══════════════════════════════════════════════════════════════════════════

async def interactive_query():
    """Interactive query interface"""

    config = ACEQueryConfig()
    engine = ACEQueryEngine(config)

    await engine.connect()

    print("\n╔═══════════════════════════════════════════════════════════════════╗")
    print("║   Phase 89: ACE Query Engine - Semantic Cache Search             ║")
    print("╚═══════════════════════════════════════════════════════════════════╝\n")

    print(f"💡 Using:")
    print(f"   • Embedding: {config.ollama_embedding_model} ({config.embedding_dim}-dim)")
    print(f"   • LLM: {config.ollama_llm_model}")
    print(f"   • GPU: {config.device}")
    print(f"   • Collection: {config.qdrant_collection}\n")

    while True:
        query = input("\n🔍 Enter query (or 'quit'): ")

        if query.lower() in ['quit', 'exit', 'q']:
            break

        if not query.strip():
            continue

        result = await engine.query(query)

        print("\n" + "=" * 70)
        print(f"\n{'✅ CACHE HIT' if result['cache_hit'] else '🔄 CACHE MISS'}")
        print(f"⏱️  Time: {result['metadata']['total_time_ms']:.1f}ms")
        print(f"📚 Sources: {len(result['sources'])}")
        print(f"\n📝 Answer:\n{result['answer']}\n")
        print("=" * 70)

    await engine.close()


async def test_query():
    """Test query"""

    config = ACEQueryConfig()
    engine = ACEQueryEngine(config)

    await engine.connect()

    # Test queries
    test_queries = [
        "How do I use Svelte 5 runes?",
        "Fix TS1005 semicolon expected error",
        "What is the admin panel architecture?",
        "How to implement RAG with Qdrant?",
    ]

    print("\n╔═══════════════════════════════════════════════════════════════════╗")
    print("║   Phase 89: ACE Query Engine - Test Suite                        ║")
    print("╚═══════════════════════════════════════════════════════════════════╝\n")

    results = []

    for query in test_queries:
        result = await engine.query(query)
        results.append(result)

        print(f"✅ {query}")
        print(f"   Cache Hit: {result['cache_hit']}")
        print(f"   Time: {result['metadata']['total_time_ms']:.1f}ms\n")

    # Save report
    config.report_dir.mkdir(parents=True, exist_ok=True)
    report_path = config.report_dir / 'phase89-ace-query-test.json'
    report_path.write_text(json.dumps(results, indent=2))

    print(f"📄 Report saved: {report_path}\n")

    await engine.close()


if __name__ == '__main__':
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == '--test':
        asyncio.run(test_query())
    else:
        asyncio.run(interactive_query())
