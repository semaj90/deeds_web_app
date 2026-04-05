# Architecture Enhancement Roadmap — 2026-04-02

## Current Architecture (What's Actually Wired)

```
User Query
    │
    ├─► EmbeddingGemma (768-dim, native Ollama :11434)
    │       ├─► Qdrant: cosine (dense) + BM42 (sparse) via RRF fusion
    │       ├─► pgvector: HNSW halfvec fallback (6 tables)
    │       └─► Fuse.js: fuzzy filename recall (codebase search)
    │
    ├─► ACE Context Assembler (15 parallel fetches)
    │       ├── RAG chunks (Qdrant multi-collection)
    │       ├── KAG neighbors (Neo4j graph traversal)
    │       ├── Glossary matches (pgvector + Qdrant)
    │       ├── Entity extraction (statutes, cases, persons)
    │       ├── Evidence metadata + connections
    │       ├── Chat history (Qdrant chat_messages)
    │       ├── Web search + Wikipedia (external enrichment)
    │       ├── User analytics context (behavioral signals)
    │       ├── Practice templates + persona
    │       ├── Query tags (legal domain classification)
    │       └── Codebase context (dual-vector: content 0.6 + signature 0.4)
    │
    ├─► DAG Ordering (Kahn topological sort on citation deps)
    │
    ├─► Bifrost Gateway (semantic cache, Go :3040, disabled by default)
    │       └── Redis-backed semantic similarity cache (28x speedup)
    │
    ├─► Ollama gemma4-legal:latest (RTX 3060 Ti, Flash Attention, Q8_0 KV)
    │       └── Structured output via GBNF grammar
    │
    ├─► ACE Self-Evaluation (async via RabbitMQ → Redis → /api/synthesis/evaluation/[id])
    │
    └─► Langfuse Observability (8 trace functions: LLM, Embedding, RAG, Qdrant, PG, RabbitMQ, Workers, CouchDB)
```

## Layer Status Matrix

