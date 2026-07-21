---
type: system
title: HyperRAG — Unified Retrieval & Knowledge System
id: system/hyperrag
status: active
owners:
  - parent-atlas
  - legal-ai-team
source_refs:
  - docs/architecture/CANONICAL-PACKET-WIRING-BLUEPRINT.md
  - docs/architecture/trace-kag-web-development-guide.md
related:
  - pipeline/content-ingestion
  - pipeline/retrieval-ranking-synthesis
  - datasets/legal-corpus
  - tools/trace-mcp
---

# HyperRAG — Unified Retrieval & Knowledge System

## Overview

HyperRAG is the orchestration surface that unifies vector retrieval (RAG), graph traversal (KAG), and sparse matching (DAG) into a single control plane. It does not own data—it coordinates access to canonical storage (Postgres, Qdrant, Neo4j, Redis) and exposes a clean query interface to downstream synthesis and tool-calling systems.

## Core Principles

1. **Postgres is canonical truth** — all packet identity, metadata, embeddings ownership
2. **Qdrant, Neo4j, Redis are mirrors or cache** — never sources of truth
3. **Three lanes, one blend** — vector ANN + graph traversal + sparse match → Karpathy rerank
4. **Streaming-aware** — all retrieval returns continuations for SSE/WebSocket delivery
5. **Tracing built-in** — every decision logged to `deep_research_audit_log` for transparency

## Retrieval Lanes

### Lane 1: Vector RAG (Qdrant ANN)
- **Query**: Find chunks semantically similar to input
- **Backing**: Qdrant `codebase_chunks_768` (768-dim named vector `content`), mirror of `codebase_chunk_index.content_embedding`
- **Performance**: 50–100ms for top-K=50, HNSW ANN
- **Use when**: Natural-language query, fuzzy intent, no known entry point

### Lane 2: Hyper-graph RAG (Neo4j Traversal)
- **Query**: Trace structural relationships, expand neighborhoods, shortest-path analysis
- **Backing**: Neo4j typed edges (`IMPORTS`, `BELONGS_TO_CLUSTER`, `SIMILAR_TOPOLOGY`, `SHARES_TAGS`), CouchDB PageRank cache (6h TTL)
- **Performance**: <500ms for k-hop ≤ 3, bounded k-hops only
- **Use when**: "What depends on X?", "Shortest path from auth → DB", cluster expansion, topology-aware reranking

### Lane 3: Sparse RAG (Full-Text & Exact Match)
- **Query**: Exact filename, export symbol, Redis key lookup
- **Backing**: Fuse.js (browser), `rg` CLI, optional BM25 index (future)
- **Performance**: <10ms for exact matches, 100–200ms for fuzzy
- **Use when**: Lexical match needed, ID lookup, code-symbol search

## Ranking & Fusion (Karpathy Blend)

After any retrieval lane pulls candidates, apply the canonical blend:

```
final_score = 0.4·PageRank + 0.3·attention + 0.3·authority
```

- **PageRank**: Structural importance (Neo4j `pagerank_score` from CouchDB cache, 24h TTL)
- **Attention**: Semantic relevance to query (GPU-computed cosine similarity vs query embedding)
- **Authority**: Domain significance (statute vs test code, API vs implementation, etc.)

Cached in Redis hash `gpu:karpathy:scores` with 24h TTL. Use the blend for all top-K reordering.

## Control Plane API

### POST /api/research/deep
- **Purpose**: Submit a deep research task
- **Request**: Query (string), rank_model (xgboost|naive_bayes), include_web_search (bool), include_ldr (bool), top_k (int)
- **Response**: { taskId (UUID), status (pending|running|completed|failed), createdAt, estimatedDuration }
- **Execution**: Orchestrates all three lanes in parallel, returns best candidates to synthesis layer

### GET /admin/deep-research
- **Purpose**: Dashboard view of all research tasks and results
- **Response**: Paginated tasks with status filters, expandable details (results, synthesis, errors)
- **Features**: Role-based access (admin/prosecutor), inline retry/delete actions

### GET /api/acp/tools
- **Purpose**: List all MCP tools available to agentic callers
- **Response**: Tool definitions, parameter schemas, usage examples

## Synthesis Integration

HyperRAG hands off ranked candidates to **Gemma4 synthesis** via SvelteKit `/api/research/deep` endpoint. Synthesis layer:

1. Receives top-K candidates from HyperRAG
2. Packs candidates into 4800-token context budget (via context-assembler.ts)
3. Calls Gemma4 at llama-server :8090 with cache_prompt enabled
4. Extracts key findings and citations
5. Stores synthesis in `ldr_synthesis` table with confidence score
6. Returns structured answer (text + citations + findings + confidence)

## Canonical Storage & Mirrors

| Store | Role | Tables/Collections | Authoritative? |
|-------|------|-------------------|---|
| **Postgres 18** | Packet identity & metadata | `atlas_packets` (58.3K), `codebase_chunk_index` (40.7K) | ✅ YES |
| **Qdrant** | Vector search (ANN) | `codebase_chunks_768` (40.5K points) | Mirror only |
| **Neo4j** | Graph structure & traversal | Typed edges, PageRank nodes | Mirror only |
| **Valkey/Redis** | Hot cache (L1/L2) | `gpu:karpathy:scores`, `bifrost:*`, `centroid:*` | Cache only |
| **CouchDB** | Precomputed views | `pagerank_scores`, `mapreduce_rollups` | 6h-derived cache |

## Performance Targets (SLA)

| Operation | Target | Notes |
|-----------|--------|-------|
| Task creation | 5ms | Async Postgres write |
| Qdrant ANN (top-50) | 50–100ms | HNSW on 40K points |
| Neo4j k-hop (k≤3) | <500ms | Bounded traversal |
| ML ranking (XGBoost) | 100–500ms | On 10–50 candidates |
| Gemma4 synthesis | 5–15s | Streaming generation |
| **Total E2E** | **30–60s** | All lanes parallel |
| Admin page load | 200–500ms | Pagination + relations |

## Audit & Observability

All retrieval decisions logged to `deep_research_audit_log`:

- Task creation (query, rank_model, parameters)
- Retrieval lane results (lane, result_count, duration)
- ML ranking scores and fusion weights
- Synthesis generation (model, confidence, key_findings)
- User actions (retry, delete, export)
- Errors and fallback decisions

Accessible via `yorha` metadata block in responses (transparency for downstream consumers).

## Error Handling & Degradation

- **Lane failure**: If any single lane fails (Qdrant down, Neo4j timeout), continue with remaining lanes
- **Ranking failure**: Fall back to BM25 scoring if ML sidecar unavailable
- **Synthesis failure**: Return best candidates without synthesis; flag for human review
- **Cache failure**: Redis is optional; all operations degrade to live compute

No cascading failures; every component has a fallback.
