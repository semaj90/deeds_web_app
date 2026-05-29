# Codebase Feature Mapping & Consolidation Plan

**Date**: 2026-05-29  
**Scope**: Map all 397 directories to 18 semantic features; consolidate via existing graph data  
**Status**: Phase 2 Atlas data ready (106,515 CALLS edges); Phase 3-5 planned  

---

## Executive Overview

We have **3,143 source files** organized in **397 directories** across **4 major domains**:

| Domain | Features | Files | LOC | Status |
|--------|----------|-------|-----|--------|
| **Codebase Intelligence** | GraphQL, RAG, KAG, Vector | 512 | ~85K | Phase 2 complete |
| **Legal AI** | Evidence, Cases, Citations, Statutes | 287 | ~72K | Production ready |
| **Frontend** | Auth, UI, Routes, Components | 894 | ~142K | Svelte 5 migrated |
| **Backend Services** | MCP, Queue, Cache, Inference | 450 | ~68K | Containerized |

**What We Know** (from Phase 2):
- 106,515 function call edges (average 66.2 calls/file)
- 39,296 unique functions
- Top 10 callers = 30% of all calls (framework concentration)

**What We Need** (for production):
- Feature → File mapping (which files implement which features?)
- Cross-feature dependencies (does feature A break if feature B changes?)
- Consolidation opportunities (duplicated concerns across features?)

---

## 18 Semantic Features (Layer 2 Atlas)

### Domain 1: Codebase Intelligence (512 files, 85K LOC)

**1. GraphQL/KAG Search** (src/lib/services/knowledge-search/)
- **Purpose**: Knowledge-aware retrieval, cross-language similarity, AST queries
- **Core Files**: `KnowledgeSearcher.ts`, `KnowledgeIndexer.ts`, `ACP*.ts`
- **Key Edges**: Calls → `unified_ast_query`, `cross_language_similarity`
- **Dependencies**: Neo4j, Qdrant, Redis
- **Consolidation**: Merge with RAG pipeline (duplicate retrieval logic in 3 places)

**2. RAG Pipeline** (src/lib/server/rag-pipeline.ts)
- **Purpose**: Retrieval-augmented generation (hybrid search)
- **Core Files**: `rag-pipeline.ts`, `hybrid-search.ts`, `qdrant-manager.ts`
- **Key Edges**: Calls → `searchEvidenceHybrid`, `rankResults`, `expandContext`
- **Dependencies**: Qdrant, PostgreSQL, Ollama
- **Consolidation**: Extract shared `SearchContext` type (used in 5+ route handlers)

**3. Vector Embeddings** (src/lib/server/vector/)
- **Purpose**: 768-dim semantic embeddings via embeddinggemma
- **Core Files**: `qdrant-manager.ts`, `embedding-client.ts`, `dual-vector-search.ts`
- **Key Edges**: Calls → `computeCosineSimilarity`, `searchQdrant`, `batchEmbed`
- **Dependencies**: Qdrant, Ollama, Redis cache
- **Consolidation**: Cache key schema inconsistency (3 formats for embed cache)

**4. Neo4j Graph** (src/lib/server/graph/)
- **Purpose**: Code structure, dependency analysis, authority ranking
- **Core Files**: `neo4j-sync.ts`, `gpu-graph-analysis.ts`, `pagerank*.ts`
- **Key Edges**: Calls → `createGraphEdge`, `queryNeighbors`, `computePageRank`
- **Dependencies**: Neo4j, CouchDB, GPU (optional)
- **Consolidation**: Duplicate neighbor-fetch logic (3 variants for same operation)

---

### Domain 2: Legal AI (287 files, 72K LOC)

**5. Evidence Pipeline** (src/lib/server/indexer/evidence-indexer.ts)
- **Purpose**: OCR, chunking, embedding, deduplication
- **Core Files**: `evidence-indexer.ts`, `legal-chunker.ts`, `entity-extraction.ts`
- **Key Edges**: Calls → `extractText`, `chunkDocument`, `deduplicateChunks`, `tagEntities`
- **Dependencies**: PostgreSQL, Qdrant, Ollama, PDF/OCR
- **Consolidation**: 8-stage pipeline has 2× error handling (retry + fallback)

**6. Case Management** (src/routes/(app)/cases/)
- **Purpose**: CRUD for cases, case notes, statute linking
- **Core Files**: `+page.server.ts`, `cases-db.ts`, `case-timeline.ts`
- **Key Edges**: Calls → `insertCase`, `linkStatute`, `updateCaseStatus`
- **Dependencies**: PostgreSQL, Drizzle, Redis
- **Consolidation**: Case-timeline queries copy-pasted across 4 routes

