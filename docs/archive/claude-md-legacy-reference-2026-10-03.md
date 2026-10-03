# CLAUDE.md legacy reference sections — archived verbatim 2026-10-03

Source: root CLAUDE.md. Condensed rules were kept in place; these are the original full texts.

## Client-Backend Multi-Tier Architecture

### Inference Fallback Chain
```
User Query
  ↓
Client Router (src/lib/ai/client-router.ts)
  ├─ Simple query → LOCAL ONNX (gemma270m via WebGPU/WASM)
  │   ├─ WebGPU (Dawn) → WASM SIMD → CPU fallback
  │   ├─ Model: static/gemma3_270m_onnx/ (418MB, local-only)
  │   ├─ Embeddings: static/embeddinggemma_300m_onnx/ (768-dim)
  │   └─ Auto-escalate on failure → SERVER
  │
  └─ Legal/complex query → DUAL LANE
      ├─ **Embeddings/Indexing**: Ollama `/api/embed` (embeddinggemma:latest)
      │   └─ Storage: Redis (exact) → Qdrant (dense) → Postgres (mirror)
      ├─ **Generation/Chat**: llama-server (Gemma4/Qwen)
      │   └─ Optimization: TurboQuant KV Cache + Bitfrost semantic cache
      └─ Reference: [`docs/KARPATHY_PIPELINE_ARCHITECTURE.md`](./docs/KARPATHY_PIPELINE_ARCHITECTURE.md)
      └─ Reference: [`docs/ACE_STARTUP_CUDA_BRIDGE.md`](./docs/ACE_STARTUP_CUDA_BRIDGE.md)
```

### Cache Hierarchy (Client → Server)
```
L0: LokiJS (in-memory, 5-10min TTL, session-scoped)
  ↓ miss
L1: IndexedDB (persistent, 7-day TTL, survives refresh)
  ↓ miss
L2: Memory Cache (server, 5min TTL, in-process Map)
  ↓ miss
L3: Redis (server, configurable TTL, cross-request)
  ↓ miss
L4: Service Logic (DB query, Qdrant search, Ollama inference)
  ↓
Write back to L0-L3
```

### Retrieval Pipeline (RAG + KAG + DAG)
- **RAG** (Retrieval-Augmented Generation): Qdrant vector search → confidence ranking → LLM generation
- **KAG** (Knowledge-Augmented Generation): Schema validation, W3C spec checks, package.json verification
- **DAG** (Directed Acyclic Graph): Cluster dependency ordering, fix priority scheduling
- **2-stage codebase retrieval**: Fuse.js fuzzy recall → Qdrant dual-vector rerank (0.6 content + 0.4 signature)

### Qdrant Collections (768-dim)

**This is a curated subset, not the full list** — live `GET /collections` (checked 2026-08-31)
returns **43 collections total**, not 6. The 6 below are confirmed live and populated; notable
collections missing from this short list include `evidence_vectors`, `court_opinions`,
`poi_profiles`, `document_tags`, `knowledge_base`, `legal_canon_chunks`, plus the embedding/latent
lanes documented elsewhere in this file (`codebase_chunks_512` — 53,379 points,
`codebase_chunks_768_v2` — 52,380 points, `codebase_chunks_latent256` — 55,169 points). Run
`curl http://127.0.0.1:6333/collections` for the current full list before assuming this table is
exhaustive. (`codebase_chunks_384` / `codebase_chunks_384_hybrid` also still exist as collections
but are near-empty — 1 and 10 points respectively — consistent with 384 being retired per the
Embedding Dimensions Policy above; they were never deleted, just abandoned.)

| Collection | Purpose | Status |
|------------|---------|--------|
| `evidence_items` | Evidence chunks + metadata | Active |
| `legal_documents` | Legal document embeddings | Active |
| `legal_cases` | Case description embeddings | Active |
| `codebase_chunks_768` | Dual-vector code search | Active (328,348 points as of 2026-09-27 — see the live re-verification table in the Embedding Dimensions Policy section above before citing an older figure) |
| `chat_messages` | Chat context search | Active |
| `embedding_cache` | Embedding lookup cache | Active |

### RabbitMQ Queues
`cache.invalidate`, `document.embed`, `evidence.process`, `vector.index`, `chat.context`, `analytics.track`, `codebase.index`

### FastMCP Agentic Tools

**This "(9)" list is fictional — verified against the live server, not just stale.** None of the 9
names below (`unified_ast_query`, `cross_language_similarity`, `cuda_fix_priority`, `glyph_metadata`,
`neo4j_dependency_graph`, `agentic_recommendation`, `batch_error_analysis`, `redis_cache_stats`,
`system_health_check`) exist anywhere in `sveltekit-frontend/src/mcp/server.ts` or the rest of
`src/` (checked 2026-08-31). The real server registers **108 tools live** (verified 2026-08-31 by
booting the actual process over stdio and sending a real `tools/list` JSON-RPC call — a static
`grep -c "name: '"` on the file undercounts this at 88, since ~20 more tools are spread in at
runtime from `DISPATCHER_TOOLS_SCHEMAS` and `getPhase109aToolDefinitions()`), namespaced like
`cases:load`, `codebase:search`, `atlas.packet_search`, `evidence:analyze`, `kb.search_cards`,
`graph.index`, `wiki.search`, etc. — a completely different naming scheme, not a renamed subset of
the 9. Do not treat the 9 names as real tool names to call; read `src/mcp/server.ts`'s
`ListToolsRequestSchema` handler directly for the current list, and see the "MCP/Atlas status
note" at the top of this file for how tool counts are tracked going forward.

**Dynamic tool-set selection (added 2026-08-31)**: `ListToolsRequestSchema` no longer only ever
returns the full 108-tool list. It now calls `selectMcpToolSubset()`, which dynamically imports
`scripts/atlas/runtime-mcp-tool-selector.mjs` — a semantic tool-picker that already existed in this
repo (Qdrant-backed with a file-backed `docs/reports/mcp-tool-registry-index.json` registry
fallback) but was never wired into any live `ListTools` handler — and filters down to a
query-relevant top-K when the caller supplies `_meta.queryHint` (or `MCP_TOOL_QUERY_HINT` env var).
With no hint, behavior is unchanged: full 108-tool list, same as before. Verified live: booting the
real process and sending `tools/list` with `_meta.queryHint: "search codebase for embedding
errors"` returned 8 tools (`codebase:search`, `atlas.packet_search`, `kb.search_cards`,
`wiki.search`, etc.) instead of 108 — no tool was deleted or stubbed, only what a given call
*advertises* changed. This is the fix for the earlier "88/108 tools always loaded" memory/context
overhead question, not a physical multi-process split (that remains a possible future follow-up,
not done here).

**MCP-SELECT hardening pass (2026-08-31, same day, external review)**: three protocol-hardening
corrections applied on top of the above, plus a live determinism check:
- **MCP-SELECT-03 (done)**: the hint key is now the reverse-DNS-namespaced
  `_meta['com.parentatlas.tool_query_hint']`, not a bare `_meta.queryHint` — MCP reserves
  unnamespaced `_meta` keys and recommends reverse-DNS prefixes for custom ones.
- **MCP-SELECT-04 (done)**: a filtered (hint-driven) `ListTools` response now returns
  `_meta: { ttlMs: 0, cacheScope: 'private' }` so a query-scoped subset can never be cached and
  reused as if it were the stable catalog. The unfiltered no-hint response carries no such hint
  (it's the real stable catalog, caching it is fine).
- **MCP-SELECT-05 (done, documentation)**: `selectMcpToolSubset()` carries an explicit hard-rule
  comment that this is a context/discovery optimization ONLY, never an authorization boundary —
  it fails open to the full list on any error, which is correct for availability but means it must
  never be trusted to withhold a tool for security reasons. Auth stays entirely in `checkAuth()`
  and per-handler guards, independent of this function.
- **MCP-SELECT-06/07 (partially proven — real finding, not just a checkbox)**: live two-query
  replay against the booted process confirmed the no-hint response is stable (108 tools, same
  checksum) and same-query repeatability holds (`"search codebase for embedding errors"` run twice
  → identical 8-tool subset, identical checksum). But **a genuinely different second query
  ("trace graph pagerank authority scores") produced the identical 8-tool subset**, not an
  independently different one. Root cause verified, not a selector bug: at the real `topK=16` used
  here, the two queries *do* rank differently before filtering, but the differentiating tools
  (`trace.kag_search`, `karpathy.attention_rank_files`, `ace.compact_search`, `ops.*`, `legal.*`)
  all belong to *other* MCP servers, not this one — Qdrant's `tool_manifest` collection is still
  empty (confirmed earlier in this file), so the registry-fallback path is doing the ranking, and
  its "generic core" of this server's own tools (`wiki.search`, `codebase:search`,
  `memory:prior_answer_lookup`, `atlas.packet_search`, etc.) dominates the top ranks for this
  server's tool space regardless of query. **Real fix path**: populate the Qdrant `tool_manifest`
  collection (the pre-existing `atlas:mcp:tool-manifest` script target) so the semantic path
  actually engages instead of always falling through to the coarser registry ranking — not a code
  change to the selector wiring itself.

