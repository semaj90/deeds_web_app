---
name: Phase 4B Level 1 Task List (Week 1–2)
description: Focused CPU-based tasks for concept extraction, Neo4j signal, and 20-query benchmark
type: project
originSessionId: june-12-2026-evening
---

# Phase 4B Level 1: Concrete Tasks (Week 1–2)

**Scope**: 3 specific modules + 1 benchmark expansion  
**Effort**: ~15 hours total  
**Success Gate**: NDCG@10 >= 0.70 on all 20 queries + all 4 weight presets

---

## Task 1: Concept Extraction Tool (4 hours)

**File**: `src/lib/server/retrieval/concept-extraction-tool.ts` (NEW, 120 lines)  
**Blocked by**: None (can start immediately)

### Implementation Checklist

- [ ] Create new file with header docstring
- [ ] Import dependencies: `gemma4-agent.ts`, `Zod`, `postgres`
- [ ] Define `ConceptExtractionRequest` Zod schema
  - `query: string` (1–1000 chars)
  - `maxConcepts: number?` (default 5, max 10)
  - `minConfidence: number?` (default 0.7, range 0.5–0.95)
- [ ] Define `ConceptExtractionResponse` interface
  - `conceptIds: string[]` (matched against `postgres.concepts`)
  - `extracted: Array<{ name, confidence, category }>` (raw LLM output)
  - `durationMs: number`
- [ ] Implement `extractQueryConceptsViaGemma(request)`
  ```typescript
  1. Stream query to Gemma4: "Extract semantic concepts: <query>"
  2. Parse streaming JSON: use jq or line-by-line parser
  3. Validate each concept: confidence >= minConfidence
  4. Look up concept_id in postgres.concepts table
  5. Return matched IDs + raw extracted data
  ```
- [ ] Error handling: invalid Zod input → 400, Gemma4 timeout → return empty, DB lookup miss → log and skip
- [ ] Add to MCP bounded tool registry (optional, use in Phase 4B not Phase 4A)
- [ ] Export function for use in `rrf-integration.ts`

### Integration Point

In `rrf-integration.ts`, replace placeholder:
```typescript
// OLD (Phase 4A):
conceptOverlapSearch([], topK)  // empty array

// NEW (Phase 4B):
const concepts = await extractQueryConceptsViaGemma({ 
  query, 
  maxConcepts: 5 
});
conceptOverlapSearch(concepts, topK)
```

### Testing

```bash
# Manual test (dev server):
curl -X POST http://localhost:5173/api/search/rrf \
  -H "Content-Type: application/json" \
  -d '{"query":"RRF ranking algorithm"}'

# Should return concepts like ["ranking", "algorithm", "information-retrieval"]
# Verify in response: breakdown.conceptCount > 0
```

### Success Criteria

- [x] Compilation: `npx tsc --noEmit` passes
- [x] Exports correct functions and types
- [x] Can be imported by `rrf-integration.ts`
- [x] Returns empty array on error (graceful degradation)
- [x] Concept extraction returns 3–5 items on typical query

---

## Task 2: Neo4j Graph Signal (4 hours)

**File**: `src/lib/server/retrieval/neo4j-graph-signal.ts` (NEW, 100 lines) — ✅ CREATED  
**Blocked by**: Task 1 (can start immediately after authentication fixed)  
**Prerequisite**: Neo4j authentication working (see troubleshooting below)

### Neo4j Authentication Fix (CRITICAL — do first)

Neo4j 5.26 auto-generates a password on first startup. If you see auth failures in docker logs, fix it:

**Quick fix**:
```bash
bash scripts/diagnose-neo4j.sh          # Check connection status
docker exec legal-ai-neo4j cypher-shell -u neo4j -p neo4j123 'ALTER USER neo4j SET PASSWORD "neo4j123"'
echo 'NEO4J_PASSWORD=neo4j123' >> sveltekit-frontend/.env
```

**Full details**: See `docs/NEO4J-AUTHENTICATION-TROUBLESHOOTING.md`

### Implementation Checklist

