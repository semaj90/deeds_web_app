# Option B Execution Sequence: Multi-Vector Lane Deployment

**Status**: ✅ **READY TO EXECUTE**  
**Timeline**: 2-3 days to production  
**Decision Point**: July 8, 2026 (after Session 121 latent64 gate failure)

---

## Pre-Execution Checklist

### Prerequisite Validation
```bash
# 1. Verify all 40K+ packets in Postgres
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM codebase_chunk_index;"
# Expected: 39,151 packets

# 2. Verify Qdrant has codebase_chunks_768 collection
curl -s http://127.0.0.1:6333/collections/codebase_chunks_768 | jq '.result.points_count'
# Expected: ~40,500 points

# 3. Verify Valkey running
docker exec legal-ai-valkey redis-cli -a redis PING
# Expected: PONG

# 4. Verify Postgres has content_embedding column (384-dim halfvec)
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT column_name, data_type FROM information_schema.columns \
   WHERE table_name='codebase_chunk_index' AND column_name LIKE 'embedding';"
# Expected: content_embedding halfvec(768) or similar

echo "✅ All prerequisites verified" || echo "❌ HALT: Prerequisites missing"
```

---

## Phase 1: Keyword Extraction (2-3 hours)

**Goal**: Extract 2-10 keywords from each of 40K packets for keyword lane.

### Step 1.1: Dry-Run Keyword Extraction
```bash
cd sveltekit-frontend
npm run atlas:phase3b2:keywords:dry 2>&1 | tee /tmp/keywords-dry.log

# Expected output:
# ✅ Loaded 40,151 packets from Postgres
# 🔍 DRY-RUN: Would extract keywords from first 100 packets...
# Sample keywords: ['authentication', 'session', 'validation', 'middleware', ...]
# ✅ Dry-run complete. Ready to apply.
```

**Gate 1.1**: Dry-run must complete without errors. If fails:
```
❌ ERROR: Keywords extraction failed
→ Check: Postgres connection, embedding column, memory
→ HALT and investigate before proceeding
```

### Step 1.2: Apply Keyword Extraction
```bash
npm run atlas:phase3b2:keywords:apply 2>&1 | tee /tmp/keywords-apply.log

# Expected runtime: 30-60 min (40K packets)
# Monitor progress in logs
```

**Gate 1.2**: All packets must have keywords extracted.
```bash
# Verify coverage
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*), COUNT(semantic_tags) as with_tags \
   FROM codebase_chunk_index 
   WHERE semantic_tags IS NOT NULL AND ARRAY_LENGTH(semantic_tags, 1) > 0;"
# Expected: COUNT(*) = 39,151, with_tags ≥ 38,000 (≥97% coverage)
```

**If Gate 1.2 fails**:
```
❌ Coverage <97%
→ Investigate: LLM failures, API rate limits, encoding errors
→ Options: 
   a) Retry failed packet batch
   b) Use fallback keyword extraction (lexical only)
   c) HALT if >5% coverage loss
```

### Step 1.3: Validate Keyword Quality
```bash
# Sample check: keywords should be semantically relevant
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT relative_path, semantic_tags FROM codebase_chunk_index 
   WHERE semantic_tags IS NOT NULL 
   LIMIT 5;"

# Visual inspection: Do keywords match file content?
# Expected: Keywords like 'auth', 'validation', 'middleware' for auth.ts
```

**If quality is poor**:
```
⚠️ Keywords don't match content
→ Possible causes: LLM model switch, tokenizer issue, embedding mismatch
→ Options:
   a) Regenerate with keyword extraction debug enabled
   b) Use fallback simple keyword extraction (TF-IDF + noun extraction)
   c) Document known limitation and proceed (acceptable)
```

---

## Phase 2: Verify Qdrant Named Vectors (1-2 hours)

**Goal**: Confirm content, summary, title vectors are indexed in Qdrant.

### Step 2.1: Check Collection Configuration
```bash
curl -s http://127.0.0.1:6333/collections/codebase_chunks_768 | jq '.result.vectors_config'

# Expected output:
# {
#   "content": { "size": 768, "distance": "Cosine" },
#   "summary": { "size": 768, "distance": "Cosine" },
#   "title": { "size": 768, "distance": "Cosine" }
# }
```

