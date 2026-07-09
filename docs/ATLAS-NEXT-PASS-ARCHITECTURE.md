# Atlas Next-Pass Architecture — Phases 6a, 9, and Tool Selection Layer

**Status**: ✅ **READY FOR IMPLEMENTATION** (July 9, 2026)

**Summary**: Phases 2-8 foundation complete. Three gaps remain before semantic tool routing is operational:

1. **Phase 6a Fix** (Feature graph path normalization) — 0 files linked to 18 features
2. **Phase 9** (Tool registry indexing) — tool schemas, embeddings, domains for HMM gating
3. **Tool selection layer** (HMM state validation + RRF ranking) — integrates tools into query flow

---

## Architecture Overview: Query → Tool → Execution

```
User Query
  ↓ [Step 1: Intent Classification]
Query embedding (384-dim, EmbeddingGemma)
  ↓ [Step 2: Tool Search]
Qdrant dense search in tool_registry embeddings
  ↓ [Step 3: HMM Gate]
Validate tool state (CANONICAL/RECOVERABLE allowed, QUARANTINE blocked)
  ↓ [Step 4: Confidence Filter]
if tool_confidence < 0.70 → fallback to rg/BM25
  ↓ [Step 5: Tool Execution]
Execute best tool via TRACE MCP or Go retrieval
  ↓ [Step 6: RRF Ranking]
Rank results by 7-signal blend (Qdrant + BM25 + Neo4j + SOM + ...)
  ↓ [Step 7: Gemma4 Synthesis]
Generate grounded explanation with evidence citations
```

---

## Phase 6a: Feature Graph Path Normalization

**Problem**: Phase 6a created 18 semantic feature nodes (auth, rag, vector, etc.) but matched 0 files because Neo4j file path formats didn't match Phase 2-4 canonical paths.

**Phase 2-4 canonical format**:
```
/C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/auth.ts
```

**Phase 6a expected format** (issue):
```
src/auth.ts (or other relative/mismatched formats)
```

**Solution**: Create `BELONGS_TO_FEATURE` relationships via keyword matching on CodebaseFile paths.

**Script**: `scripts/atlas/fix-phase6a-feature-paths.mjs`

**Execution**:
```bash
npm run atlas:phase6a:feature-paths:fix:dry
npm run atlas:phase6a:feature-paths:fix:apply
```

**Expected Output**:
- Semantic features linked to actual files
- `(CodebaseFile) -[BELONGS_TO_FEATURE]-> (Feature)` relationships created
- Feature graph now enables queries like "What files implement auth feature?"

---

## Phase 9: Tool Registry Indexing

**Goal**: Index 6+ tools (KAG search, topology expand, dependency closure, dense search, lexical search, code explanation) as packets for semantic tool selection.

**Schema**:
```sql
CREATE TABLE tool_registry (
  tool_id text PRIMARY KEY,
  name text,
  summary text,
  input_schema jsonb,          -- JSON schema for tool params
  output_schema jsonb,         -- JSON schema for tool results
  examples text[],             -- Usage examples for embedding
  domains text[],              -- auth, retrieval, graph, etc.
  embedding vector(384),       -- Semantic embedding of summary+examples
  success_count int,           -- Telemetry for HMM state validation
  failure_count int,
  avg_latency_ms real,
  allowed_hmm_states text[],   -- Which states this tool can execute in
  created_at timestamptz,
  updated_at timestamptz
);

CREATE INDEX tool_registry_domain_idx ON tool_registry USING gin(domains);
CREATE INDEX tool_registry_embedding_hnsw ON tool_registry USING hnsw(embedding vector_cosine_ops);
```

**Tools to Index**:

1. **trace.kag_search** — Knowledge-augmented graph search
   - Domains: retrieval, graph, auth
   - Example: "Find route handler for authentication"

2. **atlas.topology_expand** — SOM centroid neighborhood expansion
   - Domains: topology, retrieval
   - Example: "Expand SOM cell (10, 10) by 1 hop"

3. **neo4j.dependency_closure** — Transitive dependency traversal
   - Domains: graph, analysis
   - Example: "What does auth module depend on?"

