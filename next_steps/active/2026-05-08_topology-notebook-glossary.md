# 4D Topology Notebook — Glossary & System Map

> Canonical vocabulary for the YoRHa knowledge atlas. Each term names a
> concept and points to the **concrete table / collection / Redis key**
> that implements it today. Use this as the shared dictionary across docs,
> commit messages, and MCP tool descriptions.

## What this system is

Not "a Jupyter notebook" and not "a single database table." It is an
**interactive knowledge atlas** where every file, AGENTS.md envelope,
screenshot, case note, evidence item, and model output becomes a
structured knowledge card with:

- **text** (canonical body)
- **summary** (compressed for LLM)
- **tags** (semantic + qdrant)
- **embedding** (768-dim, EmbeddingGemma)
- **relationships** (edges to other cards)
- **authority score** (PageRank / graph centrality)
- **recency / risk** (time + audit + dirty-set membership)
- **cached context form** (Redis hot cards)

A retrieval pass picks the top cards, compresses them into a **context
packet**, and ships to Gemma4 / Claude for **synthesis**.

## 4 coordinates per card

| Axis | Meaning | Where stored |
|---|---|---|
| **X / Y** | semantic / topology position | `code_retrieval_chunks.manifold4_x/y`, Qdrant `som_bmu_col/row` payload |
| **Z** | graph authority / PageRank | `code_retrieval_chunks.graph_authority_score`, Neo4j `n.graphPageRank` |
| **W** | recency / risk / current task relevance | `metadata.updated_at`, Redis `ace:rank:dirty_files`, GRPO reward |

Together: every card has a 4D coordinate plus a unit-quaternion projection
(see [`quaternion-manifold.ts`](../../sveltekit-frontend/src/lib/server/search/quaternion-manifold.ts))
for angular similarity ranking on S³.

## Glossary — concept → implementation

| Term | Concept | Concrete location |
|---|---|---|
| **Notebook page** | canonical JSONB record | Postgres rows: `code_retrieval_chunks`, `agent_context_files`, `screenshot_artifacts`, `evidence`, `taxonomy_nodes` |
| **Knowledge card** | summarized object handed to the LLM | `chr97-builder.ts` cartridge output; ACE chunk objects in `context-assembler.ts`; `clusters.get_summary_lenses` MCP tool |
| **Embedding** | meaning vector | `code_retrieval_chunks.embedding vector(768)`, `screenshot_artifacts.caption_embedding vector(768)`, Qdrant `codebase_chunks_768` |
| **Topology coordinate** | semantic + graph 4D position | `manifold4_{x,y,z,w}` columns + `som_cluster` + `topo_byte` |
| **Graph authority** | importance score from Neo4j | Neo4j `n.graphPageRank` (with Postgres fan-in fallback as of `4f9b2ac435`) |
| **Hot cache** | Redis fast lookup | `ace:authority:top` (200 entries, 6h), `taxonomy:children:*` (24h), `gpu:karpathy:scores` (24h), `texture:bow:chunk:*` (1h), `embed:mcp:*` (1h) |
| **Context packet** | compressed set of cards | `chr97_runs` table + Redis `chr97:tensor:*` cache + MCP `context.build_kv_packet` |
| **Reranking** | choose best cards before LLM | `graph-reranker.ts` (FTS + pgvector + Qdrant fan-out), MCP `search.hybrid` (10s cold / 7s warm) |
| **Synthesis** | LLM-generated narrative / plan | `synthesis.generate` RabbitMQ queue → Ollama gemma4-legal — outputs to `memory/runs/<runId>/synthesis_summary.json` |
| **Fallback lane** | backup retrieval path when a layer is down | inline TypeScript when `*_GRPC_ENABLED=false`; pg_trgm when Qdrant offline; OCR + filename when VLM caption fails |
| **Evidence atlas** | visual + text + graph browser | `screenshot_artifacts` + Bits UI Dialog evidence-tray pattern (P3 in visual-evidence-lane TODO) |

