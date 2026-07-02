# Codebase Reference Index

**Status**: ✅ **ALL THREE MAPS DISCOVERABLE** | Master + Structured + Live Snapshot

Navigation document for the three canonical codebase inventory files. Use these for system understanding, dependency analysis, and Phase 1B + v3.0.0 integration work.

---

## 🗺️ Master Inventory

**File**: [CODEBASE_MAP.md](./CODEBASE_MAP.md) | **Size**: 63 KB, 830 lines

Comprehensive directory tree with service inventory and component breakdown.

**Coverage**:
- Grand totals: **2,115 src/ files**, 754 directories, 414 API endpoints, 86 page routes
- Directory classifications: ESSENTIAL, INFRASTRUCTURE, DATA+MODELS, ARCHIVE
- SvelteKit routes: `(app)/`, `api/`, `.well-known/`
- Component library: bits-ui, UnoCSS, Svelte 5 runes
- Test suite: 20 Playwright tests (20/20 PASS)
- Import resolution errors: 19 (documented)

**Use this for**:
- Macroscopic codebase structure
- Finding component locations
- Understanding route hierarchy
- Verifying architecture scope (2,115 files = production-scale)

**Key sections**:
- `src/routes/(app)/` — 23 app routes (cases, evidence, admin, etc.)
- `src/routes/api/` — 43 API endpoints (auth, chat, citations, etc.)
- `src/lib/` — 800+ utility files (server, client, stores, services)
- `src/lib/components/` — 200+ Svelte UI components

---

## 📊 Structured Index (JSON)

**File**: [codebase-index.json](./codebase-index.json) | **Size**: 21 KB, 529 lines

Machine-readable structured inventory with metadata, tags, and subsystem paths.

**Metadata**:
- Generated: 2025-12-29T23:35:00Z (fresher than v1)
- Generator: phase89-codebase-indexer
- Total files indexed: 17,480

**Tag dimensions**:

| Dimension | Values | Use |
|-----------|--------|-----|
| **product** | evidence, search, vision, inference, rag | Feature domain |
| **structure** | frontend (routes, lib, scripts), backend (go, python, sql), infra (docker, config), docs (steering, specs, phase) | Code organization |
| **tech** | sveltekit, go, quic, pgvector, qdrant, neo4j, redis, minio | Technology layers |

**Qdrant Collections** (14):

| Collection | Purpose | Status |
|------------|---------|--------|
| `phase89_code_units` | AST symbol embeddings | Active |
| `phase89_kb_cards` | Knowledge base context | Active |
| `knowledge_base` | General KB search | Active |
| `phase72_evidence_embeddings` | Evidence document embeddings | Active |
| `codebase_chunks_768` | Code retrieval (canonical) | Active |
| `legal_documents` | Legal reference documents | Active |
| `chat_messages` | Chat history embeddings | Active |
| `embedding_cache` | Embedding lookup cache | Active |

**Paths by subsystem**:
- **Search**: `src/lib/server/search/`, `src/routes/api/search/`
- **Inference**: `src/lib/server/ai/`, `src/lib/ai/`
- **Retrieval**: `src/lib/server/retrieval/`, `src/routes/api/retrieval/`
- **Vector DB**: `src/lib/server/vector/`, `scripts/atlas/`
- **Evidence**: `src/lib/server/evidence/`, `src/routes/api/evidence/`

**Use this for**:
- Finding subsystems by tag (e.g., all "search" product components)
- Qdrant collection inventory and use cases
- Technology stack verification
- Cross-referencing paths to CODEBASE_MAP.md

**Quick navigation**:
- Search subsystem: `src/lib/server/search/qdrant-search.ts`
- Inference subsystem: `src/lib/server/ai/ollama.ts`
- Retrieval orchestrator: `src/lib/server/retrieval/unified-orchestrator.ts`
- Steering docs: `.kiro/steering/` (adminUI, knowledgeSearch, aceAnalyzer, agenticFixer)

---

## 🔄 Live Snapshot

**File**: [currentcodebase_map.md](./currentcodebase_map.md) | **Size**: 18 KB, 415 lines

Fresh codebase state snapshot. Regenerated when file structure changes.

**When to use**:
- Verifying latest directory state before committing changes
- Checking for recently added/removed files
- Comparing against master CODEBASE_MAP.md to identify drift
- During Phase 1B + v3.0.0 integration work

**Coverage**: Similar to CODEBASE_MAP.md but fresher timestamp

---

## 🎯 Quick Navigation

### By Subsystem

**Search & Retrieval**:
- Unified orchestrator: `src/lib/server/retrieval/unified-orchestrator.ts`
- Qdrant manager: `src/lib/server/vector/qdrant-manager.ts`
- Full-text search: `src/lib/server/search/`

**AI & Inference**:
- Ollama client: `src/lib/server/ai/ollama.ts`
- Gemma4 integration: `src/lib/server/analysis/gemma4-nlp-reranker.ts`
- LLM cache: `src/lib/server/ai/llm-cache.ts`