### Evidence Pipeline (8 stages)
1. Object storage upload + SHA-256 hash + PostgreSQL record
2. Text extraction: pdf-parse → OCR fallback (Tesseract CLI → tesseract.js)
3. Structure-aware chunking via legal-chunker.ts (ARTICLE/SECTION/§)
4. Embedding: gRPC → embeddinggemma → nomic-embed-text fallback
5. Dual storage: pgvector `evidence_vectors` + Qdrant `evidence_items`
6. Entity extraction (EMAIL, PHONE, DATE, CITATION, STATUTE, MONEY)
7. Forensic pattern detection (SSN, CC, contact density, legal keywords)
8. Summarization via Ollama gemma4-rotorquant:latest (non-fatal)

### Key Client-Side Files
| File | Purpose |
|------|---------|
| `src/lib/ai/client-router.ts` | Routes local vs server inference |
| `src/lib/ai/client-cache.ts` | LokiJS + IndexedDB dual-tier cache |
| `src/lib/ai/client-embed.ts` | 768-dim ONNX embeddings (mean-pool + L2-norm) |
| `src/lib/ai/onnx/session.ts` | WebGPU → WASM → CPU session factory |
| `src/lib/ai/model-ids.ts` | Centralized model constants |
| `src/lib/models/ChatSession.svelte.ts` | Central routing hub (local ↔ server) |
| `src/lib/machines/retrieval-machine.ts` | XState v5 2-stage retrieval orchestration |

### Key Server-Side Files
| File | Purpose |
|------|---------|
| `src/lib/server/redis.ts` | Primary ioredis singleton + factory |
| `src/lib/server/cache.ts` | Dual-tier memory + Redis cache |
| `src/lib/server/vector/qdrant-manager.ts` | Qdrant client + hybrid search |
| `src/lib/server/queue/rabbitmq-manager-fixed.ts` | RabbitMQ 7-queue manager |
| `src/lib/server/grpc/embedding-client.ts` | gRPC embedding with HTTP/Ollama fallback |
| `src/lib/server/rag-pipeline.ts` | End-to-end RAG for legal Q&A |
| `src/lib/server/indexer/legal-chunker.ts` | Structure-aware legal document chunker |
| `src/lib/server/analysis/entity-extraction.ts` | LLM + regex entity extraction |
| `src/lib/server/analysis/forensics.ts` | PII/legal pattern detection |
| `src/mcp/server.ts` | MCP server (stdio transport, tool handlers) |

---

## Redis L1 + Bifrost L2 Cache System

**Status**: ✅ **PRODUCTION READY** (April 12, 2026)

**Naming clarification (verified live, 2026-08-30)**: there are two genuinely distinct systems that
share a similar name, and prior sections of this file mix their spellings inconsistently. Keep them
separate:
- **"Bifrost"** (this spelling) — the real Go microservice at port 3040 (`go-microservice/cmd/bifrost/`)
  and its TypeScript client `bifrostChat()` (`$lib/server/ollama.ts`). This is the L2 semantic-similarity
  cache described in this section. The spelling "Bifrost" is correct for this system.
- **"BitFrost"** (with a `t`) — the separate ACE/Karpathy GPU-authority Redis caching layer (SOM
  cluster assignments, autoencoder latents, Karpathy blend scores). Verified live via `docker exec
  legal-ai-valkey valkey-cli -a redis --scan --pattern '*'`: every real key in this layer is prefixed
  `bitfrost:*` (e.g. `bitfrost:summary:*`, 4,827 keys) or `gpu:*` (`gpu:som:packet:{id}`,
  `gpu:autoencoder:latent_64:{id}`, `gpu:karpathy:{scores,summary}`) — never `bifrost:*`. Real
  scripts already use this spelling correctly: `scripts/atlas/audit-bitfrost-semantic-cache.mjs`.
  Sections elsewhere in this file that say "BitFrost cache" or "bitfrost_cache_check" already have
  it right; sections that describe this same GPU/Karpathy layer using "Bifrost" (single word, one
  `f`) or the "Redis / Bifrost key pattern" contract (`bifrost:packet:*`, `centroid:directory:*`,
  `centroid:feature:*`, `centroid:packet:*`) do not match live reality — those specific key shapes
  return zero matches against the live instance. Treat the "Canonical Lineage Contract" section's
  documented key pattern as aspirational/not-yet-implemented, not current state.
- `gpu:karpathy:encoded` (the third documented Karpathy hash, alongside `scores`/`summary`) was
  found absent live on 2026-08-30. `scripts/atlas/atlas-live-reconciliation-audit.mjs` flags
  exactly this (`WARN: gpu:karpathy:encoded absent — run npm run karpathy:gpu`), so ran it —
  **still absent afterward.** The script's own log explains why: `H6: ace:autoencoder:weights
  missing — skipping 64-dim encode`. This is a deliberate, correct conditional skip, not a bug —
  it matches this file's own "Why autoencoder is bypassed for attention scoring" note elsewhere
  (untrained/random Xavier autoencoder weights produce flat, useless tanh output). `npm run
  karpathy:gpu` did real, useful work regardless (200 candidates freshly scored into
  `gpu:karpathy:scores`/`summary`, report at `next_steps/active/karpathy-gpu-recommendations.md`)
  — but `gpu:karpathy:encoded` will stay empty until `ace:autoencoder:weights` exists, which needs
  an actual trained autoencoder, not another script run. Not attempted here — out of scope for a
  doc-accuracy pass.

### Architecture

**3-Tier Cache** (Industry Best Practice):

1. **L1: Redis Exact-Match** → 5ms (instant recall for exact duplicates)
   - Module: `src/lib/server/cache/redis-exact-match.ts`
   - Key: SHA-256 hash of `model + messages + temperature + maxTokens`
   - TTL: 1 hour
   - Hit Rate: 20-30% (exact queries)

2. **L2: Bifrost Semantic Cache** → 2-5s (vector similarity for rephrased queries)
   - Service: Port 3040 (`go-microservice/cmd/bifrost/`)
   - Backend: Qdrant vector search
   - Threshold: 0.8 (configurable via `x-bf-cache-threshold` header)
   - Hit Rate: 70-90% (semantic variants)

3. **L3: Direct Ollama GPU** → 25s (cold inference)
   - Fallback when L1 + L2 miss
   - Response stored in L1 + L2 for future hits

**Combined Hit Rate**: 90-95% → **90% cost reduction**

### Performance (Measured)

```
CPU Baseline:      32,712ms
GPU Baseline:      25,395ms
L2 Semantic Hit:    2-5,000ms  (GPU: 5-10×, CPU: 6-15×)
L1 Exact Hit:            5ms  (GPU: 5,079×, CPU: 6,542×)
```

**Throughput**: 12,000 queries/minute (vs 1-2 QPM without cache)

### Usage

**Automatic** - Cache is checked transparently in `bifrostChat()`:

```typescript
import { bifrostChat } from '$lib/server/ollama.js';

// L1 → L2 → L3 fallback happens automatically
const response = await bifrostChat(
  [{ role: 'user', content: 'What is hearsay evidence?' }],
  'gemma4-rotorquant:latest',
  { temperature: 0.3, maxTokens: 200 }
);
```

**Manual Control** - Per-request cache headers:

```typescript
// Bypass cache (force L3)
fetch('/api/ai/chat', {
  headers: { 'x-bf-cache-type': 'none' }
});

// Adjust similarity threshold
fetch('/api/ai/chat', {
  headers: { 'x-bf-cache-threshold': '0.9' }  // Higher = stricter matching
});