## Storage layers — what lives where

```
┌──────────────────────────────────────────────────────────────────────┐
│ Postgres JSONB — canonical "notebook pages"                          │
│   code_retrieval_chunks      indexed code, manifold4, embedding      │
│   agent_context_files        AGENTS.md envelopes                     │
│   directory_context_bindings AGENTS.md walk-up resolution            │
│   agent_context_relations    AGENTS.md ↔ topology edges (NEW)        │
│   taxonomy_nodes / edges     5 levels root→file (5,527 / 62,802)     │
│   screenshot_artifacts       UI / forensic image evidence            │
│   evidence + audit_log       case-bound legal evidence (existing)    │
│   research_summaries         deep-research output                    │
│   chr97_runs                 cartridge / context-packet history      │
│   fix_attempts               operator-gated MCP fix audit            │
│   context_timeline           RL audit trail (every user signal)      │
│                                                                      │
│ Indexes: pg_trgm (fuzzy text) · GIN (jsonb) · HNSW (vectors)        │
└──────────────────────────────────────────────────────────────────────┘
                                ↓
┌──────────────────────────────────────────────────────────────────────┐
│ Qdrant — dense memory search                                         │
│   codebase_chunks_768        code (dual vectors: content + signature)│
│   evidence_items             evidence chunks                         │
│   legal_documents            legal corpus                            │
│   chat_messages              chat context                            │
│   embedding_cache            embed lookup cache                      │
│   ui_screenshots_768         (planned, P1 visual lane)               │
└──────────────────────────────────────────────────────────────────────┘
                                ↓
┌──────────────────────────────────────────────────────────────────────┐
│ Neo4j — graph map                                                    │
│   :CodebaseFile              3,140+ nodes with PageRank              │
│   :GPUCluster, :Community    Louvain communities + GPU k-means       │
│   IMPORTS, SIMILAR_TOPOLOGY  edge types                              │
│   :Statute, :Case, :Citation legal graph                             │
└──────────────────────────────────────────────────────────────────────┘
                                ↓
┌──────────────────────────────────────────────────────────────────────┐
│ Redis — hot working memory                                           │
│   ace:authority:top          top-200 authority scores (6h)           │
│   ace:rank:dirty_files       set: files needing re-rank              │
│   ace:visual:dirty_screenshots  set: routes that drifted             │
│   gpu:karpathy:scores        4-stage CUDA blend (24h)                │
│   taxonomy:children:*        per-parent children (24h)               │
│   embed:mcp:*                MCP query embedding cache (1h)          │
│   typing:prompt:clicks       prompt leaderboard sorted set           │
│   wiki:note:dir:*            KAG notes, 308 keys                     │
│   agents:dir:*               AGENTS.md per directory (24h, 374 keys) │
│   nes:cluster_risk:*         GRPO-wired cluster risk (6h)            │
└──────────────────────────────────────────────────────────────────────┘
```

## Ingestion pipeline — raw thing → notebook page

```
raw input           — code file / AGENTS.md / screenshot / case note / video frame
  ↓
extract metadata    — sha256, mtime, EXIF, EOF marker
  ↓
summarize           — Gemma4 (text) / Gemma4 VLM (image) / heuristic (code)
  ↓
generate tags       — semantic + qdrant + topo_class
  ↓
embed               — embeddinggemma:latest (768-dim, 1.1 GB VRAM)
  ↓
canonical row       — Postgres JSONB upsert (idempotent ON CONFLICT)
  ↓
vector store        — Qdrant upsert (points by stable_key)
  ↓
graph edges         — Neo4j MERGE (relations) + Postgres taxonomy_edges
  ↓
hot cache           — Redis SET with TTL (24h for cards, 1h for cache hits)
  ↓
synthesis ready     — card available for next ACE retrieval pass
```

