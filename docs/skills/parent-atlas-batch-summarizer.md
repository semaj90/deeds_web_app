# Parent Atlas Batch Summarizer — Agent Skill

## What This Does

Batch-summarizes every file in the codebase into the `parent_atlas_documents` table using Gemma4 on the local GPU (llama-server :8090). Each summary is a 2–4 sentence technical paragraph describing what the file does, its role in the system, and notable patterns.

Summaries are the text backbone of the NES/CHROM engram packet pipeline:
`source_ref → summary → Phase101 packet → Redis ACE cache → Qdrant embedding → Neo4j node`

---

## Architecture

```
Files on disk (scripts/, src/, sveltekit-frontend/src/)
  ↓  readFirstLines(path, 80)
  ↓
buildPrompt(row, snippet)              ← tags + imports + exports + route_handlers
  ↓
Phase101 cache lookup (Redis exact → semantic cosine ≥ 0.95)
  ↓ miss
Gemma4 llama-server :8090              ← stream:true, 90s timeout, cache_prompt:true
  ↓
Phase101SummaryPacket (JSONB)          ← featureIds[], laneIds[], synthesis{mainThemes[]}
  ↓
UPDATE parent_atlas_documents SET summary = ...
  ↓
Redis: atlas:summary:semantic:index:v1  (LRU 100-entry semantic index)
```

---

## Ports and Models

| Service | Port | Purpose |
|---|---|---|
| llama-server (TurboQuant) | **:8090** | Text generation — Gemma4 rotorquant, stream:true required |
| Ollama (fallback) | **:11434** | Chat fallback if :8090 down, uses `think:false` |
| embeddinggemma (Ollama) | **:11434** → `/api/embeddings` | Cache similarity lookup (768-dim) |
| Ollama embed alternate | **:8081** | `OLLAMA_EMBED_BASE_URL` env — separate embed server if configured |
| Redis | **:6379** | Phase101 exact + semantic cache; LOD packet store |
| Postgres 18 | **:5434** | `parent_atlas_documents`, `atlas_feature_map` source tables |
| Qdrant | **:6333** | `codebase_chunks_768` — 768-dim vectors for similarity cache lookup |

### Why stream:true on llama-server

Gemma4 is a thinking/reasoning model. With `stream:false`, the thinking block (`reasoning_content`) consumes `max_tokens` first, leaving `content` empty. `stream:true` assembles content deltas as they arrive and terminates on `[DONE]`. This is a hard rule.

---

## Key Files

| File | Role |
|---|---|
| `scripts/atlas/gemma4-parent-atlas-summaries.mjs` | Main batch runner |
| `sveltekit-frontend/src/lib/server/cache/phase101-summary-cache.ts` | Phase101 packet schema + Redis cache read/write |
| `scripts/atlas/build-synthesized-map.mjs` | Rebuilds `atlas_feature_map_synthesized` after summaries |
| `scripts/atlas/sync-atlas-to-qdrant.mjs` | Syncs Qdrant → `atlas_feature_map` (qdrant_point_id, som_cluster) |
| `scripts/atlas/project-sourceRef-context-neo4j.mjs` | Pushes source_ref + feature_id + summary → Neo4j |
| `scripts/atlas/smoke-feature-traversal.mjs` | End-to-end traversal smoke: DB → Qdrant → Neo4j → Redis |
| `sveltekit-frontend/src/lib/server/db/schema/atlas-dict.ts` | Drizzle schema: atlas_feature_synthesis, atlas_source_ref_synthesis |

---

## Running the Summarizer

```bash
cd sveltekit-frontend

# Standard batch (cache-enabled, recommended):
npx tsx ../scripts/atlas/gemma4-parent-atlas-summaries.mjs \
  --cache \
  --apply \
  --limit=100 \
  --concurrency=3

# Check remaining backlog:
npx tsx ../scripts/atlas/gemma4-parent-atlas-summaries.mjs --cache --limit=1 | grep "still need"

# Single file (debug):
npx tsx ../scripts/atlas/gemma4-parent-atlas-summaries.mjs \
  --cache --apply \
  --source-ref "src/lib/server/db/client.ts"
```

### Flags