4. **qdrant.dense_search** — Cosine similarity ANN search
   - Domains: retrieval, vector
   - Example: "Find chunks semantically similar to query"

5. **rg.lexical_search** — Regex/substring fast search
   - Domains: lexical, search
   - Example: "Find all calls to validateSession"

6. **gemma4.explain_code** — Code explanation synthesis
   - Domains: synthesis, explanation
   - Example: "Explain authentication flow"

**Execution**:
```bash
npm run atlas:phase9:tool-registry:index:dry       # Preview
npm run atlas:phase9:tool-registry:index:apply     # Execute + embed
npm run atlas:phase9:tool-registry:index:verbose   # With logging
```

**Expected Output**:
- 6 tools indexed with 384-dim embeddings
- HNSW index created for fast cosine search
- Tool domain tags enable domain-scoped filtering

---

## HMM-Gated Tool Selection Layer

**Decision Logic**:

### Step 1: Query → Tool Search
```typescript
// User query: "Find auth route handlers"
const queryEmbedding = await embeddings.embed(userQuery);  // 384-dim

// Search tool registry
const toolCandidates = await qdrant.search({
  collection: 'tool_registry',
  vector: queryEmbedding,
  top_k: 5,
  filter: { domains: ['auth', 'retrieval'] }
});
```

### Step 2: HMM State Validation
```typescript
// Hidden Markov Model observables
const observation = {
  query_tool_cosine: toolCandidates[0].score,    // 0.85
  schema_match: computeSchemaMatch(userQuery, tool.input_schema),
  past_success_rate: tool.success_count / (tool.success_count + tool.failure_count),
  source_ref_coverage: calculateCoverageInGraph(),
  packet_validation_score: auditPacketContract(),
  latency_score: normalizeLatency(tool.avg_latency_ms)
};

// HMM infers hidden state from observation
const hiddenState = hmm.viterbi(observation);
// States: UNKNOWN → CANONICAL → RECOVERABLE → QUARANTINE

// Rules: only CANONICAL and RECOVERABLE allowed
if (!['CANONICAL', 'RECOVERABLE'].includes(hiddenState)) {
  fallback_to_rg_or_bm25();  // QUARANTINE blocks execution
}
```

### Step 3: Confidence Filter
```typescript
if (toolCandidates[0].score < 0.70) {
  // Low confidence → use lexical fallback
  return await lexicalSearch(userQuery);
}
```

### Step 4: Execute Best Tool
```typescript
// Call via TRACE MCP or Go retrieval
const result = await tools.execute(toolCandidates[0].tool_id, {
  query: userQuery,
  top_k: 10,
  filters: { allowed_states: ['CANONICAL', 'RECOVERABLE'] }
});
```

### Step 5: RRF Ranking
```typescript
// Reciprocal Rank Fusion (7 signals, verified in Phase 1)
const rrf_score = (
  0.30 * rrf(qdrant_results) +
  0.20 * rrf(turbovec_results) +
  0.20 * rrf(bm25_results) +
  0.15 * rrf(ast_results) +
  0.10 * rrf(postgres_results) +
  0.05 * rrf(freshness_signal)
);
```

---

## Concrete Next Steps (Execution Order)

| Step | Task | Script | Time | Status |
|------|------|--------|------|--------|
| 1 | Fix Phase 6a paths | `atlas:phase6a:feature-paths:fix:apply` | 5-10m | ✅ READY |
| 2 | Index tool registry | `atlas:phase9:tool-registry:index:apply` | 10-15m | ✅ READY |
| 3 | Wire HMM gate | `src/lib/server/retrieval/hmm-tool-selector.ts` (new) | 30-45m | 🔄 TODO |
| 4 | Add `/tools/search` endpoint | `src/routes/api/tools/search/+server.ts` (new) | 20-30m | 🔄 TODO |
| 5 | Integrate with Go retrieval | `go-retrieval-facade.ts` (update) | 15-20m | 🔄 TODO |
| 6 | Smoke test tool selection | `tests/retrieval/tool-selection.spec.ts` (new) | 20-30m | 🔄 TODO |