**Gate 2.1**: All three vectors must exist. If missing:
```
❌ Named vector missing: <vector_name>
→ Create via Qdrant API:
   curl -X PUT http://127.0.0.1:6333/collections/codebase_chunks_768/vectors \
     -H "Content-Type: application/json" \
     -d '{"vectors": {"<vector_name>": {"size": 768, "distance": "Cosine"}}}'
```

### Step 2.2: Verify Vector Coverage
```bash
# Sample: Count points with each vector populated
curl -s -X POST http://127.0.0.1:6333/collections/codebase_chunks_768/search \
  -H "Content-Type: application/json" \
  -d '{
    "vector": "content",
    "limit": 1,
    "query": [0.0]  # dummy query
  }' | jq '.result | length'

# Expected: Each vector should have ~39,000+ points
```

**Gate 2.2**: Each vector must have ≥98% coverage. If not:
```
❌ Vector coverage <98%: <vector_name>
→ Options:
   a) Backfill missing vectors from embeddings pipeline
   b) Use fallback (content vector only) and skip missing vectors
   c) HALT if any vector has <90% coverage
```

### Step 2.3: Test Single Vector Search
```bash
# Query via content vector
QUERY_EMBEDDING="[0.1, 0.2, 0.3, ... (768 dims)]"  # sample embedding

curl -s -X POST http://127.0.0.1:6333/collections/codebase_chunks_768/search \
  -H "Content-Type: application/json" \
  -d "{
    \"vector\": \"content\",
    \"limit\": 10,
    \"query\": $QUERY_EMBEDDING
  }" | jq '.result | length'

# Expected: Returns 10 results, latency <50ms
```

**Gate 2.3**: ANN search must work and complete in <100ms. If fails:
```
❌ Vector search failed or too slow
→ Investigate: Qdrant index corruption, HNSW parameters, network latency
→ Options:
   a) Rebuild Qdrant collection
   b) Increase ef_construction timeout
   c) HALT if search consistently >200ms
```

---

## Phase 3: Implement RRF Fusion (2-3 hours)

**Goal**: Create RRF fusion module to blend 4 retrieval lanes.

### Step 3.1: Create RRF Module
```bash
# File: src/lib/server/retrieval/rrf-multi-vector.ts (200 lines)
# Implements:
#   - fuseLanesViaRrf(lanes: RetrievalLane[]) → FusedResults[]
#   - RRF scoring: 1/(k + rank) per lane
#   - Parallel lane execution
#   - Error handling per lane

cat > sveltekit-frontend/src/lib/server/retrieval/rrf-multi-vector.ts <<'EOF'
import type { QdrantSearchResult } from 'qdrant-js-client';

export interface RetrievalLane {
  name: string;
  weight: number;
  results: QdrantSearchResult[];
  error?: string;
}

export function fuseLanesViaRrf(lanes: RetrievalLane[]): FusedResult[] {
  const candidateMap = new Map<string, FusedResult>();

  // RRF scoring: for each lane, assign reciprocal rank scores
  for (const lane of lanes) {
    if (lane.error) {
      console.warn(`Lane ${lane.name} failed: ${lane.error}`);
      continue;
    }

    for (let rank = 0; rank < lane.results.length; rank++) {
      const result = lane.results[rank];
      const scoreKey = result.id;
      
      if (!candidateMap.has(scoreKey)) {
        candidateMap.set(scoreKey, {
          id: scoreKey,
          payload: result.payload,
          score: 0
        });
      }

      const candidate = candidateMap.get(scoreKey)!;
      const rrfScore = lane.weight / (60 + rank);  // 60 = k parameter
      candidate.score += rrfScore;
    }
  }

  // Sort by fused score, normalize to [0, 1]
  const results = Array.from(candidateMap.values())
    .sort((a, b) => b.score - a.score);

  const maxScore = results[0]?.score || 1;
  for (const result of results) {
    result.score = result.score / maxScore;
  }

  return results;
}

export interface FusedResult {
  id: string;
  payload: any;
  score: number;
}
EOF
```

### Step 3.2: Unit Tests
```bash
# File: tests/retrieval/rrf-multi-vector.spec.ts (150 lines)
# Tests:
#   - RRF scoring correctness (rank-based, weight-normalized)
#   - Tie-breaking (stable sort)
#   - Lane error isolation
#   - Empty lane handling

npm run test:retrieval:rrf:unit 2>&1
# Expected: All tests pass
```

