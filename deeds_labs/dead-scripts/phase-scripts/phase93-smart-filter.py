#!/usr/bin/env python3
"""
Phase 93: Smart Filtering + Hierarchical Retrieval
Implements the "LangExtract + RAG" video architecture:
  1. Query Intent Extraction ("show me auth errors" → tags: auth + error)
  2. Qdrant Payload Filtering BEFORE vector search
  3. GPU Rerank for precision
  4. Typed Artifacts (retrieval_document vs retrieval_query)

Video Insights:
  [00:24] Version Collision → Fix: run_id + timestamp filtering
  [03:53] Schema is Destiny → Fix: Strict JSON validation
  [07:39] Hierarchical Retrieval → Fix: Filter THEN search

Architecture Flow:
  Query → Intent Extract → Payload Filter → HNSW Search → GPU Rerank → Results

Usage:
    python scripts/phase93-smart-filter.py "show me auth errors in Svelte components"
    python scripts/phase93-smart-filter.py "TS1005 runes migration" --collection phase89_cache_index
"""

import argparse
import asyncio
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Fix Unicode encoding on Windows
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

sys.path.insert(0, str(Path(__file__).parent))

try:
    import httpx
    import torch
    from qdrant_client import QdrantClient
    from qdrant_client.http import models
except ImportError:
    print("❌ Missing dependencies. Install:")
    print("   pip install httpx torch qdrant-client")
    sys.exit(1)

# =============================================================================
# CONFIGURATION
# =============================================================================
QDRANT_HOST = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", 6333))
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
EMBEDDING_MODEL = "embeddinggemma:latest"
DEFAULT_COLLECTION = "phase89_cache_index"

# Smart Filter: Canonical Tag Taxonomy (from your logs)
FEATURE_TAG_ALIASES = {
    'svelte': ['svelte5', 'sveltekit', 'svelte-kit', 'component'],
    'react': ['reactjs', 'react-hooks', 'jsx'],
    'typescript': ['ts', 'tsx', 'type-checking', 'tsc'],
    'docker': ['dockerfile', 'docker-compose', 'containers'],
    'database': ['db', 'postgres', 'postgresql', 'prisma'],
    'api': ['rest', 'endpoint', 'route-handler'],
    'auth': ['authentication', 'authorization', 'lucia', 'login'],
    'rag': ['retrieval', 'embedding', 'qdrant', 'vector-search'],
    'cache': ['redis', 'caching', 'memoization'],
    'validation': ['langextract', 'validator', 'schema']
}

ERROR_TAG_ALIASES = {
    'ts2304': ['cannot-find-name', 'undefined-var'],
    'ts2345': ['argument-type-mismatch', 'incompatible-types'],
    'ts2322': ['type-not-assignable', 'assignment-error'],
    'ts7006': ['implicit-any', 'missing-type'],
    'ts1005': ['expected-token', 'syntax-error'],
    'svelte-parse': ['svelte-syntax-error', 'template-error']
}

# GPU Thresholds (from phase89-gpu-rerank.py)
GPU_THRESHOLDS = {
    'MISS': 0.38,
    'VERIFY': 0.55,
    'SAFE_REUSE': 0.55
}

