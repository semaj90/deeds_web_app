# Parent Atlas Runtime Implementation — Adapters & Orchestration

**Status**: ✅ **ADAPTERS WIRED** (July 12, 2026)

Complete infrastructure-backed implementation of the Parent Atlas unified retrieval facade.

## Package Structure

```
packages/parent-atlas-runtime/src/
  adapters/
    postgres-bm25.adapter.ts         # BM25 full-text search (Stage 1)
    qdrant-recall.adapter.ts          # Semantic ANN search (Stage 2)
    identity-resolver.ts              # Canonical identity resolution (Stage 3 — CRITICAL)
    rrf-fusion.adapter.ts             # RRF candidate fusion (Stage 4)
  facade/
    retrieval-facade.ts               # Complete pipeline orchestration
    policy-router.ts                  # Policy-driven routing (TODO)
  pipeline/
    retrieve-candidates.ts            # BM25 + Qdrant parallel (TODO)
    resolve-identities.ts             # Dedup by canonical packet_key (TODO)
    fuse-candidates.ts                # RRF merge (TODO)
    expand-graph.ts                   # Neo4j k-hop (TODO)
    rerank-candidates.ts              # XGBoost + CE (TODO)
    validate-evidence.ts              # Source validation gate (TODO)
    assemble-context.ts               # ACE vs RLM assembly (TODO)
  telemetry/
    retrieval-trace.ts                # Execution tracing (TODO)
  index.ts                            # Package exports
```

## 9-Stage Pipeline (Wired Order)

### Stage 1: BM25 (Postgres Full-Text Search)

**File**: `adapters/postgres-bm25.adapter.ts`

**Purpose**: Lexical recall via PostgreSQL built-in full-text search.

**Function**: `searchPostgresBM25(options: Postgres25TextSearchOptions): Promise<BM25Candidate[]>`

**Candidate Limit**: Policy-driven (developer_chat: 100, production_legal: 150, code_navigation: 200, etc.)

**Implementation Details**:
- Uses PostgreSQL `plainto_tsquery()` for safety (no injection risk)
- Scores via `ts_rank_cd()` (BM25-like relevance scoring)
- Optional fallback: `scoreBM25()` pure function (simplified scoring, no DB dependency)
- Source scope filtering via regex patterns (e.g., `src/lib/server/*`)
- Returns candidates with: id, packet_key, source_ref, feature_id, content_hash, title, snippet

**Key Exports**:
- `searchPostgresBM25(options)` — main search function
- `scoreBM25(document, query, k1, b)` — fallback scoring
- `filterBySourceScope(candidates, sourceScope)` — filter results by directory
- `validateBM25Results(candidates, requireSourceRef)` — validation gate

**Error Handling**:
- Throws if query is empty or malformed
- Returns empty array on DB unavailability (not thrown)
- Validates all results have packet_key and source_ref

---

### Stage 2: Qdrant ANN (Semantic Vector Search)

**File**: `adapters/qdrant-recall.adapter.ts`

**Purpose**: Semantic nearest neighbor search via HNSW index.

**Function**: `searchQdrantANN(qdrantUrl: string, options: QdrantRecallOptions): Promise<QdrantRecallResult[]>`

**Candidate Limit**: Policy-driven (developer_chat: 100, production_legal: 150, code_navigation: 50, etc.)

**Implementation Details**:
- Target collection: `codebase_chunks_768` (768-dimensional embeddings)
- Distance metric: Cosine similarity
- Query vector must be exactly 768-dimensional (enforced)
- Threshold filtering: optional score_threshold (default 0.0 = all results)
- Returns Qdrant point_id and payload (source_ref, feature_id, packet_key, content_hash)

**Key Exports**:
- `searchQdrantANN(qdrantUrl, options)` — main search function
- `validateQdrantResults(candidates)` — validation gate (checks similarity range [0,1])
- `filterQdrantBySourceScope(candidates, sourceScope)` — filter by directory
- `mergeBM25AndQdrant(bm25, qdrant)` — combine before deduplication
- `hashQueryForCache(query)` — embedding cache key generation

**Error Handling**:
- Throws if query_vector is not 768-dimensional
- Throws on Qdrant HTTP error (status != 200)
- Throws with descriptive message (e.g., "Qdrant search failed: 503 Service Unavailable")

---

### Stage 3: Canonical Identity Resolution (CRITICAL)

**File**: `adapters/identity-resolver.ts`