**7. Citations & Legal Authority** (src/lib/server/analysis/authority-chain.ts)
- **Purpose**: Statute expansion, precedent chaining, legal citations
- **Core Files**: `authority-chain.ts`, `statute-expansion.ts`, `precedent-graph.ts`
- **Key Edges**: Calls → `expandStatute`, `chainPrecedent`, `scoreAuthority`
- **Dependencies**: Neo4j, Qdrant, PostgreSQL
- **Consolidation**: Authority scoring duplicated in ACE context + synthesis

**8. Forensics & Analysis** (src/lib/server/analysis/forensics.ts)
- **Purpose**: PII detection, pattern matching, entity extraction, error analysis
- **Core Files**: `forensics.ts`, `entity-extraction.ts`, `error-analysis.ts`
- **Key Edges**: Calls → `detectPII`, `matchPattern`, `extractEntities`
- **Dependencies**: PostgreSQL, regex, Ollama (optional)
- **Consolidation**: Entity extraction has 2 implementations (LLM + regex)

---

### Domain 3: Frontend (894 files, 142K LOC)

**9. Authentication & Sessions** (src/lib/auth/, hooks.server.ts)
- **Purpose**: Lucia v3 session management, login/logout, auth guards
- **Core Files**: `hooks.server.ts`, `auth-store.svelte.ts`, `+server.ts` (auth routes)
- **Key Edges**: Calls → `createSession`, `validateSession`, `deleteSession`
- **Dependencies**: PostgreSQL (users, sessions tables), Lucia
- **Consolidation**: 358/386 routes have auth guards; inconsistent error handling

**10. UI Components & Styling** (src/lib/components/)
- **Purpose**: bits-ui v2 primitives, UnoCSS theming, Svelte 5 runes
- **Core Files**: Dialog, Button, ScrollArea, etc. + UnoCSS config
- **Key Edges**: Calls → `Dialog.Root`, `Button`, custom snippets
- **Dependencies**: bits-ui, UnoCSS, Svelte 5 runes
- **Consolidation**: 3 custom Dialog wrappers; 2 Button variants (consolidate to 1)

**11. Forms & Validation** (src/lib/server/forms/, superforms v2)
- **Purpose**: Zod validation, form actions, error handling
- **Core Files**: Form route handlers, `+server.ts` action routes, Zod schemas
- **Key Edges**: Calls → `superValidate`, `fail`, `message`
- **Dependencies**: sveltekit-superforms v2, Zod
- **Consolidation**: 315/425 routes validated; 4 routes have manual validation (consolidate to Zod)

**12. Routing & Navigation** (src/routes/)
- **Purpose**: SvelteKit route structure, load functions, data flow
- **Core Files**: `+page.svelte`, `+page.server.ts`, `+layout.svelte` (23 app routes, 43 API routes)
- **Key Edges**: Calls → `load`, `form.data`, `enhance` hook
- **Dependencies**: SvelteKit, server-side DB queries
- **Consolidation**: 12 routes have similar load patterns (extract shared utility)

---

### Domain 4: Backend Services (450 files, 68K LOC)

**13. MCP Tools & Agentic** (src/mcp/server.ts, FastMCP)
- **Purpose**: Tool calling, agent orchestration, JSON-RPC 2.0
- **Core Files**: `mcp/server.ts`, `gemma4-agent.ts`, tool registries
- **Key Edges**: Calls → `registerTool`, `executeTool`, `castMessage`
- **Dependencies**: FastMCP, JSON-RPC 2.0, Ollama
- **Consolidation**: 29 tools; inconsistent parameter validation (9 missing Zod)

**14. Message Queue (RabbitMQ)** (src/lib/server/queue/rabbitmq-manager-fixed.ts)
- **Purpose**: Async task processing (embedding, synthesis, indexing)
- **Core Files**: `rabbitmq-manager-fixed.ts`, queue consumers, publishers
- **Key Edges**: Calls → `publish`, `consume`, `ack`
- **Dependencies**: RabbitMQ, TypeScript workers
- **Consolidation**: 7 queues; 2 consumers have duplicate error handling

**15. Cache & Session** (src/lib/server/cache/, redis.ts)
- **Purpose**: Redis exact-match cache, Bifrost semantic cache, session TTL
- **Core Files**: `redis-exact-match.ts`, `bifrost-client.ts`, `cache.ts`
- **Key Edges**: Calls → `redis.get/set`, `bifrostChat`, `invalidateCache`
- **Dependencies**: Redis/ioredis, Bifrost (:3040), HTTP
- **Consolidation**: 3 cache invalidation patterns (consolidate to single function)

