# Atlas Phases 3-4-5: Building the Supervision Layer

**Date**: May 29, 2026  
**Scope**: Topology extraction + behavioral graph wiring + invalidation tracking  
**Estimated Duration**: 4-5 hours (3 parallel phases)  
**Outcome**: Complete behavioral observation infrastructure ready for LoRA training

---

## Overview: Why Supervision Matters

### Current State (Retrieval-Only)
```
Gemma4
  ├─ "What's similar to this query?"
  │   └─ Qdrant semantic search
  └─ "Which tool should I call?"
      └─ Hand-written prompts (guessing)
```

### After Phase 3-5 (Supervision-Aware)
```
Gemma4
  ├─ "What's similar?" → Qdrant [FAST]
  ├─ "Which tool should I call?" → Observation history [TRAINED]
  └─ "Is this decision stale?" → Mutation ledger [INVALIDATION-AWARE]
```

**The difference**: Instead of Gemma4 guessing which tool is best, it learns from recorded outcomes (did this tool selection actually help the user? how often was this retrieval re-selected?).

---

## Phase 3: Topology Extraction (USES_DB + USES_TOOL)

### Input
- 3,000+ TypeScript source files
- Drizzle ORM imports + queries
- MCP tool invocations
- API endpoint definitions

### Output
```
Neo4j Edges:
  ├── USES_DB: (File) → (Table) [with operation: SELECT/INSERT/UPDATE/DELETE]
  ├── USES_TOOL: (File) → (Tool) [with endpoint path]
  └── Combined with existing CALLS + IMPORT edges
```

### How to Run

```bash
# Extract database usage
node scripts/atlas/extract-db-usage.mjs

# Validate quality
node scripts/atlas/summarize-db-usage-graph.mjs

# Extract tool usage (API routes)
node scripts/atlas/extract-tool-usage.mjs

# Validate quality
node scripts/atlas/summarize-tool-usage-graph.mjs

# Expected output:
# - 500-800 USES_DB edges
# - 200-400 USES_TOOL edges
# - >30 unique tables
# - >20 unique tools/endpoints
```

### Quality Gates (Same as CALLS validation)
- ✅ Active-source edges >50%
- ✅ Framework noise <50%
- ✅ sourceRef completeness >90%

---

## Phase 4: Runtime Intent Graph (RESOLVES_INTENT edges)

### Purpose
Map the connection between **intent classifications** and **topology paths**.

When Gemma4 classifies intent as `"search_evidence"`, the intent graph says:
- "This intent resolves to feature: `evidence_search`"
- "Feature lives in files: `[search-orchestrator.ts, qdrant-manager.ts]`"
- "Those files call tools: `[find_similar, search_qdrant]`"
- "Those tools query tables: `[evidence_vectors]`"

### Implementation

**File**: `scripts/atlas/build-intent-graph.mjs`

```typescript
// Pseudocode: Map intent → feature → file → tool → table
const intentGraph = {
  "search_evidence": {
    feature: "evidence_search",
    files: ["src/lib/server/rag-pipeline.ts", "src/lib/server/retrieval/..."],
    tools: ["find_similar", "search_qdrant"],
    tables: ["evidence_vectors"],
    routes: ["/api/evidence/search"]
  },
  "search_legal_corpus": {
    feature: "legal_search",
    files: ["src/lib/server/legal-search/..."],
    tools: ["trace_database", "hybrid_search"],
    tables: ["legal_documents", "statutes"]
  },
  "classify_intent": {
    feature: "intent_classification",
    files: ["src/lib/server/ai/intent-classifier.ts"],
    tools: ["classify_intent"],
    tables: [] // No direct DB query
  }
};

// Build Neo4j edges:
// (Intent)-[:RESOLVES_INTENT]->(Feature)
// (Feature)-[:CONTAINS]->(File)
// (File)-[:USES_TOOL]->(Tool)
// (Tool)-[:QUERIES_TABLE]->(Table)
```