# =============================================================================
# INTENT EXTRACTION (Video [04:27] - Few-Shot Learning)
# =============================================================================
class IntentExtractor:
    """Extract tags + filters from natural language queries."""

    def __init__(self):
        self.feature_patterns = self._build_patterns(FEATURE_TAG_ALIASES)
        self.error_patterns = self._build_patterns(ERROR_TAG_ALIASES)

    def _build_patterns(self, aliases: Dict[str, List[str]]) -> Dict[str, re.Pattern]:
        """Compile regex patterns for each canonical tag."""
        patterns = {}
        for canonical, variants in aliases.items():
            # Match any variant (case-insensitive)
            pattern = r'\b(' + '|'.join(re.escape(v) for v in variants + [canonical]) + r')\b'
            patterns[canonical] = re.compile(pattern, re.IGNORECASE)
        return patterns

    def extract(self, query: str) -> Dict:
        """
        Extract structured intent from query.

        Returns:
            {
                'feature_tags': ['svelte', 'auth'],
                'error_tags': ['ts1005'],
                'time_filter': 24,  # hours
                'collection_filter': 'phase89_cache_index',
                'op_filter': 'upsert'
            }
        """
        intent = {
            'feature_tags': [],
            'error_tags': [],
            'time_filter': None,
            'collection_filter': None,
            'op_filter': None
        }

        # 1. Extract Feature Tags
        for canonical, pattern in self.feature_patterns.items():
            if pattern.search(query):
                intent['feature_tags'].append(canonical)

        # 2. Extract Error Tags
        for canonical, pattern in self.error_patterns.items():
            if pattern.search(query):
                intent['error_tags'].append(canonical)

        # 3. Extract Time Filter ("last 24 hours", "yesterday", "recent")
        time_patterns = [
            (r'last\s+(\d+)\s+hours?', lambda m: int(m.group(1))),
            (r'last\s+(\d+)\s+days?', lambda m: int(m.group(1)) * 24),
            (r'yesterday', lambda m: 24),
            (r'recent|latest', lambda m: 24),
            (r'this\s+week', lambda m: 168)
        ]
        for pattern, extractor in time_patterns:
            match = re.search(pattern, query, re.IGNORECASE)
            if match:
                intent['time_filter'] = extractor(match)
                break

        # 4. Extract Collection Filter
        collection_patterns = [
            r'in\s+(phase\d+_\w+)',
            r'from\s+(phase\d+_\w+)',
            r'collection[:\s]+(phase\d+_\w+)'
        ]
        for pattern in collection_patterns:
            match = re.search(pattern, query, re.IGNORECASE)
            if match:
                intent['collection_filter'] = match.group(1)
                break

        # 5. Extract Operation Filter
        op_keywords = ['upsert', 'delete', 'update', 'create', 'patch']
        for op in op_keywords:
            if re.search(r'\b' + op + r'\b', query, re.IGNORECASE):
                intent['op_filter'] = op
                break

        return intent

# =============================================================================
# SMART FILTER BUILDER (Video [07:39] - Hierarchical Retrieval)
# =============================================================================
class SmartFilterBuilder:
    """Build Qdrant Filter from extracted intent."""

    @staticmethod
    def build(intent: Dict, collection: str = DEFAULT_COLLECTION) -> Optional[models.Filter]:
        """
        Build Qdrant Filter from intent.

        The Video's Key Insight: Filter BEFORE vector search narrows the search space,
        guaranteeing semantic relevance within the correct context (no version collisions).
        """
        must_conditions = []

        # 1. Feature Tags Filter (AND logic)
        if intent['feature_tags']:
            for tag in intent['feature_tags']:
                must_conditions.append(
                    models.FieldCondition(
                        key="feature_tags",
                        match=models.MatchValue(value=tag)
                    )
                )

        # 2. Error Tags Filter (AND logic)
        if intent['error_tags']:
            for tag in intent['error_tags']:
                must_conditions.append(
                    models.FieldCondition(
                        key="error_tags",
                        match=models.MatchValue(value=tag)
                    )
                )

        # 3. Time Filter (for timeline collection)
        if intent['time_filter'] and collection == "phase92_timeline_events":
            cutoff = datetime.now(timezone.utc) - timedelta(hours=intent['time_filter'])
            must_conditions.append(
                models.FieldCondition(
                    key="ts",
                    range=models.Range(gte=cutoff.timestamp())
                )
            )

        # 4. Collection Filter (for timeline)
        if intent['collection_filter'] and collection == "phase92_timeline_events":
            must_conditions.append(
                models.FieldCondition(
                    key="collection",
                    match=models.MatchValue(value=intent['collection_filter'])
                )
            )

        # 5. Operation Filter (for timeline)
        if intent['op_filter'] and collection == "phase92_timeline_events":
            must_conditions.append(
                models.FieldCondition(
                    key="op",
                    match=models.MatchValue(value=intent['op_filter'])
                )
            )

        # Return None if no filters (full vector search)
        if not must_conditions:
            return None

        return models.Filter(must=must_conditions)

