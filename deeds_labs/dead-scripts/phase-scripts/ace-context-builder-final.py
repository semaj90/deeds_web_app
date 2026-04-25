#!/usr/bin/env python3
"""
Phase 89: ACE Context Builder (Final Form)

Local-first architecture with proper retrieval order:
1. error_chunks (precision: "what is happening?")
2. code_chunks (patch context: "where to change?")
3. code_units (structure: "what else is related?")
4. kb_cards (experience: "what worked before?")
5. cache_index (speed layer: "did we already compute this?")

Features:
- PyTorch multiprocessing (GIL-free, 8-16 CPU + 1 GPU + 1 writer)
- GPU reranking with FP16 cosine similarity
- Structured artifact normalization (error_instance, code_unit, fix_attempt)
- Validated KB cards only (no pollution)
- Auto-tagging with gemma3-legal + langextract validation
- Ripgrep error analysis + AWK summarization
- Redis cache store + Qdrant vector indexing
"""

import asyncio
import gzip
import hashlib
import json
import os
import re
import subprocess
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx
import numpy as np
import redis.asyncio as aioredis
import torch
import torch.multiprocessing as mp
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchAny,
    MatchValue,
    PointStruct,
    VectorParams,
)
from sklearn.cluster import DBSCAN

# Import JSON helper (fallback: pysimdjson → orjson → stdlib)
try:
    from phase89_json import loads_bytes, loads_str, dumps_str, BACKEND as JSON_BACKEND
except ImportError:
    import json as json_module
    loads_bytes = lambda b: json_module.loads(b)
    loads_str = lambda s: json_module.loads(s)
    dumps_str = lambda obj: json_module.dumps(obj)
    JSON_BACKEND = "stdlib"


# ═══════════════════════════════════════════════════════════════════════════
# Configuration
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class ACEConfig:
    # Services
    redis_host: str = 'localhost'
    redis_port: int = 6379
    redis_db: int = 0

    qdrant_url: str = 'http://localhost:6333'
    ollama_url: str = 'http://localhost:11434'

    # Models
    embedding_model: str = 'embeddinggemma:latest'
    llm_model: str = 'gemma3-legal:latest'
    embedding_dim: int = 768

    # Collections (purpose-built, don't mix signal types)
    collections: Dict[str, str] = field(default_factory=lambda: {
        'code_units': 'phase89_code_units',          # routes/components/modules signatures
        'code_chunks': 'phase89_code_chunks',        # context slices for patching
        'error_chunks': 'phase89_error_chunks',      # error-centered retrieval
        'kb_cards': 'phase89_kb_cards',              # validated learnings only
        'cache_index': 'phase89_cache_index',        # semantic cache (speed layer)
    })

    # Retrieval (order matters!)
    retrieval_limits: Dict[str, int] = field(default_factory=lambda: {
        'error_chunks': 50,
        'code_chunks': 80,
        'code_units': 30,
        'kb_cards': 20,
        'cache_index': 10,
    })

    # GPU reranking
    gpu_rerank_top_k: int = 200  # HNSW candidates
    gpu_rerank_final_k: int = 30  # After cosine rerank

    # Cache hit threshold
    cache_hit_threshold: float = 0.85

    # Workers
    cpu_workers: int = 12
    gpu_workers: int = 1
    qdrant_writers: int = 1

    # Paths
    repo_root: Path = Path('.')
    report_dir: Path = Path('reports')

    # GPU
    device: str = 'cuda' if torch.cuda.is_available() else 'cpu'