This is the same shape as the visual-evidence lane (Sharp →
Gemma4 VLM → EmbeddingGemma → Qdrant → Postgres → Redis), the AGENTS.md
lane (parse-agents-md.ts → agent_context_files → directory bindings →
agent_context_relations → Redis), and the code lane (ts-morph scan →
graph-builder → Qdrant content+signature → Neo4j PageRank → Redis
karpathy-gpu rank).

## Retrieval pipeline — query → context packet

```
query
  ↓
1. text candidates       — Postgres pg_trgm + tsvector (fast lane, <100ms)
  ↓
2. semantic candidates   — Qdrant ANN top-K (cached embed: <5ms; cold: 3s)
  ↓
3. topology prefilter    — som_bmu adjacency / topo_byte filter
  ↓
4. graph expansion       — Neo4j 1-2 hop neighbours
  ↓
5. cross-source merge    — webSearchToUnified + research summaries
  ↓
6. score                 — graph_authority + recency + visual_change + GRPO
  ↓
7. quaternion rerank     — angular similarity on S³ (HMM-biased)
  ↓
8. compress              — chr97 cartridge → 64-dim memory path
  ↓
9. context packet        — top N cards, < context budget (default 12k tokens)
  ↓
10. ship to LLM          — Gemma4 / Claude / TurboQuant via MCP
```

## What's already in place vs what's planned

**Built (verified this session):**
- All 4 storage layers (Postgres, Qdrant, Neo4j, Redis) populated
- 5-level taxonomy with 5,527 nodes / 62,802 edges
- AGENTS.md spine: 373 envelopes, 2,071 directory bindings, 6,864 relations
- Karpathy GPU pipeline (4-stage CUDA blend, 6.2s for top-50)
- screenshot_artifacts schema + Sharp enrich pipeline (30 baselines indexed)
- Embed cache (Redis L1, 1h TTL) — saves 3s per repeat search
- 35 MCP tools wrapping the retrieval lanes
- Quaternion S³ projection for angular reranking

**Active TODOs in [next_steps/active/](.):**
- AGENTS.md envelope content fill (P0 — generator/parser alignment)
- Visual-lane caption pass via TurboQuant :8090 (VRAM unblock)
- 3DGS / forensic reconstruction (deferred until trigger)
- Serialization roadmap (proto / gRPC / QUIC layer triggers)

## Why this name choice

"4D topology notebook database" was the user's original framing. After
working through the system map: the core is **interactive knowledge
atlas**, the data shape is **notebook page**, and the model-facing object
is **knowledge card**. The "4D" is true and useful (manifold4 + GRPO is
a literal four-axis embedding), but **atlas + card** is the daily
vocabulary.

Recommended canonical phrase:
> **YoRHa Knowledge Atlas** — a 4D topology notebook indexing every
> file, envelope, screenshot, and evidence card with embeddings, graph
> authority, and Redis-cached context packets for Gemma4 / Claude
> synthesis.

## Atlas content lifecycle — merge / index / update

Every card has an explicit lifecycle. New content does not replace old
content blindly — it **merges with timestamps** so a future query can
reconstruct what the agent saw at any point.

### Update protocol (timestamped, idempotent)

```
incoming card (file edit, screenshot diff, KAG note, agent run)
  ↓
1. compute content_hash      sha256 of canonical body (excludes timestamps)
  ↓
2. row exists with same hash?
   yes → bump updated_at + indexed_at, no embed/qdrant write    [CHEAP PATH]
   no  → embed + Qdrant upsert + Neo4j MERGE + Redis SET        [FULL PATH]
  ↓
3. write context_timeline event (event_type, payload_hash, ts)
  ↓
4. invalidate dependent caches (taxonomy:children:* if structure changed,
                                ace:authority:top if PageRank changed)
  ↓
5. enqueue downstream rebuilds (graphify:cluster-summaries if
                                code_relations changed)
```

**Existing tables already enforce this**:

- `agent_context_files.content_hash` — only re-embed when the AGENTS.md
  body actually changes
