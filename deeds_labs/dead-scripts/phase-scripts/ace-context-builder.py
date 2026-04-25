#!/usr/bin/env python3
"""
ACE Context Builder - Production Implementation
Builds structured context packets for LLM prompting using local-first retrieval.

Usage:
    python scripts/ace-context-builder.py --goal "Fix TS1005 in UnifiedButton.svelte"
    python scripts/ace-context-builder.py --interactive
"""

import asyncio
import hashlib
import orjson
import sys
import torch
import torch.nn.functional as F
from dataclasses import dataclass, asdict
from datetime import datetime
from typing import Any

try:
    import redis.asyncio as aioredis
    import httpx
except ImportError:
    print("❌ Missing dependencies. Install:")
    print("   pip install redis[asyncio] httpx orjson torch")
    sys.exit(1)

# =============================================================================
# Configuration
# =============================================================================
@dataclass
class ACEConfig:
    redis_url: str = 'redis://127.0.0.1:6379'
    qdrant_url: str = 'http://127.0.0.1:6333'
    ollama_url: str = 'http://localhost:11434'
    postgres_dsn: str = 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db'
    embedding_model: str = 'embeddinggemma:latest'
    chat_model: str = 'gemma3-legal:latest'
    device: str = 'cuda' if torch.cuda.is_available() else 'cpu'

    # Retrieval limits
    error_chunks_limit: int = 10
    code_chunks_limit: int = 15
    code_units_limit: int = 8
    kb_cards_limit: int = 5
    cache_hits_limit: int = 3

    # Cache thresholds
    direct_reuse_threshold: float = 0.92
    validation_threshold: float = 0.85
    reference_threshold: float = 0.75

# =============================================================================
# Signature Text Templates
# =============================================================================
def build_task_signature(goal: str, context: dict) -> str:
    """Build stable task signature for cache lookup."""
    error_codes = sorted(set(context.get('error_codes', [])))
    file_paths = sorted(set(context.get('file_paths', [])))[:3]
    tags = sorted(set(context.get('tags', [])))[:5]

    return f"""goal:{goal[:100]}
error_codes:{','.join(error_codes)}
files:{','.join(file_paths)}
tags:{','.join(tags)}
source:ace_task"""

def build_error_signature(error: dict) -> str:
    """Build signature for error instances."""
    return f"""error_kind:{error.get('code', 'unknown')}
file:{error.get('file', '').replace('\\', '/')}
line:{error.get('line', 0)}
message:{error.get('message', '')[:200]}
source:{error.get('source', 'unknown')}"""

# =============================================================================
# GPU Embedding Worker
# =============================================================================
class GPUEmbeddingWorker:
    """Long-lived GPU process for embeddings."""

    def __init__(self, device: str, ollama_url: str, model: str):
        self.device = torch.device(device)
        self.ollama_url = ollama_url
        self.model = model
        self.client = None

    async def embed_single(self, text: str) -> torch.Tensor:
        """Embed single text via Ollama."""
        if not self.client:
            self.client = httpx.AsyncClient(timeout=60.0)

        try:
            resp = await self.client.post(
                f"{self.ollama_url}/api/embeddings",
                json={'model': self.model, 'prompt': text}
            )

            if resp.status_code == 200:
                embedding = resp.json()['embedding']
                return torch.tensor(embedding, device=self.device, dtype=torch.float16)
            else:
                print(f"   ⚠️  Embedding failed: {resp.status_code}")
                return torch.zeros(768, device=self.device, dtype=torch.float16)

        except Exception as e:
            print(f"   ❌ Embedding error: {e}")
            return torch.zeros(768, device=self.device, dtype=torch.float16)

    async def embed_batch(self, texts: list[str]) -> torch.Tensor:
        """Batch embed texts."""
        embeddings = []
        for text in texts:
            emb = await self.embed_single(text)
            embeddings.append(emb)

        return torch.stack(embeddings)

    async def close(self):
        """Close HTTP client."""
        if self.client:
            await self.client.aclose()

