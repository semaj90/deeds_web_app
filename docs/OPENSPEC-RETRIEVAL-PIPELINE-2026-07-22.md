# OpenSpec: Retrieval Pipeline — Verified State & Gate Analysis
**Date**: 2026-07-22 | **Status**: VERIFIED LIVE — P0/P1/P2/P3/P5 APPLY_PROVEN | **GATE 2 BLOCKER IDENTIFIED**: KMeans 47.67% + SOM collapse (68% in 3 cells)

---

## Verified Infrastructure (Live)

| Service | Container | Status | Notes |
|---------|-----------|--------|-------|
| Postgres | legal-ai-postgres | ✅ UP 7h | 61,659 packets, 52,380 chunks w/ embeddings |
| Qdrant | legal-ai-qdrant | ✅ UP 7h | 41 collections, 57,395 pts in 384_hybrid |
| Neo4j | legal-ai-neo4j | ✅ UP 7h | 51,333 SIMILAR_TOPOLOGY edges |
| RabbitMQ | legal-ai-rabbitmq | ✅ UP 7h | — |
| Redis/Valkey | legal-ai-valkey | ✅ UP | 45,197 keys: 398 SOM centroids + 39,151 packet envelopes + 5,510 feature indexes |

---

## Qdrant Collection Map (Verified 2026-07-22)

| Collection | Named Vectors | Points | Role |
|------------|--------------|--------|------|
| `codebase_chunks_384_hybrid` | `content` (384d Cosine), `summary` (384d Cosine) | 57,395 | **Canonical retrieval** |
| `codebase_chunks_768` | `content` (768d Cosine), `error` (768d Cosine), `signature` (768d Cosine) | 55,119 | Native source / GPU rerank |
| `codebase_chunks_384` | `content` (384d), `summary` (384d) | 30 | Old stub (ignore) |
| `codebase_topology_64` | — | — | Routing / AE latent |

**Contract fix applied**: `qdrant-collection-contracts.ts` previously declared `content_384` / `content_768` — corrected to `content` matching live collection schema.

---

## Embedding Dimension Truth (Verified)

| Layer | Column / Field | Actual Dimension | Type | Status |
|-------|---------------|-----------------|------|--------|
| Postgres `codebase_chunk_index.content_embedding` | `halfvec` | **384** | halfvec | ✅ 52,380 rows populated |
| Postgres `codebase_chunk_index.content_embedding_384` | `vector(384)` | 384 | vector | migration 0099, not in Drizzle yet |
| Postgres `codebase_chunk_index.content_embedding_768` | `vector(768)` | 768 | vector | migration 0030 |
| Postgres `atlas_packets.embedding` | `vector(768)` | 768 | vector | ALL NULL — deprecated |
| Qdrant `codebase_chunks_384_hybrid.content` | named vector | 384 | Cosine | ✅ 57,395 pts |
| Qdrant `codebase_chunks_768.content` | named vector | 768 | Cosine | ✅ 55,119 pts |
| `embedding-service.ts` DEFAULT_CONFIG | `target_dim` | **384** | — | ✅ Fixed this session |

**Key**: `content_embedding` is `halfvec` (not `vector`) — Drizzle schema likely declares it wrong. Do NOT cast to Float32Array directly; use `::vector` cast in SQL or the halfvec accessor.

---

## SOM / K-Means State — GATE 2 INVESTIGATION COMPLETE (2026-07-22)

| Metric | Value | Status | Notes |
|--------|-------|--------|-------|
| `atlas_packets` total | 61,659 | — | |
| **K-Means Assigned** | **29,393 / 61,659 (47.67%)** | ⚠️ **PARTIAL** | **32,266 unassigned (52.33%)** |
| **SOM Cell Collapse** | **3 cells = 68.1%** | ❌ **SEVERE** | Cell [0,5]=10,109, [0,11]=5,003, [0,3]=4,901 |
| SOM unique cells occupied | ~15 / 400 | ❌ Expected 50+ | Most cells empty |
| Qdrant payload `kmeans_cluster` | present | ⚠️ Invalid data | Uses partial KMeans results |
| Qdrant payload `som_row`/`som_col` | **✅ present** | ✅ | 57,395/57,395 synced |
| Neo4j `SIMILAR_TOPOLOGY` edges | 51,333 | ✅ | |
| Neo4j `BELONGS_TO_CLUSTER` edges | 1,587 | ❌ Incomplete | Depends on valid KMeans |
| Neo4j nodes with `som_row` | **✅ 40,656** | ✅ | 99.8% coverage |