// Custom TTL
fetch('/api/ai/chat', {
  headers: { 'x-bf-cache-ttl': '7200' }  // 2 hours
});
```

### Monitoring

**Cache Statistics**:
```bash
curl http://localhost:5173/api/cache/exact-match/stats
```

**Langfuse Traces**: http://localhost:3030/traces
- View L1/L2/L3 latency breakdowns
- Track cache hit rates
- Monitor cost savings

### Backend Infrastructure Audit

**Before deployment, verify all services are healthy:**

```bash
bash scripts/audit/backend-infrastructure-audit.sh
```

Full breakdown of what this script checks (17 gates across 5 tiers, not 15 — see the "Backend
Infrastructure Audit (17 Gates)" section further down in this file for the authoritative tier
table) covers: Redis connection + memory, Bifrost semantic cache, Qdrant vector store, Ollama +
GPU availability, RabbitMQ message flow, Langfuse observability, and codebase-index health.

**See**: `BACKEND_INFRASTRUCTURE_AUDIT.md` for full gate definitions.

**Complement to**: 20-Gate Code Audit (below) — run both before deployment.

### Cache Tuning

**Similarity Threshold** (L2 Bifrost):
- **0.8** - Factual Q&A (default) ✅
- **0.9+** - Conversational queries (avoid false positives)
- **0.7** - Broad matching (use with caution)

**TTL Strategy**:
- **L1 Redis**: 1 hour (configurable per use case)
- **L2 Bifrost**: Configurable via headers
- **Invalidation**: Manual via `/api/cache/invalidate`

**Memory Limits** (Redis):
```bash
# Set max memory (recommended: 2GB for high-traffic)
docker exec deeds-redis-prod redis-cli config set maxmemory 2gb

# Set eviction policy (remove least-recently-used keys)
docker exec deeds-redis-prod redis-cli config set maxmemory-policy allkeys-lru
```

### Files Reference

| File | Purpose | Lines |
|------|---------|-------|
| `redis-exact-match.ts` | L1 cache module | 178 |
| `ollama.ts` (bifrostChat) | L1 integration + L2/L3 fallback | +15 |
| `/api/cache/exact-match/stats` | Monitoring endpoint | 48 |
| `authority-chain.ts` | Langfuse embedding/search traces | +8 |
| `rabbitmq-manager-fixed.ts` | Queue operation traces | +35 |
| `BACKEND_INFRASTRUCTURE_AUDIT.md` | 17-gate service health checks | 500+ |

### BitFrost warm buckets / cache identity / schema tournament — consolidated 2026-10-03

Measured detail (2026-09-20 receipts) moved verbatim to `docs/archive/claude-md-stale-status-and-bitfrost-audit-2026-10-03.md`; have-vs-need lives in `openspec/changes/parent-atlas-ace-bitfrost-cache-correctness/tasks.md` ("Consolidated from CLAUDE.md"). Warm buckets = `NOT_PROVEN`.
- **Live state (2026-09-20):** Valkey cold (DBSIZE 257, 1 `bitfrost:*` key), `maxmemory-policy noeviction`, ~3.6% hit rate. "155K keys" is historical.
- **Canonical shape/writer:** `bifrost:sem:packet:{packet_key}` / `bifrost:sem:feature:{feature_id}`; writer+invalidator `src/lib/server/cache/atlas-reward-cache.ts` (`setPacketCache`, `setPacketCacheV2`, `invalidateBitfrostPacket`); key builders `src/lib/server/cache-keys.ts` (`PacketSemanticCacheIdentityV2` → `bifrost:sem:packet:v2:{packet_key}:{digest}` + reverse locator `bifrost:sem:index:packet:{packet_key}`). `AceBitfrostCacheIdentityV1` (`atlas/cache/ace-bitfrost-cache-identity-v1.ts`) owns ACE artifact/centroid/residency keys; two revision-qualified identities coexist — converge before adding a third.
- **Identity roots (never substitute):** packet=`packet_key`; query=`query_hash`; feature=`feature_id`; centroid=representation+cluster/SOM coordinate; prefill=`PrefillContentIdentity` checksum. Spelling `bifrost:` (gateway cache) vs `bitfrost:` (residency) is mixed in ad-hoc writers (`packet-truth-flow.mts`, phase8*/9/10*); treat non-`bifrost:sem:*` packet keys as dead-shape.
- **Blockers:** invalidators unreachable from any live Postgres mutation path; no production caller writes v2; no SOM-cell buckets (`som_revision` NULL, `som_cell_x/y` vs `som_row/col` disagree on 99.7% of rows) — use KMeans/domain buckets; `gpu_cluster_centroids` (64×768, `kmeans_js`, 2026-07-14) and SOM codebook (400×64) are different spaces, never one matrix. Warmers: `scripts/atlas/warm-bitfrost-semantic-cache.mjs` = candidate owner (dry-run only, 0 writes); `sveltekit-frontend/scripts/cache/warm-bifrost-semantic-cache.mjs` = stale COMPATIBILITY (query_hash-keyed).
- **Schema rule:** no `*_v2` tables for the NLP/ontology fabric; reuse `atlas_ontology_linked_tuples`, `atlas_taxonomy_assignment_candidates`, `domain_taxonomy_v1`, `feature_ontology_tuples` (owner). Five tuple tables already coexist — add no sixth. Feature matrices are Arrow/mmap + receipts sharing one `CandidateOrdinalMap` checksum, not tables.
- **Classification gates downstream:** classification/ranking are probabilistic (judge by recall/precision/ECE with a confidence floor); identity stays exact. `domain.classify` is provisional (weak ~0.55 label seen). Review sheet: `node scripts/atlas/build-domain-review-sheet-v1.mjs`. Registry check: no Postgres table is a cache-key registry; do not add one.
- **Receipts:** `docs/reports/{query-fanout-bitfrost-v1,schema-tournament-v1,validation-corpus-inventory-v1,domain-calibration-draft-v1}.*`, `bitfrost-residency-policy-v1.json`.

## Migration history (May 10, 2026 — applied)

5 SQL files lived on disk but were NOT in `drizzle/meta/_journal.json`. `drizzle-kit migrate` skipped them. Applied directly via `docker exec legal-ai-postgres psql`:

```bash
# All IF NOT EXISTS — applied 2026-05-10, mostly idempotent (already in place)
docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < sveltekit-frontend/drizzle/0013_codeintel_indexes.sql
docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < sveltekit-frontend/drizzle/0016_codeintel_schema.sql
docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < sveltekit-frontend/drizzle/0016_courtroom_3d_animation.sql
docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < sveltekit-frontend/drizzle/0018_output_meta_manifold4.sql