# =============================================================================
# ACE Context Builder
# =============================================================================
class ACEContextBuilder:
    """
    Builds structured context packets for LLM prompting.
    Follows local-first retrieval: Qdrant + Postgres + Redis.
    """

    def __init__(self, config: ACEConfig):
        self.config = config
        self.redis: aioredis.Redis = None
        self.gpu_worker: GPUEmbeddingWorker = None
        self.http_client: httpx.AsyncClient = None

    async def connect(self):
        """Connect to infrastructure."""
        print("\n🔌 Connecting to ACE infrastructure...")

        # Redis
        self.redis = await aioredis.from_url(
            self.config.redis_url,
            decode_responses=True
        )
        await self.redis.ping()
        print("   ✅ Redis")

        # Qdrant
        self.http_client = httpx.AsyncClient(timeout=30.0)
        resp = await self.http_client.get(f"{self.config.qdrant_url}/collections")
        if resp.status_code == 200:
            print("   ✅ Qdrant")
        else:
            print("   ⚠️  Qdrant not accessible")

        # GPU Worker
        self.gpu_worker = GPUEmbeddingWorker(
            device=self.config.device,
            ollama_url=self.config.ollama_url,
            model=self.config.embedding_model
        )
        print(f"   ✅ GPU Worker ({self.config.device})")

        print()

    async def build_context(
        self,
        goal: str,
        error_context: dict[str, Any]
    ) -> dict[str, Any]:
        """
        Main entry point: Build ACE context packet.

        Args:
            goal: "Fix TS1005 in UnifiedButton.svelte"
            error_context: {
                'error_codes': ['TS1005'],
                'file_paths': ['src/lib/components/UnifiedButton.svelte'],
                'tags': ['svelte5', 'runes']
            }

        Returns:
            {
                'goal': str,
                'evidence': {
                    'top_error_chunks': list,
                    'top_code_chunks': list,
                    'related_units': list,
                    'kb_cards': list,
                    'cache_hits': list
                },
                'recommended_actions': list,
                'confidence': float,
                'retrieval_stats': dict
            }
        """
        start_time = datetime.now()
        stats = {'cache_hit': False, 'layers': {}}

        print(f"🧠 Building ACE Context for: {goal}")
        print(f"   Error codes: {error_context.get('error_codes', [])}")
        print(f"   Files: {error_context.get('file_paths', [])}")
        print(f"   Tags: {error_context.get('tags', [])}\n")

        context_packet = {
            'goal': goal,
            'evidence': {},
            'recommended_actions': [],
            'confidence': 0.0,
            'retrieval_stats': stats
        }

        # Step 1: Semantic Cache Lookup (Speed Layer)
        print("1️⃣ Checking semantic cache...")
        task_sig = build_task_signature(goal, error_context)
        cache_hits = await self._semantic_cache_lookup(task_sig)

        if cache_hits and cache_hits[0]['score'] >= self.config.direct_reuse_threshold:
            print(f"   ✅ CACHE HIT (score={cache_hits[0]['score']:.3f})")
            context_packet['evidence']['cache_hits'] = cache_hits
            context_packet['recommended_actions'] = cache_hits[0]['data'].get('recommended_actions', [])
            context_packet['confidence'] = cache_hits[0]['data'].get('confidence', 0.9)
            stats['cache_hit'] = True
            stats['total_time_ms'] = (datetime.now() - start_time).total_seconds() * 1000
            return context_packet

        print(f"   ⏭️  Cache miss (best score={cache_hits[0]['score']:.3f if cache_hits else 0})")
        context_packet['evidence']['cache_hits'] = cache_hits

        # Step 2: Error Chunks (Precision)
        print("2️⃣ Retrieving error chunks...")
        t0 = datetime.now()
        error_chunks = await self._retrieve_error_chunks(goal, error_context)
        stats['layers']['error_chunks'] = {
            'count': len(error_chunks),
            'time_ms': (datetime.now() - t0).total_seconds() * 1000
        }
        print(f"   ✅ Found {len(error_chunks)} error chunks")
        context_packet['evidence']['top_error_chunks'] = error_chunks

        # Step 3: Code Chunks (Patch Context)
        print("3️⃣ Retrieving code chunks...")
        t0 = datetime.now()
        affected_files = self._extract_files(error_chunks, error_context)
        code_chunks = await self._retrieve_code_chunks(goal, affected_files)
        stats['layers']['code_chunks'] = {
            'count': len(code_chunks),
            'time_ms': (datetime.now() - t0).total_seconds() * 1000
        }
        print(f"   ✅ Found {len(code_chunks)} code chunks")
        context_packet['evidence']['top_code_chunks'] = code_chunks

        # Step 4: Code Units (Structure)
        print("4️⃣ Retrieving code units...")
        t0 = datetime.now()
        code_units = await self._retrieve_code_units(goal, affected_files, error_context)
        stats['layers']['code_units'] = {
            'count': len(code_units),
            'time_ms': (datetime.now() - t0).total_seconds() * 1000
        }
        print(f"   ✅ Found {len(code_units)} code units")
        context_packet['evidence']['related_units'] = code_units

        # Step 5: KB Cards (Experience)
        print("5️⃣ Retrieving KB cards...")
        t0 = datetime.now()
        kb_cards = await self._retrieve_kb_cards(goal, error_context)
        stats['layers']['kb_cards'] = {
            'count': len(kb_cards),
            'time_ms': (datetime.now() - t0).total_seconds() * 1000
        }
        print(f"   ✅ Found {len(kb_cards)} KB cards")
        context_packet['evidence']['kb_cards'] = kb_cards

        # Step 6: Generate Recommendations
        print("6️⃣ Generating recommendations...")
        context_packet['recommended_actions'] = await self._generate_recommendations(
            context_packet['evidence']
        )

        # Step 7: Calculate Confidence
        context_packet['confidence'] = self._calculate_confidence(context_packet['evidence'])

        stats['total_time_ms'] = (datetime.now() - start_time).total_seconds() * 1000

        print(f"\n✅ Context built in {stats['total_time_ms']:.0f}ms")
        print(f"   Confidence: {context_packet['confidence']:.2f}")
        print()

        return context_packet

    async def _semantic_cache_lookup(
        self,
        task_signature: str,
        threshold: float = None
    ) -> list[dict]:
        """Query phase89_cache_index for similar tasks."""
        if threshold is None:
            threshold = self.config.validation_threshold

        try:
            # Embed signature
            embedding = await self.gpu_worker.embed_single(task_signature)

            # Search Qdrant
            results = await self._qdrant_search(
                collection='phase89_cache_index',
                vector=embedding.cpu().tolist(),
                limit=10,
                score_threshold=threshold
            )

            if not results:
                return []

            # GPU rerank top results
            if len(results) > 3:
                results = await self._gpu_rerank(results, embedding, top_k=3)

            # Load from Redis
            cache_hits = []
            for result in results:
                redis_key = result['payload'].get('redis_key')
                if not redis_key:
                    continue

                cached_value = await self.redis.get(redis_key)
                if cached_value:
                    try:
                        data = orjson.loads(cached_value)
                        cache_hits.append({
                            'score': result['score'],
                            'artifact_kind': result['payload'].get('artifact_kind'),
                            'source': result['payload'].get('source'),
                            'confidence': result['payload'].get('confidence', 0.5),
                            'data': data,
                            'action': self._get_cache_action(result['score'])
                        })
                    except:
                        pass

            return cache_hits

        except Exception as e:
            print(f"   ⚠️  Cache lookup error: {e}")
            return []

    def _get_cache_action(self, score: float) -> str:
        """Determine what to do with cached artifact."""
        if score >= self.config.direct_reuse_threshold:
            return 'direct_reuse'
        elif score >= self.config.validation_threshold:
            return 'reuse_with_validation'
        elif score >= self.config.reference_threshold:
            return 'reference_only'
        else:
            return 'recompute'

    async def _retrieve_error_chunks(
        self,
        goal: str,
        error_context: dict
    ) -> list[dict]:
        """Retrieve error chunks (precision layer)."""
        try:
            query_embedding = await self.gpu_worker.embed_single(goal)

            # Build filters
            filters = {}
            if error_context.get('error_codes'):
                filters['error_codes'] = error_context['error_codes']
            if error_context.get('tags'):
                filters['tags'] = error_context['tags']

            results = await self._qdrant_search(
                collection='phase89_error_chunks',
                vector=query_embedding.cpu().tolist(),
                limit=self.config.error_chunks_limit,
                filters=filters
            )

            return [r['payload'] for r in results]

        except Exception as e:
            print(f"   ⚠️  Error chunks retrieval failed: {e}")
            return []

    async def _retrieve_code_chunks(
        self,
        goal: str,
        affected_files: list[str]
    ) -> list[dict]:
        """Retrieve code chunks (patch context layer)."""
        try:
            query_embedding = await self.gpu_worker.embed_single(goal)

            filters = {}
            if affected_files:
                filters['file_paths'] = affected_files

            results = await self._qdrant_search(
                collection='phase89_code_chunks',
                vector=query_embedding.cpu().tolist(),
                limit=self.config.code_chunks_limit,
                filters=filters
            )

            return [r['payload'] for r in results]

        except Exception as e:
            print(f"   ⚠️  Code chunks retrieval failed: {e}")
            return []

    async def _retrieve_code_units(
        self,
        goal: str,
        affected_files: list[str],
        error_context: dict
    ) -> list[dict]:
        """Retrieve code units (structure layer)."""
        try:
            query_embedding = await self.gpu_worker.embed_single(goal)

            filters = {}
            if affected_files:
                filters['file_paths'] = affected_files
            if error_context.get('tags'):
                filters['tags'] = error_context['tags']

            results = await self._qdrant_search(
                collection='phase89_code_units',
                vector=query_embedding.cpu().tolist(),
                limit=self.config.code_units_limit,
                filters=filters
            )

            return [r['payload'] for r in results]

        except Exception as e:
            print(f"   ⚠️  Code units retrieval failed: {e}")
            return []

    async def _retrieve_kb_cards(
        self,
        goal: str,
        error_context: dict
    ) -> list[dict]:
        """Retrieve KB cards (experience layer)."""
        try:
            query_embedding = await self.gpu_worker.embed_single(goal)

            # CRITICAL: Only validated fixes
            filters = {'source': 'validated_fix'}
            if error_context.get('tags'):
                filters['tags'] = error_context['tags']

            results = await self._qdrant_search(
                collection='phase89_kb_cards',
                vector=query_embedding.cpu().tolist(),
                limit=self.config.kb_cards_limit,
                filters=filters
            )

            return [r['payload'] for r in results]

        except Exception as e:
            print(f"   ⚠️  KB cards retrieval failed: {e}")
            return []

    async def _qdrant_search(
        self,
        collection: str,
        vector: list[float],
        limit: int,
        score_threshold: float = 0.7,
        filters: dict = None
    ) -> list[dict]:
        """Generic Qdrant search with filters."""
        try:
            payload = {
                'vector': vector,
                'limit': limit,
                'score_threshold': score_threshold,
                'with_payload': True,
                'with_vector': True
            }

            # Add filters if provided
            if filters:
                must_conditions = []
                for key, value in filters.items():
                    if isinstance(value, list):
                        must_conditions.append({
                            'key': key,
                            'match': {'any': value}
                        })
                    else:
                        must_conditions.append({
                            'key': key,
                            'match': {'value': value}
                        })

                if must_conditions:
                    payload['filter'] = {'must': must_conditions}

            resp = await self.http_client.post(
                f"{self.config.qdrant_url}/collections/{collection}/points/search",
                json=payload
            )

            if resp.status_code == 200:
                return resp.json().get('result', [])
            else:
                return []

        except Exception as e:
            print(f"   ⚠️  Qdrant search error: {e}")
            return []

    async def _gpu_rerank(
        self,
        candidates: list[dict],
        query_vec: torch.Tensor,
        top_k: int = 10
    ) -> list[dict]:
        """GPU-accelerated reranking."""
        try:
            candidate_vecs = torch.tensor(
                [c['vector'] for c in candidates],
                device=self.config.device,
                dtype=torch.float16
            )

            candidate_vecs = F.normalize(candidate_vecs, dim=1)
            query_vec = F.normalize(query_vec.unsqueeze(0), dim=1).half()

            scores = (candidate_vecs @ query_vec.T).squeeze()
            topk_indices = torch.topk(scores, k=min(top_k, len(scores))).indices

            return [candidates[i] for i in topk_indices.cpu().tolist()]

        except Exception as e:
            print(f"   ⚠️  GPU rerank error: {e}")
            return candidates[:top_k]

    def _extract_files(
        self,
        error_chunks: list[dict],
        error_context: dict
    ) -> list[str]:
        """Extract unique file paths from error chunks."""
        files = set(error_context.get('file_paths', []))

        for chunk in error_chunks:
            if 'file' in chunk:
                files.add(chunk['file'])
            if 'file_path' in chunk:
                files.add(chunk['file_path'])

        return sorted(files)

    async def _generate_recommendations(self, evidence: dict) -> list[str]:
        """Generate recommended actions from evidence."""
        recommendations = []

        # From KB cards (validated wins)
        for card in evidence.get('kb_cards', []):
            if 'fix_steps' in card:
                for step in card['fix_steps']:
                    if step not in recommendations:
                        recommendations.append(f"[KB] {step}")

        # From cache hits
        for hit in evidence.get('cache_hits', []):
            if hit['action'] == 'direct_reuse' and 'recommended_actions' in hit['data']:
                for action in hit['data']['recommended_actions']:
                    if action not in recommendations:
                        recommendations.append(f"[Cache] {action}")

        # From error analysis
        error_codes = set()
        for chunk in evidence.get('top_error_chunks', []):
            if 'code' in chunk:
                error_codes.add(chunk['code'])

        if 'TS1005' in error_codes:
            recommendations.append("[Error] Add missing semicolon")
        if 'TS2322' in error_codes:
            recommendations.append("[Error] Fix type mismatch")

        return recommendations[:10]  # Limit to top 10

    def _calculate_confidence(self, evidence: dict) -> float:
        """Calculate confidence score based on evidence quality."""
        confidence = 0.0

        # KB cards (strongest signal)
        kb_count = len(evidence.get('kb_cards', []))
        if kb_count > 0:
            confidence += 0.4 * min(kb_count / 3, 1.0)

        # Cache hits
        cache_hits = evidence.get('cache_hits', [])
        if cache_hits:
            best_score = max(h['score'] for h in cache_hits)
            confidence += 0.3 * best_score

        # Error chunks (precision)
        error_count = len(evidence.get('top_error_chunks', []))
        if error_count > 0:
            confidence += 0.15 * min(error_count / 5, 1.0)

        # Code chunks (context)
        code_count = len(evidence.get('top_code_chunks', []))
        if code_count > 0:
            confidence += 0.15 * min(code_count / 8, 1.0)

        return min(confidence, 1.0)

    async def close(self):
        """Cleanup resources."""
        if self.redis:
            await self.redis.close()
        if self.gpu_worker:
            await self.gpu_worker.close()
        if self.http_client:
            await self.http_client.aclose()