| Layer | Role | Status | Gap |
|-------|------|--------|-----|
| **RAG** | Qdrant vector → chunks → LLM | Deep (multi-collection, corrective RAG, BM42 hybrid) | None |
| **KAG** | Neo4j graph → boost/expand retrieval | Deep (pre-retrieval + post-retrieval + authority scoring) | None |
| **DAG** | Kahn topological sort on citation deps | Active (SSE chat + synthesis) | None |
| **ACE** | 15-section context + self-eval | Strongest path (RAG+KAG+DAG combined) | None |
| **Qdrant** | 9 collections, INT8, BM42 sparse | Full (payload indexes, hybrid RRF) | None |
| **pgvector** | 6 halfvec HNSW tables | Active (iterative scan enabled) | None |
| **CouchDB** | ACE tag mirror, cluster summaries | Light (2 API routes only) | Underutilized |
| **Bifrost** | AI gateway + semantic cache | **ENABLED** — :3040 /v1/chat + /v1/embeddings + /v1/models verified, BIFROST_ENABLED=true | None |
| **Langfuse** | LLM observability traces | **OPERATIONAL** — v3.163.0, 10 trace functions, 18 files wired, ClickHouse+Worker+Web healthy | None |
| **Worker Threads** | K-Means, SOM, forensics, silhouette | Active (cluster-aware pool) | None |
| **Go Microservices** | gRPC :50051, SIMD :8095, search :8096 | Docker profile:full | Optional |
| **CHR97 Cartridge** | Binary tensor cache format | Internal (/api/cartridge/* endpoints) | Not exposed in UI |
| **TensorRT** | GPU inference accelerator | Not started — Docker compacted, reconsidering for Gemma 4 | Needs C: drive space for Triton image + TRT-LLM engine |
| **VLM** | Vision Language Model (Gemma3→Gemma4) | Code wired — vlm-evidence-analyzer.ts (Triton→Ollama fallback) | Not runtime-tested with live VLM inference |
| **Unsloth/GRPO** | LoRA fine-tuning + RL alignment | **IN PROGRESS** — 4 notebooks + merge-and-export.sh pipeline | Gemma4_E4B_Legal_GRPO.ipynb ready, needs Colab A100 run |
| **Neo4j** | Graph DB for KAG/entity relationships | Active in ACE, optional Docker | Profile:full required |
| **LibTorch CUDA** | N-API addon (similarity, clustering, embedding) | Verified (6 functions, RTX 3060 Ti) — added getCudaMemory, batchCosineSimilarity, graphSimilarityHalf | Only /api/gpu/compute |

---

## Priority Enhancements (Ordered by Impact)

### P0: SSE Chat KAG Gap Fix — Graph-Informed Retrieval

**Current flow** (`/api/sse/chat/+server.ts`):
```
1. retrieveContext() → Qdrant vector search (RAG)     [line 905]
2. correctiveRetrieval() → reformulate if low scores    [line 924]
3. dagOrderContext() → citation-based ordering           [line 931]
4. getGraphContext() → Neo4j neighbors (POST-retrieval)  [line 952]
5. graphBoostRerank() → re-rank by graph connectivity    [line 967]
6. Append graph context to system prompt                 [line 1008]
```

**Problem**: Graph neighbors only re-rank existing results. They don't expand the retrieval set.

**Fix**: Insert a graph-informed expansion step between steps 3 and 4:

```typescript
// NEW: Graph-Informed Retrieval Expansion
// 1. Extract entity IDs from initial retrieval results
// 2. Query Neo4j for graph neighbors of those entities
// 3. Get Qdrant embeddings for graph neighbor documents
// 4. Search Qdrant with expanded query (original + neighbor embeddings)
// 5. Merge + deduplicate + re-rank by (cosine * authority_weight)
```

**Files to modify**:
- `src/routes/api/sse/chat/+server.ts` — Add expansion step after DAG ordering
- `src/lib/server/retrieval/graph-context.ts` — Add `getGraphExpansionEmbeddings()` function
- `src/lib/server/retrieval/graph-informed-retrieval.ts` — NEW: orchestrates expansion

**Effort**: Medium (1 session)

---

### P1: Unsloth QLoRA Adapter Merging Pipeline

**Current state**: Archived notebook (`phase77-unsloth-finetuning.ipynb`), conversion scripts in `deeds_labs/`.

**What needs to happen**:
1. **Fine-tune gemma4-legal with legal corpus** via Unsloth 4-bit QLoRA
2. **Merge LoRA adapters** back into base model weights
3. **Export to GGUF** for Ollama consumption
4. **Validate** legal domain accuracy vs base model

**Pipeline**:
```
legal_corpus (PostgreSQL + Qdrant chunks)
    │
    ├─► Export training pairs (query, golden_answer, context)
    │     └── src/lib/server/training/export-training-data.ts (NEW)
    │
    ├─► Unsloth fine-tune (WSL2 + CUDA)
    │     └── scripts/training/unsloth-finetune.py (NEW)
    │     └── Config: QLoRA rank=16, alpha=32, dropout=0.05
    │
    ├─► Merge adapters
    │     └── scripts/training/merge-lora-adapters.py (NEW)
    │
    ├─► Convert to GGUF Q4_K_M
    │     └── llama.cpp convert-hf-to-gguf.py
    │
    └─► Create Ollama Modelfile + push
          └── ollama create gemma4-legal-finetuned -f Modelfile
```

**Dependencies**: Unsloth (pip), CUDA 13.0, 8GB+ VRAM, ~2-4 hours training

**Effort**: Large (2-3 sessions)

---

### P2: VLM Enhancement Audit + Wiring

**Current state**: `resize-for-vlm.ts` exists, VLM pipeline archived, POI photos use Gemma3 VLM via Ollama.

**What exists**:
- `src/lib/server/image/resize-for-vlm.ts` — Sharp preprocessing (active)
- POI photos: 7-step pipeline (Sharp → VLM → OCR → Embed → Qdrant → Auto-tag)
- TRT VLM notebook: `Gemma3_12B_INT4_Quantize_and_Export.ipynb`

**What's missing**:
1. **Evidence VLM analysis API route** — `/api/evidence/[id]/vlm-analyze` (NEW)
2. **Multimodal embedding fusion** — Image + text vectors combined for evidence search
3. **VLM-powered OCR fallback** — When Tesseract fails, use Gemma3-vision
4. **Image similarity search** — Qdrant collection for image embeddings (SigLIP)

**Pipeline**:
```
Evidence Image Upload
    │
    ├─► Sharp resize (resize-for-vlm.ts)
    ├─► Gemma3-vision description (Ollama /api/generate with images)
    ├─► SigLIP image embedding (768-dim, stored in Qdrant)
    ├─► Tesseract OCR → VLM fallback if OCR confidence < 0.5
    └─► Multimodal fusion: text_embed * 0.6 + image_embed * 0.4
```

**Effort**: Medium (1-2 sessions)

---

### P3: CouchDB Topological Cache Layer

**Current state**: 2 API routes use CouchDB (tag mirror, cluster summaries). Underutilized.

**Proposed role**: Cache topological graphs (DAG orderings, citation networks) for fast re-retrieval.

**Architecture**:
```
ACE/SSE Chat → DAG ordering → cache DAG graph in CouchDB
    │
    ├─► CouchDB doc: { _id: "dag:{caseId}:{queryHash}", graph: {...}, orderedIds: [...] }
    ├─► TTL: 1 hour (evidence changes invalidate)
    ├─► MapReduce view: by case_id → all cached DAG orderings
    └─► Qdrant tag search results → cached in CouchDB for cluster re-retrieval
```

**Why CouchDB vs Redis**: CouchDB is better for structured document storage with MapReduce views. Redis is better for ephemeral cache. Use both:
- **Redis**: Short-lived semantic cache hits (seconds-minutes)
- **CouchDB**: Structured DAG/cluster snapshots (minutes-hours)

**Effort**: Small (1 session)

---

### P4: Recursive LLM Multi-Hop Retrieval

**Current state**: Single-pass retrieval + corrective RAG on low scores.

**Proposed enhancement**: Multi-hop staged retrieval with cache at each stage.

```
Stage 1: Initial RAG retrieval (existing)
    │ Cache: Redis (query → chunks, 5min TTL)
    │
Stage 2: Entity extraction from top results
    │ Cache: Redis (entity_set → neighbors, 10min TTL)
    │
Stage 3: Graph-informed expansion (P0 fix)
    │ Cache: CouchDB (case_dag → ordered graph, 1hr TTL)
    │
Stage 4: Authority chain drill-down
    │ If top result cites a statute → retrieve that statute's full text
    │ If top result references a case → retrieve case precedent
    │ Cache: Redis (authority_chain → expanded context, 15min TTL)
    │
Stage 5: LLM synthesis with expanded context
    │ Cache: Bifrost semantic cache (query+context → response)
    │
Stage 6: ACE self-eval → correction if needed
    │ Cache: Redis (response_id → evaluation, 1hr TTL)
```

**Max hops**: 2 (prevent unbounded expansion)
**Total latency budget**: 15s (6s retrieval + 2s expansion + 7s LLM)

**Effort**: Large (2 sessions)

---

### P5: Langfuse Deployment + CouchDB Inference Log

**Current state**: 8 trace functions wired, disabled by default (`LANGFUSE_ENABLED=false`).

**Option A — Self-hosted Langfuse** (docker-compose):
```yaml
langfuse-server:
  image: langfuse/langfuse:2
  ports: ["3030:3000"]
  depends_on: [langfuse-db, langfuse-clickhouse]
  environment:
    DATABASE_URL: postgresql://...
    CLICKHOUSE_URL: http://langfuse-clickhouse:8123
langfuse-db:
  image: postgres:16-alpine
langfuse-clickhouse:
  image: clickhouse/clickhouse-server:24
```
**Cost**: ~2GB RAM, ~17.5GB disk (ClickHouse)

**Option B — CouchDB inference log** (lightweight alternative):
```typescript
// Log every inference call to CouchDB for analysis
async function logInference(params: {
  type: 'llm' | 'embedding' | 'vector_search' | 'graph_query';
  model: string;
  latencyMs: number;
  tokenCount?: number;
  cacheHit: boolean;
  queryHash: string;
}) {
  await couchdb.post('inference_log', {
    ...params,
    timestamp: new Date().toISOString(),
  });
}
```
**Cost**: Minimal (CouchDB already running)

**Recommendation**: Start with Option B (CouchDB inference log) for immediate observability without ClickHouse overhead. Migrate to Langfuse later if needed.

**Effort**: Small (Option B: 1 session), Medium (Option A: 2 sessions)

---

### P6: Triton/TensorRT + Ollama Coexistence — **COMPLETE**

**Wired** `gpu-monitor.ts` VRAM check into `inference-router.ts`:
- `tryTensorRT()` checks `getGpuStats().memory.freeMB >= 4000` before acquiring lease
- `routeStreamingInference()` same VRAM gate on TRT streaming path
- `getRouterStatus()` now reports VRAM stats, temperature, utilization, and `vramSufficient` flag
- `preferredBackend` calculation includes VRAM sufficiency check

Also fixed defensive iteration (`evidenceIds ?? []`) in `graph-context.ts` and `graph-informed-retrieval.ts`.

**Effort**: Small (completed in single session)

---

## CHR97 NES Glyph Architecture

**Current state**: Internal binary cache format for tensor results.

```
CHR97 Binary Format:
├── Magic bytes: "CHR97" (4B)
├── Header (4KB): version, dimensions, tensor count, metadata offset
├── RuneBlocks (36B each): tensor index + quantization params
├── FP16 Tensors: compressed embedding vectors
├── GraphCSR: compressed sparse row graph structure
└── JSON Metadata: source IDs, timestamps, scores
```

**Active endpoints**:
- `POST /api/cartridge/export` — Build + cache cartridge
- `POST /api/cartridge/search` — Tensor similarity search in cartridge
- `GET /api/cartridge/stats` — Redis cache statistics
- `POST /api/cartridge/invalidate` — Evict cached cartridge

**Integration with Qdrant**: Cartridges store pre-computed Qdrant results in binary format for instant replay without re-querying vectors.

**Integration with glyph-prompt-cache**: The L0.5 glyph cache (`glyph-prompt-cache.ts`) caches prompt fragments (case context, glossary, codebase, KAG) with typed fragments (FragmentType.CASE, .RAG, .CODE, .KAG). This is the "NES glyph" layer — pre-computed prompt segments that avoid re-assembling on repeated queries.

---

## Implementation Order

| Priority | Enhancement | Sessions | Dependencies | Status |
|----------|------------|----------|--------------|--------|
| **P0** | SSE Chat KAG Gap Fix | 1 | Neo4j (profile:full) | **COMPLETE** — Phase 1+2 wired |
| **P0b** | RabbitMQ Synthesis Worker | 1 | RabbitMQ (already running) | **COMPLETE** |
| **P0c** | Tiered Retrieval + Pre-Retrieval KAG | 1 | P0 complete | **COMPLETE** |
| **P0d** | Qdrant Schema Drift Fix | 0.5 | Qdrant running | **COMPLETE** |
| **P0e** | Node→Evidence ID Mapping Fix | 0.5 | P0d complete | **COMPLETE** |
| **P1** | Unsloth LoRA/GRPO Training | 2-3 | Colab A100, Unsloth pip | **IN PROGRESS** — Gemma4_E4B_Legal_GRPO.ipynb created (GRPO RL + 5 reward fns), needs Colab execution |
| **P2** | VLM Enhancement + Wiring | 1-2 | Ollama gemma3-vision | **CODE WIRED** — vlm-evidence-analyzer.ts + endpoints exist, not runtime-tested with live Ollama VLM |
| **P3** | CouchDB Topological Cache | 1 | CouchDB (already running) | **COMPLETE** — `dag-cache.ts` wired |
| **P4** | Recursive Multi-Hop Retrieval | 2 | P0 + P0c + P3 completed | **COMPLETE** — `authority-chain.ts` wired into SSE chat |
| **P5** | Langfuse/CouchDB Inference Log | 1-2 | CouchDB or Docker compose | **COMPLETE** — 6 SSE chat sites + synthesis worker |
| **P6** | TensorRT/Ollama Coexistence | 1 | TensorRT Docker image, C: drive space | **NOT STARTED** — inference-router.ts code exists; Docker Desktop compacted to free C: space; reconsidering for Gemma 4 TRT-LLM |

**Status (2026-04-03)**:
- P0-P0e, P3-P5: **COMPLETE** (code + runtime verified)
- P1: **IN PROGRESS** — GRPO notebook created, needs Colab A100 execution
- P2: **CODE WIRED** — vlm-evidence-analyzer.ts exists, not runtime-tested
- P6: **NOT STARTED** — code scaffolding exists, Docker Desktop compacted to free C: drive space for Triton; reconsidering for Gemma 4 TRT-LLM
- Runtime proof: **17/17 PASS** (scripts/runtime-proof-pipeline.mjs)

**Recommended next**:
1. **P1**: Run Gemma4_E4B_Legal_GRPO.ipynb on Colab A100 (3-5 hours, ~$10)
2. **P1**: Deploy resulting GGUF to Ollama: `ollama create gemma4-legal:latest -f Modelfile`
3. **P2**: Runtime-test VLM pipeline with live Ollama (evidence upload + /api/vision/analyze)
4. **P6**: Pull Triton TRT-LLM Docker image for Gemma 4 (needs ~8GB C: drive); build INT4 engine
5. Watch TurboQuant for Ollama (~Q3 2026) — free 6x KV cache memory savings

---

## Session Results — April 2, 2026

### P0 Phase 1: SSE Chat Retrieval Enhancements (COMPLETE)

**Files modified**:
- `src/routes/api/sse/chat/+server.ts` — graphBoostRerank(), query-time entity extraction, DAG ordering
- `src/lib/server/legal/constitution-pipeline.ts` — **P0 Bug Fix**: empty string `''` → `'content'` for Qdrant named vector
- `src/lib/server/config/vector-config.ts` — Added `knowledge_base` collection to VECTOR_CONFIG

**What was implemented**:
1. **`graphBoostRerank()`** — Re-ranks retrieved docs by +0.15 for Neo4j graph-connected documents
2. **Query-time entity extraction** — `extractLegalTags()` detects STATUTE, CASE, CA_CODE entities before retrieval
3. **DAG ordering** — Kahn's algorithm ensures cited sources appear before citing sources in context
4. **Vector name fix** — Constitution pipeline was sending empty string `''` as vector name; `legal_canon_chunks` collection uses named vector `'content'` (768-dim Cosine, 59 points verified)

**Eval test results**:
- SSE chat: PASSED — full legal analysis with corrective RAG reformulation, glossary match, 2 RAG chunks
- Synthesis: Diagnosed Bifrost timeout root cause (see below)

### P0 Phase 2: Remaining (Graph Expansion)

**What's still missing**: Graph neighbors only re-rank existing results. They don't expand the retrieval set.
The `graphBoostRerank()` function from Phase 1 improves ranking but doesn't add new documents from graph neighbors.
Next step: implement `getGraphExpansionEmbeddings()` to query Qdrant with expanded neighbor IDs.

---

### P0b: RabbitMQ Synthesis Worker (COMPLETE)

**Problem diagnosed**: Synthesis endpoint was synchronous — ACE context assembly (2-5s) + Ollama LLM (10-60s) + ACE eval (10-30s) all in one HTTP request. Bifrost's 30s server-side timeout caused orphaned Ollama requests that blocked subsequent calls.

**Solution**: Async publish→consume→poll pattern via RabbitMQ.

**Files modified**:
- `src/lib/server/queue/rabbitmq-manager-fixed.ts` — Added `synthesis.generate` queue (10th queue), consumer `handleSynthesisGenerate`, publisher `publishSynthesisGenerate`
- `src/routes/api/synthesis/generate/+server.ts` — JSON mode now publishes to RabbitMQ, returns 202 with `synthesisId` for polling. Synchronous fallback when RabbitMQ unavailable
- `src/routes/api/synthesis/evaluation/[id]/+server.ts` — Unified polling endpoint: checks `synthesis:result:{id}` + `synthesis:status:{id}` + `ace:result:{id}`

**Architecture**:
```
POST /api/synthesis/generate (JSON mode)
    │
    ├─ Cache hit? → return cached result (200)
    │
    ├─ RabbitMQ available? → publish to synthesis.generate queue
    │   │   └─ Return 202 { synthesisId, pollUrl }
    │   │
    │   └─ Worker (handleSynthesisGenerate):
    │       ├─ Redis: status → 'generating'
    │       ├─ assembleACEContext() (15 parallel fetches)
    │       ├─ DAG-order RAG chunks
    │       ├─ Direct Ollama (5min timeout, no Bifrost)
    │       ├─ Extract citations + compute confidence
    │       ├─ Redis: synthesis:result:{id} (1hr TTL)
    │       ├─ Redis: status → 'complete'
    │       ├─ Publish ace.evaluate (fire-and-forget)
    │       └─ CouchDB inference log (fire-and-forget)
    │
    └─ RabbitMQ down? → synchronous fallback (existing path)

GET /api/synthesis/evaluation/{id} (unified polling)
    ├─ synthesis:result:{id} → full result + optional ACE eval
    ├─ synthesis:status:{id} → pending/generating/failed
    └─ ace:result:{id} → ACE evaluation only
```

**Key design decisions**:
- Worker uses direct Ollama (5min timeout) — no Bifrost, no inference router chain
- Status tracking: `pending` → `generating` → `complete`/`failed` (all in Redis, 1hr TTL)
- ACE evaluation fires as separate RabbitMQ message after synthesis completes
- CouchDB inference logging wired via `logLLMInference()` (fire-and-forget)
- Synchronous fallback ensures endpoint works even without RabbitMQ

---

### Bifrost Timeout Investigation

**Root cause**: `routeInference()` goes TRT → Bifrost → Ollama chain. Bifrost's Go server has a 30s hard-coded timeout. Config values (`default_request_timeout: 120`) in both top-level and `network_config` are ignored.

**Impact**: Bifrost returns 504 after 30s, but the Ollama request continues processing. Promise.race doesn't cancel the losing promise. Direct Ollama calls get queued behind the orphaned request.

**Mitigation in place**:
1. Synthesis worker bypasses Bifrost entirely (direct Ollama)
2. Synthesis endpoint still has 3s TRT race for fast-path TensorRT (returns null on timeout, falls through)
3. SSE chat was never affected (uses direct Ollama, no inference router)

**Bifrost config** (`docker/bifrost/config.json`):
```json
{ "default_request_timeout": 120, "providers": { "ollama-local": { "network_config": { "default_request_timeout": 120 } } } }
```
Both timeout values are ignored by the Bifrost Go server.

---

### P5: CouchDB Inference Log (BUILT, not wired)

**File**: `src/lib/server/observability/inference-log.ts`
- `logInference()` / `logLLMInference()` / `logVectorSearch()` convenience functions
- Buffered writes: flush every 5s or at 50 entries
- CouchDB `inference_log` database via `_bulk_docs`
- Fire-and-forget — never blocks request pipeline
- Now wired into RabbitMQ synthesis worker (first consumer)

**Remaining**: Wire into SSE chat, RAG pipeline, Qdrant manager for full observability

---

### P0c: Tiered Retrieval + Pre-Retrieval KAG (COMPLETE)

**Problem**: RAG searched all collections in a single flat pass. Graph neighbors only decorated results post-retrieval (+0.15 flat boost). KB corpus and case evidence had identical cache TTLs despite vastly different invalidation patterns.

**Solution**: Two-tier retrieval with separate caching + pre-retrieval graph authority filtering.

**Files modified**:
- `src/lib/server/ace/types.ts` — Added `kbChunks`, `caseChunks` to `ACEContext`
- `src/lib/server/ace/context-assembler.ts` — Split `fetchRAGChunks()` → `fetchKBChunks()` + `fetchCaseChunks()` with Redis bundle caching (10min KB, 2min Case); `buildACEPrompt()` renders tiers as separate labeled sections
- `src/lib/server/retrieval/graph-context.ts` — Added `getCaseGraphNeighborIds()` (pre-retrieval by caseId), `buildGraphShouldFilter()` (Qdrant should filter), `applyGraphAuthorityScoring()` (strength + confidence weighted reranking)
- `src/routes/api/sse/chat/+server.ts` — Split `RAG_COLLECTIONS` → `KB_COLLECTIONS` + `CASE_COLLECTIONS`; pre-retrieval KAG: fetch neighbors → build filter → pass to retrieval; graph filter only targets case tier; replaced `graphBoostRerank()` with `applyGraphAuthorityScoring()`
- `src/routes/api/investigate/suggest/+server.ts` — Added missing `kbChunks`, `caseChunks`, `codebaseContext` to inline ACEContext

**Architecture**:
```
Query + caseId
    │
    ├─ getCaseGraphNeighborIds(caseId) → pre-retrieval neighbors
    │   └─ buildGraphShouldFilter() → Qdrant `should` filter
    │
    ├─ KB Tier (no graph filter):
    │   ├─ case_chunks (court opinions)
    │   ├─ law_sections (statutes, codes)
    │   └─ legal_documents (summaries, docs)
    │   └─ Redis cache: kb_bundle:{hash} (10min TTL)
    │
    ├─ Case Tier (graph-filtered):
    │   └─ evidence_vectors (uploaded PDFs, evidence)
    │   └─ Redis cache: case_bundle:{hash}:{caseId} (2min TTL)
    │
    ├─ Merge by score → DAG ordering
    │
    └─ applyGraphAuthorityScoring()
        └─ score = cosine * (1 + 0.2 * strength/100 + 0.1 * confidence/100)
```

**Key design decisions**:
- Graph `should` filter is additive (boosts, not restricts) — documents without graph connections still appear
- KB tier has no graph filter: legal corpus is universal, not case-scoped
- Authority scoring replaces flat +0.15 boost: uses both strength AND confidence from graph edges
- Pre-retrieval + post-retrieval neighbors merged: best of both (case-level + evidence-level)
- ACE prompt shows provenance: "Legal Corpus Context" vs "Case Evidence Context" sections

**Known gap**: `knowledge_base` collection is not yet in ACE's primary RAG path — glossary/knowledge endpoints don't influence ACE synthesis directly (optional next wiring step)

**Next steps for runtime verification**:
1. Verify SSE chat pre-retrieval KAG fires when caseId present in message
2. Verify DAG cache hits on repeated queries (CouchDB)
3. Verify inference log records written and queryable via `/api/observability/inference-stats`

---

### P0d: Qdrant Schema Drift Fix (COMPLETE)

**Problem**: Qdrant collection configs had drifted from what the code assumed. SSE chat searched `law_sections` (doesn't exist), `_denseSearch` hardcoded `{ name: 'content' }` (breaks 10+ collections), and 3 collections were missing from VECTOR_CONFIG.

**Audit findings** (50+ collections scanned):
1. `law_sections` — searched every SSE chat message, **does not exist** in Qdrant
2. `_denseSearch` in `qdrant-manager.ts` — hardcoded `{ name: 'content' }` vector payload, fails for collections using `'default'`, `'embedding'`, `'message'`, `'query'`, `'error'`, `'diagnosis'`, `'description'`
3. `case_chunks`, `evidence_vectors`, `court_opinions` — active in Qdrant but **missing from VECTOR_CONFIG**
4. `court_opinions` (7,825 points) — **no INT8 quantization** (all other active collections had it)
5. `poi_profiles` — config said `['default']` but Qdrant has named vector `'embedding'`

**Fixes applied**:

| Fix | File | Change |
|-----|------|--------|
| Remove `law_sections` | `sse/chat/+server.ts` | Removed from KB_COLLECTIONS, added `court_opinions` + `legal_canon_chunks` |
| Central vector-name registry | `vector-config.ts` | Added `NAMED_VECTOR_MAP` + `getNamedVectorName()` — computed from COLLECTION_VECTORS |
| Dynamic vector name resolution | `qdrant-manager.ts` | `_denseSearch` resolves vector name from VECTOR_CONFIG instead of hardcoding `'content'` |
| Add missing collections | `vector-config.ts` | `case_chunks`, `evidence_vectors`, `court_opinions` added to COLLECTIONS + COLLECTION_VECTORS |
| Fix poi_profiles drift | `vector-config.ts` | Changed `['default']` → `['embedding']` to match Qdrant reality |
| Quantize court_opinions | Qdrant API | Applied INT8 scalar quantization (q=0.99, always_ram=true) to 7,825 points |
| SSE chat vector names | `sse/chat/+server.ts` | Replaced hardcoded `collection === 'legal_documents'` check with `NAMED_VECTOR_MAP[collection]` lookup |
| Typed `VectorSearchConfig` | `vector-config.ts` | `mode: 'named'\|'unnamed'`, dimension, distance, quantized — per-collection typed config |
| `buildVectorPayload()` helper | `vector-config.ts` | Single function builds correct Qdrant payload for any collection — named or unnamed |
| `getVectorSearchConfig()` | `vector-config.ts` | Returns full search config (mode, vectorName, dimension, distance, quantized, onDiskPayload) |
| Unified `_denseSearch` | `qdrant-manager.ts` | Replaced 5-line vector resolution with single `buildVectorPayload()` call |
| Unified SSE chat search | `sse/chat/+server.ts` | `searchCollection()` uses `buildVectorPayload()` instead of `NAMED_VECTOR_MAP` lookup |
| `validateQdrantCollections()` | `vector-config.ts` | Startup validator: checks existence, mode, vector name, dimension per collection |

**Architecture after fix**:
```
VectorSearchConfig (typed per-collection config)
    │
    ├─► getVectorSearchConfig(collection)
    │   └── Returns: { mode, vectorName?, dimension, distance, quantized, onDiskPayload }
    │
    ├─► buildVectorPayload(collection, vector)
    │   ├── mode='named'   → { name: vectorName, vector: [...] }
    │   └── mode='unnamed'  → [...] (raw array)
    │
    ├─► SSE Chat searchCollection()
    │   └── vectorPayload = buildVectorPayload(collection, vector)
    │
    ├─► QdrantManager._denseSearch()
    │   └── vectorField = buildVectorPayload(collectionName, queryEmbedding)
    │
    ├─► NAMED_VECTOR_MAP (backward compat, auto-computed)
    │
    └─► validateQdrantCollections(qdrantUrl)
        ├── Collection exists?
        ├── Mode matches (named vs unnamed)?
        ├── Vector name matches?
        ├── Dimension matches?
        └── Logs: [Qdrant Validator] 12/18 passed, 0 failed, 6 skipped
```

**Impact**: Every Qdrant search now uses the correct vector name. No more silent failures, no per-route special-casing, one canonical lookup path.

---

### P4: Authority Chain Drill-Down — Recursive Multi-Hop Retrieval (COMPLETE)

**Problem**: Single-pass RAG retrieval finds documents about a topic, but when those documents cite specific statutes or cases, the LLM doesn't have the cited authority's full text. The model must reason about "18 U.S.C. § 1512" without seeing the actual statute language.

**Solution**: Multi-hop authority chain expansion. After initial retrieval + DAG ordering, extract statute/case citations from top results, embed the citation text, and search statute/case collections for the cited authority's full text. Up to 2 hops.

**Files modified**:
- `src/lib/server/retrieval/authority-chain.ts` — NEW: `authorityChainExpansion()` orchestrator, `extractNewAuthorities()`, `searchAuthorityCollections()`
- `src/lib/server/cache-keys.ts` — Added `AUTHORITY_CHAIN: 15 * 60` TTL
- `src/routes/api/sse/chat/+server.ts` — Wired authority chain after DAG ordering, before KAG graph context
- `src/lib/server/retrieval/graph-informed-retrieval.ts` — Fixed hardcoded `legal_documents` vector payload → `buildVectorPayload()`
- `src/routes/(app)/evidence/upload/+page.svelte` — Fixed pre-existing mixed `??`/`||` operator error
- `tests/retrieval-path-wiring.spec.ts` — Added 9 authority chain tests (36 total, all passing)

**Architecture**:
```
After DAG ordering → Authority Chain Drill-Down → KAG Graph Context

Hop 1:
  ├─ extractLegalTags(top docs) → new statutes + cases
  ├─ Embed citation text: "18 U.S.C. § 1512; People v. Vital"
  ├─ Search STATUTE_COLLECTIONS (legal_canon_chunks, legal_documents)
  ├─ Search CASE_COLLECTIONS (court_opinions, case_chunks)
  └─ Merge + dedup → expanded context

Hop 2 (if new citations found in hop 1 results):
  └─ Same process with newly discovered entities

Cache: Redis memory + L3 (authority:chain:{qHash}:{dHash}, 15min TTL)
```

**Key design decisions**:
- Embeds the combined citation text (not the original query) to find semantically relevant authority sources
- Uses `buildVectorPayload()` for correct named/unnamed vector handling across all collections
- `EmbedFn` callback pattern keeps the module decoupled from Ollama — callers provide their own embedding function
- Max 2 hops with 3s timeout per Qdrant search to stay within latency budget
- Defensive iteration (`tags.caCodes ?? []`) handles partial tag extractor results
- Fire-and-forget Redis caching — never blocks the retrieval pipeline

---

### P0e: Node→Evidence ID Mapping Fix (COMPLETE)

**Problem**: `buildGraphShouldFilter()` constructed Qdrant `should` filters using graph node IDs (`yorha_evidence_nodes.id`), but Qdrant payloads store evidence document IDs (`evidence.id`). These are separate UUID spaces. Qdrant's `should` is a **hard OR filter** (not a soft boost) — zero results were returned when no payload field matched a graph node UUID.

**Root cause**: Graph nodes and evidence documents have separate ID spaces. Example:
- Graph node: `2881752e-5ee3-4987-...` (PARTIES section)
- Evidence doc: `cb4b0a08-2b34-48ce-...` (Complaint - Graph Test)
- Node `file_path`: `evidence/cb4b0a08-2b34-48ce-.../complaint.pdf` (contains evidence UUID)

**Fix**: Extract evidence UUIDs from node `file_path` and include them in Qdrant filters alongside node IDs.

**Files modified**:
| Fix | File | Change |
|-----|------|--------|
| `GraphNeighbor.evidenceIds` | `graph-context.ts` | Added `evidenceIds: string[]` field resolved from node `file_path` |
| `extractEvidenceIdsFromPath()` | `graph-context.ts` | UUID regex extraction from `file_path` column |
| `getCaseGraphNeighborIds()` | `graph-context.ts` | SQL now fetches `tn.file_path AS neighbor_file_path`, maps to `evidenceIds` |
| `buildGraphShouldFilter()` | `graph-context.ts` | Collects BOTH `nodeId` + `evidenceIds` into filter (was node-only) |
| `applyGraphAuthorityScoring()` | `graph-context.ts` | Matches on evidence IDs for re-ranking (was node-only) |
| `getGraphContext()` | `graph-context.ts` | SQL fetches `file_path`, returned neighbors include `evidenceIds` |
| `fetchNeighborChunks()` | `graph-informed-retrieval.ts` | Uses `nodeId` + `evidenceIds` in Qdrant filter |
| `DEFAULT_CONFIG.collections` | `graph-informed-retrieval.ts` | `law_sections` → `evidence_items` (nonexistent collection fix) |

**Verification**:
- Before fix: Qdrant search with graph filter → **0 hits** (node IDs never match evidence payloads)
- After fix: Qdrant search with graph filter → **5 hits, all boosted=true**
- Filter now contains 10 IDs (9 node + 1 evidence) vs 9 (node-only before)

**Audit scope**: Full codebase audit confirmed NO OTHER locations have this bug:
- `authority-chain.ts` — NOT AFFECTED (uses text-based citation extraction, not node IDs)
- `ace/context-assembler.ts` — SAFE (delegates to `buildGraphShouldFilter()`)
- `sse/chat/+server.ts` — SAFE (delegates to `buildGraphShouldFilter()`)
- `evidence/search/+server.ts` — NOT AFFECTED (PostgreSQL-only, no Qdrant node ID filters)

**Data seeded for verification**:
- 12 graph connections for case `c9b79f5d` (supports, contextualizes, requests-remedy, etc.)
- 45 evidence vectors upserted to Qdrant `evidence_vectors` (1 → 46)
- 45 evidence items upserted to Qdrant `evidence_items` (10 → 55)
