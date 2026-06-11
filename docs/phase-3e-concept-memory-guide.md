# Phase 3E: Concept Memory Lifecycle — Architecture & Implementation Guide

**Status**: Foundation Ready (June 11, 2026)
**Next Lane**: Phase 3E.1 Concept Telemetry Integration

---

## What Concept_records Actually Changes

### Before (Packet-Centric)
```
Query
  ↓
Qdrant ANN
  ↓
Packets returned
  ↓
LLM synthesis
  ↓
Answer
```

**Problem**: No memory of WHY packets were selected or WHETHER they helped.

### After (Concept-Memory)
```
Query
  ↓
Retrieval (any lane)
  ↓
Telemetry recorded
  ↓
Packet evidence aggregated
  ↓
Concept synthesis
  ↓
concept_records UPDATED
  ↓
Answer
  ↓
Lifecycle governance (active/warm/cold)
```

**Benefit**: Concepts now carry behavioral metadata. The system learns which concepts are *actually useful*.

---

## Three New Fields & Why They Matter

### 1. retrievalStrategy: text
**Options**: `vector_only | lexical_only | structural_only | fusion | cold_neschrom`

**Purpose**: Tracks HOW each concept was discovered.

**Example Queries**:
```sql
-- Find concepts discovered only via lexical search (high specialization)
SELECT concept_id, label, retrieval_count
FROM concept_records
WHERE retrieval_strategy = 'lexical_only'
  AND concept_temperature > 0.7
ORDER BY concept_temperature DESC;

-- Find hybrid-discovery concepts (most robust)
SELECT concept_id, retrieval_strategy, COUNT(*) as discovery_count
FROM concept_records
WHERE retrieval_strategy = 'fusion'
GROUP BY concept_id
HAVING COUNT(*) > 5;
```

**Decision Impact**: 
- Concepts with `vector_only` are brittle (one lane dependency)
- Concepts with `fusion` are robust (multi-lane convergence)
- `cold_neschrom` concepts are rarely used (candidate for archive)

### 2. lastRetrievedAt: timestamp with time zone
**Purpose**: Enables accurate lifecycle transitions.

**Lifecycle States** (not enums, inferred):
```
active      → last_retrieved < 1 day   (concept_temperature >= 0.8)
warm        → last_retrieved < 7 days  (concept_temperature 0.5–0.8)
cool        → last_retrieved < 30 days (concept_temperature 0.2–0.5)
cold        → last_retrieved > 30 days (concept_temperature < 0.2)
archived    → concept_temperature < 0.1 AND last_retrieved > 60 days
```

**Example Query**:
```sql
-- Concepts aging out (warm → cold transition candidates)
SELECT concept_id, label, 
       (now() - last_retrieved_at) as days_since_use,
       concept_temperature
FROM concept_records
WHERE concept_temperature BETWEEN 0.5 AND 0.8
  AND last_retrieved_at < now() - interval '7 days'
ORDER BY last_retrieved_at DESC
LIMIT 50;
```

**Automation**: Lifecycle transitions drive:
- **Active → Warm**: Background indexing pauses
- **Warm → Cold**: Archive to low-cost storage
- **Cold → Archived**: Remove from Qdrant, keep in Postgres

### 3. conceptTemperature: double precision
**Range**: 0.0–1.0 (not a percent, a behavioral score)

**Derivation** (illustrative):
```
concept_temperature = 0.4 * (retrieval_count / max_retrieval_count)
                    + 0.3 * (recency_score)
                    + 0.2 * (repair_success)
                    + 0.1 * (selection_frequency)
```

**Example Heat Map**:
```
concept_id                      temperature   lifecycle
─────────────────────────────── ──────────── ──────────
ace_retrieval_reranking         0.95         ACTIVE
fuzzy_search_fallback           0.73         WARM
vectordb_cache_invalidation     0.45         COOL
old_grpc_endpoint               0.08         COLD
deprecated_llm_inference        0.02         ARCHIVED
```