**Gate 3.2**: Unit tests must all pass. If fails:
```
❌ Unit test failure: <test_name>
→ Debug RRF scoring logic
→ HALT and fix before proceeding
```

### Step 3.3: Integration Test (Mock Lanes)
```bash
npm run test:retrieval:rrf:integration 2>&1
# Expected: Integration tests pass with mock lane results
```

**Gate 3.3**: Integration tests must pass. If fails:
```
❌ Integration test failure
→ Check: Lane result parsing, score normalization, candidate merging
→ HALT and fix before proceeding
```

---

## Phase 4: Wire into Retrieval Bridge (2-3 hours)

**Goal**: Integrate RRF fusion into the live retrieval path.

### Step 4.1: Modify Go Retrieval Bridge
```bash
# File: src/lib/server/retrieval/go-retrieval-bridge.ts
# Add multi-vector orchestration:

cat >> sveltekit-frontend/src/lib/server/retrieval/go-retrieval-bridge.ts <<'EOF'

/**
 * Multi-vector lane execution and RRF fusion
 */
async function executeMultiVectorRetrieval(
  query: string,
  embedding: number[],
  options: RetrievalOptions
) {
  const startTime = Date.now();

  // Execute 4 lanes in parallel
  const [contentResults, summaryResults, titleResults, keywordResults] = 
    await Promise.allSettled([
      qdrantSearch('content', embedding, 100),
      qdrantSearch('summary', embedding, 100),
      qdrantSearch('title', embedding, 100),
      executeKeywordSearch(query, 100)
    ]);

  // Collect results (handle errors gracefully)
  const lanes = [
    {
      name: 'content',
      weight: 0.40,
      results: contentResults.status === 'fulfilled' ? contentResults.value : [],
      error: contentResults.status === 'rejected' ? contentResults.reason?.message : undefined
    },
    {
      name: 'summary',
      weight: 0.30,
      results: summaryResults.status === 'fulfilled' ? summaryResults.value : [],
      error: summaryResults.status === 'rejected' ? summaryResults.reason?.message : undefined
    },
    {
      name: 'title',
      weight: 0.20,
      results: titleResults.status === 'fulfilled' ? titleResults.value : [],
      error: titleResults.status === 'rejected' ? titleResults.reason?.message : undefined
    },
    {
      name: 'keywords',
      weight: 0.10,
      results: keywordResults.status === 'fulfilled' ? keywordResults.value : [],
      error: keywordResults.status === 'rejected' ? keywordResults.reason?.message : undefined
    }
  ];

  // Fuse via RRF
  const fusedResults = fuseLanesViaRrf(lanes);

  // Apply identity validation gate
  const validatedResults = await validatePacketIdentity(fusedResults);

  return {
    results: validatedResults.slice(0, 10),  // Return top-10
    timing: {
      total_ms: Date.now() - startTime,
      multi_vector_ms: Date.now() - startTime
    },
    lanes: lanes.map(l => ({ name: l.name, weight: l.weight, count: l.results.length }))
  };
}
EOF
```

### Step 4.2: Type Check
```bash
cd sveltekit-frontend
npm run build:check 2>&1

# Expected: TypeScript compilation succeeds, 0 errors
```

**Gate 4.2**: TypeScript must compile without errors. If fails:
```
❌ TypeScript compilation failed
→ Fix type errors in RRF module or bridge
→ HALT and fix before proceeding
```

### Step 4.3: Add Feature Flag (Optional Traffic Ramp)
```bash
# File: src/lib/server/config/feature-flags.ts

export const FEATURE_FLAGS = {
  MULTI_VECTOR_ENABLED: process.env.MULTI_VECTOR_ENABLED === 'true',
  MULTI_VECTOR_TRAFFIC_PCT: parseInt(process.env.MULTI_VECTOR_TRAFFIC_PCT || '0')
};

// In retrieval bridge:
if (FEATURE_FLAGS.MULTI_VECTOR_ENABLED) {
  const shouldUseMultiVector = Math.random() * 100 < FEATURE_FLAGS.MULTI_VECTOR_TRAFFIC_PCT;
  if (shouldUseMultiVector) {
    return executeMultiVectorRetrieval(query, embedding, options);
  }
}
return executeUnifiedRetrieval(query, embedding, options);  // fallback
```