- [ ] Create new file with header docstring
- [ ] Import: `neo4j driver`, `Zod`, typed Neo4j result
- [ ] Define `GraphSignalRequest` Zod schema
  - `conceptIds: string[]` (1–10 concept IDs)
  - `topK: number` (default 20, max 100)
  - `relationshipTypes: string[]?` (default `["USED_CONCEPT", "SIMILAR"]`)
- [ ] Define `GraphSignalResult` interface
  - `id: string` (packet ID)
  - `score: number` (relationship weight, normalized 0–1)
  - `text?: string` (packet summary from Neo4j payload)
  - `paths?: number` (how many distinct paths from query concepts)
- [ ] Implement `queryNeoJsGraphSignal(conceptIds, topK)`
  ```typescript
  1. Build Cypher query:
     MATCH (c:Concept)-[r:USED_CONCEPT|SIMILAR]->(p:Packet)
     WHERE c.id IN $conceptIds
     RETURN p.id, r.weight as score, p.summary as text, COUNT(DISTINCT c) as pathCount
     ORDER BY score DESC LIMIT $topK
  
  2. Execute query (driver.executeQuery)
  3. Map results to GraphSignalResult[]
  4. Handle 0 results gracefully (return empty, not error)
  ```
- [ ] Error handling: Neo4j unavailable → return empty, invalid Cypher → log and return empty
- [ ] Add connection health check (optional, can defer to Phase 4C)
- [ ] Export function for use in `rrf-integration.ts`

### Integration Point

In `rrf-integration.ts`, replace placeholder:
```typescript
// OLD (Phase 4A):
queryNeoJsGraphSignal(query)  // returns empty

// NEW (Phase 4B):
queryNeoJsGraphSignal(conceptIds, topK)  // uses extracted concepts
```

### Testing

```bash
# Verify Neo4j has edges:
cypher-shell "MATCH ()-[r:USED_CONCEPT]->() RETURN count(r) as edgeCount"

# Should show > 0 edges

# Then test API:
curl -X POST http://localhost:5173/api/search/rrf \
  -H "Content-Type: application/json" \
  -d '{"query":"ranking algorithm"}'

# Should return: breakdown.neoCount > 0 (if concepts extracted)
```

### Success Criteria

- [x] Compilation passes
- [x] Neo4j driver connects on startup
- [x] Cypher query executes without errors
- [x] Returns empty array if no Neo4j edges (graceful)
- [x] Result count <= topK
- [x] Scores in [0, 1] range (normalized)

---

## Task 3: Test Set Expansion to 20 Queries (5 hours)

**File**: `scripts/rrf-20-query-benchmark.ts` (NEW, 180 lines)  
**Blocked by**: Task 1 + Task 2 (need concept extraction + Neo4j working)

### Implementation Checklist

- [ ] Copy `scripts/rrf-ablation-test.ts` → new file
- [ ] Expand test dataset from 5 to 20 queries
  ```typescript
  const TEST_QUERIES_20 = [
    // Category 1: Ranking & Information Retrieval (5 queries)
    {
      query: "RRF multi-signal ranking algorithm",
      relevanceLabels: {
        "rrf-combiner": 1.0,
        "ranking-algorithms": 0.9,
        "information-retrieval": 0.8,
        // ...
      }
    },
    // Category 2: Database & SQL (5 queries)
    {
      query: "PostgreSQL full-text search and trigram indexing",
      relevanceLabels: { /* ... */ }
    },
    // Category 3: Vector & Semantic (5 queries)
    {
      query: "Qdrant vector similarity and ANN search",
      relevanceLabels: { /* ... */ }
    },
    // Category 4: Graph & Neo4j (5 queries)
    {
      query: "Neo4j relationships and Cypher queries",
      relevanceLabels: { /* ... */ }
    },
  ];
  ```
- [ ] Assign manual relevance labels (0.0–1.0) to 8–12 documents per query
  - 1.0 = highly relevant to query intent
  - 0.7–0.9 = somewhat relevant
  - 0.5–0.6 = tangentially related
  - 0.0 = not relevant