# vlm_image_tags: created from scratch (schema added the table 2026-05-10)
docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db <<SQL
CREATE TABLE IF NOT EXISTS vlm_image_tags (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  name varchar(200) UNIQUE NOT NULL,
  description text,
  source varchar(50) NOT NULL DEFAULT 'manual',
  hit_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
SQL

# password_reset_tokens.user_id: uuid → integer (0 rows in table — matches users.id)
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "ALTER TABLE password_reset_tokens ALTER COLUMN user_id TYPE integer USING NULL;"
```

**Version bumps verified clean (this session):** `drizzle-orm@0.45.2`, `drizzle-kit@0.31.10`, `@sveltejs/kit@2.59.1`, `@sveltejs/adapter-node@5.5.4`. tsgo baseline unchanged.

**SeaweedFS already wired** at `env.server.ts:300-307` — set `SEAWEED_S3_PORT=8333` in `.env` to retarget the MinIO SDK at the SeaweedFS S3 gateway. Zero code changes needed in `minio-client.ts` or call sites. SeaweedFS containers (`legal-ai-seaweed-{master,volume,filer,s3}`) confirmed up.

### Verification matrix (2026-05-10 — applied + tested)

| Lane | Result |
|---|---|
| svelte-check | **32 errors / 13 warnings in 29 files** — down from 43 errors at session start (vlmImageTags fix + reverted password_reset_tokens schema = -11 errors) |
| smoke:graphify (5-pillar + D33) | **8 present / 4 absent** — Neo4j + Redis hypergraph checkpoint absent (acceptable; Neo4j is a separate `--profile full` lane) |
| Playwright `auth-login-db` | **11/11 pass** — register, login (4 seeded users), wrong-password 401, duplicate email 409, invalid email 400, short password 400, browser-nav to /cases, logout invalidates session |
| Playwright `route-verification` | **22/22 pass** — homepage, command-center, terminal, error-analysis, topology, sidebar nav, link clicks, 404 handling, no JS errors on homepage |
| Playwright `homepage-screenshot` | **4/4 pass** — homepage load, sidebar render, action buttons, mobile viewport |
| Playwright `evidence-viewer-route` (NEW) | **3/3 pass** — not-found state for unknown UUID, invalid UUID format rejection, no JS errors |
| Playwright `service-health-probe` | 6/7 pass — 1 pre-existing failure on `/api/health` missing expected service property |
| Playwright `evidence-diagnostics-upload` | 1/2 pass — 1 timeout waiting for upload response (pre-existing, not session-introduced) |

**Wired this session:** `/evidence/[id]/view` route ([+page.server.ts](sveltekit-frontend/src/routes/(app)/evidence/[id]/view/+page.server.ts) + [+page.svelte](sveltekit-frontend/src/routes/(app)/evidence/[id]/view/+page.svelte)) using `EvidenceMediaViewer.svelte` for unified inline display of image/video/audio/PDF/text with lightbox + download fallback. Auth-guarded with `redirect(303, '/login?redirect=...')` and graceful `loadError` degradation.

**`PLAYWRIGHT_SKIP_GLOBAL_SETUP=true` is required for any Playwright run** until `cases.user_id uuid → integer` migration lands. The case-seed in `tests/global-setup.ts:60` POSTs to `/api/cases` which fails with `invalid input syntax for type uuid: "2"` (integer `users.id` won't fit into uuid `cases.user_id`).

**Known degradations (acceptable until structural fix):**
- `/cases` page renders empty-state when SSR query `WHERE cases.user_id = $1` runs with integer user.id (see `safe()` helper + `loadError` field — graceful, no 500)
- `evidence.user_id` queries (chain-of-custody, /api/evidence/[id]) return 0 rows for current Lucia users; consumer routes should switch to `evidence.uploaded_by` (integer) for ownership filters
- `db:seed` succeeds for users (4 created) but fails at cases insert with the same uuid mismatch — non-blocking for auth tests

---

## GPU Acceleration Stack (N-API + LibTorch + simdjson)

**Overview**: Native C++ addons bridge TypeScript ↔ CUDA/LibTorch/simdjson for 2-6,500× performance gains.

### GPU/CPU boundary (added 2026-08-26 — clarifies a recurring question)

**RTX/CUDA cores accelerate tensor math (PyTorch's ATen backend) — nothing else.** If a task isn't
matrix multiplication, cosine/dot-product batches, top-k, AE/SOM/kmeans, or model inference, GPU
does not help it, no matter how slow it is. Concretely:

- ✅ GPU-accelerable: embeddings, cosine/matmul, top-k, rerank batches, AE/SOM/kmeans, PyTorch/ATen
  tensor ops, LibTorch inference.
- ❌ NOT GPU-accelerable: AST/tree-sitter parsing (ast-grep, ts-morph — branchy tree-walking, not
  matrix math), JSON parsing/validation, CRUD, joins, PostgreSQL FTS. This is CPU work; the only
  real speedup lever for these is **CPU parallelism** (a worker-thread/worker-process pool across
  files), not a GPU port. Example: the AST-grep symbol extraction pass
  (`scripts/atlas/lib/ast-grep-symbol-extraction.mjs`) takes ~20 minutes because it's a plain
  sequential `for` loop with zero parallelism — confirmed by reading the file, not assumed. A
  worker pool would help; a GPU rewrite would not.
- **simdjson** (`lib/server/gpu/simdjson-bridge.ts`, below) is the one exception that looks
  GPU-adjacent but isn't — it's AVX2/SSE4.2 **SIMD on the CPU**, not GPU. Don't conflate "SIMD
  acceleration" with "GPU acceleration"; they're different hardware paths. simdjson and TurboVec
  are both CPU-side (AVX2 SIMD for JSON; 4-bit quantized RAM ANN for vector prefilter) and can be
  used together, but neither one runs on the RTX GPU.

**NetworkX vs. Neo4j — both are real, they are not alternatives to each other.** Confirmed live in
this repo (`python/parent_atlas_networkx_pagerank.py`,
`python/graph_snapshot_parity_networkx_oracle.py`, `python/atlas_compute/typed_graph_runtime.py`,
`python/graph_snapshot_parity_cugraph_oracle.py`):
- **NetworkX** = a Python in-memory graph *library*, CPU-only, used here as the **reference/parity
  oracle** — e.g. `graph_snapshot_parity_networkx_oracle.py` computes ground-truth PageRank that a
  GPU cuGraph challenger (`graph_snapshot_parity_cugraph_oracle.py`) is checked against. It can
  build and emit a graph as JSON (nodes/edges), but it is not a database — nothing persists between
  runs unless something else writes the output somewhere.
- **Neo4j** = the persistent graph **database** — a topology *mirror* per this file's own Postgres-
  is-truth rule (Postgres is truth; Qdrant/Redis/Neo4j are rebuildable mirrors). It's what a live
  query traverses; NetworkX is what a one-off Python script computes and checks against.
- Before adding a new graph computation anywhere, check both: is this a persistent, queryable
  topology (→ likely belongs behind the existing Neo4j mirror path) or a one-off/parity-check
  computation (→ a NetworkX script, matching the existing oracle pattern)? Also check the
  TypeScript side first — `src/lib/server/graph/graph-analysis-runner.ts` and its adapters
  (`pagerank-analysis-adapter.ts`, `kcore-analysis-adapter.ts`, `betweenness-analysis-adapter.ts`,
  `cheirank-analysis-adapter.ts`) already write real graph-algorithm output to Postgres
  (`graph_community_assignments`, `graph_communities`, `graph_node_metrics`) — confirmed live,
  wired, with passing tests. Per the "5 competing PageRank implementations" finding above (Aug 9
  audit), this repo already has more graph-algorithm owners than it needs; check that section
  before adding another one.

**Correction (2026-08-26, operator note) — Neo4j is a topology mirror, NOT the canonical PageRank
compute path.** The framing above ("Neo4j is what a live query traverses; NetworkX is what a
one-off script checks against") undersold NetworkX/cuGraph's actual role. Neo4j's native GDS
PageRank (`neo4j-gds-client.ts::runPageRankClient()`) was run once and hit real limitations
(operator-reported); the project pivoted to the NetworkX↔cuGraph parity pipeline
(`python/graph_snapshot_parity_networkx_oracle.py` /
`python/graph_snapshot_parity_cugraph_oracle.py`, driven by
`scripts/atlas/export-graph-snapshot-parity-parquet.mts`) as the trusted PageRank + Louvain
compute path. That pipeline is live-proven on real production-scale data — 162,234 nodes / 108,156
edges from the real `graphify/frozen-graph-snapshot-v2.json` corpus, `status: PASS`,
`pagerankCorrelation: 1`, `louvainCommunityAgreement: 1` (ARI/NMI both 1.0) — see
`sveltekit-frontend/docs/reports/graph-snapshot-parity/receipt.json`. **Do not treat Neo4j's own
GDS PageRank run (3,667 nodes carry stale `pageRank`/`graphAuthorityScore` properties from that
earlier, since-superseded run) as the canonical PageRank source** — it predates the pivot and has
not been reconciled with the NetworkX/cuGraph numbers. Neo4j otherwise remains exactly what it
always was: the mirror a live query traverses for structural edges (`IMPORTS`, `CONTAINS`,
`BELONGS_TO_CLUSTER`, etc.) — this correction is scoped to PageRank/community-detection
authority specifically, not Neo4j's role as topology mirror in general.
  before adding another one.

### Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│ TypeScript Application (SvelteKit)                     │
│  ├─ fastJsonParse<T>() — lib/server/gpu/simdjson-bridge.ts
│  └─ computeGpuSimilarity() — lib/server/gpu/libtorch-bridge.ts
└─────────────────────────────────────────────────────────┘
                         ↓ N-API
┌─────────────────────────────────────────────────────────┐
│ C++ N-API Addon (tensorrt_bridge.node)                 │
│  ├─ simdJsonParse() — AVX2 SIMD JSON parsing           │
│  ├─ libtorchCosineSimilarity() — GPU tensor ops        │
│  └─ tensorrtInference() — TensorRT acceleration        │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ Native Libraries                                        │
│  ├─ simdjson (AVX2/SSE4.2) — 2-5× faster JSON parsing │
│  ├─ LibTorch (CUDA 12.1) — GPU tensor operations       │
│  └─ TensorRT (v10.7) — INT4/INT8 quantized inference   │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ NVIDIA RTX 3060 Ti (8GB VRAM, CUDA 12.1)                │
└─────────────────────────────────────────────────────────┘
```

### 1. simdjson N-API Bridge

**Location**: `sveltekit-frontend/src/lib/server/gpu/simdjson-bridge.ts`
**Native Addon**: `simd-bridge/cpp/build/Release/tensorrt_bridge.node`

**Features**:
- **AVX2/SSE4.2 SIMD**: 2-5× faster than V8 JSON.parse for payloads >1KB
- **LRU Cache**: 200-entry cache with 30s TTL, FNV-1a hash keys
- **Auto-fallback**: Gracefully degrades to V8 JSON.parse if addon unavailable
- **Smart routing**: Payloads <1KB bypass native (V8 is faster for small strings)

**TypeScript API**:
```typescript
import { fastJsonParse, fastJsonValidate, fastJsonExtractNumbers, isSimdJsonAvailable } from '$lib/server/gpu/simdjson-bridge';

// Parse large JSON responses (Qdrant, RabbitMQ, Ollama)
const result = fastJsonParse<QdrantResponse>(largeJsonString);

// Fast structural validation (pre-parse check)
if (fastJsonValidate(untrustedInput)) { /* ... */ }

// Extract embedding vectors directly into Float64Array (zero-copy)
const embedding = fastJsonExtractNumbers(response, '/data/embedding');
```

**Performance**:
- **With addon**: 2-5× faster than V8 (for JSON >1KB)
- **Without addon**: Falls back to V8 (no performance loss, just no speedup)
- **Cache hit**: 0.1ms (200× faster than parse)

**Known Limitation**: Addon requires LibTorch/CUDA DLLs in system PATH. If DLLs missing outside dev server, falls back to V8.

### 2. LibTorch CUDA Bridge

**Location**: `sveltekit-frontend/src/lib/server/gpu/libtorch-bridge.ts`
**Native Addon**: Same `tensorrt_bridge.node` (combined addon)
**C++ Source**: `simd-bridge/cpp/libtorch_graph.cc`

**Features**:
- **GPU tensor operations**: Cosine similarity, clustering, graph analytics
- **CUDA 12.1**: Direct RTX GPU access, no Docker overhead
- **Zero-copy**: TypeScript Float32Array ↔ CUDA tensors (shared memory)
- **Batching**: Process 100+ vectors in parallel on GPU

**TypeScript API**:
```typescript
import { computeGpuSimilarity, isCudaAvailable } from '$lib/server/gpu/libtorch-bridge';

// GPU cosine similarity (100× faster than CPU for large batches)
const queryVec = new Float32Array([...]); // 768-dim
const candidateVecs = [new Float32Array([...]), ...]; // 1000 candidates
const scores = computeGpuSimilarity(queryVec, candidateVecs);
```

**Performance**:
- **CPU (TypeScript)**: 2.5s for 1000 comparisons
- **GPU (LibTorch)**: 25ms for 1000 comparisons
- **Speedup**: 100× for batch operations

### 3. N-API Build System

**Build Tool**: CMake + node-gyp
**Config**: `simd-bridge/cpp/CMakeLists.txt`

**Dependencies**:
- **Node-API Headers**: Auto-detected from Node.js installation
- **LibTorch**: Downloaded from pytorch.org (CUDA 12.1, C++17)
- **simdjson**: Git submodule at `simd-bridge/cpp/simdjson/`
- **CUDA Toolkit**: 12.1.x (for LibTorch)

**Build Command**:
```bash
cd simd-bridge/cpp
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release
# Output: build/Release/tensorrt_bridge.node (299KB)
```

**Verification**:
```bash
# Check if addon loads correctly
node -e "const addon = require('./simd-bridge/cpp/build/Release/tensorrt_bridge.node'); console.log('CUDA available:', addon.isCudaAvailable());"
```

### 4. Integration Points

**Where Used**:
- **Qdrant responses** — `fastJsonParse()` in `/api/codebase-index/stats`, vector search endpoints
- **Ollama responses** — Large JSON from LLM completions (30KB+ for long responses)
- **RabbitMQ messages** — Fast deserialization of queue payloads
- **Evidence pipeline** — `computeGpuSimilarity()` for duplicate detection (Stage 9)
- **Search reranking** — GPU-accelerated cosine similarity for top-K selection

**Backend Audit Gate**:
- **G17**: Checks `isSimdJsonAvailable()` via `/api/codebase-index/stats`
- **Status**: SKIP (acceptable) — addon exists but DLLs not in system PATH, falls back to V8

### 5. Troubleshooting

**Addon not loading**:
```
Error: The specified module could not be found (ERR_DLOPEN_FAILED)
```
**Cause**: LibTorch/CUDA DLLs not in system PATH
**Fix**:
1. Add `C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.1\bin` to PATH
2. Add LibTorch `lib` directory to PATH
3. Restart dev server

**Alternative**: Accept V8 fallback (2-5× slower but still functional)

**CUDA not available**:
```javascript
isCudaAvailable() === false
```
**Cause**: GPU driver issue or LibTorch built for CPU-only
**Fix**: Download CUDA-enabled LibTorch from pytorch.org, rebuild addon

### 6. Performance Impact

| Operation | V8 Native | simdjson Addon | Speedup |
|-----------|-----------|----------------|---------|
| Parse 100KB JSON | 12ms | 2.4ms | 5× |
| Parse 10KB JSON | 1.2ms | 0.8ms | 1.5× |
| Parse 1KB JSON | 0.3ms | 0.4ms | 0.75× (slower, use V8) |
| Extract Float64Array | 5ms (parse + loop) | 0.5ms (zero-copy) | 10× |

**Best for**: Qdrant responses (10-100KB JSON), Ollama completions (30KB+), RabbitMQ batch messages

---

## Post-Audit Alignment (May 3, 2026 — Deep Compiler Stack Audit)

### Inference Cascade (8 tiers — verified live)
```
TensorRT-LLM :8099 (INT4 AWQ, GPU lease) →
Triton TensorRT :8000 →
Bifrost :3040 (ε-greedy, 500ms deadline, ~5ms hits) →
TurboQuant :8090 (llama-server, cache_prompt:true, KV q8_0) →
VLM :8085 (Gemma4 E4B HF, NF4, vision) →
LiteRT-LM :8070 (CPU MTP speculative) →
Ollama :11434 (final fallback)
```

### Compiler Stack — Correct Mental Model
- **tsgo** = type graph traversal (Go goroutines). NO GPU, NO matmul. 10× speed = CPU parallelism only.
- **tensorrt_bridge.node** = LibTorch N-API. cuBLAS GEMM on RTX 3060 Ti. 100–500× faster than WASM for matmul.
- **WASM SIMD128** = 128-bit lanes, no GPU access, ~500× slower than cuBLAS for 768×768 matmul. Browser-only last resort.
- **ioredis** = `setex` (lowercase), no `.connect()`, use `.quit()` not `.disconnect()`.

### KV Cache Policy (llama-server.exe)
- **Production-stable**: `-ctk q8_0 -ctv q8_0` (works on every llama.cpp build)
- **Recommended TurboQuant**: `-ctk q8_0 -ctv turbo3` — asymmetric. K stays at q8_0 because K-cache TurboQuant support is less mature than V-cache compression on current forks; V at turbo3 captures most of the context-length win.
- **Avoid** `-ctk turbo3 -ctv turbo4` — symmetric K-turbo is the riskier config and stock binaries reject it at flag parse, which silently no-ops if a launcher falls back. Don't hardcode it.
- **Aggressive ceiling**: `-ctk q8_0 -ctv turbo4` — only after q8_0/turbo3 passes the 20-generation stability harness
- **Fallback**: if q8_0/turbo3 fails parity on Gemma4's `head_dim=256` (CUDA mixed-quant parity is documented as "not yet verified" by upstream), drop to `-ctk q8_0 -ctv q8_0` and keep `TURBO_CTX=16384` — you still win 4× context vs the 4096 default.
- **Binary requirement (Gemma4-critical)**: `turbo2/turbo3/turbo4/tbq3_0/tbq4_0` are rejected by stock `ggml-org/llama.cpp` builds, and **picking the right fork matters more than picking the right cache type** for Gemma 4. Gemma 4 attention has `head_dim=256` on SWA layers and `head_dim=512` on global layers, but most TurboQuant forks ship `D=128`-only attention kernels:
  - **[TheTom/llama-cpp-turboquant](https://github.com/TheTom/llama-cpp-turboquant/releases) tqp-v0.1.1 (Win+CUDA12.4 prebuilt)** — D=128 only. The `-h` probe advertises turbo support so the launcher passes flags through, but the model **crashes or produces garbage at the first attention pass on `gemma4-rotorquant:latest`**. Suitable for D=128 models (Llama-3 8B, Qwen2.5 7B). **Do not pair with Gemma 4.**
  - **[test1111…/llama-cpp-turboquant-gemma4](https://github.com/test1111111111111112/llama-cpp-turboquant-gemma4)** — source build, MSVC + CUDA 13.0. Adds D=256/512 kernels with lazy K (Q pre-transform), lazy V (deferred WHT post-loop), batch centroid decode, warp-cooperative writes. Reaches 100% of f16 throughput. **The only working path to turbo4 on Gemma 4 today.**

  Build:
  ```bash
  git clone https://github.com/test1111111111111112/llama-cpp-turboquant-gemma4
  cd llama-cpp-turboquant-gemma4
  cmake -B build -S . -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=86  # 86 = RTX 3060 Ti / Ampere
  cmake --build build --config Release   # ~30 min
  ```
  Drop `build/bin/llama-server.exe` in a separate folder (e.g. `C:\Users\james\Desktop\llama-server-turboquant\`), point `LLAMA_SERVER_PATH` at it. The launcher's `-h` turbo-support probe **cannot detect head-dim incompatibility** — operator owns matching binary capability to model architecture.

  Expected on RTX 3060 Ti / 8GB vs the test1111 RTX 3090 numbers: tokens/sec roughly halves (448 GB/s vs 936 GB/s memory bandwidth), but VRAM footprint is identical. `gemma4-rotorquant:latest` (5.3 GB) + turbo4 KV @ 256K ≈ 6.3 GB total — fits 8GB.
- **Validation harness**: `npm run turbo:test:stability:turbo` (requires server already running with the matching profile — the harness does NOT start llama-server)
- **TurboQuant `cache_prompt: true`**: safe for system prompt KV reuse across communities/clusters

#### `TURBO_PROFILE` shortcut (launcher env var)

[scripts/launch-turboquant.ps1](sveltekit-frontend/scripts/launch-turboquant.ps1) accepts a single env var that picks the K/V pair:

| `TURBO_PROFILE` | K | V | When |
|------|---|---|------|
| `stock` *(default)* | q8_0 | q8_0 | Stock llama.cpp binary; safe baseline. |
| `turboquant` | q8_0 | turbo3 | TurboQuant-enabled binary at `LLAMA_SERVER_PATH`; recommended once stability harness passes. |
| `turboquant-safe` | q8_0 | q8_0 | TurboQuant binary present but you suspect parity issues — keep the larger `TURBO_CTX` without trusting the V-cache compression yet. |

`TURBO_KV_K` / `TURBO_KV_V` env vars override the profile. The launcher's failure semantics (added 2026-05-08):
- Invalid `TURBO_PROFILE` → throw before launch.
- Explicit `TURBO_KV_K` / `TURBO_KV_V` outside the allowlist (`f32, f16, bf16, q8_0, q4_0, q4_1, iq4_nl, q5_0, q5_1, turbo2, turbo3, turbo4, tbq3_0, tbq4_0`) → throw.
- Profile resolves to `turbo*` but binary's `-h` doesn't advertise turbo support → throw with the test1111 fork build URL (for Gemma 4 / D=256/512) and TheTom releases URL (for D=128 models). Silent downgrade is exactly the failure mode that hid `-ctk turbo3 -ctv turbo4` for months.
- Profile defaults that resolve to a stock-only name and the binary doesn't accept it → soft-fallback (the user did not assert intent).

Recommended sequence on RTX 3060 Ti / 8GB:

```powershell
# 1. Baseline on stock binary
$env:TURBO_PROFILE = 'stock'
$env:TURBO_CTX     = '16384'
npm run turbo:start:detached
npm run turbo:test:stability       # captures the q8_0 baseline numbers

# 2. Drop in TurboQuant binary, retest with V-cache compression only
$env:LLAMA_SERVER_PATH = 'C:\Users\james\Desktop\llama-server-turboquant\llama-server.exe'
$env:TURBO_PROFILE     = 'turboquant'
$env:TURBO_CTX         = '16384'
npm run turbo:start:detached
npm run turbo:test:stability:turbo # compares vs the baseline

# 3. Only if step 2 fails parity / stability:
$env:TURBO_PROFILE = 'turboquant-safe'
npm run turbo:start:detached
```

### Gemma4 TurboQuant caveat

See the "KV Cache Policy" and "`TURBO_PROFILE` shortcut" subsections above (Post-Audit Alignment,
May 3 2026) for the full head_dim=256/512 fork-compatibility rule, the TheTom-vs-test1111 fork
table, the source-build command, and the `TURBO_PROFILE` values — this section previously
duplicated all of that content verbatim; do not re-add it here.

**TurboQuant is a manual runtime milestone.** Do not block ACE / KAG / hypergraph retrieval work on it. Retrieval lanes (Lane A cluster_context shipped, Lane B shared_resource shipped, Lane C SHARES_TAGS pending) improve agent quality even when the server stays on `q8_0/q8_0`. Lane B retrieval > TurboQuant runtime as a priority call.

### TurboQuant — Google ICLR 2026 Paper (PolarQuant + QJL)
**Paper**: "TurboQuant: Redefining AI Efficiency with Extreme Compression" — Google Research + NYU  
**Algorithm** (two-stage, data-oblivious — no calibration, no learned params):
1. **PolarQuant**: Random rotation of KV vectors → simplifies geometry → scalar quantization per coordinate (Lloyd-Max optimal codebook)
2. **QJL error correction**: Captures residual error (~1 bit) via Quantized Johnson-Lindenstrauss, eliminates quantization bias

**Compression ratios vs f16 baseline**:
| Format | Bits | VRAM savings | Notes |
|--------|------|-------------|-------|
| `turbo4` | 4-bit | 74% | Higher quality, more VRAM than turbo3 |
| `turbo3` | 3-bit | 80% | Recommended — 5.1× compression |
| `turbo2` | 2-bit | 87% | Aggressive — test carefully |
| `q8_0` | 8-bit | 50% | Stable production baseline |

**Speedup**: 8× attention computation speedup, within 1% throughput of baseline. Example: 75 tok/s on Qwen3-8B / RTX 3080.

**Correct flags** (Flash Attention is MANDATORY — without `-fa on`, KV is dequantized every step → slower than no quant):
```bash
# Recommended asymmetric — K stays at q8_0, only V is pushed to turbo3
# (requires a TurboQuant-enabled llama-server binary; stock llama.cpp rejects turbo3/turbo4)
llama-server.exe -m model.gguf -ctk q8_0 -ctv turbo3 -fa on -ngl 99 -c 16384

# Aggressive (only after q8/turbo3 passes the 20-gen stability harness)
llama-server.exe -m model.gguf -ctk q8_0 -ctv turbo4 -fa on -ngl 99 -c 16384

# Production-stable baseline (works on every llama.cpp build)
llama-server.exe -m model.gguf -ctk q8_0 -ctv q8_0 -fa on -ngl 99 -c 16384
```

**RTX 3060 Ti (8GB) with gemma4-rotorquant:latest (5.3GB model)**:
- Baseline f16 KV: ~7.5GB total → barely fits
- turbo3 KV: ~3.4GB total → 4GB free for batch/context
- Enables 32K+ context without OOM
- **Test stability first**: run 20+ generations, check for NaN/repetition before prod use

### ACE Scoring Spine (verified weights)
```
semantic_vector × 0.60 + tag_score × 0.12 + ast_graph × 0.10 + som_boost × 0.08 + hyperedge × 0.10
+ community_context (GraphRAG preamble, not scored inline)
```

### A2A / MCP / ACP Wiring (verified)
- **A2A AgentCard**: `GET /.well-known/agent.json` — LIVE (`src/routes/.well-known/agent.json/+server.ts`)
- **Agent API**: `POST /api/ai/agent` — native + A2A Task + SSE streaming — LIVE
- **MCP**: `src/mcp/server.ts` — 108 tools live (verified 2026-08-31 by booting the process, not the "29 tools" previously stated here), FastMCP, auth guard, dynamic query-scoped tool-set selection — LIVE
- **ACP**: `GET /api/acp/tools`, `POST /api/acp/execute` — LIVE

### `using` / `await using` — Available Now (TS 5.2+)
Add `"lib": ["es2025", "esnext.disposable"]` to tsconfig, then:
```typescript
class DisposableRedis extends Redis {
  async [Symbol.asyncDispose]() { await this.quit(); }
}
await using redis = new DisposableRedis(REDIS_URL, { password: REDIS_PASS });
// no explicit quit() needed — fires on scope exit even if exception thrown
```
Replaces manual `if (redisReady) await redis.quit().catch(() => {})` in all pipeline scripts.

### Full Compiler Doc
See `sveltekit-frontend/scripts/docs/compiler-stack-explainer.md` for complete reference.

---

## Karpathy GPU Authority Blend + Redis ACE Cache (LEGACY / REFERENCE ONLY — May 8, 2026)

Single-pipeline composite score for "where to focus" agent recommendations. Historical blend only; current Parent Atlas retrieval ownership is elsewhere. This combines Neo4j PageRank, GPU semantic attention, and graph authority into one Redis-cached blend that ACE/MCP/synthesis tools read in O(1).

### Pipeline (`scripts/karpathy-gpu-enrich.mjs`)
```
Top-N from Neo4j (graphPageRank)
  → Qdrant fetch content_embedding (768-dim, codebase_chunks_768)
  → Embed RISK_QUERY via /api/embed (Redis L1 + Bifrost L2 cached probe)
  → attentionScoreGPU(probe, 768, embeddings, n)  [direct on raw 768d]
  → autoencoderEncode 768→64  [separate output for memory paths, NOT on attention path]
  → Blend: 0.4·PR + 0.3·attn + 0.3·authority
  → Persist to Redis + write markdown report
```

**Surface**: `npm run karpathy:gpu` (top-50), `karpathy:gpu:dirty` (incremental), `karpathy:gpu:top200`, `karpathy:gpu:dry`.

### Redis ACE cache layout (canonical)

| Key | Type | TTL | Refresher |
|-----|------|-----|-----------|
| `gpu:karpathy:scores` | hash `<file> → JSON{pr,attn,authority,blend}` | 24h | `karpathy:gpu` |
| `gpu:karpathy:encoded` | hash `<file> → 64-dim CSV` (compressed memory paths) | 24h | `karpathy:gpu` |
| `gpu:karpathy:summary` | hash run metadata | 24h | `karpathy:gpu` |
| `ace:authority:top` | hash top-200 stableKey → graphAuthorityScore | varies | `graphify:authority` |
| `ace:rank:dirty_files` | set | session | `startup:ace` |
| `ace:startup:last_sha` | string git HEAD | persistent | `startup:ace` |
| `ace:startup:heavy_last_run` | string ISO timestamp | 24h | `startup:ace` heavy |
| `ace:topo:{class}:{hash}` | string topo-byte candidate cache | 300s | ACE Stage A0 |
| `agents:dir:<rel>` | string rendered AGENTS.md | 24h | `agents:write` |
| `couchdb:pagerank_scores` | string JSON | 6h | `run-pagerank.ts` |

### TurboQuant embedding constraint (important)

**TurboQuant llama-server (:8090) is chat-only** with the canonical flags `-fa on -ctk q8_0 -ctv q8_0`. It refuses `/embedding` and `/v1/embeddings` with `code: 501, "Start it with --embeddings"`. Don't route embedding work through TurboQuant.

**Canonical embed cascade** (used by `karpathy-gpu-enrich.mjs` and elsewhere):
1. **SvelteKit `/api/embed`** — wraps Ollama embeddinggemma with Redis L1 (5ms) + Bifrost L2 (2-5s) — preferred
2. **Direct Ollama `/api/embeddings`** — fallback when dev server is down
3. **TurboQuant** — chat-only, never embeddings unless restarted with `--embeddings` (which OOMs with current `ctk/ctv q8_0` config on 8GB GPU)

**Why TurboQuant chat config wins on RTX 3060 Ti (8GB)**: gemma4-rotorquant:latest + q8_0 KV uses ~5.8GB VRAM; tensorrt_bridge.node shares the remaining ~2.3GB for autoencoder/attention compute. Adding `--embeddings` would OOM or force a separate server instance.

### Why autoencoder is bypassed for attention scoring

Random Xavier-initialized weights produce flat tanh outputs at 64-dim — every vector saturates near boundaries, attention scores cluster at ~1.0 (Δ < 0.01). Direct 768-dim attention preserves embeddinggemma's semantic structure. The 64-dim autoencoder output is still cached at `gpu:karpathy:encoded` for **future MLA-style consumers** (DeepSeek-MLA path) once trained autoencoder weights become available.

`encodeProbe` and `attentionVsRiskProbe` are kept in the script (marked `@reserved` JSDoc) — don't delete on lint cleanup.

### Auto-fire policy

Wired into the heavy lane of `scripts/startup/ace-incremental-startup.mjs` via `config/startup-ace-policy.json`:
- Heavy lane fires only when GPU is warm (TurboQuant :8090 OR Ollama :11434 health probe passes)
- 24h cooldown via `ace:startup:heavy_last_run`
- Sequence: `graphify:authority → graphify:gds → graphify:cluster-summaries → graphify:bow-tiles → topology:validate → karpathy:gpu → audit:full-pipeline`
- Allowlist also permits `karpathy:gpu:dirty` and `karpathy:gpu:dry` on every folder open (incremental lane)

### Correction (2026-09-28): the Surface aliases were documentation, not reality — `karpathy:gpu` was completely broken; this Auto-fire policy subsection describes two files that do not exist

**`karpathy:gpu` (bare) was non-functional since the moment its admission gate was added — verified
live, not assumed.** Running it threw `Error: KARPATHY_APPLY_ADMITTED_WORKSPACE_REVISION_REQUIRED`
at `scripts/atlas/karpathy-gpu-enrich.mjs:623` every single time, because its apply mode hard-requires
`ATLAS_WORKSPACE_REVISION` (`sha256:`-prefixed) and `ATLAS_SOURCE_COHORT_CHECKSUM` env vars, and a
full repo-wide search found **zero code anywhere that ever set either one**. The "Surface" line
above (`karpathy:gpu:dirty`, `karpathy:gpu:top200`, `karpathy:gpu:dry`) was aspirational when
written — none of those three npm aliases existed in `sveltekit-frontend/package.json` until this
correction; only bare `karpathy:gpu` existed, and it was broken.

**Fixed 2026-09-28, live-verified, no fabrication**: `scripts/atlas/run-karpathy-gpu-admitted-v1.mjs`
(new) resolves `ATLAS_WORKSPACE_REVISION` from the most recent COMPLETED `graphify_runs` row's real
`workspace_revision` (fails closed with `NO_ADMITTED_WORKSPACE_REVISION` if none exists — never a
timestamp or synthesized value), and `ATLAS_SOURCE_COHORT_CHECKSUM` from a sha256 of the exact real
candidate set `karpathy-gpu-enrich.mjs` itself fetches for the run (via a new
`--dry-run --dry-run-candidates` mode that emits a `KARPATHY_COHORT_JSON:` line for exactly this
purpose), then re-invokes the real script with both supplied. **Live result**: `gpu:karpathy:scores`
went **0 → 190 → 390** real Redis hash entries across two runs (verified via `HLEN`, not the
script's own self-report), exit 0 both times. New, now-real npm aliases: `karpathy:gpu:dry` (the raw
script's read-only mode), `karpathy:gpu:admitted` (the fix — this is what should be called from now
on), `karpathy:gpu:dirty` and `karpathy:gpu:top200` (both routed through the admitted wrapper). All 3
places in `.vscode/tasks.json` that called bare `karpathy:gpu` (including the `runOn: folderOpen`
gated daily-startup task) now call `karpathy:gpu:admitted`. Full evidence trail:
`openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md`,
`STARTUP-BITFROST-WARM-DIAGNOSIS-01` and its follow-up entry.

**The "Auto-fire policy" paragraph above this correction is STALE — `scripts/startup/
ace-incremental-startup.mjs` and `config/startup-ace-policy.json` do not exist anywhere in this
repo** (confirmed via direct `find`/`ls`, not a stale grep). The `.vscode/tasks.json` task whose
`detail` field repeats this same description (`"🚀 Startup: ACE Incremental Refresh (detached,
safe)"`) has a `command` of `npm run startup:ace:detached` — **also not a real npm script** in
either `package.json` — so this task has silently done nothing on every folder-open since it was
added. A sibling task, `"🔥 Startup: Seed Hit-Demand (chunk_hit_log → Redis, detached)"`, has the
identical failure shape: its command `npm run ace:hit-demand` is also not a real script (the
underlying `chunk_hit_log` Postgres table is real and has real consumers — `context-assembler.ts`,
`mcp/server.ts` — but nothing seeds a Redis demand signal from it). **Do not treat either capability
as live.** Both are recorded as open, unbuilt gates (not fixed in this correction — each needs its
own build-vs-remove decision) in
`openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md`. A new read-only check,
`npm run atlas:audit:startup-tasks` (`scripts/atlas/audit-startup-task-npm-scripts-v1.mjs`), now
exists specifically to catch this failure mode — any `.vscode/tasks.json` task whose `npm run X`
doesn't resolve to a real script in either `package.json` (or the task's own declared cwd). Running
it found the real scope is **4** silently-broken `runOn: folderOpen` tasks, not just these 2 — also
`"🩺 Startup: Atlas Smoke Gate"` (`smoke:atlas`) and `"🧪 Startup: OpenCode Sidecars Smoke"`
(`smoke:mcp:opencode-sidecars`), both likely non-functional since whichever of the 4 broke first,
since they're chained via `dependsOn`. It also found 157 additional stale references on manual-only
tasks (lower urgency — those fail loudly the moment someone runs them). None of the 161 were fixed
in this pass; full detail in
`openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md`'s
`STARTUP-BITFROST-WARM-DIAGNOSIS-01` follow-up entries.

### Verification

```bash
# Sample scores
docker exec legal-ai-valkey valkey-cli HGET gpu:karpathy:scores 'src/lib/server/db/client.ts'
# → {"pr":7.06,"attn":0.999,"authority":0.555,"blend":3.291}

# 64-dim memory path for a file
docker exec legal-ai-valkey valkey-cli HGET gpu:karpathy:encoded 'src/lib/server/db/client.ts'

# Run metadata
docker exec legal-ai-valkey valkey-cli HGETALL gpu:karpathy:summary
```

---

## Reconstruction 3-Track Architecture (May 8, 2026)

Three connected tracks for evidence → timeline → visual reconstruction:

**Track 1 — model layer per binary** (multiple llama-server.exe paths, switch via `LLAMA_SERVER_PATH`):
- `gemma4-rotorquant:latest` → stock `-ctk q8_0 -ctv q8_0` (head dim 256+, D=128 TurboQuant kernels crash). VLM + legal reasoning.
- `qwen2.5-7b-instruct` / `qwen3-7b` → candidate for `-ctk q8_0 -ctv turbo3` (head_dim=128, 28 Q-heads / 4 KV-heads — matches stock D=128 TurboQuant prebuilts). Long-context planning, JSON timeline extraction, ComfyUI workflow generation.

**Track 2 — ComfyUI image/keyframe generation**: HTTP API only (`POST /prompt` → `GET /history/{prompt_id}` → fetch outputs). Operator builds workflow in ComfyUI Desktop, exports `workflow_api.json`, app submits as POST payload. RabbitMQ queue `comfyui.render` + SSE stream `/api/comfyui/render/stream`. **Do NOT shell out to Python** — the Desktop "Export to Python" is a dev-only debugging convenience.

**Track 3 — 3D reconstruction lanes** (build in order, do NOT skip):
- Lane A — 2D legal timeline viewer (safest first)
- Lane B — ComfyUI still frame per `TimelineEvent`
- Lane C — Blender + Mixamo MP4 (uses existing `courtroom_models` table + `courtroom_anim_type` enum: idle/speaking/objection/walk/gesture/point/sit/stand/present_evidence/react_*/nod/shake_head). Queue: `blender.render`.
- Lane D — WebGPU low-poly viewer (Threlte). Actors follow paths, Mixamo clips, evidence labels, timeline scrubber, "Demonstrative reconstruction" overlay.
- Lane E — Gaussian splatting **environments only** (pre-scanned courtroom/street/house). Defer until stable scene library exists. NOT for actors, NOT for text-to-3D, NOT for claimed-real spaces.

**Canonical TimelineEvent schema:** `{ id, time, location, who[], what, whyHypothesis?, how, evidenceIds[], confidence: 'high'|'medium'|'low', disputed: boolean, reconstructionNotes[] }`.

**Legal product rule:** every visual output must carry `"Demonstrative reconstruction — not original footage"` overlay + per-event confidence badge + evidence ID citations + disputed-fact highlights + gaps for unknowns. Hyper-realistic uncertainty-free reconstructions are indefensible. Mixamo+Blender frames trace to logged action IDs; SVD/AnimateDiff/CogVideoX/Wan invent pixels — do NOT use for evidence.

**Load-bearing principle:** LLM is planner, compiler is renderer. Gemma4/Qwen emit Zod-validated `SceneIntent` JSON only. A deterministic TypeScript scene compiler turns intent → Blender script / Three.js scene. Do NOT let the LLM write Three.js/Blender Python directly — silent failures (empty scene, wrong scale, hallucinated objects, non-repeatable). Same input → same render is load-bearing for legal audit.

**Repo audit (2026-05-08): ~70% of the renderer already exists.** `src/lib/courtroom/` is 1556 LoC including a CRT/N64 post-process shader (PS1 aesthetic foundation), 1070-line scene state machine, 276-line timeline engine. `/demos/crime-reconstruction/+page.svelte` is 690 LoC with who/what/why/how form + WebGPU scene wired. `courtroom_models` + `courtroom_animations` Drizzle tables exist. 8 detective-mode UI components exist. Missing: SceneIntent Zod schema, deterministic compiler, TRELLIS evidence-to-3D pipeline, Mixamo asset registry, RabbitMQ `scene.render`/`evidence.render` queues, mini-modal viewer, ZIP export bundle.

**Hard gates** (do not skip):
1. **Stylization IS the admissibility hedge** — PS1/N64 aesthetic on environments is non-negotiable. Going photoreal on non-evidence renders pushes the product into Daubert-hearing territory. Keep backgrounds pixelated.
2. **Evidence is near-exact** — TRELLIS-derived GLBs preserve original photo silhouette/texture; do NOT apply PS1 vertex jitter to evidence meshes. Visual contrast (sharp evidence + blocky environment) signals "reconstructed scene, real evidence."
3. **Chain of custody on every 3D asset** — extend `evidenceAuditLog` to `evidence_3d_assets`, SHA-256 every GLB at write, log `metadata.trellis_model = 'TRELLIS-image-large@<digest>'`.
4. **No GPU/3D work on Node main thread** — TRELLIS + Blender = Python sidecars on RabbitMQ. SvelteKit produces messages, never blocks on render. Queues: `scene.render` (1hr), `evidence.render` (1hr), `scene.export` (5min).
5. **Export bundles are SHA-256-verifiable** — `manifest.txt` in the ZIP lets a reviewer prove the offline bundle matches what the case file exported. Self-contained Chrome-offline `index.html` + Three.js single-file ESM (~200KB) means air-gapped review laptops work.

**Existing scaffolding** (don't rebuild): `src/lib/courtroom/{courtroom-scene,timeline-engine,crt-postprocess,courtroom-types}.svelte.ts/.ts`, `courtroom_models` + `courtroom_animations` Drizzle tables, `/api/courtroom/models`, `/api/cases/[id]/timeline`, `/api/persons-of-interest/[id]/timeline`, 8 `src/lib/components/detective/*` + `*Detective*` components, `LocalImageGenerator.svelte` with `comfyui` provider.

**Companion lane** (different tooling): `next_steps/active/2026-05-08_3dgs-forensic-roadmap.md` — photogrammetric 3DGS from real crime-scene photos (evidence-AS-environment). The 3-track lane above is the reverse: prompt-as-environment + evidence-as-objects.

See `memory/reconstruction-3-tracks.md` for full SceneIntent schema, RabbitMQ queue table, license-safe Mixamo action allowlist, TRELLIS Replicate fallback policy, and the 9-phase build order.

---