**Use Cases**:
- **Hot concepts** (>0.8): Keep in primary index, cache aggressively
- **Warm concepts** (0.5–0.8): Standard indexing, background refresh
- **Cold concepts** (<0.2): Archive or delete

---

## Phase 3E.1: Concept Telemetry Integration (Next Week)

### Task 1: Link retrieval_telemetry → concept_records

```typescript
// After successful retrieval, trigger concept update
async function updateConceptOnRetrieval(
  conceptIds: string[],
  telemetryRecord: RetrievalTelemetry
) {
  for (const id of conceptIds) {
    await db
      .update(conceptRecords)
      .set({
        retrievalCount: sql`${conceptRecords.retrievalCount} + 1`,
        lastRetrievedAt: new Date(),
        retrievalStrategy: telemetryRecord.retrievalStrategy,
        // Temperature updated via trigger or periodic job
      })
      .where(eq(conceptRecords.conceptId, id));
  }
}
```

### Task 2: Periodic Temperature Recomputation

```typescript
// Run nightly (or hourly for hot concepts)
async function recomputeConceptTemperatures() {
  await db.execute(sql`
    UPDATE concept_records
    SET concept_temperature = (
      0.4 * (CAST(retrieval_count AS FLOAT) / NULLIF(
        (SELECT MAX(retrieval_count) FROM concept_records), 0
      )) +
      0.3 * (CASE 
        WHEN last_retrieved_at > now() - interval '1 day' THEN 1.0
        WHEN last_retrieved_at > now() - interval '7 days' THEN 0.5
        WHEN last_retrieved_at > now() - interval '30 days' THEN 0.2
        ELSE 0.0
      END) +
      0.2 * repair_success +
      0.1 * (CASE 
        WHEN retrieval_strategy = 'fusion' THEN 0.2
        WHEN retrieval_strategy = 'vector_only' THEN -0.1
        ELSE 0.0
      END)
    )
    WHERE updated_at < now() - interval '6 hours'
  `);
}
```

### Task 3: Concept Lifecycle Reports

```typescript
// Generate temperature distribution report
async function generateConceptTemperatureReport() {
  const report = await db
    .select({
      lifecycle: sql<string>`
        CASE 
          WHEN ${conceptRecords.conceptTemperature} >= 0.8 THEN 'ACTIVE'
          WHEN ${conceptRecords.conceptTemperature} >= 0.5 THEN 'WARM'
          WHEN ${conceptRecords.conceptTemperature} >= 0.2 THEN 'COOL'
          WHEN ${conceptRecords.conceptTemperature} >= 0.1 THEN 'COLD'
          ELSE 'ARCHIVED'
        END
      `,
      count: sql<number>`COUNT(*)`,
      avgTemp: sql<number>`AVG(${conceptRecords.conceptTemperature})`,
      topStrategies: sql<string>`
        ARRAY_AGG(DISTINCT ${conceptRecords.retrievalStrategy})
      `,
    })
    .from(conceptRecords)
    .groupBy(
      sql`CASE 
        WHEN ${conceptRecords.conceptTemperature} >= 0.8 THEN 'ACTIVE'
        WHEN ${conceptRecords.conceptTemperature} >= 0.5 THEN 'WARM'
        WHEN ${conceptRecords.conceptTemperature} >= 0.2 THEN 'COOL'
        WHEN ${conceptRecords.conceptTemperature} >= 0.1 THEN 'COLD'
        ELSE 'ARCHIVED'
      END`
    );
  
  return report;
}
```

---

## Learning vs Search: How Concepts Enable Behavior

### Why LLMs Learn Compressed Concepts

**With Raw Observations**:
```
Query: "fix auth bug"
Observed: [packet_001, packet_002, packet_003]
         [packet_101, packet_102, packet_103]
         [packet_201, packet_202, packet_203]
         ...×10,000 queries
```

Problem: Model sees *everything*, learns *nothing specific*.

**With Compressed Concepts**:
```
Query: "fix auth bug"
Concept: auth_guard_pattern (temperature: 0.92, strategy: fusion)
         error_handling_boilerplate (temperature: 0.87, strategy: lexical_only)
         test_fixtures (temperature: 0.45, strategy: vector_only)
```