### Neo4j Schema Extension
```cypher
CREATE CONSTRAINT intent_unique ON (i:Intent) ASSERT i.name IS UNIQUE;
CREATE CONSTRAINT feature_unique ON (f:Feature) ASSERT f.name IS UNIQUE;

-- New edge types:
(intent:Intent)-[:RESOLVES_INTENT {confidence: 0.85}]->(feature:Feature)
(feature:Feature)-[:CONTAINS]->(file:CodebaseFile)
(file:CodebaseFile)-[:USES_TOOL]->(tool:Tool)
(tool:Tool)-[:QUERIES_TABLE]->(table:DBTable)
```

### Quality Validation

```bash
node scripts/atlas/validate-intent-graph.mjs

# Checks:
# - All intents resolve to features
# - All features contain at least one file
# - All files have at least one CALLS or USES_DB edge
# - No orphan intents/features
```

---

## Phase 5: Graph Mutation Ledger (INVALIDATED_BY edges)

### Purpose
Track **when edges become stale** so inference can decide whether to trust an old baseline.

Example:
```
2026-05-30 14:00:00 — Schema change: evidence_vectors table modified
  ├─ INVALIDATES: all USES_DB edges touching evidence_vectors
  ├─ INVALIDATES: all glyphs with sourceRef in evidence query paths
  ├─ RECOMPUTE_AT: 2026-05-31 00:00:00
  └─ REASON: "Column evidence.metadata added; embeddings may have changed"
```

### Implementation

**File**: `scripts/atlas/track-graph-mutations.mjs`

```typescript
// Schema change detected (git hook or manual)
const mutation = {
  id: uuid(),
  type: "schema_change",
  affected_table: "evidence_vectors",
  change_details: { column: "metadata", operation: "ADD" },
  timestamp: now(),
  discovered_at: "post_migration",
  invalidates_edge_class: "USES_DB",
  invalidates_glyphs: true,
  recompute_at: addHours(now(), 24),
  reason: "Column metadata added; embeddings may have changed"
};

// Store in:
// 1. DuckDB mutation_ledger table
// 2. Neo4j (Edge)-[:INVALIDATED_BY {reason, expires_at}]->(Mutation)
// 3. Redis (mutation:latest key for fast checks)
```

### DuckDB Ledger Schema

```sql
CREATE TABLE mutation_ledger (
  id UUID PRIMARY KEY,
  type STRING,  -- schema_change, code_refactor, embeddings_updated, etc.
  affected_entity STRING,  -- table name, function name, etc.
  change_details JSONB,
  timestamp TIMESTAMP,
  discovered_at STRING,  -- post_migration, git_hook, manual, etc.
  invalidates_edge_class STRING,  -- USES_DB, CALLS, RESOLVES_INTENT, etc.
  invalidates_glyphs BOOLEAN,
  recompute_at TIMESTAMP,
  reason TEXT,
  status STRING  -- pending, recomputed, expired
);

CREATE INDEX idx_mutation_invalidates 
  ON mutation_ledger(invalidates_edge_class, status);
```

### Runtime Invalidation Check

```typescript
// When Gemma4 is about to use a cached decision:
const isStale = await checkInvalidations({
  sourceRef: "context-assembler.ts:145",
  edgeClass: "USES_DB",
  lastComputedAt: glyph.reward_computed_at
});

if (isStale) {
  // Recompute reward baseline or skip cached decision
  glyph.reward = await recomputeReward(sourceRef);
} else {
  // Use cached reward
  glyph.reward = glyph.cached_reward;
}
```

---

## Data Flow: How It All Connects

```
Code Changes (git commit)
       ↓
AST Extraction (Phase 3)
  ├─ CALLS edges (existing)
  ├─ USES_DB edges (new)
  └─ USES_TOOL edges (new)
       ↓
Neo4j Sync
  ├─ Topology layer: File → Table, File → Tool
  ├─ Behavioral layer: Intent → Feature → File → Tool
  └─ Indices: (source_file, table), (intent, feature)
       ↓
Intent Graph Build (Phase 4)
  └─ RESOLVES_INTENT edges: Intent → Feature
  └─ Validation: all intents covered
       ↓
Mutation Ledger (Phase 5)
  ├─ Track schema changes
  ├─ Mark stale edges
  └─ Recompute baseline signals
       ↓
Observation Stream (Phase 6+)
  ├─ Record tool selections
  ├─ Record outcomes
  └─ Update reward history
       ↓
Synthetic Trace Simulator (Phase 6)
  ├─ Uses topology to generate valid traces
  └─ Computes baseline reward scores
       ↓
Glyph Reward Computation (Phase 7)
  ├─ Aggregates actual outcomes
  └─ Updates Redis reward cache
       ↓
LoRA Training (Phase 9)
  └─ Uses baseline + actual outcomes as supervision signal
```