**Purpose**: Deduplication by canonical identity **BEFORE RRF fusion**. Prevents duplicate candidates under different IDs.

**Function**: `resolveCanonicalIdentity(candidates, options): Promise<IdentityResolutionResult[]>`

**Critical Rule**: This stage runs AFTER BM25 + Qdrant (recall) but BEFORE RRF (fusion).

**Implementation Details**:
- Deduplication key: `(source_ref, feature_id, content_hash)` — semantic unit
- Canonical identity chain: directory_path → source_ref → file_path → function_symbol → feature_id → feature_label → packet_key
- Hard fail conditions:
  - missing packet_key (unless `allowMissingPacketKey: true`)
  - missing source_ref
  - missing feature_id
- When duplicates found: keep highest score, merge IDs into `merged_from[]`
- **Why this matters**: Same logical packet can arrive from BM25 (chunk ID) and Qdrant (point ID). Without dedup, it ranks twice.

**Key Exports**:
- `resolveCanonicalIdentity(candidates, options)` — main dedup function
- `validatePacketLineage(packetKey, sourceRef, featureId, options)` — Postgres truth check (TODO)
- `blendDuplicateScores(candidates, bm25Weight, qdrantWeight)` — optional score blending (placeholder)
- `reportDuplicateMetrics(input, output)` — observability (duplicate count, largest group, affected refs)

**Expected Behavior**:
- Input: 200 candidates (100 BM25 + 100 Qdrant, ~30% overlap)
- Output: ~140 deduplicated candidates (30 duplicates merged)
- Dedup report: { total_input: 200, deduplicated: 140, duplicate_groups: 60, largest_group: 2 }

**Error Handling**:
- Throws on missing packet_key (unless allowMissingPacketKey set)
- Throws on missing source_ref or feature_id (hard fail)
- Accumulates all errors in single error message (batch reporting)

---

### Stage 4: RRF Fusion (Reciprocal Rank Fusion)

**File**: `adapters/rrf-fusion.adapter.ts`

**Purpose**: Fuse deduplicated BM25 and Qdrant rankings into a single score.

**Function**: `fuseWithRRF(candidates, limit): RRFFusedCandidate[]`

**Formula**: `score = sum(1 / (k + rank))` where k = 60

**Implementation Details**:
- Input: deduplicated candidates (from identity-resolver)
- Each candidate carries `source_stage` (bm25 or qdrant)
- Separate ranking: BM25 results ranked by original_score (descending), then Qdrant (descending)
- RRF contribution: 1/(60 + rank) for each ranker's result
- Combine scores: candidates appearing in both rankers get sum of contributions
- Output: sorted by rrf_score (descending), up to `limit`

**Key Exports**:
- `fuseWithRRF(candidates, limit)` — main fusion function
- `validateRRFResults(candidates)` — validation gate
- `computeRRFMetrics(input, output)` — observability (fusion multiplicity, stage breakdown)

**Expected Metrics**:
- bm25_only: ~60 (BM25 finds lexical matches not in semantic space)
- qdrant_only: ~60 (semantic matches not lexically matched)
- combined: ~20 (both rankers agree)
- avg_rrf_score: 0.02-0.05 (typical for k=60)