Model learns: "auth bugs map to these 3 concepts; only fusion-discovered ones are reliable."

### QLoRA Training Dataset Shape

After Phase 3E.1, you can export:

```jsonl
{"query":"fix missing auth guard","retrieval_strategy":"fusion","selected_concepts":["auth_guard_pattern","test_fixtures"],"outcome":"success","score":0.92}
{"query":"add endpoint validation","retrieval_strategy":"vector_only","selected_concepts":["input_validation","error_handling_boilerplate"],"outcome":"partial","score":0.68}
{"query":"handle concurrent state","retrieval_strategy":"cold_neschrom","selected_concepts":[],"outcome":"failure","score":0.0}
```

This becomes training data for:
- **Gemma4 Planner**: "Given query + context, which retrieval lane?"
- **Gemma4 Agent**: "Which concepts lead to successful repairs?"
- **Atlas Orchestrator**: "Route queries by learned strategy patterns"

---

## Architecture: Packets → Concepts → Engrams

```
┌─────────────────────────────────────────────────────────────┐
│ PACKETS (Observations)                                      │
│ - 8,170 NES/CHROM cards                                    │
│ - ~15,000 synthesized artifacts                            │
│ - Retrieved per query, high volume                          │
└─────────────────────────────────────────────────────────────┘
                           ↓
                      SYNTHESIS
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ CONCEPTS (Abstractions)                                    │
│ - ~500–2,000 synthesized concepts                          │
│ - Each represents semantic cluster of packets              │
│ - Temperature-tracked lifecycle                            │
│ - Enables behavioral learning                              │
└─────────────────────────────────────────────────────────────┘
                           ↓
                      ENGAGEMENT
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ ENGRAMS (Learned Patterns)                                 │
│ - Implicit in Gemma4 weights (QLoRA)                       │
│ - "This retrieval strategy works for this class of query"  │
│ - "This concept is 95% reliable, that one 40%"            │
│ - Explicit in routing policy (Redis ace:lane:routing)      │
└─────────────────────────────────────────────────────────────┘
```

concept_records is the **bridge** layer.

---

## Next Week's Order (Phase 3E.1)

1. **Concept Telemetry Integration**
   - Hook retrieval_telemetry → conceptRecords updates
   - Increment `retrieval_count`, update `lastRetrievedAt`, set `retrievalStrategy`

2. **Temperature Recomputation Job**
   - Nightly (or hourly for hot concepts)
   - Derive temperature from retrieval_count + recency + success + lane diversity

3. **Lifecycle Governance**
   - Automation: active → warm → cold transitions
   - Trigger archive moves (Postgres → SeaweedFS cold storage)

4. **Export QLoRA Dataset**
   - Concept memory + outcome tracing
   - → training examples for Gemma4

5. **Gemma4 Planning Experiment**
   - Train lightweight SFT adapter on concept-level examples
   - Test: "Given query, predict retrieval_strategy"
   - Baseline: Pure semantic similarity
   - Target: 80%+ strategy prediction accuracy

---

## Implementation Readiness

- [x] concept_records schema complete
- [x] Three lifecycle fields added
- [x] Indexes created
- [x] retrieval_telemetry wired (Point 1, ACE assembler)
- [ ] Concept update trigger / job
- [ ] Temperature recomputation script
- [ ] Lifecycle automation rules
- [ ] QLoRA exporter
- [ ] Gemma4 planning training

---

## References

- Parent Architecture: `docs/architecture/phase-3d-telemetry-instrumentation.md`
- Telemetry Fixes: `docs/phase-3d-telemetry-fixes.md`
- Schema: `src/lib/server/db/schema/concept-records.ts`
- ACE Emission: `src/lib/server/telemetry/ace-telemetry-emitter.ts`

---

**Milestone**: Phase 3D + 3E foundation closes the gap from *retrieval infrastructure* to *concept memory*. Next: behavioral learning.
