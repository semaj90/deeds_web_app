---
name: Phase 9 Production Readiness Gaps + Architectural Pivot
description: User feedback on HMM tool selection design — 7 blocking gaps before production, 1 high-value next step
type: project
---

# Phase 9 Production Gap Analysis (Session 128 Feedback)

**Status**: MVP WIRED (7/10 production-ready)  
**Blocker**: HMM routing directly from cosine similarity alone (should consume multi-signal observation sequence)  
**Next highest-value work**: Unified Packet Ontology Registry (prerequisite for telemetry feedback loop + XGBoost lane recommendation)

---

## What Works Well (Architecture: 9/10)

✅ **Tool registry as first-class index**  
- Embedding + metadata + domains + telemetry as a single searchable object
- Matches Atlas packet infrastructure (canonical Postgres, mirrors in Qdrant/Neo4j/Redis)

✅ **HMM as state validator, not ranker**  
- Validates execution state (CANONICAL, RECOVERABLE, QUARANTINE) — NOT quality scores
- Deterministic, testable, safe fallback behavior (confidence + lexical search)

✅ **Canonical 384-dim embedding**  
- Eliminates dimension confusion (was 768-dim Ollama vs 384-dim project standard)
- Aligns with rest of retrieval pipeline

---

## The 7 Production Gaps

### Gap 1: HMM routing directly from cosine similarity (CRITICAL)

**Current flow**:
```
query → embedding → tool cosine search → HMM → execute
```

**Problem**: HMM has NO observation sequence. Single threshold on embedding similarity is not an HMM.

**Required flow**:
```
query
  ↓
intent features (ast-grep, lexical, semantic)
  ↓
candidate tools (Qdrant ANN top-K)
  ↓
rules & schema compatibility checks
  ↓
XGBoost / lightweight classifier → confidence
  ↓
HMM state validation (multi-signal observation)
  ↓
tool execution
  ↓
telemetry feedback
```

**Observation sequence should include**:
- query_type (CODE_SEARCH | SEMANTIC_SEARCH | GRAPH_EXPAND | etc.)
- classifier_confidence (0-1, from XGBoost or rule engine)
- schema_compatibility (0-1, does packet type match tool input schema?)
- historical_success_rate (0-1, tool success on similar queries)
- avg_latency_ms (normalized, 1=fast, 0=slow)
- validation_failures (count, tool has failed X% of time)
- retry_count (how many times was this tool retried?)

**Then HMM can model**:
- Transition probabilities (CODE_SEARCH → GRAPH_EXPAND likelihood)
- Emission probabilities (if in CODE_SEARCH state, observe lexical keyword score)
- Viterbi sequence inference (optimal state path given observations)

**Current MVP is sufficient for v1**, but rename it clearly:
- ❌ "HMM state machine" (implies observation sequence)
- ✅ "Deterministic state validator" or "Intent gate"

---

### Gap 2: Tool embeddings too narrow (summaries only)

**Current**: Embed `tool.summary` only

**Problem**: "Keyword relevance match" is not semantic tool matching.

**Better embedding source**:
```
${tool.name}
${tool.description}
Input schema: ${JSON.stringify(tool.input_schema)}
Output schema: ${JSON.stringify(tool.output_schema)}
Examples: ${tool.examples.join('; ')}
Domains: ${tool.domains.join(', ')}
Limitations: ${tool.limitations || 'none'}
```

This gives Qdrant better signals for:
- "find tools that take file paths as input"
- "find tools that return JSON"
- "find tools used in auth domain"
- "find tools suitable for code analysis"

**Action**: Regenerate tool embeddings with richer context before Phase 9 apply.

---

### Gap 3: Missing tool ontology (filter predicates)

**Current**: No schema compatibility checking before tool selection.

**Add to tool_registry JSONB**:
```sql
tool_capabilities jsonb          -- ["lexical_search", "ast_analysis", "graph_traversal"]
tool_constraints jsonb           -- {"max_query_length": 10000, "rate_limit": 100}
tool_examples jsonb              -- {"input": "...", "output": "...", "domain": "auth"}
tool_tags text[]                 -- ["fast", "deterministic", "gpu-accelerated", "deprecated"]
supported_languages text[]       -- ["typescript", "python", "go"]
supported_extensions text[]      -- [".ts", ".py", ".go", ".md"]
supported_packet_types text[]    -- ["code_chunk", "test_file", "documentation"]
failure_modes jsonb              -- {"timeouts": 5, "schema_mismatch": 12, "rate_limit": 3}
```