**BLOCKER FOUND**: KMeans is only 47.67% assigned + SOM has collapsed to 3 cells (68% of data). gpu:karpathy:scores cannot be populated until KMeans root cause is diagnosed and fixed. See GATE-2-INVESTIGATION-COMPLETE.md for detailed analysis and 6-phase remediation roadmap.

---

## Search Lane Registry (Current)

| Lane | Name | Weight | Collection | Vector | Status |
|------|------|--------|------------|--------|--------|
| `GpuCuvSLane` | `gpu-cuvs` | 0.40 | :8791 HTTP | — | ⚠️ Needs TurboVec running |
| `QdrantLane384` | `qdrant-384` | 0.38 | `codebase_chunks_384_hybrid` | `content` (384d) | ✅ Verified correct |
| `QdrantLane` | `qdrant` | 0.35 | `codebase_chunks_768` | `content` (768d) | ✅ Active fallback |
| `LexicalLane` | `lexical` | 0.20 | Postgres FTS | — | ✅ |
| `Bm25Lane` | `bm25` | 0.15 | Postgres trigram | — | ✅ |

Default lanes in `service.ts`: `['gpu-cuvs', 'qdrant-384', 'qdrant']`
Fallback chain: `['gpu-cuvs', 'qdrant-384', 'qdrant', 'lexical', 'bm25']`

---

## Smoke Test Status

```bash
# 768-dim native lane (source768)
npm run smoke:embeddinggemma        # → --lane source768, collection: codebase_chunks_768

# 384-dim retrieval projection (retrieval384)
npm run smoke:embeddinggemma:384    # → --lane retrieval384, collection: codebase_chunks_384_hybrid
```

**Fix applied this session**: E5/E6 upsert+search now use `NAMED_VECTOR` variable and `projectVec()` which prefix-slices 768→384 and re-normalizes. The FATAL dim guard that blocked the 384 lane is removed.

---

## Pipeline Gaps & Next Steps (Priority Order)

### P0 — ✅ COMPLETE — Bifrost/Valkey KV warming
- `legal-ai-valkey` verified UP (was already running)
- `phase7-redis-centroid-warming-fast.mjs --apply` → **398/400 SOM centroids cached** (24h TTL)
  - Key pattern: `centroid:{row}:{col}` → JSON with embedding array + chunk_ids
- `phase10-packet-cache-warmer.mjs` → **39,151 packet envelopes cached** (7-day TTL)
  - Key pattern: `bitfrost:packet:envelope:{id}` + `bitfrost:packet:index:{feature_id}`
- Total Valkey keys: 45,197

### P1 — ✅ COMPLETE — SOM Coordinates → Qdrant
- `backfill-qdrant-som-payload.mjs --apply` → **57,395/57,395 points updated** (100%)
  - Added `som_row`, `som_col`, `som_cluster` to every point in `codebase_chunks_384_hybrid`
  - Join: `atlas_packets.packet_key` → Qdrant payload `packet_key` (0 mismatches)
  - SOM filter pushdown in `QdrantLane384.search()` now works

### P2 — ✅ COMPLETE — SOM → Neo4j Node Properties
- `backfill-neo4j-som-cluster.mjs --apply` → **40,656/40,754 Packet nodes updated** (99.8%)
  - Added `som_row`, `som_col`, `som_cluster_20x20` to every matched Packet node
  - Join: `Packet.path` (Neo4j) → `atlas_packets.source_ref` (Postgres), 98 path mismatches (deleted files)
  - ACE topological boosting via SOM grid coords now enabled on Neo4j

### P3 — ✅ COMPLETE — Drizzle Schema Alignment
- `schema-postgres.ts` fixed in `codebaseChunkIndex` table:
  - Added `halfvec` import from `drizzle-orm/pg-core`
  - `contentEmbedding`: now `halfvec('content_embedding', { dimensions: 768 })` (was absent/commented)
  - `summaryEmbedding`: now `halfvec('summary_embedding', { dimensions: 768 })` (was `vector(768)`)
  - `signatureEmbedding`: now `halfvec('signature_embedding', { dimensions: 768 })` (was `vector(768)`)
  - `content_embedding_768`, `legal_documents.content_embedding` remain `vector(768)` (correct)
  - No drizzle-kit push needed — schema-only type correction, no DDL change

### P4 — 🔄 IN PROGRESS — Gemma4 Summary Backfill
- **Current**: 39,151/52,417 chunks have summaries (74.7%) — not 9.6% as originally noted
- **Remaining**: 13,266 chunks without summaries
- **Running**: `batch-summarize-chunks.mjs --apply --batch-size=10 --limit=13300` (PID background)
  - Fixed: `stream: true` (was `false`) per Gemma4 hard rule — thinking model requires streaming
  - Monitor: `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM codebase_chunk_index WHERE summary IS NOT NULL AND LENGTH(summary) > 30;"`