| Flag | Default | Notes |
|---|---|---|
| `--cache` | off | Enables Phase101 Redis cache (exact + semantic lookup). Always use this. |
| `--apply` | off | Writes to DB. Without this, dry-run only. |
| `--limit=N` | 50 | Files per run |
| `--concurrency=N` | 2 | Parallel inflight requests to llama-server |
| `--source-ref=...` | — | Single file mode |
| `--verbose` | off | Extra Redis cache debug logs |

### GPU / Concurrency notes

RTX 3060 Ti (8GB VRAM) at `--concurrency=3`:
- GPU util: ~84%, VRAM used: ~7.2 GB, free: ~820 MB
- Throughput: ~8–9 files/min (21s avg inference per file)
- Cache hits reduce this significantly — batch 2 saw 23% hit rate, rising each run

To explore higher throughput via llama-server.exe flags:
```
llama-server.exe --help | grep -E "batch|ubatch|parallel|threads|cont-batching"

Key flags to investigate:
  -np / --parallel N        Number of parallel decode slots (default 1)
  -cb / --cont-batching     Enable continuous batching (multiple requests in flight)
  -b  / --batch-size N      Logical batch size for prompt processing
  -ub / --ubatch-size N     Physical batch size for CUDA kernels
  --threads N               CPU threads for non-GPU layers
  -ngl / --n-gpu-layers N   Layers on GPU (already 99 = all)
```

With `--parallel 2 --cont-batching`, llama-server can process 2 requests simultaneously.
On 8GB with Gemma4 (5.3GB model), ~2.7GB headroom — tight but possibly viable for parallel=2.
Test: `llama-server.exe -m model.gguf -ngl 99 -np 2 -cb -c 8192`
If it runs, bump `--concurrency` in the script to match.

---

## NES/CHROM Engram Packet Pipeline

The summary feeds directly into the engram packet structure:

```
parent_atlas_documents
  { source_ref, feature_id, summary, tags[], imports[], exports[], route_handlers[] }
  ↓
Phase101SummaryPacket (built by phase101-summary-cache.ts)
  {
    packetId,
    sourceRefs: [source_ref],
    featureIds: [feature_id],          ← for Neo4j ParentAtlasFeature nodes
    laneIds: ['feature:auth'],          ← for ACE lane routing
    summary,                            ← text backbone
    synthesis: {
      mainThemes[], supportingEvidence[],
      gaps[], nextSteps[]
    },
    semanticEmbedding: float32[768]     ← deterministic seed OR embeddinggemma result
  }
  ↓
Redis: atlas:summary:cache:{sha256}    (exact hit, 1h TTL)
Redis: atlas:summary:semantic:index:v1 (LRU semantic index, cosine ≥ 0.95 threshold)
```

### Embedding the packets for Qdrant ingestion

Currently `semanticEmbedding` in the Phase101 packet uses a **deterministic SHA-256 seed vector** (flat, low entropy) — not a real embeddinggemma embedding. To upgrade to real 768-dim vectors for Qdrant storage:

```bash
# The embed endpoint cascade (canonical):
# 1. GET /api/embed (SvelteKit dev server — Redis L1 + Bifrost L2 cached)
# 2. POST http://127.0.0.1:11434/api/embeddings  (Ollama direct fallback)
# 3. POST http://127.0.0.1:8081/api/embeddings   (OLLAMA_EMBED_BASE_URL alt server)

# Model: embeddinggemma:latest (768-dim, Ollama)
# NOT via llama-server :8090 (chat-only, refuses /embeddings without --embeddings flag)
```

To embed summaries and push to Qdrant:
```bash
# Planned script (not yet built):
node scripts/atlas/embed-summaries-to-qdrant.mjs --apply
# Reads: parent_atlas_documents WHERE summary IS NOT NULL
# Embeds: summary text via Ollama embeddinggemma
# Upserts: Qdrant collection 'parent_atlas_summaries_768' (or adds named vector to codebase_chunks_768)
# Payload: { source_ref, feature_id, summary, som_cluster, centroid_id }
```

---

## Postgres → Qdrant → DuckDB → Neo4j Full Pipeline

### Storage spine