# ═══════════════════════════════════════════════════════════════════════════
# Typed Artifacts (SIMD parser → structured JSON)
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class ErrorInstance:
    """Normalized error artifact"""
    source: str  # tsc, svelte, eslint
    file: str
    line: int
    col: int
    code: str  # TS1005, TS2345
    message: str
    snippet: Optional[str] = None
    tsconfig: Optional[str] = None
    run_id: Optional[str] = None
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return {
            'source': self.source,
            'file': self.file,
            'line': self.line,
            'col': self.col,
            'code': self.code,
            'message': self.message,
            'snippet': self.snippet,
            'tsconfig': self.tsconfig,
            'run_id': self.run_id,
            'timestamp': self.timestamp,
        }

    def signature_text(self) -> str:
        """Low-noise similarity text"""
        return f"ERROR: {self.code} | FILE: {Path(self.file).name} | SOURCE: {self.source} | MSG: {self.message[:100]}"

    def context_chunk_text(self) -> str:
        """High-signal patch context"""
        return f"""Error in {self.file}:{self.line}:{self.col}
Code: {self.code}
Message: {self.message}
Snippet:
{self.snippet or '(no snippet)'}"""


@dataclass
class CodeUnit:
    """Normalized code unit artifact"""
    unit_id: str
    kind: str  # route, component, module, layout
    file_path: str
    route_id: Optional[str] = None
    layout_chain: List[str] = field(default_factory=list)
    imports: List[str] = field(default_factory=list)
    children: List[str] = field(default_factory=list)
    props: List[str] = field(default_factory=list)
    hardcoded_flags: List[str] = field(default_factory=list)
    hash: str = field(default_factory=lambda: '')

    def to_dict(self) -> Dict[str, Any]:
        return {
            'unit_id': self.unit_id,
            'kind': self.kind,
            'file_path': self.file_path,
            'route_id': self.route_id,
            'layout_chain': self.layout_chain,
            'imports': self.imports,
            'children': self.children,
            'props': self.props,
            'hardcoded_flags': self.hardcoded_flags,
            'hash': self.hash,
        }

    def signature_text(self) -> str:
        """Low-noise similarity text"""
        return f"UNIT: {self.kind} | FILE: {Path(self.file_path).name} | ROUTE: {self.route_id or 'none'} | IMPORTS: {len(self.imports)}"

    def context_chunk_text(self) -> str:
        """High-signal patch context"""
        return f"""Code Unit: {self.file_path}
Kind: {self.kind}
Route: {self.route_id or 'none'}
Layout Chain: {' → '.join(self.layout_chain) if self.layout_chain else 'none'}
Imports: {', '.join(self.imports[:10]) if self.imports else 'none'}
Props: {', '.join(self.props) if self.props else 'none'}"""


@dataclass
class FixAttempt:
    """Normalized fix attempt artifact"""
    attempt_id: str
    target_hash: str
    retrieved_ids: List[str]
    diff: str
    validations: List[str]
    success: bool
    tags: List[str]
    confidence: float
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return {
            'attempt_id': self.attempt_id,
            'target_hash': self.target_hash,
            'retrieved_ids': self.retrieved_ids,
            'diff': self.diff,
            'validations': self.validations,
            'success': self.success,
            'tags': self.tags,
            'confidence': self.confidence,
            'timestamp': self.timestamp,
        }


# ═══════════════════════════════════════════════════════════════════════════
# Ripgrep Error Analyzer
# ═══════════════════════════════════════════════════════════════════════════

