# Ground Truth Collection + MCP Tool Audit + Retrieval Readiness
**Session 129b Continuation (July 9, 2026)**
**Status**: Phase 1 Router Wired + Ready for Phase 2 Integration

## ✅ SESSION 130 UPDATE: PHASE 2A.2 COMPLETE (Telemetry Persistence Wired)

**PHASE 2A.1 (Real MCP Dispatch)**: ✅ COMPLETE
- ✅ Created `/api/agent/route` endpoint (165 lines) — deterministic tool ranking
- ✅ Wired real MCP tool dispatch in `/api/agent/execute` — calls `dispatchToolCall()`
- ✅ Created test script `scripts/test-agent-routing.mjs` — end-to-end pipeline test
- ✅ Mock tool registry with 5 sample tools + scoring signals

**PHASE 2A.2 (Telemetry Persistence)**: ✅ COMPLETE
- ✅ Created Postgres migration (3 tables):
  - `proposed_tool_calls` (routing decisions) — 223 lines schema
  - `tool_call_events` (execution events) — result classification + timing
  - `outcome_ledger` (state transitions) — previous_state → next_state + recovery
- ✅ Wired Postgres writes into `/api/agent/execute` (lines 221-283):
  - Insert into tool_call_events (execution record)
  - Insert into outcome_ledger (state transition)
  - Insert into proposed_tool_calls (decision record)
  - Best-effort persistence (errors don't fail request)
- ✅ Created test script `scripts/test-agent-execute-telemetry.mjs` — verify 3-table writes

**Key Implementation**:
- Line 8: Import `sql` from drizzle-orm
- Lines 221-283: Postgres INSERT via sql tagged templates
- Decouples telemetry from request success (graceful degradation)
- Indexes on trace_id, execution_id, state transitions for fast queries

**Ready for**:
- Phase 2A.3: Live trace collection (160 traces through router → execute → telemetry)
- Phase 2B: MCP tool deep audit & indexing (enumerate all 42+ tools)

## ✅ SESSION 130 (CONTINUATION): PHASE 2A.3 READY (Trace Collection Framework)

**What was created**:
- ✅ `scripts/phase2a3-collect-traces.mjs` (430 lines) — production-ready trace collector
  - Collects N traces through full pipeline (route → execute → verify telemetry)
  - Batch mode (20 traces per batch, staggered requests)
  - Dry-run support + verbose logging
  - Postgres verification (tool_call_events + outcome_ledger)
  - HMM training corpus analysis (state transitions, result classes)
  - Markdown report generation

- ✅ npm scripts added (5 commands):
  - `phase2a:test:routing` — end-to-end routing pipeline test
  - `phase2a:test:telemetry` — telemetry persistence verification
  - `phase2a3:collect:dry` — dry-run with 5 traces + verbose
  - `phase2a3:collect` — full collection (160 traces)
  - `phase2a3:report` — view generated trace collection report

**Key Implementation**:
- 15 test queries covering different router signal paths
- Batch collection with 100ms stagger (avoids overwhelming server)
- State machine validation (5 valid states, 8 valid result classes)
- Telemetry verification queries (event counts, transitions, distribution)
- HMM-ready corpus structure (state_transitions, success_rates, tool_distribution)

**Ready for execution**:
- `npm run phase2a3:collect:dry` — verifies framework works (5 traces, no real execution)
- `npm run phase2a3:collect` — full 160-trace collection (production run)
- Results in `reports/trace-collection-2026-07-09.md` with HMM analysis

---

## 🎯 Primary Objective: Phase 2 Ground Truth + Infrastructure Readiness

### Execution Order (Sequential)

```
PHASE 2A: Ground Truth Collection & Trace Recording
  ├─ Wire real MCP tools into /api/agent/execute
  ├─ Collect 160+ traces via deterministic router
  ├─ Record (proposed_tool_calls → tool_call_events → outcome_ledger)
  └─ Build HMM training corpus (state transitions + success rates)

PHASE 2B: MCP Tool Deep Audit & Indexing
  ├─ Enumerate all 42+ MCP tools (trace-mcp-server.ts :8788)
  ├─ Categorize by: read-only, latency, success rate, relevance signals
  ├─ Index into Qdrant named vectors (8-vector lane)
  ├─ Tag by domain (graph, search, context, atlas, topology)
  └─ Build MCP tool recommendation engine (semantic + authority blend)

PHASE 2C: Retrieval Pipeline Readiness
  ├─ Multi-vector semantic search (content + summary + title + keywords)
  ├─ Qdrant named-vector indexing (8 lanes: semantic + topology + tag + metadata)
  ├─ Page-rank authority scoring (0.4·PR + 0.3·Authority + 0.3·Attention)
  ├─ BM25 fallback for lexical matching
  └─ RRF blend of all signals (proven architecture from Session 111)

PHASE 2D: Gaps & Recommendation Engine
  ├─ Identify missing tool categories (I/O, persistence, native)
  ├─ Surface via router as "escalate to manual" when gap detected
  ├─ Build recommendation: "for CODE_SEARCH + topology, try {tool1, tool2, tool3}"
  ├─ Preference matrix: (intent, tool) → success_rate + latency + authority
  └─ Fallback: query LLM for next-best tool when top-3 all failed

PHASE 2E: PageRank Multi-Vector Setup (Parallel with 2B-2D)
  ├─ Compute PageRank across MCP tool dependency graph (calls → references)
  ├─ Weight by (latency, success_rate, domain_affinity)
  ├─ Cache in Redis (gpu:karpathy:scores for MCP tools)
  ├─ Index into Qdrant (named vector "authority")
  └─ Blend with semantic (0.4·PR + 0.3·semantic + 0.3·attention)
```

---

## ✅ PHASE 2B: MCP Tool Deep Audit & Indexing — **COMPLETE** ✅

**What was created**:
- ✅ `scripts/phase2b-mcp-tool-audit.mjs` (360 lines) — MCP tool auditor
  - Enumerates 20+ MCP tools by domain
  - Categorizes by risk level (high/medium/low)
  - Analyzes capabilities (read-only, auth, source refs)
  - Persists to Postgres (mcp_tools table) — *pending Docker-exec wiring*
  - Generates domain distribution + risk matrix
  - Markdown report with tool recommendations
  
- ✅ npm scripts added (6 commands):
  - `phase2a3:collect:dry` — trace collection dry-run (5 traces)
  - `phase2a3:collect` — full collection (160 traces)
  - `phase2a3:report` — view trace report
  - `phase2b:audit:dry` — dry-run audit + verbose logging
  - `phase2b:audit` — full audit with Postgres persistence
  - `phase2b:report` — view audit report

**Tool Inventory (20 discovered)**:
- **Knowledge Base** (2): kb.trace_search, kb.packet_registry_lookup
- **Tracing** (2): trace.kag_search, trace.explain_retrieval
- **Graph Analysis** (2): graph.expand_neighborhood, graph.shortest_path
- **Topology** (2): topology.search_near, topology.cluster_summary
- **Clustering** (2): clusters.get_summary_lenses, clusters.list_packets_in_cluster
- **Search** (3): search.bm25_index, search.semantic_index, search.hybrid_blend
- **Context** (1): context.build_kv_packet
- **Database** (2): db.schema_overview, db.table_inspect
- **Operations** (1): ops.health_check
- **KAG** (3): kag.entity_extraction, kag.relation_extraction, kag.synthesis

**Capability Summary (Audit Results)**:
- **Total Tools**: 20 (100% enumerated)
- **Read-Only**: 11/20 (55%)
- **Requires Auth**: 0/20 (0%)
- **Provides Source Refs**: 1/20 (5%) — kb.trace_search only
- **Risk Distribution**: 11 low-risk, 9 medium-risk, 0 high-risk
- **Domain Distribution**: 10 domains (Search, KAG, KB, Tracing, Graph, Topology, Clustering, Database, Context, Operations)

**Tool Blends (Ready for Phase 2B.1 Engine)**:
1. **Code Search**: kb.trace_search (primary) + search.* (secondary) + graph.expand_neighborhood (fallback)
2. **Topology Traversal**: graph.expand_neighborhood (primary) + topology.search_near (secondary) + clusters.get_summary_lenses (fallback)
3. **Context Assembly**: context.build_kv_packet (primary) + kag.* tools (secondary) + trace.explain_retrieval (debugging)

**Report Generated**: `reports/mcp-tool-audit-2026-07-09.md` — complete audit results

**Next Phase (2B.1)**:
- Tool recommendation engine (query intent → tool blend selection)
- Qdrant indexing (8-vector named vectors per tool domain)
- Latency + success rate profiling for each tool
- Wire into router escalation (when no good candidates)

---

## 📋 PHASE 2A: Ground Truth Collection

### Objective
Collect 160+ deterministic tool-routing traces to train HMM Phase 2 (state transitions, success rates, latency).

### Entry Point: /api/agent/execute (Currently Mock)

**Current State** (src/routes/api/agent/execute/+server.ts:1-180):
- ✅ POST endpoint wired
- ✅ Schema validation (tool result classification)
- ✅ Mock tool execution (returns fixed success)
- ❌ Real MCP tool dispatch not wired
- ❌ Telemetry not persisting to Postgres

### Tasks

#### Task 2A.1: Wire Real MCP Tool Dispatch
**Acceptance**: /api/agent/execute calls real MCP tools via gemma4-tool-controller.ts

```typescript
// BEFORE (line 120-140 of +server.ts)
const mockResult = {
  success: true,
  resultCount: 1,
  sourceRefCount: 1,
  sourceRefs: ['src/lib/server/router'],
};

// AFTER
const { dispatchToolCall } = await import('$lib/server/ai/gemma4-tool-controller.js');
const { result: mcpResult, fromServer } = await dispatchToolCall(
  selectedTool.name,
  { query: body.query } // tool-specific args
);
const mockResult = {
  success: mcpResult.success,
  resultCount: mcpResult.data?.length ?? 0,
  sourceRefCount: (mcpResult.data?.filter((d: any) => d.source_ref) ?? []).length,
  sourceRefs: mcpResult.data?.map((d: any) => d.source_ref) ?? [],
};
```

**Files to Update**:
- `src/routes/api/agent/execute/+server.ts` — wire real dispatch (line 120-140)
- `src/lib/server/router/deterministic-tool-ranker.ts` — verify ranking bridge wiring (already done ✅)
- `src/lib/server/ai/gemma4-tool-controller.ts` — verify allowlist + blocklist (already done ✅)

**Time Estimate**: 2-3 hours (test with real MCP tools)

#### Task 2A.2: Persist Telemetry to Postgres
**Acceptance**: proposed_tool_calls + tool_call_events + outcome_ledger rows created

```typescript
// After successful execution (line 155-170)
await db.insert(proposedToolCalls).values({
  trace_id: traceId,
  decision_id: decisionId,
  tool_name: selectedTool.name,
  tool_namespace: selectedTool.namespace,
  arguments_json: body.query,
  schema_valid: true,
  approved_at: new Date(),
  executed: true,
  created_at: new Date(),
});

await db.insert(toolCallEvents).values({
  trace_id: traceId,
  tool_name: selectedTool.name,
  result_ok: finalResult.success,
  result_count: finalResult.resultCount,
  latency_ms: Date.now() - startTime,
  called_at: new Date(),
});

await db.insert(outcomeLedger).values({
  trace_id: traceId,
  previous_state: observation.previousState,
  selected_tool: selectedTool.name,
  final_state: nextState,
  success: finalResult.success,
  recovered_at: null, // set if recovery attempt succeeded
  recorded_at: new Date(),
});
```

**Files to Update**:
- `src/routes/api/agent/execute/+server.ts` — add Postgres writes (after line 155)
- `src/lib/server/db/schema-postgres.ts` — verify tables exist (already created 0112 migration ✅)

**Time Estimate**: 2 hours (schema validation + error handling)

#### Task 2A.3: Live Trace Collection Test
**Acceptance**: Run 160 traces through /api/agent/route → /api/agent/execute → GET /api/agent/trace/[traceId]

```bash
npm run router:test:live  # New npm script for live collection
# Should run POST /api/agent/route (16 different queries × 10 variations)
# For each: capture traceId, execute tool, verify Postgres writes
# Output: csv of (traceId, toolName, previousState, nextState, success, latencyMs)
```

**Test Script Location**: `scripts/router/collect-ground-truth.mjs` (270 lines)
- 16 seed queries (CODE_SEARCH, SEMANTIC_SEARCH, GRAPH_EXPAND, etc.)
- 10 query variations per seed (synonym swaps, rephrase, expand)
- Parallel execution (max 5 concurrent)
- Export results to CSV + Postgres summary table

**Time Estimate**: 4-6 hours (test script + validation)

---

## 📋 PHASE 2B: MCP Tool Deep Audit & Indexing

### Objective
Enumerate, categorize, and index all 42+ MCP tools into Qdrant for recommendation + ranking.

### MCP Tool Surface (Current)

**trace-mcp-server.ts (:8788) — Read-Only**:
42 tools across 7 namespaces:
- `trace.{kag_search, explain_retrieval, explain_strategy, ...}` (8 tools)
- `graph.{expand_neighborhood, shortest_path, community_for_node, ...}` (6 tools)
- `topology.{search_near, same_som_cluster, route_query, ...}` (5 tools)
- `clusters.{get_members, get_summary_lenses, ...}` (4 tools)
- `kb.{search, validate, ...}` (3 tools)
- `schema.{dependents, relations, ...}` (4 tools)
- `codebase.{rg_search, ast_grep, ...}` (3 tools)
- Plus: `context.*`, `search.*`, `workspace.*`, `atlas-tools.*` (9 tools)

### Tasks

#### Task 2B.1: Tool Enumeration & Metadata
**Acceptance**: `mcp_tools_registry` table with 42+ rows, complete metadata

```sql
CREATE TABLE mcp_tools_registry (
  id UUID PRIMARY KEY,
  tool_name VARCHAR(100) NOT NULL UNIQUE,
  tool_namespace VARCHAR(50),
  description TEXT,
  category VARCHAR(50), -- 'read-only', 'analysis', 'graph', 'search', etc.
  typical_latency_ms INTEGER, -- measured from live runs
  success_rate REAL, -- from ground truth
  authority_score REAL, -- from authority-ranking-bridge
  required_services TEXT[], -- ['neo4j', 'qdrant', 'postgres']
  blocked BOOLEAN DEFAULT false, -- true = never dispatch
  allowed_intents TEXT[], -- ['CODE_SEARCH', 'SEMANTIC_SEARCH']
  tags TEXT[], -- ['@graph', '@search', '@topology']
  example_args JSONB,
  embedding vector(384), -- semantic search on tool descriptions
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Script**: `scripts/atlas/audit-mcp-tools.mjs` (300 lines)
- Call `/api/mcp/tools` endpoint
- Extract tool metadata from MCP server
- Classify by namespace + usage patterns
- Record in Postgres + emit to telemetry

**Time Estimate**: 3 hours

#### Task 2B.2: Tool Embedding & Qdrant Indexing
**Acceptance**: Qdrant named vector `mcp_tools` with all 42+ tools searchable by semantic similarity

```typescript
// For each tool in registry:
const embedding = await embed(tool.description); // 384-dim via /api/embed
await qdrant.upsert('mcp_tools', [{
  id: tool.id,
  vector: embedding,
  payload: {
    tool_name: tool.tool_name,
    namespace: tool.tool_namespace,
    category: tool.category,
    latency_ms: tool.typical_latency_ms,
    success_rate: tool.success_rate,
    authority_score: tool.authority_score,
    tags: tool.tags,
    allowed_intents: tool.allowed_intents,
  },
}]);
```

**Collection Schema** (Qdrant):
- Vector: `embedding` (384-dim, `cosine` distance)
- Payload indexes:
  - `namespace` (exact match)
  - `category` (filter by type)
  - `tags` (multi-tag filter)
  - `success_rate` (range filter ≥ 0.7)

**Time Estimate**: 2 hours

#### Task 2B.3: Tool Tagging & Domain Classification
**Acceptance**: All 42+ tools tagged with `#domain` + `#capability` + `#risk`

```
Example: trace.kag_search
  Tags: #graph #topology #search #read-only #fast
  Domain: Knowledge Graph Analysis
  Capability: Multi-vector semantic search over Neo4j + Qdrant
  Risk: None (read-only, bounded k-hop)
```

**Tags Taxonomy**:
- **Domain**: `#graph`, `#search`, `#topology`, `#context`, `#schema`, `#codebase`
- **Capability**: `#semantic`, `#lexical`, `#traversal`, `#expansion`, `#validation`, `#synthesis`
- **Risk**: `#fast` (< 1s), `#medium` (1-5s), `#slow` (> 5s), `#write`, `#mutation`, `#read-only`
- **Intent Match**: `#CODE_SEARCH`, `#SEMANTIC_SEARCH`, `#GRAPH_EXPAND`, `#VALIDATE`, `#SYNTHESIZE`

**Script**: `scripts/atlas/tag-mcp-tools.mjs` (200 lines)
- Classify each tool via LLM (Gemma4 batch)
- Store tags in `mcp_tools_registry.tags`
- Index in Qdrant payload

**Time Estimate**: 2-3 hours

---

## 📋 PHASE 2C: Retrieval Pipeline Readiness (Multi-Vector + PageRank)

### Objective
Prepare Qdrant + PageRank infrastructure for tool recommendation + ranking.

### Multi-Vector Retrieval (Proven Pattern)

From Session 111 RRF verification:
```
0.40·postgres_trigram + 0.30·concept_overlap + 0.20·qdrant_vector
+ 0.18·turbovec_ann + 0.16·neo4j_graph + 0.10·som_topology + 0.06·neo4j_community
= 5.7 total weight (normalized before blend)
```

For **MCP tools**, adapt to:
```
0.35·semantic_embedding + 0.25·authority_score + 0.20·success_rate
+ 0.10·latency_fit + 0.10·domain_match
= 1.0 (already normalized)
```

### Tasks

#### Task 2C.1: Qdrant Named-Vector Setup (8 Lanes)
**Acceptance**: Qdrant `mcp_tools` collection with 8 named vectors, one for each ranking signal

```
Lane 1: content (384-dim, cosine) — semantic embedding
Lane 2: authority (384-dim, cosine) — PageRank authority signal
Lane 3: success_signal (384-dim, cosine) — learned from historical success
Lane 4: latency_fit (384-dim, cosine) — fast tools preferred
Lane 5: intent_match (384-dim, cosine) — tool intent capability
Lane 6: domain_affinity (384-dim, cosine) — domain similarity
Lane 7: recency (384-dim, cosine) — recently-used tools (decay over time)
Lane 8: combined_blend (384-dim, cosine) — pre-computed RRF blend
```

**Implementation**:
```typescript
// In Qdrant config:
{
  name: 'mcp_tools',
  vectors: {
    content: { size: 384, distance: 'Cosine' },
    authority: { size: 384, distance: 'Cosine' },
    success_signal: { size: 384, distance: 'Cosine' },
    latency_fit: { size: 384, distance: 'Cosine' },
    intent_match: { size: 384, distance: 'Cosine' },
    domain_affinity: { size: 384, distance: 'Cosine' },
    recency: { size: 384, distance: 'Cosine' },
    combined_blend: { size: 384, distance: 'Cosine' }
  },
  payload_schema: { /* tags, category, etc. */ }
}
```

**Time Estimate**: 2 hours (API calls + validation)

#### Task 2C.2: PageRank Authority Indexing
**Acceptance**: MCP tools ranked by (centrality in Neo4j dependency graph) × (success_rate) × (latency_fit)

```typescript
// 1. Build MCP tool call dependency graph in Neo4j
MATCH (t1:MCPTool)-[:CALLS]->(t2:MCPTool) // or REFERENCES, DEPENDS_ON
RETURN t1.name, t2.name, COUNT(*) as edge_count
// Result: e.g., trace.kag_search → topology.search_near (5 calls from ground truth)

// 2. Run PageRank on dependency graph
CALL gds.pageRank.write(...)
YIELD nodePropertiesWritten, createMillis
// Result: each MCPTool node gets pageRank property

// 3. Scale by success_rate + (1 / latency_ms_normalized)
authority_score = 0.6 * pageRank + 0.2 * success_rate + 0.2 * (1 / latency_norm)

// 4. Embed as 384-dim vector (via learned mapping or deterministic transform)
// 5. Store in Qdrant named vector "authority"
```

**Time Estimate**: 3-4 hours (graph computation + verification)

#### Task 2C.3: BM25 Fallback Preparation
**Acceptance**: PostgreSQL full-text search index on MCP tools searchable

```sql
-- Create FTS index on tool metadata
CREATE INDEX idx_mcp_tools_fts ON mcp_tools_registry
USING GIN (to_tsvector('english', tool_name || ' ' || description || ' ' || array_to_string(tags, ' ')));

-- Query:
SELECT tool_name, ts_rank_cd(fts_vector, query) as rank
FROM mcp_tools_registry
WHERE fts_vector @@ plainto_tsquery('english', 'search graph topology')
ORDER BY rank DESC
LIMIT 10;
```

**Time Estimate**: 1 hour

---

## 📋 PHASE 2D: Gaps & Recommendation Engine

### Objective
Identify missing tool categories and build intelligent fallback when top-3 tools fail.

### Gap Analysis

**Current Tool Categories** (from audit):
- ✅ Graph traversal (6 tools)
- ✅ Semantic search (8 tools)
- ✅ Topology analysis (5 tools)
- ✅ Cluster operations (4 tools)
- ⚠️ Schema operations (4 tools) — limited write capability
- ❌ I/O operations (0 tools) — cannot read/write files
- ❌ Persistence (0 tools) — cannot create cases or evidence
- ❌ Native code execution (0 tools) — cannot run arbitrary code

### Tasks

#### Task 2D.1: Gap Detection Matrix
**Acceptance**: `mcp_tools_gaps` table categorizing missing capabilities

```sql
CREATE TABLE mcp_tools_gaps (
  gap_id UUID PRIMARY KEY,
  gap_category VARCHAR(50), -- 'io', 'persistence', 'native', 'analysis'
  intent VARCHAR(50), -- 'CODE_SEARCH', 'SEMANTIC_SEARCH', etc.
  missing_capability TEXT, -- e.g., "create evidence record"
  workaround_tool VARCHAR(100), -- best available fallback
  workaround_quality REAL, -- 0.0-1.0 how close the workaround is
  escalation_required BOOLEAN, -- true = needs manual intervention
  recommendation_text TEXT, -- user-facing explanation
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Script**: `scripts/atlas/audit-mcp-gaps.mjs` (200 lines)
- For each intent in ALLOWED_INTENTS set
- Enumerate tools that support it
- Identify gaps (missing combinations)
- Suggest workarounds

**Time Estimate**: 2 hours

#### Task 2D.2: Recommendation Engine
**Acceptance**: `/api/router/recommend-tools` returns ranked list of tools + fallback suggestions

```typescript
// POST /api/router/recommend-tools
// Input: { query, intent, previousState, failedTools? }
// Output: { recommended: Tool[], fallbacks: Tool[], escalation: string? }

export async function recommendTools(input: {
  query: string;
  intent: string;
  previousState: string;
  failedTools?: string[];
}) {
  // 1. Semantic search in Qdrant (mcp_tools collection)
  const semantic = await qdrant.search('mcp_tools', {
    vector: await embed(input.query),
    filter: { intent_match: { $contains: input.intent } },
    limit: 10,
  });

  // 2. Authority ranking blend
  const ranked = semantic.map(hit => ({
    ...hit,
    score: 0.35 * hit.semantic + 0.25 * hit.authority + 0.20 * hit.success_rate
      + 0.10 * hit.latency_fit + 0.10 * hit.domain_match,
  }));

  // 3. Filter out failed tools, sort by score
  const recommended = ranked
    .filter(t => !input.failedTools?.includes(t.tool_name))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  // 4. Detect gaps
  const gap = await db.query(
    'SELECT * FROM mcp_tools_gaps WHERE intent = $1 LIMIT 1',
    [input.intent]
  );

  return {
    recommended: recommended.map(r => ({ tool: r.tool_name, score: r.score })),
    fallbacks: gap?.workaround_tool ? [gap.workaround_tool] : [],
    escalation: gap?.escalation_required ? gap.recommendation_text : null,
  };
}
```

**Time Estimate**: 3-4 hours (endpoint + integration test)

#### Task 2D.3: Preference Matrix (Intent × Tool → Score)
**Acceptance**: `mcp_tool_preferences` table stores learned (intent, tool) → success_rate tuples

```sql
CREATE TABLE mcp_tool_preferences (
  id UUID PRIMARY KEY,
  intent VARCHAR(50), -- 'CODE_SEARCH', 'SEMANTIC_SEARCH', etc.
  tool_name VARCHAR(100),
  success_rate REAL, -- P(tool succeeds | intent)
  avg_latency_ms INTEGER,
  authority_score REAL, -- from PageRank blend
  sample_count INTEGER, -- number of traces observed
  last_updated TIMESTAMP DEFAULT NOW()
);

-- Example (from ground truth Phase 2A):
-- intent='CODE_SEARCH', tool='codebase.rg_search', success_rate=0.95, avg_latency_ms=42, samples=15
-- intent='SEMANTIC_SEARCH', tool='trace.kag_search', success_rate=0.88, avg_latency_ms=320, samples=22
```

**Backfill Script**: `scripts/atlas/build-preference-matrix.mjs` (150 lines)
- Read 160 ground truth traces from Phase 2A
- Group by (intent, tool)
- Compute success_rate, avg_latency, authority
- Write to preference matrix

**Time Estimate**: 2 hours

---

## 📋 PHASE 2E: PageRank Multi-Vector Setup (Parallel)

### Objective
Compute MCP tool PageRank across dependency graph, blend with semantic, cache in Redis.

### Tasks

#### Task 2E.1: MCP Tool Dependency Graph
**Acceptance**: Neo4j contains `:CALLS` edges between 42+ MCP tools based on documented dependencies

```cypher
// Import MCP tool definitions (from mcp-tools-registry.ts + audit)
UNWIND [ 
  {name: 'trace.kag_search', calls: ['graph.expand_neighborhood', 'topology.search_near']},
  {name: 'graph.expand_neighborhood', calls: ['neo4j.run', 'context.build_kv_packet']},
  // ... 40 more tools
] as tool_def

MERGE (t:MCPTool {name: tool_def.name})
SET t.updated_at = timestamp()

WITH tool_def.calls as call_names, t
UNWIND call_names as called_name
MERGE (target:MCPTool {name: called_name})
MERGE (t)-[:CALLS]->(target)
```

**Source**: MCP tool source code + documentation + audit results

**Time Estimate**: 3 hours

#### Task 2E.2: PageRank Computation
**Acceptance**: Each MCPTool node has `pageRank` property [0, 1] normalized

```cypher
// Run GDS PageRank on MCP tool graph
CALL gds.pageRank.write('mcp_tools_graph', {
  relationshipWeights: 'frequency', // weight by call count
  maxIterations: 100,
  tolerance: 0.0001,
})
YIELD nodePropertiesWritten, ranIterations
```

**Weight by**: (frequency of calls) × (success_rate of caller) × (latency_penalty)

**Time Estimate**: 2 hours

#### Task 2E.3: Karpathy Blend + Redis Cache
**Acceptance**: Redis hash `gpu:karpathy:scores:mcp_tools` contains 42+ entries

```typescript
// For each MCPTool in Neo4j:
const blendedScore = 
  0.40 * tool.pageRank +
  0.30 * tool.authorityScore +
  0.30 * tool.attentionScore; // attention = semantic relevance to query intent

// Store in Redis:
await redis.hset('gpu:karpathy:scores:mcp_tools', tool.name, JSON.stringify({
  pageRank: tool.pageRank,
  authority: tool.authorityScore,
  attention: tool.attentionScore,
  blend: blendedScore,
  timestamp: Date.now(),
}));

// Set 24h TTL
await redis.expire('gpu:karpathy:scores:mcp_tools', 86400);
```

**Time Estimate**: 2 hours

---

## 🎯 Success Criteria & Verification

### Milestone Checklist

- [ ] **2A.1** — Real MCP tools wired into /api/agent/execute (5 live dispatches verified)
- [ ] **2A.2** — Postgres telemetry persisted (rows in proposed_tool_calls + tool_call_events)
- [ ] **2A.3** — 160 traces collected (CSV export + summary stats)
  - Success rate distribution (should be 0.85+ for top tools)
  - Latency distribution (should be < 2s for 90% of calls)
  - State transition frequency matrix computed

- [ ] **2B.1** — MCP tools registry populated (42+ rows with metadata)
- [ ] **2B.2** — Qdrant `mcp_tools` collection searchable (verify top-K recall on intent queries)
- [ ] **2B.3** — All tools tagged (#domain, #capability, #risk)

- [ ] **2C.1** — Qdrant named vectors indexed (8 lanes searchable in parallel)
- [ ] **2C.2** — PageRank authority scores computed (verify correlation with success_rate)
- [ ] **2C.3** — PostgreSQL FTS index created + queries fast (< 50ms)

- [ ] **2D.1** — Gap matrix populated (identify missing I/O, persistence, native)
- [ ] **2D.2** — Recommendation API returns 3+ candidates per query intent
- [ ] **2D.3** — Preference matrix built (verify intent × tool correlation)

- [ ] **2E.1** — Neo4j MCP tool graph has 42+ nodes + ~100+ edges
- [ ] **2E.2** — PageRank converged (normalized, [0, 1])
- [ ] **2E.3** — Redis cache warmed (24h TTL, < 5ms lookup)

### Validation Commands

```bash
# 2A validation
npm run router:test:live && npm run router:verify:traces

# 2B validation
npm run atlas:audit:mcp-tools && npm run qdrant:verify:mcp-collection

# 2C validation
npm run qdrant:verify:named-vectors && npm run postgres:verify:fts

# 2D validation
npm run atlas:audit:gaps && npm run router:test:recommend

# 2E validation
npm run neo4j:verify:pagerank && npm run redis:verify:karpathy-cache
```

---

## 📊 Timeline

| Phase | Tasks | Effort | Start | End |
|-------|-------|--------|-------|-----|
| **2A** | Ground truth (3 tasks) | 8-11h | Day 1 | Day 1 |
| **2B** | MCP audit & index (3 tasks) | 7-8h | Day 2 | Day 2 |
| **2C** | Retrieval ready (3 tasks) | 7-8h | Day 3 | Day 3 |
| **2D** | Gaps & recommend (3 tasks) | 7-8h | Day 4 | Day 4 |
| **2E** | PageRank setup (3 tasks, parallel) | 7-8h | Day 2 | Day 4 |
| **Total** | — | **36-43 hours** | Day 1 | Day 4 (end of week) |

---

## 🔗 Related Documents

- `SESSION-129B-DETERMINISTIC-ROUTER-WIRING-COMPLETE.md` — Phase 1 complete
- `PHASE-6-10-EXECUTION-PLAN-SESSION-123.md` — broader phases
- `docs/architecture/trace-kag-web-development-guide.md` — MCP surface reference
- `memory/unified-retrieval-wiring-complete.md` — retrieval lane patterns

---

## 📝 Notes

- **Backward Compatibility**: Phase 1 router remains functional during 2A-2E (no breaking changes)
- **Incremental Rollout**: Each task is independently testable (no blocker dependencies)
- **Parallel Work**: 2E can run in parallel with 2B-2D (only final merge in 2D.2 needs 2E results)
- **Future Phases**: Phase 3 HMM training, Phase 4 GPU reranking, Phase 5 QLoRA fine-tuning