### P5 — ✅ APPLY_PROVEN — MCP Clustering Tools (TRACE MCP live at :8788)
- **Added `clusters.som_cell_lookup`** — registered in `trace-mcp-server.ts` + `cluster-lenses.tool.ts`
  - Query: `atlas_packets WHERE som_row BETWEEN $rowMin AND $rowMax AND som_col BETWEEN $colMin AND $colMax ORDER BY COALESCE(authority_score,0) DESC`
  - Returns: `routing_provenance.som_assignment_health: 'unverified'`, `center_count`, `neighbor_count`, `packets[]` with `is_center` flag
  - **Runtime smoke PASS**: row=0, col=5, include_neighbors=true → 20 packets, center_count=20, provenance ✅
- **Added `clusters.kmeans_members`** — registered in `trace-mcp-server.ts` + `cluster-lenses.tool.ts`
  - Query: `atlas_packets WHERE som_cluster_id = $1 AND COALESCE(authority_score,0) >= $2` (uses `som_cluster_id` integer column, not `som_cluster` text)
  - **Runtime smoke PASS**: cluster_ids=[2,7], min_authority=0 → cluster 2: 66 total/20 returned, cluster 7: 68 total/20 returned ✅
- **TRACE MCP server restarted** — tools/list now returns **129 tools** (was 127)
- **Column fixes applied**: `authority_score` (not `graph_authority_score`), `som_cluster_id` integer (not `som_cluster` text)
- Both tools also wired into `server-fastmcp.ts` (tsc exit 0)

### P6 — PageRank GPU Fanout (blocks authority scoring)
- [ ] **cuGraph offline PageRank** → write scores back to `atlas_packets.pagerank_score`
  - Script: `scripts/atlas/cuml-kmeans-clustering.py` (exists, check if PageRank included)
  - Scores feed Karpathy blend: `0.4·PR + 0.3·attn + 0.3·authority`
  - Cache to Redis: `gpu:karpathy:scores` hash (24h TTL)

### P7 — Feature Labeling (Tree-sitter / LangExtract alignment)
- [ ] **Structured lexical evidence classes** not yet formalized
  - Define enum: `noun | verb | identifier | error_term | type_ref | module_ref | literal | operator`
  - Wire into LangExtract service response typing (`langextract-reranker.ts`)
  - Wire into tree-sitter AST extractor output (`extract-ast-keywords.mjs`)
  - Store in `atlas_packets.feature_labels` JSONB or new `atlas_packet_features` table

### P8 — HyperRAG RPC (blocks multi-hop traversal)
- [ ] **Verify smoke test passes**: `npm run smoke:trace:full`
  - Check: `scripts/atlas/smoke-hyperrag-packet-rpc.mjs` → calls `/api/hyperrag/packet-rpc`
  - Requires: SvelteKit dev server running (`:5173`)

### P9 — Archive / SeaweedFS Migration
- [ ] **Score superseded files**: `node scripts/atlas/score-superseded-originals.mjs`
- [ ] **Move cold originals**: `node deeds_labs/archive-cold-originals.mjs --apply`
- [ ] **Verify cold storage restore** before deleting: `node deeds_labs/prove-cold-storage-restore.mjs`

---

## Multiview Collection Plan (Post-P1)

Build `codebase_chunks_multiview_v1` with three named vectors in one collection:

```json
{
  "dense_384": { "size": 384, "distance": "Cosine" },
  "dense_768": { "size": 768, "distance": "Cosine" },
  "latent_64":  { "size": 64,  "distance": "Cosine" }
}
```

Switch alias `codebase_search_current` → `codebase_chunks_multiview_v1` atomically after validation. This enables Qdrant Query API prefetch+RRF across all three vectors in a single request.

**Do NOT attempt until**: P1 (SOM backfill), P4 (summary coverage >80%), and P6 (PageRank scores) are complete.

---

## Agentic Error-Fixing Readiness

- **TODO sources**: `NEXT-STEPS.md`, `NEXT_ACTIONS_CHECKLIST.md`, `TODO_ParentAtlas_Ingestion.md`, `next_steps/active/` (20+ items)
- **Synthesis command**: `npm run atlas:pipeline:20step` runs phases 0–4 sequentially
- **ACE assembler ready**: `npm run atlas:phase4:ace` once summary coverage >50%
- **Blocking items for full agentic loop**: Redis (P0), SOM→Qdrant (P1), summary backfill (P4)