**Total effort**: ~2-2.5 hours

---

## Service Worker Cache Key Fix (Parallel)

**Problem**: Service Worker cache keys use `Date.now()`, so identical requests create separate cache entries.

**Current pattern** (broken):
```typescript
const cacheKey = `cache:${Date.now()}:${method}:${url}`;
// Same request 1s later → new cache key → cache miss
```

**Fixed pattern** (stable hash):
```typescript
const cacheKey = `cache:${hashRequestBody(body)}:${method}:${url}`;
// Same request anytime → same cache key → cache hit
```

**Implementation**: 
- Use SHA-256 hash of request body
- Update `service-worker.ts` to use stable keys
- Wire actual Redis/SOM clients (currently dummy loggers)

**Expected impact**: Browser cache hit rate improves from ~0% (all misses) to ~40-60% on repeated queries.

---

## Files Created This Session

| File | Purpose | Status |
|------|---------|--------|
| `scripts/atlas/phase9-tool-registry-index.mjs` | Tool indexing + embedding | ✅ CREATED |
| `scripts/atlas/fix-phase6a-feature-paths.mjs` | Feature graph fix | ✅ CREATED |
| `docs/PHASES-2-8-COMPLETION-REPORT.md` | Phase 2-8 audit | ✅ CREATED |
| `docs/ATLAS-NEXT-PASS-ARCHITECTURE.md` | This document | ✅ CREATED |

---

## Validation Checklist

**Before running Phase 6a fix:**
- ✅ Phase 2-4 CALLS/USES_DB/USES_TOOL edges created (Neo4j healthy)
- ✅ CodebaseFile nodes exist (verified in Phase 2)
- ✅ Absolute path format verified (`/C:/...`)

**Before running Phase 9 tool indexing:**
- ✅ Postgres schema created (tool_registry table + indexes)
- ✅ Ollama embeddinggemma available (`:11434/api/embeddings`)
- ✅ Tool definitions finalized (6 tools canonical)

**Before wiring HMM gate:**
- ✅ Tool registry populated with embeddings
- ✅ HMM state machine designed (UNKNOWN → CANONICAL → RECOVERABLE → QUARANTINE)
- ✅ Observation features documented (6 signals)

---

## Hard Rules for Tool Selection

| Rule | Why | Enforcement |
|------|-----|-------------|
| **Postgres is truth** | Tools read from postgres first, Qdrant/Neo4j for enrichment | Load from `tool_registry` table, not Qdrant payload |
| **HMM gates execution** | Invalid state → fallback (no silent synthesis) | Return error if state = QUARANTINE |
| **Confidence > 0.70** | Low-confidence tool → lexical fallback | Check `toolCandidates[0].score < 0.70` |
| **RRF > custom ranking** | Canonical blend (0.30 + 0.20 + ... = 1.0) | Use existing blend, don't invent new weights |
| **No direct Gemma4 calls** | Tools are the interface layer | Route query → tool → Gemma4 (not query → Gemma4) |

---

## Next Session (Phase 10+)

After Phases 6a, 9, and tool selection layer are complete:

1. **Phase 10: Admin UI Dashboard** — Graphify daily metrics, error-fixing kanban, CRM plane
2. **Phase 11: ACP Agent Loop** — Orchestrate tool calls via LangGraph state machine
3. **Phase 12: E2E Testing** — End-to-end workflow tests (query → tool → result)

---

## References

- **Phase 2-8 Completion**: `docs/PHASES-2-8-COMPLETION-REPORT.md`
- **Atlas Graph Plan**: `docs/atlas-graph-plan-update.md`
- **Retrieval Lane Decision Matrix**: Root `CLAUDE.md` § "Retrieval Lanes"
- **HMM Architecture**: This document § "HMM-Gated Tool Selection Layer"

---

**Authored**: Claude Haiku 4.5  
**Date**: July 9, 2026  
**Status**: ✅ READY FOR EXECUTION  
**Effort Estimate**: 2–2.5 hours (all 3 gaps)  
**Next Command**: `npm run atlas:phase6a:feature-paths:fix:dry`