- [ ] For each query, run all 4 weight presets
- [ ] Collect metrics: DCG@10, NDCG@10, MRR@20, Recall@10
- [ ] Aggregate: compute per-query averages + per-preset averages
- [ ] Output format:
  ```
  Query 1: "RRF ranking..."
    default:        NDCG=0.75 MRR=0.55 Recall=0.65
    bm25_heavy:     NDCG=0.72 MRR=0.50 Recall=0.62
    concept_heavy:  NDCG=0.78 MRR=0.60 Recall=0.68
    vector_heavy:   NDCG=0.74 MRR=0.52 Recall=0.64
  
  ... (queries 2–20)
  
  SUMMARY:
  Preset          Avg NDCG    Avg MRR     Avg Recall
  default         0.72        0.53        0.65
  bm25_heavy      0.70        0.50        0.63
  concept_heavy   0.74        0.56        0.67
  vector_heavy    0.71        0.51        0.64
  
  RECOMMENDATION: concept_heavy preset wins on NDCG
  ```
- [ ] Add JSON export (for Langfuse logging or dashboard)
- [ ] Wire into package.json: `npm run rrf:benchmark:20-query`

### Testing

```bash
# Run benchmark:
npm run rrf:benchmark:20-query

# Expected output:
# - All 20 queries complete without timeout (60s max per query)
# - All 4 presets tested
# - NDCG@10 >= 0.70 on ALL queries
# - If any query < 0.70: investigate why (may indicate weak relevance labels)
```

### Success Criteria

- [x] 20 queries defined with manual relevance labels
- [x] Benchmark runs in <10 minutes (all 80 query+preset combos)
- [x] NDCG@10 >= 0.70 on all queries across all presets
- [x] No timeouts or crashes
- [x] JSON report generated with per-query + aggregate metrics
- [x] One preset identified as best performer

---

## Task 4: Package.json & npm Scripts (1 hour)

**File**: `package.json` (MODIFY existing)

### Checklist

- [ ] Add scripts (after existing `rrf:ablation-test`):
  ```json
  "rrf:benchmark:20-query": "tsx scripts/rrf-20-query-benchmark.ts",
  "rrf:benchmark:20-query:verbose": "tsx scripts/rrf-20-query-benchmark.ts --verbose",
  "rrf:gate:level-1": "npm run rrf:benchmark:20-query && echo '✅ Level 1 gate PASS (NDCG@10 >= 0.70)'"
  ```
- [ ] Verify no syntax errors: `npm run` (list all scripts)
- [ ] Test one script: `npm run rrf:benchmark:20-query --help` (should work)

---

## Task 5: Integration Tests (2 hours)

**Files**: Modified `src/lib/server/retrieval/rrf-integration.ts`

### Checklist

- [ ] Import new modules:
  ```typescript
  import { extractQueryConceptsViaGemma } from './concept-extraction-tool.js';
  import { queryNeoJsGraphSignal } from './neo4j-graph-signal.js';
  ```
- [ ] Update `multiLaneRetrievalWithRRF()`:
  ```typescript
  // Before (Phase 4A):
  conceptOverlapSearch([], topK)
  queryNeoJsGraphSignal(query)
  
  // After (Phase 4B):
  const concepts = await extractQueryConceptsViaGemma({ query, maxConcepts: 5 });
  conceptOverlapSearch(concepts, topK)
  
  const neoResults = await queryNeoJsGraphSignal(concepts, topK);
  // ...
  ```
- [ ] Test via API:
  ```bash
  curl -X POST http://localhost:5173/api/search/rrf \
    -H "Content-Type: application/json" \
    -d '{"query":"test query"}'
  ```
- [ ] Verify response includes all 4 signals:
  ```json
  {
    "breakdown": {
      "bm25Count": 10,
      "conceptCount": 5,
      "qdrantCount": 8,
      "neoCount": 3
    }
  }
  ```
- [ ] Run ablation test (existing):
  ```bash
  npm run rrf:ablation-test
  ```
- [ ] Run 20-query benchmark (new):
  ```bash
  npm run rrf:benchmark:20-query
  ```

---

## Task 6: Memory & Documentation (1 hour)