- `code_retrieval_chunks` — `indexed_at` + `updated_at` + signature
  embedding hash
- `screenshot_artifacts.metadata.sha256` (planned) — never re-caption a
  byte-identical screenshot
- `context_timeline` — append-only audit; every signal (feedback, summary,
  research, rl_adapt, tool_call) carries a timestamp

### Merge strategy per layer

| Layer | Merge rule | Conflict resolution |
|---|---|---|
| Postgres JSONB | `ON CONFLICT (stable_key) DO UPDATE` with timestamp gate | last-writer-wins on `updated_at` |
| Qdrant points | upsert by deterministic `qdrant_id` | last-write-wins; old vector overwritten |
| Neo4j edges | `MERGE` then `SET ON MATCH` | edge properties accumulate; `pagerankSource` marker tracks origin |
| Redis cards | `SETEX` with TTL | new value, fresh TTL |
| Taxonomy | `ON CONFLICT (node_key) DO UPDATE` | parent/level mutable; member_count recomputes |
| AGENTS.md relations | `ON CONFLICT (source, target, relation) DO UPDATE` | weight + evidence latest |

## Most-accessed signal — `chunk_hit_log`

The atlas already tracks **which chunks the agent actually retrieves**.
Every ACE pass calls `recordChunkHits(chunks, queryHash, pipeline)` →
appends to `chunk_hit_log`:

```sql
chunk_hit_log
  chunk_id        — qdrant point id or stable_key
  relative_path   — file path
  gpu_cluster     — at hit time
  som_cluster     — at hit time
  pipeline        — 'rag' | 'kag' | 'agent' | 'graph' | 'fast-ast'
  query_hash      — sha256 prefix (16 chars)
  score           — pre-rerank similarity
  rerank_score    — post-rerank score
  user_id, case_id, hit_at
```

Indexes: `(pipeline, gpu_cluster, hit_at DESC)` + `(query_hash, hit_at DESC)`.

### Hot-card promotion query

```sql
-- Top 50 most-retrieved chunks last 24h, weighted by rerank
SELECT chunk_id,
       relative_path,
       count(*)            AS hits,
       avg(rerank_score)   AS avg_rerank,
       count(*) * avg(rerank_score) AS hot_score
FROM chunk_hit_log
WHERE hit_at > now() - interval '24 hours'
GROUP BY chunk_id, relative_path
ORDER BY hot_score DESC
LIMIT 50;
```

Pipeline: this query feeds `karpathy:gpu` which currently uses Neo4j
PageRank. Switching the candidate source to `chunk_hit_log` gives the
agent **demand-weighted** ranking instead of pure structural authority —
the chunks the model actually reaches for bubble up first.

**Wire (P1, ~15 min)**: add `--source=hit-log` flag to
`karpathy-gpu-enrich.mjs`; default stays Neo4j.

## Retrieval techniques — what each layer is for

The atlas combines multiple search modalities. Each one answers a
different shape of question:

| Technique | Mechanism | Best for | Cost | Where |
|---|---|---|---|---|
| **BM25 / FTS** | tsvector + GIN | exact tokens, code identifiers | <10ms | `code_retrieval_chunks.search_vector` (precomputed `tsvector`) |
| **pg_trgm** | trigram GIN, `similarity()` | typo-tolerant fuzzy | <10ms (small tables) | `screenshot_artifacts_caption_trgm_idx`, statute / case search |
| **ANN** | HNSW over 768-dim cosine | semantic similarity, paraphrase | 5-30ms | Qdrant `codebase_chunks_768`, `evidence_items` |
| **Graph neighbour** | Neo4j 1-2 hop | "what depends on / cites this" | 50-200ms | `IMPORTS`, `SIMILAR_TOPOLOGY`, `BELONGS_TO_COMMUNITY` |
| **Quaternion S³** | angular `\|dot(q_a, q_b)\|` on biased manifold4 | topology + reward + semantic blend | <1ms per pair | `quaternion-manifold.ts`, `manifold4_q` payload |
| **Autoencoder rank** | 768→64 CUDA projection + attention | demand-weighted authority blend | 100ms / 50 cards | `karpathy-gpu-enrich.mjs` (Stage 3) |
| **Hot-card replay** | `chunk_hit_log` aggregation | what the agent actually reaches for | <50ms | per-pipeline btree index |