---

## Execution Order

### Immediate (Next 4-5 hours)

1. **Phase 3: Extraction** (1h)
   ```bash
   node scripts/atlas/extract-db-usage.mjs
   node scripts/atlas/extract-tool-usage.mjs
   node scripts/atlas/summarize-db-usage-graph.mjs
   node scripts/atlas/summarize-tool-usage-graph.mjs
   ```

2. **Phase 3: Neo4j Ingestion** (1-2h)
   ```bash
   node scripts/atlas/ingest-calls-db-tool-to-neo4j.mjs --dry-run
   node scripts/atlas/ingest-calls-db-tool-to-neo4j.mjs --write
   ```

3. **Phase 4: Intent Graph** (1h)
   ```bash
   node scripts/atlas/build-intent-graph.mjs
   node scripts/atlas/validate-intent-graph.mjs
   ```

4. **Phase 5: Mutation Ledger** (1h)
   ```bash
   node scripts/atlas/track-graph-mutations.mjs --init
   node scripts/atlas/validate-mutation-ledger.mjs
   ```

### Validation Gates

After each phase, run:

```bash
# Phase 3 validation
npx duckdb < scripts/atlas/audit-topology-coverage.sql

# Phase 4 validation
npx duckdb < scripts/atlas/audit-intent-coverage.sql

# Phase 5 validation
npx duckdb < scripts/atlas/audit-stale-edges.sql
```

---

## DuckDB Audit Queries (Copy-Paste Ready)

```sql
-- Phase 3: Topology coverage
SELECT 
  'USES_DB' as edge_type, count(*) as total,
  count(distinct source_file) as files,
  count(distinct table) as tables
FROM db_usage_edges
UNION ALL
SELECT 
  'USES_TOOL' as edge_type, count(*),
  count(distinct source_file), count(distinct tool)
FROM tool_usage_edges;

-- Phase 4: Intent coverage gaps
SELECT intent, count(*) as resolves_to
FROM intent_graph
GROUP BY intent
HAVING count(*) = 0;  -- Unresolved intents

-- Phase 5: Stale edges
SELECT 
  edge_class,
  count(*) as total,
  count(*) FILTER (WHERE invalidated_by IS NOT NULL) as stale,
  count(*) FILTER (WHERE invalidated_at > now()) as active_stale
FROM topology_edges
GROUP BY edge_class;
```

---

## Files to Create/Modify

| File | Type | Purpose |
|------|------|---------|
| `scripts/atlas/extract-db-usage.mjs` | NEW | Phase 3 extraction |
| `scripts/atlas/extract-tool-usage.mjs` | NEW | Phase 3 extraction |
| `scripts/atlas/build-intent-graph.mjs` | NEW | Phase 4 wiring |
| `scripts/atlas/track-graph-mutations.mjs` | NEW | Phase 5 ledger |
| `scripts/atlas/ingest-calls-db-tool-to-neo4j.mjs` | NEW | Combined ingestion |
| `scripts/atlas/audit-topology-coverage.sql` | NEW | Phase 3 audit |
| `scripts/atlas/audit-intent-coverage.sql` | NEW | Phase 4 audit |
| `scripts/atlas/audit-stale-edges.sql` | NEW | Phase 5 audit |

---

## Success Criteria

### Phase 3
- ✅ >500 USES_DB edges
- ✅ >200 USES_TOOL edges
- ✅ All quality gates passing

### Phase 4
- ✅ All intents mapped to features
- ✅ All features contain at least one file
- ✅ No orphan nodes

### Phase 5
- ✅ Mutation ledger initialized
- ✅ No stale edges without recompute timestamps
- ✅ DuckDB audit queries return expected results

---

**Ready to execute Phase 3-5?**

The supervision layer is the missing piece that makes LoRA training actually work.

Generated on 2026-05-29 21:20 PST