# =============================================================================
# EMBEDDING CLIENT (Video [08:59] - Task Types)
# =============================================================================
class EmbeddingClient:
    """
    Typed Artifacts Philosophy: Separate query vs document embeddings.
    EmbeddingGemma supports task_type for optimized retrieval.
    """

    def __init__(self, ollama_url: str = OLLAMA_URL):
        self.ollama_url = ollama_url
        self.client = httpx.AsyncClient(timeout=30.0)

    async def embed(
        self,
        text: str,
        task_type: str = "retrieval_query"  # or "retrieval_document"
    ) -> List[float]:
        """
        Embed text with task_type hint.

        task_type:
            - retrieval_query: For user queries ("fix memory leak")
            - retrieval_document: For stored artifacts ("memory management module")
        """
        response = await self.client.post(
            f"{self.ollama_url}/api/embeddings",
            json={
                'model': EMBEDDING_MODEL,
                'prompt': text,
                'options': {
                    'task_type': task_type  # Video [08:59] - Typed Artifacts
                }
            }
        )
        data = response.json()
        return data['embedding']

    async def close(self):
        await self.client.aclose()

# =============================================================================
# GPU RERANK ENGINE (Video [05:51] - Two-Pass Search)
# =============================================================================
class GPURerankEngine:
    """
    Two-Pass Search:
      1. HNSW (fast, approximate)
      2. GPU (precise, exact cosine similarity on FP16)
    """

    def __init__(self, device: str = "cuda"):
        self.device = torch.device(device if torch.cuda.is_available() else "cpu")
        self.thresholds = GPU_THRESHOLDS

        if self.device.type == "cuda":
            print(f"🎮 GPU Rerank Engine initialized")
            print(f"   Device: {torch.cuda.get_device_name(0)}")
            print(f"   VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f}GB")

    def rerank(
        self,
        query_vector: List[float],
        candidates: List[Dict]
    ) -> List[Dict]:
        """
        GPU-accelerated cosine similarity rerank.

        Args:
            query_vector: 768-dim query embedding
            candidates: List of {id, vector, payload, score}

        Returns:
            Reranked candidates with GPU scores
        """
        if not candidates:
            return []

        # Move to GPU (FP16 for RTX 3060 Ti)
        query_tensor = torch.tensor([query_vector], dtype=torch.float16, device=self.device)

        candidate_vectors = [c['vector'] for c in candidates]
        candidate_tensor = torch.tensor(candidate_vectors, dtype=torch.float16, device=self.device)

        # Cosine similarity (batch)
        query_norm = query_tensor / query_tensor.norm(dim=1, keepdim=True)
        candidate_norm = candidate_tensor / candidate_tensor.norm(dim=1, keepdim=True)

        scores = torch.mm(query_norm, candidate_norm.t()).squeeze(0)

        # Sort by score (descending)
        sorted_indices = torch.argsort(scores, descending=True).cpu().tolist()

        # Rerank candidates
        reranked = []
        for idx in sorted_indices:
            candidate = candidates[idx].copy()
            candidate['gpu_score'] = float(scores[idx])
            candidate['confidence'] = self._classify_confidence(float(scores[idx]))
            reranked.append(candidate)

        return reranked

    def _classify_confidence(self, score: float) -> str:
        """Classify score into confidence buckets."""
        if score < self.thresholds['MISS']:
            return 'MISS'
        elif score < self.thresholds['VERIFY']:
            return 'VERIFY'
        else:
            return 'SAFE_REUSE'