# =============================================================================
# CLI
# =============================================================================
async def interactive_mode(builder: ACEContextBuilder):
    """Interactive CLI for building contexts."""
    print("\n" + "=" * 60)
    print("🧠 ACE Context Builder - Interactive Mode")
    print("=" * 60)
    print("Enter 'quit' to exit\n")

    while True:
        goal = input("Goal: ").strip()
        if goal.lower() in ['quit', 'exit', 'q']:
            break

        if not goal:
            continue

        # Parse error codes
        error_codes = input("Error codes (comma-separated, optional): ").strip()
        error_codes = [e.strip() for e in error_codes.split(',')] if error_codes else []

        # Parse file paths
        file_paths = input("File paths (comma-separated, optional): ").strip()
        file_paths = [f.strip() for f in file_paths.split(',')] if file_paths else []

        # Parse tags
        tags = input("Tags (comma-separated, optional): ").strip()
        tags = [t.strip() for t in tags.split(',')] if tags else []

        error_context = {
            'error_codes': error_codes,
            'file_paths': file_paths,
            'tags': tags
        }

        # Build context
        context = await builder.build_context(goal, error_context)

        # Display results
        print("\n" + "=" * 60)
        print("📊 Context Packet")
        print("=" * 60)
        print(orjson.dumps(context, option=orjson.OPT_INDENT_2).decode())
        print()

