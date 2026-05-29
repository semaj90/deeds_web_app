# Atlas Runtime Intent Graph — Architectural Pivot

**Status**: Design phase (before Phase 3-4 implementation)  
**Scope**: Move from static structural graph → runtime intent tracing + memory ledger  
**Blockers**: None — Phase 2 CALLS edges provide the foundation  

---

## The Static-to-Runtime Gap

### What Phase 2 Atlas Gives Us
```
IMPORTS  ✅ Static: which files depend on which modules
CALLS    ✅ Static: which functions call which functions
USES_DB  🔜 Static: which code touches which tables
USES_TOOL 🔜 Static: which code invokes which tools
```

**The problem**: These are all *structural*. They describe the code as written, not the code as *understood*.

Atlas can answer:
- ✅ "What tables does this feature use?"
- ✅ "What functions call buildGlyph()?"
- ❌ "Why did that glyph reward score go stale?"
- ❌ "Which tool should I call for this intent?"
- ❌ "Did we test the schema change against all dependents?"

### What We Need to Add: Intent Graph

Intent graph is the **runtime topology**:

```
Intent (user/agent goal)
  ↓ RESOLVES_VIA
Feature (code + tools + cache)
  ↓ DEPENDS_ON
State (graph version, cache key, DB schema version)
  ↓ INVALIDATED_BY
Event (mutation, schema change, reward retrain)
```

---

## System Architecture: 7-Layer Data Flow

### Layer 1: Static Graph (Neo4j)
```
Node Types: File, Function, Table, Tool, Cache, Feature
Edge Types: IMPORTS, CALLS, USES_DB, USES_TOOL, USES_CACHE
Query:     "What does this feature depend on?"
Lifetime:  Regenerated when code changes (daily)
Truth:     Code is authoritative; graph follows
```

### Layer 2: Vector Semantics (Qdrant)
```
Collections: codebase_chunks_768, intent_embeddings, glyph_vectors
Payloads:    sourceRef, domain, feature, intent, kind, graphNodeId
Query:       "What code/docs mean similar things?"
Lifetime:    Indexed when documents change; vectors cached
Truth:       Embeddings follow semantic intent; can be retrained
```

### Layer 3: Document Rollups (CouchDB MapReduce)
```
Views:       retrieval_loop, tool_calls, glyph_rewards, sourceRef_coverage
Emit Keys:   feature, sourceRef, intent, tool, graphMutation
Query:       "Which features are hottest? Which tools fail most?"
Lifetime:    Regenerated when logs rotate (hourly/daily)
Truth:       Events are appended; views are aggregate projections
```

### Layer 4: Analytics Engine (DuckDB)
```
Sources:     NDJSON exports from Phase 2-4 extractors + event logs
Query:       "Which directories have missing edges? Which routes lack auth?"
Lifetime:    Ephemeral; regenerated per audit
Truth:       Schema audit; not a source of truth, but a truth-finder
```

### Layer 5: Durable Records (PostgreSQL JSONB)
```
Tables:      glyph_records, context_timeline, graph_mutations, engram_ledger
Records:     { intent, tool, selectedSourceRefs, outcome, reward, graphVersion }
Query:       "What was the outcome of that glyph reward run?"
Lifetime:    Permanent audit trail
Truth:       Events are the ledger; schema changes propagate here
```

### Layer 6: Hot Memory (Redis / Valkey)
```
Keys:        ace:routing:policy, gpu:karpathy:scores, topo:candidate:cache
TTL:         Seconds to hours (varies by use case)
Query:       "What's the current retrieval routing policy?"
Lifetime:    Transient; regenerated on startup or policy change
Truth:       Policies live in code/DB; Redis is the live cache
```

### Layer 7: Tool Bridge (MCP / JSON-RPC 2.0)
```
Messages:    { method: "tools/call", params: { name, arguments } }
Tools:       atlas-tools (graph), qdrant-tools (search), kb-tools (memory)
Query:       Gemma4/OpenCode asks tools, gets structured answers
Lifetime:    Per-request
Truth:       Tools answer from layers 1-6; clients trust tool responses
```

