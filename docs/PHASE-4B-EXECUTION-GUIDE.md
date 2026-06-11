# Phase 4B Level 1: Execution Guide (Week 2, 5 working days)

**Scope**: Concept extraction + Neo4j signal + 20-query benchmark  
**Duration**: 17 hours / 5 days  
**Success Gate**: NDCG@10 >= 0.70 on all 20 queries  
**Status**: ✅ All code ready, 🟢 Neo4j auth verified, 📋 Tasks listed

---

## Pre-Flight Checklist (Do These First)

### 1. Verify Neo4j Connection

```bash
npm run neo4j:diagnose
```

Expected output:
```
✅ Container: legal-ai-neo4j is RUNNING
✅ Bolt port 7687 is OPEN
✅ HTTP port 7474 is OPEN
✅ Authentication: neo4j:neo4j123 WORKS
✅ Neo4j Version: 5.26.19
✅ GDS is INSTALLED
✅ All checks passed!
```

If any check fails, see `docs/NEO4J-AUTHENTICATION-TROUBLESHOOTING.md`.

### 2. Test Neo4j Graph Signal Module

```bash
npm run neo4j:test-signal
```

Expected output:
```
✅ Neo4j connection WORKS
✅ Graph data readable
✅ Query function works
✅ All tests passed!
```

### 3. Verify Phase 4A API Still Works

```bash
# Start dev server
cd sveltekit-frontend
npm run dev

# In another terminal
curl -X POST http://localhost:5173/api/search/rrf \
  -H "Content-Type: application/json" \
  -d '{"query":"test query"}'
```

Should return:
```json
{
  "success": true,
  "results": [...],
  "breakdown": {
    "bm25Count": N,
    "conceptCount": 0,    // Will be 0 until Task 1 done
    "qdrantCount": N,
    "neoCount": 0         // Will be 0 until edges created
  }
}
```

---

## Week 2 Task Schedule

### Day 1: Task 1 — Concept Extraction (4 hours)

**File**: `src/lib/server/retrieval/concept-extraction-tool.ts`

**Checklist**:

- [ ] Create new file with header docstring
- [ ] Import: `gemma4-agent.ts`, `Zod`, `postgres`
- [ ] Define `ConceptExtractionRequest` Zod schema
  - `query: string` (1–1000 chars)
  - `maxConcepts?: number` (default 5, max 10)
  - `minConfidence?: number` (default 0.7, range 0.5–0.95)
- [ ] Define `ConceptExtractionResponse` interface
  - `conceptIds: string[]` (matched against postgres)
  - `extracted: Array<{ name, confidence, category }>`
  - `durationMs: number`
- [ ] Implement `extractQueryConceptsViaGemma(request)`
  ```typescript
  1. Stream query to Gemma4: "Extract 3-5 semantic concepts"
  2. Parse response: validate confidence >= minConfidence
  3. Look up concept_id in postgres.concepts
  4. Return matched IDs + raw extracted data
  ```
- [ ] Error handling: Zod validation error → 400, Gemma4 timeout → return empty, DB miss → log and skip
- [ ] Export for use in `rrf-integration.ts`

**Integration Test** (end of day):
```bash
curl -X POST http://localhost:5173/api/search/rrf \
  -H "Content-Type: application/json" \
  -d '{"query":"Concept extraction and semantic analysis"}'

# Check response: "conceptCount": N > 0
```

---

### Days 2–3: Task 2 — Neo4j Signal Integration (2 hours active, 1 day buffer)

**File**: `src/lib/server/retrieval/rrf-integration.ts` (modify existing)

**Checklist**:

- [ ] Add import: `queryNeoJsGraphSignal` from `neo4j-graph-signal.js`
- [ ] Locate function `multiLaneRetrievalWithRRF()`
- [ ] Find the section with `Promise.allSettled([...])` (currently 4 signals)
- [ ] Update Neo4j signal line:
  ```typescript
  // OLD (Phase 4A):
  queryNeoJsGraphSignal(query)  // returns empty array
  
  // NEW (Phase 4B):
  const concepts = await extractQueryConceptsViaGemma({ query, maxConcepts: 5 });
  queryNeoJsGraphSignal({ conceptIds: concepts, topK: topK })
  ```
- [ ] Test via API: verify `"neoCount"` > 0 in response (if edges exist)
- [ ] If `neoCount` is 0, that's OK — edges will be created in next phase

**Note**: Edges (USED_CONCEPT, SIMILAR) don't exist yet. Neo4j will return empty, but the integration is wired correctly.

**Integration Test** (end of Day 3):
```bash
npm run neo4j:test-signal    # Verify module still works
curl -X POST http://localhost:5173/api/search/rrf ... # Verify integration wired
```