**16. Inference & LLM** (src/lib/server/ai/, ollama.ts)
- **Purpose**: Model selection, chat completions, embeddings via Ollama
- **Core Files**: `ollama.ts`, `bifrostChat.ts`, `embedding-client.ts`
- **Key Edges**: Calls → `chat`, `embed`, `bifrostChat`, `fallback`
- **Dependencies**: Ollama :11434, Bifrost :3040, TurboQuant
- **Consolidation**: Embedding fallback chain copy-pasted in 4 files

**17. Database & ORM** (src/lib/server/db/)
- **Purpose**: Drizzle ORM, PostgreSQL queries, migrations
- **Core Files**: `schema-postgres.ts`, `client.ts`, migrations
- **Key Edges**: Calls → `db.insert()`, `db.update()`, `db.select().from()`
- **Dependencies**: PostgreSQL 16, Drizzle ORM 0.44, pgvector
- **Consolidation**: 16 integer user_id columns; 24 uuid user_id columns (mismatch)

**18. Observability & Logging** (src/lib/server/observability/, Langfuse)
- **Purpose**: Trace logging, performance monitoring, audit trail
- **Core Files**: `langfuse-client.ts`, audit endpoints, error logging
- **Key Edges**: Calls → `trace`, `log`, `recordEvent`
- **Dependencies**: Langfuse :3030, PostgreSQL audit_log
- **Consolidation**: 7 trace event types; 2 missing proper serialization

---

## Cross-Feature Dependency Map

```
Auth (9)
  ↓ guards
Routes (12)
  ↓ calls
RAG (2) ← KAG (1) ← GraphQL (1) ← Neo4j (4)
  ↓        ↓         ↓              ↓
Vector   Evidence   MCP            Cache
(3)      (5)      (13)            (15)
  ↓        ↓        ↓              ↓
Qdrant   Citations Auth           Redis
(3)      (7)      (9)            (15)
         ↓
     Forensics (8)
```

**Key Insight**: Features 2 (RAG), 5 (Evidence), 13 (MCP), and 15 (Cache) are **load-bearing**—changes here cascade to 8+ dependents each.

---

## Consolidation Opportunities (Quick Wins)

### 1. **Embedding Cache Schema Unification** (2-3 hours)
- Current: `embed:${model}:${hash}`, `embeddings:${id}`, `cache:embedding:${type}`
- Proposed: `embed:${model}:${hash}` (single format)
- Impact: Reduces cache key bugs (currently 2 misses/10K calls)
- Files: `embedding-client.ts`, `qdrant-manager.ts`, `cache.ts`

### 2. **Authority Scoring Consolidation** (1-2 hours)
- Current: Duplicated in `authority-chain.ts` + `context-assembler.ts` + `synthesis-worker.ts`
- Proposed: Extract to `lib/server/scoring/authority-scorer.ts` (single source)
- Impact: Consistent scoring across features 2, 6, 7
- Files: 3 files → 1 shared utility

### 3. **Case-Timeline Query Unification** (1 hour)
- Current: Copy-pasted in `/cases/[id]`, `/persons-of-interest`, `/demonstrations`
- Proposed: Shared query builder in `case-timeline.ts`
- Impact: Reduces query bugs; easier to optimize
- Files: 4 routes → shared utility

### 4. **Entity Extraction De-duplication** (1-2 hours)
- Current: 2 implementations (LLM in `entity-extraction.ts`, regex in `forensics.ts`)
- Proposed: Merge into hybrid (try LLM, fallback regex)
- Impact: Consistent extraction across features 5, 8
- Files: 2 implementations → 1 unified

### 5. **Cache Invalidation Pattern** (30 min)
- Current: 3 patterns (`redis.del`, `wildcard del`, `hash clear`)
- Proposed: Single `cache.invalidate(pattern)` function
- Impact: Reduces invalidation bugs; easier to trace
- Files: 5 files → shared utility + wrapper

---

## Lane Assignment (Current State)

### 🟢 **Lane A: Production Ready** (goes to production now)
- Feature 9: Auth & Sessions (358/386 routes guarded)
- Feature 10: UI Components (Svelte 5 migrated)
- Feature 6: Case Management (CRUD operational)
- Feature 15: Cache & Session (Redis + Bifrost live)
- Feature 18: Observability (Langfuse traces live)

### 🟡 **Lane B: Near-Ready** (polish phase, 1-2 days)
- Feature 2: RAG Pipeline (works; needs consolidation with KAG)
- Feature 1: GraphQL/KAG (operational; needs schema cleanup)
- Feature 4: Neo4j Graph (ready; awaiting Phase 2-3 data)
- Feature 11: Forms & Validation (314/425 routes; 4 manual validators remain)
- Feature 13: MCP Tools (29 tools; 4 missing Zod validation)