**Usage in routing**:
```typescript
// Before vector search, filter by compatibility
const candidates = await qdrant.search({
  vector: queryEmbedding,
  filter: {
    must: [
      { key: 'supported_packet_types', match: { any: [selectedPacketType] } },
      { key: 'supported_languages', match: { any: [detectedLanguage] } }
    ],
    must_not: [
      { key: 'tool_tags', match: { any: ['deprecated'] } }
    ]
  },
  limit: 10
});
```

**Effect**: Eliminates candidates that can't possibly work before scoring.

---

### Gap 4: Missing telemetry feedback loop (OPERATIONAL)

**Current**: Telemetry collection planned, not wired into routing.

**Required fields on tool_registry**:
```sql
success_count int                -- total successful executions
failure_count int                -- total failures
avg_latency_ms real              -- mean execution time
timeout_count int                -- how often did this tool timeout?
schema_mismatch_count int        -- how often did schema compatibility check fail?
false_positive_rate real         -- (wrong tool selected) / total_selected
last_success timestamp           -- freshness signal
last_failure timestamp           -- when was most recent failure?
rolling_success_rate_7d real     -- 7-day rolling success %
```

**Feedback loop**:
```
1. Tool executes → success / failure → update counters
2. Next query consults success_rate in observation
3. Low success_rate + high latency → deprioritize in ranking
4. Repeated failures → move to QUARANTINE state automatically
5. Recovery: gradual re-enable as success_rate rebounds
```

**Without this, you have no operational signal**. MVP can't distinguish:
- "Tool is broken" (low success rate, timeouts)
- "Tool works but latency spiked" (avg_latency_ms abnormal)
- "Tool works but schema changed" (schema_mismatch_count up)

---

### Gap 5: Retrieval should stay packet-first (ARCHITECTURAL)

**Current flow**:
```
query → SELECT TOOL → execute tool
```

**Problem**: Inverts the canonical truth layer. Packets are truth, tools are servants.

**Required flow**:
```
query
  ↓
Qdrant ANN (packet vectors, top-100)
  ↓
PostgreSQL join (canonical packet metadata)
  ↓
Neo4j expand (relationships, topology)
  ↓
Derive domains from packets
  ↓
Recommend tools based on packet types + domains
  ↓
Execute tools
  ↓
Rerank packets
```

**Why**: 
- Packets are Postgres truth, with embeddings + metadata + provenance
- Tools are utility functions that operate ON packets
- Selecting tools first divorces routing from the actual domain/content

**Fix**:
- Don't call `selectTool(query)` directly
- Instead: `retrievePackets(query) → deriveDomainsFromPackets() → recommendTools(domains, packet_types) → executeTools()`

---

### Gap 6: Missing semantic feature packets (UNIFICATION)

**Current**: Separate registries (packets vs tools vs prompts vs schemas)

**Long-term vision**: Single ontology

```
Packet {
  packet_key: string
  packet_type: "code" | "test" | "doc" | "prompt" | "schema" | "tool" | "api" | "spec"
  feature_id: string
  tree_node_id: string
  domain: string
  summary: string
  embedding: vector(384)
  metadata: jsonb
}
```

Then tools are just `packet_type: "tool"` with additional fields like:
```
{
  ...base packet fields,
  packet_type: "tool",
  input_schema: jsonb,
  output_schema: jsonb,
  capabilities: text[],
  constraints: jsonb,
  examples: jsonb
}
```

**Benefit**: Unified search, unified telemetry, unified graph relationships.

**Timeline**: Not v1, but prerequisite for "all searchable objects are packets."

---

### Gap 7: Missing contextual tree (RETRIEVAL EXPANSION)

**Current**: Tool selection is flat (which tool? A, B, or C?)

**Missing**: Hierarchical context

```
query
  ↓
tree_node (feature scope)
  ↓
neighbor_packets (same cluster)
  ↓
tool_packets (applicable tools)
  ↓
graph_relationships (dependencies, used_by)
  ↓
retrieval + execution
```

**Currently we have**:
- Packets (Postgres/Qdrant)
- Tools (tool_registry)
- Graph (Neo4j)

**Missing**:
- Unified tree_node_id on packets
- Hierarchical expansion (feature → subfeatures → implementations)
- Parent-child tool relationships (generic tool → specialized variant)

**Fix**: Ensure `atlas_packets.tree_node_id` is populated, add parent/child tracking in tool_registry.

---

## Production Readiness Scorecard