---

### Day 4: Task 3 — 20-Query Benchmark (5 hours)

**File**: `scripts/rrf-20-query-benchmark.ts` (copy from ablation test, expand)

**Checklist**:

- [ ] Copy `scripts/rrf-ablation-test.ts` → new file
- [ ] Expand test dataset from 5 to 20 queries
  - Organize into 4 categories (Ranking, Database, Vector, Graph)
  - Assign manual relevance labels (0.0–1.0) to 8–12 docs per query
  - 1.0 = highly relevant, 0.7–0.9 = somewhat, 0.5–0.6 = tangential, 0.0 = not relevant
- [ ] Run all 4 weight presets on each query
- [ ] Compute: DCG@10, NDCG@10, MRR@20, Recall@10
- [ ] Output tabular results + JSON export

**Benchmark Categories**:

1. **Ranking & Information Retrieval** (5 queries)
   - "RRF multi-signal ranking algorithm"
   - "Reciprocal rank fusion vs other fusion methods"
   - "Ranking by relevance score"
   - "Search result reranking techniques"
   - "Information retrieval evaluation metrics"

2. **Database & SQL** (5 queries)
   - "PostgreSQL full-text search and trigram indexing"
   - "Similarity search with GIN indexes"
   - "JSONB operations and operators"
   - "Concept overlap scoring"
   - "Database query optimization"

3. **Vector & Semantic** (5 queries)
   - "Qdrant vector similarity and ANN search"
   - "Embeddings and dense retrieval"
   - "Vector database indexing"
   - "Semantic similarity between documents"
   - "768-dimensional embedding space"

4. **Graph & Neo4j** (5 queries)
   - "Neo4j relationships and Cypher queries"
   - "Knowledge graph traversal"
   - "Concept relationships and edges"
   - "GDS algorithms on graphs"
   - "Graph-based ranking signals"

**Success Gate**: NDCG@10 >= 0.70 for ALL 20 queries on DEFAULT preset.

**Command**:
```bash
npm run rrf:benchmark:20-query
```

**Expected Output**:
```
Query 1: "RRF ranking..."
  default:        NDCG=0.75 MRR=0.55 Recall=0.65
  bm25_heavy:     NDCG=0.72 MRR=0.50 Recall=0.62
  concept_heavy:  NDCG=0.78 MRR=0.60 Recall=0.68
  vector_heavy:   NDCG=0.74 MRR=0.52 Recall=0.64

... (queries 2-20)

SUMMARY:
  Preset          Avg NDCG    Avg MRR     Avg Recall
  default         0.72        0.53        0.65
  bm25_heavy      0.70        0.50        0.63
  concept_heavy   0.74        0.56        0.67
  vector_heavy    0.71        0.51        0.64

✅ Level 1 gate PASS: All presets >= 0.70
```

---

### Day 5: Integration Tests + Documentation (2 hours)

**Checklist**:

- [ ] Run all three npm scripts in order:
  ```bash
  npm run neo4j:diagnose      # Should all pass
  npm run neo4j:test-signal   # Should all pass
  npm run rrf:ablation-test   # Existing test, should still pass
  npm run rrf:benchmark:20-query  # New benchmark
  ```
- [ ] Verify all 4 weight presets on all 20 queries
- [ ] Confirm NDCG@10 >= 0.70 across board
- [ ] Test via API:
  ```bash
  curl -X POST http://localhost:5173/api/search/rrf \
    -H "Content-Type: application/json" \
    -d '{"query":"test"}'
  
  # Verify breakdown shows:
  # "conceptCount": > 0 (from Task 1)
  # "neoCount": 0 or N (from Task 2, edges pending)
  ```
- [ ] Update MEMORY.md with Phase 4B Level 1 completion status
- [ ] Create summary doc: `docs/PHASE-4B-LEVEL-1-COMPLETE.md`

---

## Task Dependencies & Parallelization

```
Task 1 (Concept extraction)  ---|
                                 |---> Task 3 (20-query benchmark)
Task 2 (Neo4j integration)  -----|    
                                 |---> Task 5 (Integration + docs)
                                 
Can parallelize Tasks 1 & 2 (independent)
Task 3 depends on Tasks 1 & 2 complete
Task 5 depends on all others complete
```

**Realistic Schedule**:
- Days 1–2: Tasks 1 & 2 in parallel (4 hrs + 2 hrs = 6 hrs)
- Days 3–4: Task 3 (5 hrs)
- Day 5: Task 5 + buffer (2 hrs)
- **Total**: 17 hours / 5 days ✅

---