**Evidence Pipeline**:
- Upload handler: `src/routes/api/evidence/upload/+server.ts`
- Indexing: `src/lib/server/search/evidence-indexer.ts`
- Extraction: `src/lib/server/analysis/entity-extraction.ts`

**Vector & Embeddings**:
- TurboVec bridge: `src/lib/server/retrieval/turbovec-bridge.ts`
- Embedding cache: `src/lib/server/cache/embedding-cache.ts`
- GPU acceleration: `src/lib/server/gpu/`

**Admin Interface**:
- Admin search API: `src/routes/api/admin/retrieval/search/+server.ts`
- Command center: `src/routes/(app)/command-center/retrieval/+page.svelte`
- Dashboard: `src/routes/(app)/admin-dashboard/+page.svelte`

### By File Size (Largest)

**Reference large files for architectural understanding**:
- CODEBASE_MAP.md (63 KB) — master reference
- `src/lib/server/retrieval/unified-orchestrator.ts` — core retrieval
- `src/routes/api/admin/retrieval/search/+server.ts` — admin search ranking
- `src/lib/server/analysis/gemma4-nlp-reranker.ts` — synthesis

### By Phase (1B + v3.0.0)

**Phase 1B prerequisites**:
- Postgres schema: `drizzle/schema-postgres.ts`
- Vector setup: `drizzle/0NNN_pgvector.sql`
- GIN/BRIN indexes: `drizzle/0NNN_phase1b.sql` (to be created)

**v3.0.0 gates**:
- RRF fusion wiring: `src/lib/server/retrieval/` + `src/routes/api/retrieval/`
- BM25 ranking: Phase 1B Postgres GIN + ts_rank_cd
- Authority scores: Phase 103 (Qdrant payload sync)
- Smoke tests: `tests/e2e/` (20/20 PASS baseline)

---

## 📖 How to Use These Files

### For Understanding Scope

1. **Start with CODEBASE_MAP.md** — Get the 830-line overview
2. **Cross-reference with codebase-index.json** — Find specific subsystems by tag
3. **Verify with currentcodebase_map.md** — Confirm state hasn't drifted

Example: "Where is the search subsystem?"
- CODEBASE_MAP.md → `src/lib/server/search/`
- codebase-index.json → "search" product tag → `src/lib/server/search/qdrant-search.ts`
- currentcodebase_map.md → verify files still exist

### For Phase 1B + v3.0.0 Integration

1. **Identify all RRF-related routes**: grep across `src/routes/api/retrieval/` using codebase-index.json paths
2. **Map BM25 signal source**: CODEBASE_MAP.md → search subsystem → `qdrant-search.ts`
3. **Verify Qdrant collections**: codebase-index.json → 14 collections table → confirm `codebase_chunks_768` exists
4. **Check admin search wiring**: CODEBASE_MAP.md → API routes → `/api/admin/retrieval/search`

### For Dependency Analysis

1. **Find all consumers of a subsystem**: Use codebase-index.json "tech" tags
2. **Check import graph**: CODEBASE_MAP.md "Import resolution errors: 19" section
3. **Verify route coverage**: codebase-index.json → 414 API endpoints, 86 page routes

---

## 📋 File Index (Clickable)

| File | Size | Lines | Best For | Last Gen |
|------|------|-------|----------|----------|
| [CODEBASE_MAP.md](./CODEBASE_MAP.md) | 63 KB | 830 | Macroscopic structure | 2025-12-29 |
| [codebase-index.json](./codebase-index.json) | 21 KB | 529 | Structured tags + paths | 2025-12-29 |
| [currentcodebase_map.md](./currentcodebase_map.md) | 18 KB | 415 | Live snapshot + drift check | Fresh |

---

## 🔗 Phase 1B + v3.0.0 Reference

**Related documentation**:
- [PHASE-1B-POSTGRES-BM25-INDEXING.md](./PHASE-1B-POSTGRES-BM25-INDEXING.md) — Phase 1B execution plan
- [POSTGRES-INDEXING-STATUS.md](./POSTGRES-INDEXING-STATUS.md) — Postgres 18.4 readiness audit
- [UNIFIED-RETRIEVAL-PIPELINE.md](./UNIFIED-RETRIEVAL-PIPELINE.md) — 6-stage retrieval pipeline

**Key indexes to create** (Phase 1B):
- `codebase_chunk_index_search_vector_gin` — Full-text search (GIN tsvector)
- `codebase_chunk_index_bm25_brin` — Range filtering on BM25 scores

**Key collections** (existing):
- `codebase_chunks_768` — Qdrant ANN search (40.5K points, 384-dim)

**Key routes** (RRF wiring targets):
- `/api/retrieval/unified` — Unified orchestrator (Phase 1B + Phase 103 consumer)
- `/api/admin/retrieval/search` — Admin search with 6-signal blend

---

**Status**: ✅ All three maps linked and cross-referenced. Use this document to navigate the codebase for Phase 1B + v3.0.0 work.