### Hybrid retrieval ladder (current `search.hybrid`)

```
query
  ↓
parallel:
  pg_trgm exact-match  (FTS)            ←   BM25 lane
  embeddinggemma 768-dim                ↓
  Qdrant ANN top-50                     ←   ANN lane
  ↓
RRF fuse (reciprocal rank, k=60)
  ↓
graph reranker:
  graphAuthorityScore × 0.35
  pg_trgm score        × 0.20
  Qdrant cosine        × 0.30
  topo_byte adjacency  × 0.15
  ↓
top-N
```

`search.hybrid` already does this. **Missing**: chunk_hit_log
demand-weight folded into the rerank — easy add after `karpathy:gpu`
ingests hit-log scores.

### Minified pg_trgm — compact lexical lane

`pg_trgm` over the trigram GIN index is the cheapest lexical lane.
Today it runs on full row text. Two compactions worth doing:

**a) Minified text columns** — store a stripped/lower-cased projection
(no whitespace/punctuation) in a generated column; trigram index that
instead. Cuts index size ~60% with no recall loss for fuzzy code search.

**b) Tag-only minified table** — for AGENTS.md and screenshots, a
`<table>_tags_min text` generated column = `array_to_string(qdrant_tags || semantic_tags, ' ')`. One trigram index over both tag arrays at once.

Defer until storage pressure shows up.

### Autoencoder + attention (Karpathy GPU lane, already shipped)

```
Stage 1  Neo4j fetch top-N CodebaseFile by graphPageRank   (or hit-log when wired)
Stage 2  Qdrant fetch 768-dim content_embedding per node
Stage 3  autoencoderEncode (CUDA): 768 → 64 dims           memory-path projection
Stage 4  attentionScoreGPU (CUDA): score vs centroid       centrality probe
Stage 5  blend = 0.4·PR + 0.3·attn + 0.3·authority
```

GPU footprint: 196 KB autoencoder weights + 6 KB encoded buffer for 24
vectors. Negligible on RTX 3060 Ti (7,126 MB free at idle). 6.2s for
top-50.

Output flows to:
- `gpu:karpathy:scores` Redis hash (24h TTL)
- `next_steps/active/karpathy-gpu-recommendations.md`
- `logs/task-output/pipeline-test/karpathy-gpu-{latest,timestamp}.json`

### When to use what

```
exact identifier / typo?           → pg_trgm
"what means the same as this?"    → ANN (Qdrant)
"what depends on this?"            → Neo4j graph traversal
"what's structurally adjacent?"    → quaternion S³ on manifold4
"what does the agent actually use?"→ chunk_hit_log aggregation
"what's ranked highest overall?"  → karpathy:gpu blend
```

A complete retrieval pass uses **all** of these; the rerank composes them.

## Cross-references

- [2026-05-08_serialization-roadmap.md](2026-05-08_serialization-roadmap.md) — JSONB → Proto → gRPC → MCP → QUIC layer triggers
- [2026-05-08_agents-md-relationships-todo.md](2026-05-08_agents-md-relationships-todo.md) — staged plan for envelope content + 8 edge types
- [2026-05-08_visual-evidence-lane-todo.md](2026-05-08_visual-evidence-lane-todo.md) — Bits UI / screenshot atlas
- [2026-05-08_3dgs-forensic-roadmap.md](2026-05-08_3dgs-forensic-roadmap.md) — deferred 3D scene reconstruction
- [2026-05-08_mcp-trace-hardening-session.md](2026-05-08_mcp-trace-hardening-session.md) — session work log