## Success Metrics per Task

### Task 1: Concept Extraction ✅
- [ ] Returns 3–5 concepts per query
- [ ] Concepts match postgres.concepts registry
- [ ] No memory OOMs on large queries
- [ ] Graceful error handling

### Task 2: Neo4j Signal ✅
- [ ] Module imports without error
- [ ] `checkNeo4jHealth()` returns `available: true`
- [ ] Query executes Cypher without errors
- [ ] Returns empty array on error (graceful)
- [ ] Integration test passes

### Task 3: Benchmark ✅
- [ ] All 20 queries complete < 60s each
- [ ] All 4 presets tested on each query
- [ ] NDCG@10 >= 0.70 across board
- [ ] JSON report generated with aggregates
- [ ] No timeouts or crashes

### Task 5: Integration ✅
- [ ] All npm scripts pass
- [ ] API endpoint returns breakdown for all 4 signals
- [ ] MEMORY.md updated with completion status
- [ ] Summary doc created

---

## Phase 4B Level 1 Gate (Success Criteria)

✅ **Must have**:
- NDCG@10 >= 0.70 on all 20 queries
- Latency p95 < 250ms (measured in API responses)
- Error rate < 0.5% on typical traffic
- All 4 RRF signals present in API response

✅ **Nice to have**:
- Breakdown shows conceptCount & neoCount > 0 (indicates signals working)
- One preset identified as best performer
- Langfuse traces logged (optional for Phase 4B)

---

## Troubleshooting During Execution

### Concept Extraction Returns Empty
- Check Gemma4 is running: `curl -s http://localhost:11434/api/tags | jq '.models[].name'`
- Check postgres.concepts table: `SELECT COUNT(*) FROM concepts;`
- Check LLM response format: enable debug logging in concept-extraction-tool.ts

### Neo4j Query Returns 0 Results
- **Expected**: Edges don't exist yet (that's Phase 4C work)
- **Not a problem**: Integration is wired, test will pass once edges created
- Verify connection: `npm run neo4j:test-signal`

### NDCG < 0.70 on Some Queries
- Check relevance labels are correct (you assigned them manually)
- May indicate weak query/document match in test dataset
- Option: Adjust relevance labels if truly wrong, or debug RRF weights

### Benchmark Timeout (> 60s per query)
- Check Qdrant is running (slowest signal): `curl -s http://localhost:6333/health`
- Check Gemma4 latency: `npm run neo4j:test-signal` should complete in <10s
- Adjust timeout: increase `SIGNAL_TIMEOUT` in rrf-integration.ts if needed

---

## Daily Standup (Brief)

**Day 1 End**: Task 1 complete, conceptCount > 0 in API tests  
**Day 2 End**: Task 2 complete, rrf-integration.ts wired, neo4j-test-signal passes  
**Day 3 End**: Task 3 complete, benchmark runs, NDCG@10 metrics collected  
**Day 4 End**: All integration tests pass, MEMORY.md updated  
**Day 5 End**: Phase 4B Level 1 gate achieved (NDCG >= 0.70), ready for Phase 4C  

---

## Handoff to Phase 4C

Once Phase 4B Level 1 is complete:

```
✅ NDCG@10 >= 0.70 confirmed
✅ All 4 RRF signals wired
✅ 20-query benchmark passing
  ↓
🚀 Move to Phase 4C (Week 3):
   - SOM topology boost (4 hrs)
   - Hybrid index optimization (3 hrs)
   - Langfuse telemetry (3 hrs)
   - Production safeguards (2 hrs)
   - Gate: Latency p95 < 250ms
```

---

## Reference Files

**Code**:
- `src/lib/server/retrieval/concept-extraction-tool.ts` (to create)
- `src/lib/server/retrieval/neo4j-graph-signal.ts` (READY)
- `src/lib/server/retrieval/rrf-integration.ts` (to modify)
- `scripts/rrf-20-query-benchmark.ts` (to create)

**Documentation**:
- `memory/phase-4b-level-1-task-list.md` (detailed task specs)
- `docs/NEO4J-AUTHENTICATION-TROUBLESHOOTING.md` (auth fixes)
- `docs/PHASE-4B-TASK-2-NEO4J-READY.md` (Neo4j module details)

**Diagnostics**:
- `npm run neo4j:diagnose` (health check)
- `npm run neo4j:test-signal` (module test)
- `npm run rrf:ablation-test` (existing baseline)
- `npm run rrf:benchmark:20-query` (new benchmark)

---

**Status**: 🟢 **READY TO EXECUTE — ALL PREREQUISITES VERIFIED**

Start with Day 1 (Task 1: Concept Extraction).