async def main():
    import argparse

    parser = argparse.ArgumentParser(description='ACE Context Builder')
    parser.add_argument('--goal', type=str, help='Goal to build context for')
    parser.add_argument('--error-codes', type=str, help='Comma-separated error codes')
    parser.add_argument('--files', type=str, help='Comma-separated file paths')
    parser.add_argument('--tags', type=str, help='Comma-separated tags')
    parser.add_argument('--interactive', action='store_true', help='Interactive mode')
    parser.add_argument('--output', type=str, help='Output file for context JSON')

    args = parser.parse_args()

    config = ACEConfig()
    builder = ACEContextBuilder(config)

    try:
        await builder.connect()

        if args.interactive:
            await interactive_mode(builder)
        elif args.goal:
            error_context = {
                'error_codes': [e.strip() for e in args.error_codes.split(',')] if args.error_codes else [],
                'file_paths': [f.strip() for f in args.files.split(',')] if args.files else [],
                'tags': [t.strip() for t in args.tags.split(',')] if args.tags else []
            }

            context = await builder.build_context(args.goal, error_context)

            output_json = orjson.dumps(context, option=orjson.OPT_INDENT_2).decode()

            if args.output:
                with open(args.output, 'w') as f:
                    f.write(output_json)
                print(f"✅ Context saved to {args.output}")
            else:
                print(output_json)
        else:
            parser.print_help()

    finally:
        await builder.close()

if __name__ == '__main__':
    asyncio.run(main())