---

## Phase 5: A/B Testing (2-3 hours)

**Goal**: Validate multi-vector retrieval against baseline on 20 diverse queries.

### Step 5.1: Run A/B Test (Dry-Run)
```bash
cd sveltekit-frontend
npm run atlas:retrieval:validate:multi-vector:dry 2>&1 | tee /tmp/ab-test-dry.log

# Expected output:
# Testing 20 queries...
# Query 1/20: "authentication session validation"
#   Unified: latency=125ms, recall@100=100%, ndcg@20=0.76
#   MultiVector: latency=130ms, recall@100=100%, ndcg@20=0.78
# ...
# SUMMARY:
#   Recall@100: 100% (target ≥98%) ✅
#   Latency p95: 145ms (target ≤150ms) ✅
#   NDCG@20: 0.74 (target ≥0.72) ✅
```

**Gate 5.1**: All metrics must pass. If any fail:
```
❌ Gate failure: <metric> = <value> << <threshold>
→ Investigate:
   - Recall loss: Are lanes returning wrong candidates? Debug lane results
   - Latency regression: Is parallel execution slower? Check Qdrant perf
   - Quality regression: Are rankings worse? Check RRF weight distribution
→ Options:
   a) Adjust RRF weights and retest
   b) Investigate individual lane performance bottleneck
   c) HALT if failure is systematic (not tuning issue)
```

### Step 5.2: Full A/B Test (Apply)
```bash
npm run atlas:retrieval:validate:multi-vector:apply 2>&1 | tee /tmp/ab-test-apply.log

# Expected runtime: 30-60 min (100+ queries)
# Generates: reports/phase5-ab-test/results.json
```

**Gate 5.2**: All success criteria must pass on full test set.
```bash
# Check results
jq '.gates' reports/phase5-ab-test/results.json

# Expected output:
# {
#   "recall_at_100": { "value": 0.99, "threshold": 0.98, "pass": true },
#   "latency_p95_ms": { "value": 142, "threshold": 150, "pass": true },
#   "ndcg_20": { "value": 0.73, "threshold": 0.72, "pass": true }
# }
```

**If any gate fails**:
```
❌ A/B test failed on full test set
→ Options:
   a) Run diagnostic: which lane is causing the failure?
   b) Adjust RRF weights (try: 0.35·content + 0.35·summary + 0.15·title + 0.15·keywords)
   c) Investigate individual query failures (outliers)
   d) HALT if systematic failure (not tuning issue)
```

---

## Phase 6: Production Deployment (1-2 hours)

**Goal**: Gradual traffic ramp to multi-vector retrieval.

### Step 6.1: 5% Traffic Ramp
```bash
# Enable multi-vector on 5% of traffic
export MULTI_VECTOR_ENABLED=true
export MULTI_VECTOR_TRAFFIC_PCT=5

# Restart app or deploy feature flag
npm run deploy:feature-flag:multi-vector:5pct

# Monitor for 5 min
sleep 300

# Check error logs
docker logs sveltekit-frontend 2>&1 | grep -E "ERROR|FAIL" | head -10
# Expected: 0 errors

# Check metrics
curl http://127.0.0.1:5173/api/metrics/retrieval | jq '.multi_vector_calls'
# Expected: >0 (traffic flowing through multi-vector path)
```

**Gate 6.1**: No errors, traffic flowing. If issues:
```
❌ Errors or no traffic on 5%
→ Investigate: Is feature flag wired? Are lanes executing?
→ Rollback: export MULTI_VECTOR_TRAFFIC_PCT=0
→ HALT and debug before proceeding
```

### Step 6.2: 25% Traffic Ramp
```bash
export MULTI_VECTOR_TRAFFIC_PCT=25
npm run deploy:feature-flag:multi-vector:25pct
sleep 300

# Monitor metrics
curl http://127.0.0.1:5173/api/metrics/retrieval | jq '.multi_vector_calls, .errors'
```

**Gate 6.2**: Error rate must be <1%, latency must not regress >10%.