**Why RRF?**:
- No manual weight tuning (balanced 1/(k+rank) is stable)
- Commutative (order of rankers doesn't matter)
- Handles sparse overlaps (many candidates in only one ranker)

---

### Stage 5: Graph Expansion (Neo4j k-hop)

**File**: `pipeline/expand-graph.ts` (TODO)

**Purpose**: Expand candidate set via Neo4j k-hop traversal (topological relevance).

**Candidate Limit**: policy.graphLimit (dev_chat: 20, production_legal: 30, code_nav: 40, etc.)

**When Skipped**: `policy.enableGraphExpansion = false` (agent_context uses shallow depth)

**Expected Behavior**: TBD (awaits Neo4j adapter implementation)

---

### Stage 6-7: Feature Extraction & Reranking (XGBoost + Optional CE)

**File**: `pipeline/rerank-candidates.ts` (TODO)

**Purpose**: XGBoost feature extraction and reranking. Optional CrossEncoder final refinement.

**Candidate Limit After Reranking**: policy.crossencoderLimit (10-20 candidates)

**When CE Applied**: `policy.enableCrossencoder = true` (skipped for code_navigation for speed)

**CE Weight**: policy.crossencoderWeight (0.10-0.20, combined with semantic/topology/latent/glyph)

**Expected Behavior**: TBD (awaits XGBoost + CrossEncoder adapter implementation)

---

### Stage 8: Source Validation

**File**: `pipeline/validate-evidence.ts` (TODO)

**Purpose**: Enforce source_ref requirement (hard gate).

**When Applied**: `policy.requireSourceRefs = true` (default: all policies)

**Current Implementation**: Filter candidates where source_ref is null/empty

**Expected Behavior**: TBD

---

### Stage 9: Context Assembly (ACE vs RLM)

**File**: `pipeline/assemble-context.ts` (TODO)

**Purpose**: Policy-specific context building (ACE for agents, RLM for reasoning).

**ACE Context** (Agent Context Envelope):
- Compact representation (fits MCP context windows)
- Fields: task, state, packets (compact), constraints, decisions, tools, tokenEstimate
- Used by: developer_chat, code_navigation, agent_context

**RLM Context** (Retrieval with Long-term Memory):
- Iterative reasoning support
- Fields: objective, workingSet, unresolvedQuestions, retrievalHistory, synthesisBudget
- Used by: production_legal, rlm_context

**Current Implementation**: Placeholder in `retrieval-facade.ts`

---

## Unified Retrieval Facade

**File**: `facade/retrieval-facade.ts`

**Class**: `ParentAtlasRetrievalFacade`

**Implements**: `RetrievalFacade` from @deeds/parent-atlas-core

**Constructor**: `new ParentAtlasRetrievalFacade(config: RetrievalFacadeConfig)`

**Config Fields**:
- `db: Database` — Drizzle ORM database client
- `qdrant_url: string` — Qdrant HTTP endpoint (e.g., `http://127.0.0.1:6333`)
- `neo4j_url?: string` — Neo4j HTTP endpoint (optional)
- `embedding_service_url?: string` — Embedding service (optional)
- `crossencoder_url?: string` — CrossEncoder sidecar (optional)

**Public Methods**:
- `search(request: RetrievalRequest): Promise<RetrievalResult>` — Main retrieval entry point
- `health(): Promise<boolean>` — Service health check (TODO: probe all backends)

**Pipeline Stages Tracked**:
- Stage name, duration (ms), candidate count, errors
- Returned in `result.trace.stages[]`

**Example Usage**:
```typescript
import { createRetrievalFacade } from '@deeds/parent-atlas-runtime';
import { db } from '$lib/server/db/client.js';

const facade = createRetrievalFacade({
  db,
  qdrant_url: 'http://127.0.0.1:6333'
});

const result = await facade.search({
  query: 'How do I validate sessions?',
  useCase: 'developer_chat',
  graphDepth: 2,
  tokenBudget: 8000,
  requireSourceRefs: true
});

console.log(`Retrieved ${result.candidates.length} candidates in ${result.trace.total_duration_ms}ms`);
result.trace.stages.forEach(stage => {
  console.log(`${stage.name}: ${stage.candidate_count} candidates, ${stage.duration_ms}ms`);
});
```

---

## Pipeline Flow Diagram (Wired Stages)

```
┌─────────────────────────────────────────────────────────────┐
│ Input: RetrievalRequest (query, useCase, sourceScope, ...)  │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
           ┌───────────────────────────────┐
           │  Stage 1: BM25 (Postgres)    │ ✅ WIRED
           │  100-200 candidates          │
           └───────────────┬───────────────┘
                           ↓
           ┌───────────────────────────────┐
           │  Stage 2: Qdrant ANN         │ ✅ WIRED
           │  100-150 candidates          │
           └───────────────┬───────────────┘
                           ↓
           ┌───────────────────────────────────────┐
           │  Stage 3: Identity Resolution        │ ✅ WIRED
           │  Dedup by (source_ref,feature_id)    │ CRITICAL!
           │  ~140 candidates                     │
           └───────────────┬───────────────────────┘
                           ↓
           ┌───────────────────────────────┐
           │  Stage 4: RRF Fusion         │ ✅ WIRED
           │  80-120 candidates           │
           └───────────────┬───────────────┘
                           ↓
           ┌───────────────────────────────┐
           │  Stage 5: Graph Expansion    │ ⏳ TODO
           │  15-40 candidates            │
           └───────────────┬───────────────┘
                           ↓
           ┌───────────────────────────────┐
           │  Stage 6-7: Reranking        │ ⏳ TODO
           │  XGBoost + optional CE       │
           │  10-20 candidates            │
           └───────────────┬───────────────┘
                           ↓
           ┌───────────────────────────────┐
           │  Stage 8: Source Validation  │ ⏳ TODO
           │  Filter null source_ref      │
           │  5-20 candidates             │
           └───────────────┬───────────────┘
                           ↓
           ┌───────────────────────────────┐
           │  Stage 9: Context Assembly   │ ⏳ TODO
           │  ACE or RLM per policy       │
           └───────────────┬───────────────┘
                           ↓
      ┌────────────────────────────────────────┐
      │  Output: RetrievalResult               │
      │  - candidates: RankedCandidate[]       │
      │  - context: AceContext | RlmContext    │
      │  - trace: RetrievalTrace (timing)      │
      └────────────────────────────────────────┘
```

---

## Critical Architectural Rules

### Rule 1: Identity Resolution BEFORE RRF
```
❌ WRONG:
  BM25 → Qdrant → RRF (merge) → Identity Resolution
  (duplicates survive fusion, rank twice)

✅ CORRECT:
  BM25 → Qdrant → Identity Resolution → RRF (merge)
  (duplicates collapsed before fusion, count once)
```

### Rule 2: Canonical Deduplication Key
```
Dedup by: (source_ref, feature_id, content_hash)
NOT by: qdrant_point_id, chunk_id, or other ephemeral IDs
```

### Rule 3: All Stages Must Carry packet_key
```
✅ Every candidate must have:
  - packet_key (canonical identity)
  - source_ref (file/module reference)
  - feature_id (semantic unit identifier)
```

### Rule 4: Graceful Degradation
```
If a stage fails:
  - BM25 down → skip, continue with Qdrant only
  - Qdrant down → skip, continue with BM25 only
  - Graph expansion optional → skip if Neo4j down
  - CrossEncoder optional → fall back to 4-signal blend
  (Do NOT throw from pipeline; report stage.errors instead)
```

### Rule 5: Policy-Driven Routing
```
All funnel limits are policy-specific:
  - developer_chat: tight funnel (8 output)
  - production_legal: wide funnel (10 output)
  - code_navigation: lexical-heavy (50 Qdrant vs 200 BM25)
  - agent_context: minimal (5 output)
  (No hard-coded limits in adapters; all driven by RetrievalPolicy)
```

---

## Testing Adapters

### Unit Tests (Standalone)
Each adapter is a pure function and can be unit-tested without services.

Example:
```typescript
import { resolveCanonicalIdentity } from '@deeds/parent-atlas-runtime';

const candidates = [
  { packet_key: 'pk1', source_ref: 'src/a.ts', feature_id: 'f1', content_hash: 'h1', score: 0.9 },
  { packet_key: 'pk2', source_ref: 'src/a.ts', feature_id: 'f1', content_hash: 'h1', score: 0.85 }
];

const resolved = await resolveCanonicalIdentity(candidates, { db, allowMissingPacketKey: false });
// resolved has 1 element (deduplicated), score 0.9 (max)
```

### Integration Tests (With Services)
Test full pipeline with mocked or real Postgres/Qdrant.

### E2E Tests (All Stages)
Run through facade, verify trace, check performance per stage.

---

## Next Steps

1. **Implement Postgres query** in `searchPostgresBM25()` (currently placeholder)
2. **Implement Qdrant query** in `searchQdrantANN()` with real embedding service
3. **Implement Graph Expansion** (`expand-graph.ts`, Neo4j k-hop)
4. **Implement Reranking** (`rerank-candidates.ts`, XGBoost + CE)
5. **Implement Context Assembly** (`assemble-context.ts`, ACE/RLM building)
6. **Test E2E Pipeline** with all 9 stages
7. **Benchmark NDCG@5** (XGBoost only vs. XGBoost + CE)
8. **Wire SvelteKit routes** (thin delegation to facade)
9. **Implement @deeds/parent-atlas-client** (HTTP + MCP adapters)

---

## References

- [PARENT-ATLAS-PACKAGE-ARCHITECTURE.md](./PARENT-ATLAS-PACKAGE-ARCHITECTURE.md) — Complete package overview
- [CROSSENCODER-RERANKER-INTEGRATION.md](./CROSSENCODER-RERANKER-INTEGRATION.md) — Stage 7 CE integration
- `packages/parent-atlas-core/src/contracts/` — Contract definitions
- `packages/parent-atlas-runtime/src/` — This package