# =============================================================================
# SMART SEARCH ENGINE
# =============================================================================
class SmartSearchEngine:
    """
    Complete Smart Filter + Hierarchical Retrieval pipeline.
    """

    def __init__(
        self,
        qdrant_host: str = QDRANT_HOST,
        qdrant_port: int = QDRANT_PORT,
        ollama_url: str = OLLAMA_URL
    ):
        self.qdrant = QdrantClient(host=qdrant_host, port=qdrant_port)
        self.embedder = EmbeddingClient(ollama_url)
        self.intent_extractor = IntentExtractor()
        self.filter_builder = SmartFilterBuilder()
        self.gpu_rerank = GPURerankEngine()

    async def search(
        self,
        query: str,
        collection: str = DEFAULT_COLLECTION,
        limit: int = 10,
        hnsw_limit: int = 50
    ) -> Dict:
        """
        Smart Search Pipeline:
          1. Extract Intent (tags, time, collection filters)
          2. Build Qdrant Filter
          3. Embed Query (task_type=retrieval_query)
          4. HNSW Search with Filters
          5. GPU Rerank
          6. Return Top-K
        """
        start = time.time()

        print(f"🔍 Smart Search: {query}")
        print(f"   Collection: {collection}")

        # Step 1: Intent Extraction
        intent = self.intent_extractor.extract(query)
        print(f"\n📊 Extracted Intent:")
        for key, value in intent.items():
            if value:
                print(f"   {key}: {value}")

        # Step 2: Build Filter
        query_filter = self.filter_builder.build(intent, collection)
        if query_filter:
            print(f"\n🎯 Payload Filter: ACTIVE")
            print(f"   Must conditions: {len(query_filter.must)}")
        else:
            print(f"\n🎯 Payload Filter: NONE (full vector search)")

        # Step 3: Embed Query
        embed_start = time.time()
        query_vector = await self.embedder.embed(query, task_type="retrieval_query")
        embed_time = (time.time() - embed_start) * 1000
        print(f"\n✅ Query Embedding: 768-dim in {embed_time:.2f}ms")

        # Step 4: HNSW Search
        search_start = time.time()
        results = self.qdrant.search(
            collection_name=collection,
            query_vector=query_vector,
            query_filter=query_filter,  # <--- The Video's Key: Filter BEFORE search
            limit=hnsw_limit,
            with_vectors=True  # Need vectors for GPU rerank
        )
        search_time = (time.time() - search_start) * 1000
        print(f"✅ HNSW Search: {len(results)} candidates in {search_time:.2f}ms")

        # Step 5: GPU Rerank
        rerank_start = time.time()
        candidates = [
            {
                'id': hit.id,
                'vector': hit.vector,
                'payload': hit.payload,
                'hnsw_score': hit.score
            }
            for hit in results
        ]
        reranked = self.gpu_rerank.rerank(query_vector, candidates)[:limit]
        rerank_time = (time.time() - rerank_start) * 1000
        print(f"✅ GPU Rerank: Top {len(reranked)} in {rerank_time:.2f}ms")

        total_time = (time.time() - start) * 1000

        return {
            'query': query,
            'intent': intent,
            'results': reranked,
            'timings': {
                'total': total_time,
                'embed': embed_time,
                'hnsw': search_time,
                'rerank': rerank_time
            },
            'stats': {
                'hnsw_candidates': len(results),
                'final_results': len(reranked),
                'filtered': query_filter is not None
            }
        }

    async def close(self):
        await self.embedder.close()

# =============================================================================
# CLI
# =============================================================================
async def main():
    parser = argparse.ArgumentParser(
        description='Phase 93: Smart Filtering + Hierarchical Retrieval'
    )
    parser.add_argument('query', help='Search query')
    parser.add_argument('--collection', default=DEFAULT_COLLECTION, help='Qdrant collection')
    parser.add_argument('--limit', type=int, default=10, help='Max results')
    parser.add_argument('--hnsw-limit', type=int, default=50, help='HNSW candidates')
    parser.add_argument('--json', action='store_true', help='JSON output')

    args = parser.parse_args()

    engine = SmartSearchEngine()

    try:
        result = await engine.search(
            query=args.query,
            collection=args.collection,
            limit=args.limit,
            hnsw_limit=args.hnsw_limit
        )

        if args.json:
            print(json.dumps(result, indent=2))
        else:
            print(f"\n📈 Top {len(result['results'])} Results:")
            print("=" * 80)
            for i, res in enumerate(result['results'], 1):
                conf = res['confidence']
                emoji = '✅' if conf == 'SAFE_REUSE' else '⚠️' if conf == 'VERIFY' else '❌'
                print(f"{i}. {emoji} Score: {res['gpu_score']:.4f} ({conf})")
                print(f"   ID: {res['id']}")
                if 'feature_tags' in res['payload']:
                    print(f"   Tags: {', '.join(res['payload']['feature_tags'])}")

            print(f"\n⏱️  Timings:")
            print(f"   Total: {result['timings']['total']:.2f}ms")
            print(f"   Embed: {result['timings']['embed']:.2f}ms")
            print(f"   HNSW: {result['timings']['hnsw']:.2f}ms")
            print(f"   Rerank: {result['timings']['rerank']:.2f}ms")

    finally:
        await engine.close()

if __name__ == "__main__":
    asyncio.run(main())