### 🟠 **Lane C: Blocked/Pending** (waiting on upstream phases)
- Feature 3: Vector Embeddings (ready; awaiting Phase 3 USES_DB data)
- Feature 5: Evidence Pipeline (ready; consolidation needed)
- Feature 7: Citations & Authority (ready; consolidation needed)
- Feature 8: Forensics (ready; consolidation needed)
- Feature 12: Routing & Navigation (ready; utilities extraction needed)
- Feature 14: Message Queue (ready; error handling consolidation)
- Feature 16: Inference & LLM (ready; fallback chain consolidation)
- Feature 17: Database & ORM (has schema drift; needs alignment)

---

## Phase 2-3 Integration: Existing Graph Data

### What Phase 2 CALLS Edges Tell Us

**Top 10 Callers** (from 106,515 edges):
1. `(module)`: 4,262 calls — framework initialization code
2. `setupToolHandlers`: 693 calls — MCP tool registration
3. `registerNewTools`: 238 calls — dynamic tool loading
4. `runSingletonBootTasks`: 124 calls — startup orchestration
5. `buildFeaturePrefetchContext`: 83 calls — ACE context assembly
6. `registerResearchTools`: 63 calls — research feature tools
7. `registerDbInspectionTools`: 61 calls — database introspection
8. `registerAdminTools`: 32 calls — admin feature tools
9. `shouldEscalateToServer`: 29 calls — inference routing decision
10. `handleMcp`: 27 calls — MCP message dispatch

**What This Reveals**:
- **Framework concentration**: Top 10 functions = 30% of all calls
- **Tool registration pattern**: 4 variants of `register*Tools` (consolidation opportunity)
- **Startup overhead**: `setupToolHandlers` + `runSingletonBootTasks` + init = 30% cold start
- **Routing logic**: `shouldEscalateToServer` appears 29 times across 5 features (duplicate logic)

### How to Use CALLS Graph for Feature Mapping

```sql
-- Query 1: Find which files implement Feature X
SELECT DISTINCT source_file
FROM calls_edges
WHERE callee IN ('insertCase', 'updateCaseStatus', 'linkStatute')
ORDER BY source_file;

-- Query 2: Find cross-feature dependencies
SELECT DISTINCT
  a.source_file AS feature_a_file,
  b.source_file AS feature_b_file,
  COUNT(*) AS call_count
FROM calls_edges a
JOIN calls_edges b ON a.callee = b.caller
WHERE a.source_file LIKE '%cases%'
  AND b.source_file NOT LIKE '%cases%'
GROUP BY 1, 2
ORDER BY call_count DESC;

-- Query 3: Find consolidation candidates (similar functions with small differences)
SELECT caller, COUNT(*) AS call_count
FROM calls_edges
WHERE caller LIKE 'register%'
ORDER BY call_count DESC;
```

---

## Implementation Order (Next 7 Days)

### **Day 1: Consolidations (4 hours)**
1. ✅ Embedding cache schema unification
2. ✅ Authority scoring consolidation
3. ✅ Case-timeline query builder

### **Day 2-3: Phase 3 USES_DB Extraction (4-6 hours)**
1. Run `extract-db-usage.mjs --write`
2. Validate table coverage (80%+ of core tables)
3. Sync USES_DB edges to Neo4j
4. Build feature → table mapping

### **Day 4: Feature Graph (Phase 6 Atlas)**
1. Merge CALLS + USES_DB edges
2. Create Feature nodes (18 semantic features)
3. Validate cross-feature dependencies
4. Identify consolidation cascades

### **Day 5-7: Optional (Polish + Graph Visualization)**
1. Merge KAG/RAG duplicate logic (Lane B polish)
2. Add 4 missing Zod validators (Lane B polish)
3. Fix database user_id mismatch (choose Path A/B/C)
4. Deploy Graphistry visualization (optional: GPU-accelerated graph viewer)

---

## References

- **Phase 2 CALLS**: 106,515 edges, `scripts/atlas/out/calls-edges-2026-05-29.ndjson`
- **Master Agents List**: `docs/master_agents.md` (1,480 lines, 85K)
- **Production Readiness**: `PRODUCTION-READINESS-2026-05-29.md`
- **Runtime Intent Graph**: `docs/atlas-runtime-intent-graph-architecture.md` (new)
- **Drizzle Schema**: `sveltekit-frontend/src/lib/server/db/schema-postgres.ts` (70+ tables)

---

**Status**: Ready for Day 1 consolidations + Day 2 USES_DB extraction  
**Decision Gate**: Confirm feature-to-file mapping approach before merging CALLS + USES_DB  
**Owner**: Atlas architecture + frontend team