| Aspect | Score | Status |
|--------|-------|--------|
| Architecture clarity | 9/10 | ✅ Separation of concerns clear |
| State validation | 8/10 | ✅ HMM gating works; rename to Intent Gate for clarity |
| Fallback safety | 9/10 | ✅ Deterministic, tested, production-ready |
| Observation richness | 3/10 | ❌ CRITICAL — only embedding similarity |
| Tool filtering | 2/10 | ❌ No schema compatibility checks |
| Telemetry integration | 2/10 | ❌ Planned, not wired |
| Packet-first flow | 5/10 | ⚠️ Tool selection precedes packet retrieval |
| Unified ontology | 1/10 | ⚠️ Tools ≠ packets, planned for later |
| **Overall** | **7/10** | ⏳ MVP ready, production needs gaps 1+4 |

---

## Next Highest-Value Work (Phase 10 Planning)

### Priority 1: Packet Ontology Registry (1-2 weeks)

**Why first**: Unblocks telemetry feedback loop, enables XGBoost lane recommendation, makes unified ontology possible.

**What to build**:
1. Add fields to `atlas_packets`:
   - `packet_ontology jsonb` (capabilities, constraints, examples, tags)
   - `packet_type enum` (code, test, doc, prompt, tool, schema, api, spec)
   - `parent_packet_key` (hierarchical relationships)
   - `related_packets text[]` (semantic neighbors)
   - `telemetry jsonb` (execution history)

2. Extend tool_registry with same ontology structure:
   - `tool_capabilities jsonb`
   - `tool_constraints jsonb`
   - `tool_examples jsonb`
   - `tool_tags text[]`
   - `failure_modes jsonb`

3. Add telemetry table:
   - `tool_execution_log` (tool_id, query, success, latency, error_type, timestamp)
   - Materialized view: rolling success_rate, avg_latency, timeout_count

4. Wire feedback loop:
   - Every tool execution → log event
   - Hourly: compute rolling statistics
   - Next routing: consult fresh statistics

### Priority 2: Multi-Signal Observation Layer (1 week)

**Build**:
1. Intent parser (classify query into CODE_SEARCH, GRAPH_EXPAND, etc.)
2. Lightweight classifier (confidence score from AST + lexical + semantic signals)
3. Schema compatibility validator (does packet type match tool input?)
4. Operational history reader (success_rate, latency, failures from telemetry)
5. Package all into `Observation` struct for HMM state inference

**Result**: HMM now has actual observation sequence instead of single similarity threshold.

### Priority 3: XGBoost Lane Recommendation (2 weeks)

**Train on**:
- Query features (AST score, keyword score, semantic score)
- Packet features (type, domain, size, complexity)
- Tool features (success_rate, latency, schema_match)
- Historical outcomes (was tool X recommended? did it succeed?)

**Output**: Confidence + top-3 tool recommendations

**Integration**: Feed confidence + recommendations into HMM observation.

### Priority 4: Viterbi HMM Inference (1-2 weeks)

**Replace current MVP threshold logic with**:
- Transition matrix (state → state likelihood)
- Emission probabilities (observation → state likelihood)
- Viterbi forward pass (optimal state sequence)

**Now HMM actually learns**:
- "CODE_SEARCH usually followed by GRAPH_EXPAND" → weight that transition
- "High schema_mismatch usually means QUARANTINE" → learn that emission
- "Success_rate + latency observations predict CANONICAL" → pick state path

---

## Recommended Implementation Order

```
Phase 10: Packet Ontology Registry
  ↓
Phase 10b: Multi-Signal Observation Layer
  ↓
Phase 11: XGBoost Lane Recommendation
  ↓
Phase 12: Viterbi HMM Inference
  ↓
Phase 12b: Unified Tool + Packet Search (stretch goal)
```

Each phase feeds the next. Don't skip to ML without ontology + observations.

---

## How to Frame This for Session 128+

**Current state** (v1, MVP):
- ✅ Deterministic intent gate (rename from "HMM" to be clear)
- ✅ Tool registry as indexed packet analogue
- ✅ Fallback safety mechanisms
- ⚠️ Missing observation richness (embedding only)
- ⚠️ Missing telemetry feedback loop
- ⚠️ Missing packet-first retrieval

**v1 -> v2 path**:
1. Build packet ontology + telemetry backend (prerequisite for everything)
2. Wire multi-signal observations into state validation
3. Train XGBoost on historical tool selections
4. Replace threshold-based state inference with Viterbi
5. Unify packet + tool search under single ontology

**v1 is production-ready for**:
- Deterministic tool routing with safety fallback
- Basic schema validation
- Telemetry collection (if backend built)

**v1 is NOT production-ready for**:
- Learning from execution history (no feedback loop)
- Complex multi-tool orchestration (needs tree context)
- Automatic quality improvement over time (needs telemetry + training)

---

**Key insight**: You've built a solid v1. The next step is NOT more ML. It's infrastructure (ontology + telemetry) to make ML possible. That's the opposite of most ML projects — this one gets the data plumbing right first, then adds learners.