### Step 6.3: 100% Traffic Ramp
```bash
export MULTI_VECTOR_TRAFFIC_PCT=100
npm run deploy:feature-flag:multi-vector:100pct

# Full monitoring (see Phase 7)
```

**Gate 6.3**: All systems green, no rollback needed.

---

## Phase 7: Monitoring + Validation (1-2 hours)

**Goal**: 24-hour soak test to confirm stability.

### Step 7.1: Set Up Grafana Dashboard
```bash
# Metrics to track:
# - retrieval.recall_at_100 (per lane + fused)
# - retrieval.latency_p95_ms (per lane + fused)
# - retrieval.ndcg_20 (overall relevance)
# - retrieval.cache_hit_rate
# - retrieval.errors_total

# Expected baselines (from A/B test):
# - Recall@100: 99%
# - Latency p95: 145ms
# - NDCG@20: 0.73
# - Cache hit rate: 40%+
# - Errors: <0.1%
```

### Step 7.2: 24-Hour Soak Test
```bash
# Run overnight, monitor for:
# - Sustained metric stability (no drift)
# - Zero critical errors
# - Zero lane timeouts
# - Cache hit rate stable

# Morning check: All metrics still green?
curl http://127.0.0.1:5173/api/metrics/retrieval | jq '.summary'
```

**Gate 7.2**: 24-hour period must pass without incident.
```
If issues detected:
  ❌ Metric anomaly or error surge
  → Rollback to baseline: export MULTI_VECTOR_TRAFFIC_PCT=0
  → Investigate root cause
  → Retry soak test after fix
  
If successful:
  ✅ Multi-vector lanes LIVE in production
  → Commit feature flag to main branch
  → Document in CHANGELOG.md
  → Brief operations team
```

---

## Rollback Procedure (If Needed)

**Immediate rollback** (any phase):
```bash
# Disable multi-vector immediately
export MULTI_VECTOR_TRAFFIC_PCT=0
npm run deploy:feature-flag:multi-vector:0pct

# Verify traffic returned to baseline
curl http://127.0.0.1:5173/api/metrics/retrieval | jq '.multi_vector_calls'
# Expected: 0

# Collect logs for post-mortem
docker logs sveltekit-frontend > /tmp/logs-before-rollback.txt
```

**Investigate root cause**:
```bash
# Check which lane failed
jq '.lanes' reports/phase5-ab-test/results.json
# Identify: content / summary / title / keywords

# Retest individual lane
npm run test:retrieval:<lane_name>:dry

# Check Qdrant / Valkey health
curl http://127.0.0.1:6333/health
curl http://127.0.0.1:5173/api/health
```

---

## Success Checklist

✅ **Phase 1**: Keywords extracted for 40K+ packets  
✅ **Phase 2**: Qdrant vectors verified (content, summary, title)  
✅ **Phase 3**: RRF fusion module implemented + tested  
✅ **Phase 4**: Retrieval bridge wired + TypeScript passing  
✅ **Phase 5**: A/B test passes all gates (Recall ≥98%, Latency ≤150ms, NDCG ≥0.72)  
✅ **Phase 6**: Production ramp 5% → 25% → 100% (no errors)  
✅ **Phase 7**: 24-hour soak test clean (metric stability, zero errors)  

---

## Timeline Summary

| Phase | Duration | Cumulative |
|-------|----------|-----------|
| 1: Keywords | 2-3h | 2-3h |
| 2: Verify Qdrant | 1-2h | 3-5h |
| 3: RRF Module | 2-3h | 5-8h |
| 4: Wiring | 2-3h | 7-11h |
| 5: A/B Test | 2-3h | 9-14h |
| 6: Deployment | 1-2h | 10-16h |
| 7: Monitoring | 24h+ | 34h+ |

**Total**: ~2 calendar days (active work + overnight soak test)

---

## Emergency Contacts

If critical issue arises:
- Check logs: `docker logs sveltekit-frontend | grep -E "ERROR|CRITICAL"`
- Rollback immediately: `export MULTI_VECTOR_TRAFFIC_PCT=0`
- Investigate via A/B test dry-run: `npm run atlas:retrieval:validate:multi-vector:dry`
- Escalate to architecture review (not a simple tuning issue)

---

**Status**: 🚀 **READY TO EXECUTE** — All phases defined, gates specified, rollback procedure clear.