**Files**: `memory/MEMORY.md`, `docs/PHASE-4B-LEVEL-1-COMPLETE.md`

### Checklist

- [ ] Update MEMORY.md header:
  ```markdown
  ## Last Updated: [DATE] — Phase 4A COMPLETE; Phase 4B Level 1 COMPLETE
  ```
- [ ] Add Phase 4B status block:
  ```markdown
  **Phase 4B Level 1 Status**: ✅ COMPLETE
  - ✅ Concept extraction tool (Gemma4-based, 5 concepts per query)
  - ✅ Neo4j graph signal (USED_CONCEPT + SIMILAR edges)
  - ✅ 20-query benchmark (NDCG@10 >= 0.70 gate achieved)
  - ✅ All 4 RRF signals now fully operational
  ```
- [ ] Create completion summary: `docs/PHASE-4B-LEVEL-1-COMPLETE.md`
  - What was delivered (3 modules + benchmark)
  - Metrics achieved (NDCG@10, MRR, recall)
  - Performance profile (latency, throughput)
  - Next steps (Level 1 Phase 4C: SOM + hybrid index)

---

## Parallel Work (Weeks 2, no blocking)

**Phase 4C Level 1 tasks** (can start after Level 1 Phase 4B complete):
- SOM topology integration: boost nearby clusters in RRF
- Hybrid index: skip Qdrant if BM25 score > 0.8 (latency optimization)
- Langfuse telemetry: log RRF breakdown per query
- Production safeguards: circuit breaker per signal (if any signal fails, skip it)

**Do NOT start Level 2 work** until:
- NDCG@10 >= 0.70 confirmed on 20 queries
- Latency p95 < 250ms measured
- Error rate < 0.5% on production-like traffic

---

## Success Criteria for Level 1 Complete

✅ **Concept extraction**:
- Returns 3–5 relevant concepts per query
- Matches concept_ids in Postgres
- No memory OOMs on large queries

✅ **Neo4j signal**:
- Executes Cypher without errors
- Returns <20 packets per query
- Scores normalized to [0, 1]

✅ **20-query benchmark**:
- All queries < 60s each
- NDCG@10 >= 0.70 across all presets
- No timeouts or crashes
- JSON report with aggregates

✅ **Integration**:
- API `/api/search/rrf` returns all 4 signals
- breakdown shows non-zero counts for all lanes
- RRF combiner merges all signals correctly

✅ **Documentation**:
- MEMORY.md updated with Level 1 status
- Completion document created
- No open questions about implementation

---

## Estimated Effort

| Task | Hours | Days | Difficulty |
|------|-------|------|------------|
| 1. Concept extraction | 4 | 1 | Medium (LLM integration) |
| 2. Neo4j signal | 4 | 1 | Medium (Cypher debugging) |
| 3. 20-query benchmark | 5 | 1.5 | Low (copy + extend) |
| 4. npm scripts | 1 | 0.5 | Trivial |
| 5. Integration tests | 2 | 0.5 | Medium |
| 6. Documentation | 1 | 0.5 | Low |
| **TOTAL** | **17** | **~5** | **Medium** |

**Timeline**: Weeks 1–2 (5 working days), 3–4 hours/day typical.

---

## DO NOT DO (Common Mistakes)

❌ **Don't implement MessagePack yet** — Level 2 task  
❌ **Don't add GPU JSON** — Level 3, only if scale demands  
❌ **Don't optimize latency** — Baseline first, optimize in Phase 4C  
❌ **Don't build SOM clustering** — That's Phase 4C Level 1  
❌ **Don't write FlatBuffers schema** — Deferred to Year 2  
❌ **Don't parallelize Gemma4 concept extraction** — Single-threaded for now, batch later

---

## References

**Roadmap**: `memory/phase-4b-4c-three-level-roadmap.md`  
**Phase 4A delivery**: `memory/phase-4a-implementation-delivery.md`  
**RRF integration**: `src/lib/server/retrieval/rrf-integration.ts`  
**Existing ablation test**: `scripts/rrf-ablation-test.ts` (copy this pattern)