```
Postgres 18 (port :5434)
  parent_atlas_documents          ← canonical source_ref + feature_id + summary
  atlas_feature_map               ← qdrant_point_id + som_cluster + centroid_id
  atlas_feature_map_synthesized   ← joined working memory (12,666 rows)
  atlas_feature_synthesis         ← per feature_id aggregate (12 rows)
  atlas_source_ref_synthesis      ← per source_ref Karpathy scores (planned)

Qdrant (:6333)
  codebase_chunks_768             ← 76,185 points, named vector 'content' 768-dim
                                    payload: { source_ref, feature_id, som_cluster,
                                               centroid_id, file_path, tags[] }

Redis (:6379)
  gpu:karpathy:scores             ← hash: file → {pr, attn, authority, blend}  24h TTL
  ace:authority:top               ← top-200 stableKey → graphAuthorityScore
  atlas:summary:cache:{sha}       ← Phase101 exact packet cache  1h TTL
  code:index:tag:*                ← 2,202 tag keys for ACE fast-AST lane

Neo4j (:7687)
  CodebaseFile { source_ref }
  ParentAtlasFeature { featureKey: feature_id }
  (CodebaseFile)-[:BELONGS_TO_FEATURE]->(ParentAtlasFeature)
  (CodebaseFile)-[:SIMILAR_TOPOLOGY]->(CodebaseFile)   ← SOM grid adjacency
  (CodebaseFile)-[:BELONGS_TO_CLUSTER]->(GPUCluster)
```

### DuckDB offline join pattern

For cross-source joins without loading everything into Postgres:

```javascript
import duckdb from 'duckdb';
const db = new duckdb.Database(':memory:');

// Join parent_atlas_documents + NDJSON candidate cards + Qdrant export
db.run(`
  CREATE TABLE atlas AS
    SELECT * FROM read_ndjson_auto('.opencode/ndjson/atlas_feature_map.ndjson');

  CREATE TABLE candidates AS
    SELECT * FROM read_ndjson_auto('.opencode/ndjson/candidates/*.ndjson');

  CREATE TABLE summaries AS
    SELECT source_ref, feature_id, summary, som_cluster
    FROM atlas WHERE summary IS NOT NULL;

  -- Join summaries with SOM cluster centroids
  SELECT s.feature_id, s.summary, a.som_cluster, a.centroid_id
  FROM summaries s
  JOIN atlas a ON s.source_ref = a.source_ref
  WHERE a.qdrant_point_id IS NOT NULL
  ORDER BY a.som_cluster;
`);
```

MapReduce script: `scripts/atlas/mapreduce-path-join.mjs`
DuckDB report: `docs/reports/offline-synthesis-mapreduce.duckdb`

---

## Post-Summaries Cascade (run in order)

```bash
cd sveltekit-frontend

# 1. Verify coverage
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*), COUNT(*) FILTER (WHERE summary IS NOT NULL) FROM parent_atlas_documents"

# 2. Rebuild synthesized map
node ../scripts/atlas/build-synthesized-map.mjs --apply

# 3. Karpathy GPU blend refresh (requires Qdrant 76k+ points ✓)
npm run karpathy:gpu
# Writes: Redis gpu:karpathy:scores hash (0.4·PR + 0.3·attn + 0.3·authority)

# 4. Push feature_id + summaries → Neo4j
node ../scripts/atlas/project-sourceRef-context-neo4j.mjs --apply
# Creates: ParentAtlasFeature nodes keyed by feature_id
# Creates: (SourceRef)-[:BELONGS_TO_FEATURE]->(ParentAtlasFeature) edges

# 5. PageRank refresh
npm run graphify:pagerank
# CouchDB link_matrix → power-iteration → Redis couchdb:pagerank_scores (6h TTL)

# 6. Topology edges
npm run graphify:topology
# SIMILAR_TOPOLOGY edges in Neo4j from SOM grid adjacency

# 7. Smoke check
npm run smoke:graphify
node scripts/atlas/smoke-feature-traversal.mjs
```

---

## Completion Estimate (2026-06-04)

| Layer | Coverage | Blocker |
|---|---|---|
| parent_atlas_documents summaries | 80.5% (4,229/5,253) | ~924 files, ~9 more batches |
| atlas_feature_map Qdrant coverage | 58.4% (7,403/12,666) | 5,263 feature bucket rows are intentionally unvectorized |
| SOM cluster coverage | 62.6% (7,933/12,666) | Same denominator issue — Qdrant-backed rows ~97% clustered |
| Karpathy GPU blend | Stale (pre-scripts/ indexing) | Run `karpathy:gpu` after summaries done |
| Neo4j feature projection | Partial | Run `project-sourceRef-context-neo4j.mjs --apply` |
| Recommendation engine | 35% | Needs stable Karpathy blend first |