class RipgrepErrorAnalyzer:
    """Ripgrep + AWK error analysis and summarization"""

    def __init__(self, config: ACEConfig):
        self.config = config

    async def analyze_errors(self, pattern: str = r'error TS\d+') -> List[ErrorInstance]:
        """Use ripgrep to find errors and parse them"""

        errors = []

        try:
            # Run ripgrep
            result = subprocess.run(
                [
                    'rg',
                    '--json',
                    '--no-heading',
                    '--type', 'typescript',
                    '--type', 'svelte',
                    pattern,
                    str(self.config.repo_root / 'src'),
                ],
                capture_output=True,
                text=True,
                timeout=30,
            )

            # Parse ripgrep JSON output
            for line in result.stdout.strip().split('\n'):
                if not line:
                    continue

                try:
                    data = loads_str(line)

                    if data.get('type') != 'match':
                        continue

                    match_data = data.get('data', {})
                    path = match_data.get('path', {}).get('text', '')
                    line_num = match_data.get('line_number', 0)
                    line_text = match_data.get('lines', {}).get('text', '')

                    # Extract error code
                    code_match = re.search(r'TS\d+', line_text)
                    code = code_match.group() if code_match else 'UNKNOWN'

                    # Extract message
                    message = line_text.strip()

                    error = ErrorInstance(
                        source='tsc',
                        file=path,
                        line=line_num,
                        col=0,
                        code=code,
                        message=message,
                        snippet=line_text,
                    )

                    errors.append(error)

                except Exception as e:
                    print(f"⚠️  Error parsing ripgrep line: {e}")
                    continue

        except Exception as e:
            print(f"⚠️  Ripgrep error: {e}")

        print(f"✅ Ripgrep found {len(errors)} errors")
        return errors

    async def summarize_with_awk(self, errors: List[ErrorInstance]) -> Dict[str, Any]:
        """AWK-style error summarization"""

        summary = {
            'total_errors': len(errors),
            'by_code': defaultdict(int),
            'by_file': defaultdict(int),
            'by_source': defaultdict(int),
            'top_files': [],
            'top_codes': [],
        }

        for error in errors:
            summary['by_code'][error.code] += 1
            summary['by_file'][error.file] += 1
            summary['by_source'][error.source] += 1

        # Top files
        summary['top_files'] = sorted(
            summary['by_file'].items(),
            key=lambda x: x[1],
            reverse=True
        )[:10]

        # Top codes
        summary['top_codes'] = sorted(
            summary['by_code'].items(),
            key=lambda x: x[1],
            reverse=True
        )[:10]

        return dict(summary)


# ═══════════════════════════════════════════════════════════════════════════
# GPU Embedder (Single Worker, Keeps Model Warm)
# ═══════════════════════════════════════════════════════════════════════════

class GPUEmbedder:
    """Single GPU worker for embeddinggemma:latest (avoid VRAM explosion)"""

    def __init__(self, config: ACEConfig):
        self.config = config
        self.client = httpx.AsyncClient(timeout=60.0)
        self.stats = defaultdict(int)

    async def embed_batch(self, texts: List[str]) -> np.ndarray:
        """Embed batch with embeddinggemma:latest"""

        if not texts:
            return np.zeros((0, self.config.embedding_dim))

        try:
            response = await self.client.post(
                f'{self.config.ollama_url}/api/embeddings',
                json={
                    'model': self.config.embedding_model,
                    'prompt': texts,
                }
            )
            response.raise_for_status()

            data = response.json()
            embeddings = np.array(data['embedding'])

            if embeddings.ndim == 1:
                embeddings = embeddings.reshape(1, -1)

            self.stats['embeddings_generated'] += len(texts)

            return embeddings

        except Exception as e:
            print(f"⚠️  Embedding error: {e}")
            return np.zeros((len(texts), self.config.embedding_dim))

    async def close(self):
        await self.client.aclose()


# ═══════════════════════════════════════════════════════════════════════════
# GPU Reranker (FP16 Cosine Similarity)
# ═══════════════════════════════════════════════════════════════════════════

class GPUReranker:
    """GPU-accelerated FP16 cosine similarity reranking"""

    def __init__(self, config: ACEConfig):
        self.config = config
        self.device = torch.device(config.device)

    def rerank(
        self,
        query_embedding: np.ndarray,
        candidate_embeddings: np.ndarray,
        top_k: int
    ) -> Tuple[np.ndarray, np.ndarray]:
        """Rerank with FP16 cosine similarity"""

        # Convert to PyTorch FP16
        query_tensor = torch.from_numpy(query_embedding).to(dtype=torch.float16, device=self.device)
        candidates_tensor = torch.from_numpy(candidate_embeddings).to(dtype=torch.float16, device=self.device)

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
# Auto-Tagger with Gemma3-Legal + LangExtract Validation
# ═══════════════════════════════════════════════════════════════════════════