---

## Runtime Intent Graph: Node Types

### 1. Intent (user/agent goal)
```
{
  "intentId": "fix_glyph_ingestion",
  "description": "Resolve ON CONFLICT glyph_id constraint violation",
  "domain": "glyphs",
  "kind": "repair|feature|optimize|audit",
  "createdAt": "2026-05-29T21:00Z",
  "resolvedBy": ["Feature:phase1-glyphs"],
  "status": "active|stale|invalidated"
}
```

### 2. Feature (code + tools + cache)
```
{
  "featureId": "phase1-glyphs",
  "description": "ACE cards as training data",
  "routes": ["POST /api/glyphs/ingest"],
  "usesDB": ["glyph_records"],
  "usesTools": ["embedding-service", "qdrant-index"],
  "usesCache": ["redis:glyph:*"],
  "graphNodeId": "File:scripts/atlas/ingest-ace-cards-to-glyphs.mjs",
  "tested": true,
  "graphVersion": "2026-05-29T20:00Z"
}
```

### 3. State (graph version, cache key, schema)
```
{
  "stateId": "state:glyph_records:schema:2026-05-29",
  "kind": "database_schema|cache_policy|routing_policy|graph_version",
  "resource": "glyph_records table",
  "hash": "abc123...def789",
  "timestamp": "2026-05-29T20:00Z",
  "affectsFeatures": ["phase1-glyphs", "phase2-glyphs-rewards"],
  "invalidatesCache": ["gpu:karpathy:scores"]
}
```

### 4. Event (mutation, change, trigger)
```
{
  "eventId": "event:glyph_records:schema:2026-05-29T20:01Z",
  "kind": "schema_change|code_change|reward_retrain|cache_invalidate|graph_rebuild",
  "resource": "glyph_records.grpo_reward_score column",
  "timestamp": "2026-05-29T20:01Z",
  "triggeredBy": "user-request|automated-rebuild|ci-pipeline",
  "invalidatesCache": ["gpu:karpathy:scores"],
  "affectsIntents": ["Intent:improve-glyph-quality"]
}
```

### 5. Tool (MCP tool)
```
{
  "toolId": "atlas-tools.find_dependencies",
  "mcp_method": "tools/call",
  "documentation": "Find all files/tables/tools that depend on a given resource",
  "inputSchema": { "sourceRef": "string" },
  "outputSchema": { "dependencies": [{ "kind", "sourceRef", "edge" }] },
  "usedBy": ["Feature:phase1-glyphs", "Intent:audit-schema-safety"],
  "lastCalled": "2026-05-29T20:30Z"
}
```

### 6. CacheKey (identity for caching)
```
{
  "cacheKeyId": "cache:glyph:reward:phase2:qdrant:768",
  "resource": "gpu:karpathy:scores",
  "computedFrom": ["Feature:phase2-glyphs-rewards", "State:qdrant:codebase_chunks_768"],
  "ttl": "24h",
  "invalidatedBy": ["Event:glyph_records:schema:*", "Event:qdrant:reindex:*"],
  "lastComputed": "2026-05-29T20:00Z"
}
```

### 7. RewardRun (training/scoring event)
```
{
  "rewardRunId": "run:grpo:phase2:2026-05-29T20:00Z",
  "kind": "grpo_scoring|active_learning|validation",
  "inputGlyphs": 78,
  "outputRewards": { "min": 0.03, "max": 0.93, "avg": 0.43 },
  "invalidatesAt": null,
  "invalidatedWhen": "Event:glyph_records:schema:*",
  "usesGraphVersion": "2026-05-29T20:00Z",
  "timestamp": "2026-05-29T20:00Z"
}
```

---

## Runtime Intent Graph: Edge Types