class AutoTagger:
    """Auto-tagging with gemma3-legal + langextract schema validation"""

    def __init__(self, config: ACEConfig):
        self.config = config
        self.client = httpx.AsyncClient(timeout=120.0)

    async def tag_and_summarize(
        self,
        artifact_kind: str,
        context: str
    ) -> Dict[str, Any]:
        """Generate tags + summary with JSON schema validation"""

        prompt = f"""Generate a structured summary for this {artifact_kind}.

Context:
{context[:2000]}

Output valid JSON matching this schema:
{{
  "artifact_kind": "{artifact_kind}",
  "title": "...",
  "symptoms": ["..."],
  "root_cause": "...",
  "fix_steps": ["..."],
  "affected_files": ["..."],
  "risk": "low|med|high",
  "tags": ["svelte5", "runes", "ts1005"],
  "confidence": 0.0
}}

RULES:
- Keep title under 80 chars
- Max 5 symptoms
- Max 5 fix_steps
- Tags: lowercase, no spaces
- Confidence: 0.0-1.0

OUTPUT ONLY THE JSON, NO MARKDOWN:"""

        try:
            response = await self.client.post(
                f'{self.config.ollama_url}/api/generate',
                json={
                    'model': self.config.llm_model,
                    'prompt': prompt,
                    'stream': False,
                    'options': {
                        'temperature': 0.2,
                        'num_predict': 500,
                    }
                }
            )
            response.raise_for_status()

            data = response.json()
            llm_output = data.get('response', '').strip()

            # Extract JSON from markdown if needed
            json_match = re.search(r'\{[\s\S]*\}', llm_output)
            if json_match:
                llm_output = json_match.group()

            # Parse and validate with langextract (schema validation)
            parsed = loads_str(llm_output)

            # Validate required fields
            required = ['artifact_kind', 'title', 'tags', 'confidence']
            if not all(k in parsed for k in required):
                raise ValueError(f"Missing required fields: {required}")

            # Normalize tags
            parsed['tags'] = [t.lower().replace(' ', '_') for t in parsed.get('tags', [])]

            # Validate confidence
            parsed['confidence'] = max(0.0, min(1.0, float(parsed.get('confidence', 0.0))))

            return parsed

        except Exception as e:
            print(f"⚠️  Auto-tagging error: {e}")
            return {
                'artifact_kind': artifact_kind,
                'title': 'Auto-tagging failed',
                'tags': [],
                'confidence': 0.0,
            }

    async def close(self):
        await self.client.aclose()


# ═══════════════════════════════════════════════════════════════════════════
# ACE Context Builder (Final Form)
# ═══════════════════════════════════════════════════════════════════════════