| Edge | From | To | Meaning |
|------|------|-----|---------|
| **RESOLVES_INTENT** | Feature | Intent | Feature implements this goal |
| **DEPENDS_ON_STATE** | Feature | State | Feature behavior depends on this state |
| **INVALIDATED_BY** | Feature / CacheKey | Event | This change makes feature/cache stale |
| **USES_TOOL** | Feature | Tool | Feature calls this MCP tool |
| **USES_CACHE** | Feature | CacheKey | Feature reads from cache |
| **GENERATED_TRACE** | RewardRun | Event | This run was triggered by event |
| **HAS_REWARD** | RewardRun | CacheKey | Scores stored in this cache key |
| **AFFECTS_INTENTS** | Event | Intent | This event impacts these goals |

---

## Engram Memory Ledger (Structured Trace Log)

Engram is **NOT vague chat history**. It's a structured event log:

```sql
CREATE TABLE engram_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- What happened
  intent TEXT NOT NULL,        -- "fix_glyph_ingestion"
  tool TEXT,                   -- "atlas-tools.find_dependencies"
  action TEXT,                 -- "selected_source_refs"
  
  -- Inputs
  selectedSourceRefs TEXT[],   -- ["src/scripts/ingest-ace-cards.mjs:L50"]
  queryHash TEXT,              -- SHA256(query) for caching
  
  -- Outcome
  outcome TEXT,                -- "fixed|failed|partial|stale"
  reward REAL,                 -- 0.0-1.0 confidence score
  durationMs INT,
  
  -- Metadata for invalidation
  graphVersion TEXT,           -- "2026-05-29T20:00Z"
  invalidatesAt TIMESTAMPTZ,   -- When this trace expires
  affectsFeatures TEXT[],      -- Cascading impact
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON engram_ledger(intent, outcome);
CREATE INDEX ON engram_ledger(tool);
CREATE INDEX ON engram_ledger(graphVersion);
```

**Query pattern**:
```sql
-- "What's the history of glyph ingestion attempts?"
SELECT intent, outcome, reward, selectedSourceRefs
FROM engram_ledger
WHERE intent = 'fix_glyph_ingestion'
  AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;

-- "Which features are affected by this schema change?"
SELECT DISTINCT affectsFeatures
FROM engram_ledger
WHERE graphVersion = '2026-05-29T20:00Z'
  AND outcome IN ('failed', 'partial');
```

---

## Graph Mutation Ledger (Invalidation)

When the graph changes, we must record **what changed** so downstream consumers can invalidate:

```sql
CREATE TABLE graph_mutations (
  id UUID PRIMARY KEY,
  
  -- What changed
  node_kind TEXT,              -- "File|Function|Table|Feature"
  node_id TEXT,                -- "File:src/lib/server/db/schema-postgres.ts"
  change_kind TEXT,            -- "added|removed|modified"
  
  -- When it changed
  mutation_version TEXT,       -- Timestamp as version ID
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  
  -- What it invalidates
  invalidates_cache TEXT[],    -- ["gpu:karpathy:scores", "ace:routing:*"]
  invalidates_features TEXT[], -- ["phase1-glyphs", "phase2-glyphs-rewards"]
  invalidates_intents TEXT[],  -- ["Intent:improve-quality"]
  
  -- Who/what triggered it
  triggered_by TEXT            -- "user-request|ci-pipeline|automated-rebuild"
);

CREATE INDEX ON graph_mutations(node_id, timestamp DESC);
CREATE INDEX ON graph_mutations(mutation_version);
```

**Usage**:
```javascript
// After drizzle-kit migrate adds a column to glyph_records:
await db.insert(graph_mutations).values({
  node_id: 'Table:glyph_records',
  change_kind: 'modified',
  mutation_version: new Date().toISOString(),
  invalidates_cache: ['gpu:karpathy:scores'],
  invalidates_features: ['phase2-glyphs-rewards'],
  triggered_by: 'ci-pipeline'
});

// Downstream cache invalidation:
const mutations = await db.query(
  'SELECT * FROM graph_mutations WHERE mutation_version = $1',
  [graphVersion]
);
for (const m of mutations) {
  for (const cacheKey of m.invalidates_cache) {
    await redis.del(cacheKey);  // or pattern-del if wildcard
  }
}
```

---

## Atlas Tool: `atlas-tools.find_intent_chain`

Once the runtime graph exists, Gemma4 can ask:

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "atlas-tools.find_intent_chain",
    "arguments": {
      "intent": "fix_glyph_ingestion",
      "depth": 3
    }
  }
}
```

**Response**:
```json
{
  "intent": "fix_glyph_ingestion",
  "resolvedBy": [
    {
      "feature": "phase1-glyphs",
      "routes": ["POST /api/glyphs/ingest"],
      "usesDB": ["glyph_records"],
      "dependsOn": [
        {
          "state": "State:glyph_records:schema:2026-05-29",
          "invalidatesCache": ["gpu:karpathy:scores"]
        }
      ]
    }
  ],
  "affectedByMutations": [
    {
      "timestamp": "2026-05-29T20:01Z",
      "change": "glyph_records.grpo_reward_score column added",
      "invalidates": ["gpu:karpathy:scores"]
    }
  ]
}
```

---

## Implementation Order (3-4 weeks)

### Week 1: Graph Schema + Ledgers
- [ ] Add `graph_mutations`, `engram_ledger`, runtime intent nodes to Postgres
- [ ] Wire `graph_mutations` inserts into drizzle-kit post-migration hook
- [ ] Wire `engram_ledger` appends into Phase 2 extractors + reward runners

### Week 2: Vector Payloads + Semantics
- [ ] Add `intent`, `domain`, `graphNodeId` to Qdrant payload schema
- [ ] Reindex `codebase_chunks_768` with runtime intent metadata
- [ ] Create `intent_embeddings` collection for user goals

### Week 3: CouchDB Views + DuckDB Audit
- [ ] MapReduce views: `retrieval_loop`, `tool_calls`, `glyph_rewards`
- [ ] DuckDB audit queries: missing edges, stale features, orphan files
- [ ] Dashboard: `/admin/graph-health` showing mutation impact

### Week 4: MCP Tools + Gemma4 Integration
- [ ] `atlas-tools.find_intent_chain` implementation
- [ ] `atlas-tools.check_invalidation_status` (is this feature stale?)
- [ ] Wire Gemma4 to ask "What tool should I call?" via graph

---

## Comparison: Static vs Intent-Aware

| Question | Static Graph | Runtime Intent Graph |
|----------|--------|----------|
| "What functions call buildGlyph?" | 10 CALLS edges | 10 CALLS edges + Intent:* + invalidation tracking |
| "Is glyph reward stale?" | ❌ Can't answer | ✅ Check RewardRun.invalidatedWhen vs current State |
| "What breaks if we add a column?" | ❌ Can't answer | ✅ Follow Event → INVALIDATED_BY → Features → Intents |
| "Should I retrain this model?" | ❌ Can't answer | ✅ Check CacheKey.invalidatedBy events since last train |
| "Did that schema change actually get tested?" | ❌ Can't answer | ✅ Query engram_ledger for attempts on that mutation |

---

## References

- Phase 2 CALLS edges: `scripts/atlas/phase2-atlas-calls-extractor.mjs` (106,515 edges)
- Phase 2 Glyphs: `scripts/atlas/phase2-glyphs-grpo-rewards.mjs` (78 glyphs scored)
- Phase 3 USES_DB: `scripts/atlas/extract-db-usage.mjs` (TBD)
- Phase 4 USES_TOOL: `scripts/atlas/extract-tool-usage.mjs` (TBD)

---

**Status**: Ready for Week 1 implementation (Postgres schema + mutation hook)  
**Ownership**: Atlas architecture team  
**Decision Gate**: Confirm with team before starting Week 1 data model changes