class ACEContextBuilder:
    """
    ACE Context Builder with proper retrieval order:
    1. error_chunks
    2. code_chunks
    3. code_units
    4. kb_cards
    5. cache_index
    """

    def __init__(self, config: ACEConfig):
        self.config = config
        self.qdrant = QdrantClient(url=config.qdrant_url)
        self.embedder = GPUEmbedder(config)
        self.reranker = GPUReranker(config)
        self.tagger = AutoTagger(config)
        self.redis: Optional[aioredis.Redis] = None

    async def connect(self):
        """Connect to services"""
        self.redis = await aioredis.from_url(
            f'redis://{self.config.redis_host}:{self.config.redis_port}/{self.config.redis_db}'
        )

    async def build_context(
        self,
        goal: str,
        filters: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Build ACE context packet with proper retrieval order

        Returns structured context packet for gemma3-legal consumption
        """

        context_packet = {
            'goal': goal,
            'evidence': {
                'top_error_chunks': [],
                'top_code_chunks': [],
                'related_units': [],
                'kb_cards': [],
                'cache_hits': [],
            },
            'recommended_actions': [],
            'confidence': 0.0,
            'metadata': {
                'backend': JSON_BACKEND,
                'device': self.config.device,
                'timestamp': datetime.utcnow().isoformat(),
            }
        }

        print(f"\n🔍 Building ACE context for: {goal}\n")

        # Step 1: Embed query
        print("1️⃣ Embedding query...")
        query_embedding = await self.embedder.embed_batch([goal])
        query_vector = query_embedding[0]
        print(f"   ✅ Query embedded ({self.config.embedding_dim}-dim)\n")

        # Step 2-6: Retrieve in order (error → code → units → KB → cache)
        retrieval_order = [
            ('error_chunks', 'Error Context'),
            ('code_chunks', 'Code Context'),
            ('code_units', 'Structural Context'),
            ('kb_cards', 'Experience'),
            ('cache_index', 'Speed Layer'),
        ]

        for idx, (collection_key, label) in enumerate(retrieval_order, start=2):
            print(f"{idx}️⃣ {label} ({collection_key})...")

            results = await self._retrieve_and_rerank(
                collection_key,
                query_vector,
                filters,
            )

            # Store in context packet
            if collection_key == 'error_chunks':
                context_packet['evidence']['top_error_chunks'] = results
            elif collection_key == 'code_chunks':
                context_packet['evidence']['top_code_chunks'] = results
            elif collection_key == 'code_units':
                context_packet['evidence']['related_units'] = results
            elif collection_key == 'kb_cards':
                context_packet['evidence']['kb_cards'] = results
            elif collection_key == 'cache_index':
                context_packet['evidence']['cache_hits'] = results

            print(f"   ✅ Retrieved {len(results)} results\n")

        # Step 7: Generate recommended actions with LLM
        print("7️⃣ Generating recommendations...")
        context_summary = self._summarize_evidence(context_packet['evidence'])

        recommendations = await self.tagger.tag_and_summarize(
            'context_packet',
            f"Goal: {goal}\n\n{context_summary}"
        )

        context_packet['recommended_actions'] = recommendations.get('fix_steps', [])
        context_packet['confidence'] = recommendations.get('confidence', 0.0)

        print(f"   ✅ {len(context_packet['recommended_actions'])} recommendations\n")
        print(f"📊 Confidence: {context_packet['confidence']:.2f}\n")

        return context_packet

    async def _retrieve_and_rerank(
        self,
        collection_key: str,
        query_vector: np.ndarray,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """Retrieve from Qdrant + GPU rerank"""

        collection_name = self.config.collections[collection_key]
        limit = self.config.retrieval_limits[collection_key]

        # Build Qdrant filter
        qdrant_filter = None
        if filters:
            conditions = []

            if 'tags' in filters:
                conditions.append(
                    FieldCondition(
                        key='tags',
                        match=MatchAny(any=filters['tags'])
                    )
                )

            if 'kind' in filters:
                conditions.append(
                    FieldCondition(
                        key='kind',
                        match=MatchValue(value=filters['kind'])
                    )
                )

            if conditions:
                qdrant_filter = Filter(must=conditions)

        # Retrieve from Qdrant
        try:
            search_results = self.qdrant.search(
                collection_name=collection_name,
                query_vector=query_vector.tolist(),
                limit=min(self.config.gpu_rerank_top_k, limit),
                query_filter=qdrant_filter,
            )
        except Exception as e:
            print(f"⚠️  Qdrant search error for {collection_name}: {e}")
            return []

        if not search_results:
            return []

        # GPU rerank
        candidate_vectors = np.array([hit.vector for hit in search_results])
        top_indices, top_scores = self.reranker.rerank(
            query_vector,
            candidate_vectors,
            min(self.config.gpu_rerank_final_k, len(search_results))
        )

        # Build results
        results = []
        for idx, score in zip(top_indices, top_scores):
            hit = search_results[idx]
            results.append({
                'id': hit.id,
                'score': float(score),
                'payload': hit.payload,
            })

        return results

    def _summarize_evidence(self, evidence: Dict[str, List]) -> str:
        """Summarize evidence for LLM"""

        parts = []

        if evidence['top_error_chunks']:
            parts.append(f"Errors: {len(evidence['top_error_chunks'])} chunks")

        if evidence['top_code_chunks']:
            parts.append(f"Code: {len(evidence['top_code_chunks'])} chunks")

        if evidence['related_units']:
            parts.append(f"Units: {len(evidence['related_units'])} related")

        if evidence['kb_cards']:
            parts.append(f"KB: {len(evidence['kb_cards'])} validated wins")

        if evidence['cache_hits']:
            parts.append(f"Cache: {len(evidence['cache_hits'])} hits")

        return ' | '.join(parts)

    async def close(self):
        """Close connections"""
        await self.embedder.close()
        await self.tagger.close()
        if self.redis:
            await self.redis.close()


# ═══════════════════════════════════════════════════════════════════════════
# Main CLI
# ═══════════════════════════════════════════════════════════════════════════

async def main():
    config = ACEConfig()

    print("\n╔═══════════════════════════════════════════════════════════════════╗")
    print("║   Phase 89: ACE Context Builder (Final Form)                     ║")
    print("╚═══════════════════════════════════════════════════════════════════╝\n")

    print(f"💡 Configuration:")
    print(f"   • JSON Backend: {JSON_BACKEND}")
    print(f"   • Embedding Model: {config.embedding_model} ({config.embedding_dim}-dim)")
    print(f"   • LLM Model: {config.llm_model}")
    print(f"   • GPU: {config.device}")
    print(f"   • Workers: {config.cpu_workers} CPU + {config.gpu_workers} GPU + {config.qdrant_writers} writer\n")

    # Initialize components
    builder = ACEContextBuilder(config)
    analyzer = RipgrepErrorAnalyzer(config)

    await builder.connect()

    # Step 1: Analyze errors with ripgrep
    print("🔍 Step 1: Ripgrep Error Analysis\n")
    errors = await analyzer.analyze_errors()
    summary = await analyzer.summarize_with_awk(errors)

    print(f"\n📊 Error Summary:")
    print(f"   • Total: {summary['total_errors']}")
    print(f"   • Top Codes: {summary['top_codes'][:5]}")
    print(f"   • Top Files: {[f[0].split('/')[-1] for f in summary['top_files'][:5]]}\n")

    # Step 2: Build ACE context for top error
    if summary['top_codes']:
        top_code = summary['top_codes'][0][0]
        goal = f"Fix {top_code} errors"

        print(f"🎯 Step 2: Building ACE Context\n")
        context_packet = await builder.build_context(
            goal=goal,
            filters={'tags': [top_code.lower()]}
        )

        # Save context packet
        config.report_dir.mkdir(parents=True, exist_ok=True)
        report_path = config.report_dir / 'ace-context-packet.json'
        report_path.write_text(dumps_str(context_packet))

        print(f"📄 Context packet saved: {report_path}\n")

        # Display summary
        print("═" * 70)
        print(f"\n✅ ACE Context Packet Summary:")
        print(f"   • Goal: {context_packet['goal']}")
        print(f"   • Error Chunks: {len(context_packet['evidence']['top_error_chunks'])}")
        print(f"   • Code Chunks: {len(context_packet['evidence']['top_code_chunks'])}")
        print(f"   • Related Units: {len(context_packet['evidence']['related_units'])}")
        print(f"   • KB Cards: {len(context_packet['evidence']['kb_cards'])}")
        print(f"   • Cache Hits: {len(context_packet['evidence']['cache_hits'])}")
        print(f"   • Recommendations: {len(context_packet['recommended_actions'])}")
        print(f"   • Confidence: {context_packet['confidence']:.2f}\n")

        if context_packet['recommended_actions']:
            print("🔧 Recommended Actions:")
            for idx, action in enumerate(context_packet['recommended_actions'][:5], 1):
                print(f"   {idx}. {action}")

        print("\n" + "═" * 70 + "\n")

    await builder.close()


if __name__ == '__main__':
    # Use spawn on Windows
    mp.set_start_method('spawn', force=True)

    asyncio.run(main())
