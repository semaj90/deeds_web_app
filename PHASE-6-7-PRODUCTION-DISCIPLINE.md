# Phase 6–7 Production Discipline

**Session 122 → 123: From Implementation-Complete to Production-Complete**

---

## Current State

| Layer | Status | Evidence |
|-------|--------|----------|
| Retrieval architecture | ✅ Implemented | RRF module, 4 lanes, validation gates |
| Multi-vector routing | ✅ Implemented | Go facade integration, feature flag |
| Keyword extraction | ✅ Implemented | 26.8K unique keywords, 31K features |
| Deployment tooling | ✅ Implemented | Canary scripts, rollback, npm commands |
| A/B validation | ✅ Initial | 16.62% latency improvement, zero regression |
| Canary automation | ✅ Ready | Traffic ramp 5% → 25% → 100% |
| Soak test framework | ✅ Ready | Monitoring guide, metrics collection |
| **Operational validation** | ⏳ Pending | Infrastructure gates, trace instrumentation |
| **Production sign-off** | ⏳ Pending | 24h soak completion, all gates passing |

**Key distinction:** Implementation-complete means the code works in staging. Production-complete means it works sustainably under live traffic.

---

## Phase A: Deployment Verification (Pre-Canary)

**Gate: `npm run atlas:phase6:preflight`**

This command must exit zero before any traffic reaches the new retrieval path.

### 1. Infrastructure Health

```bash
□ SvelteKit starts cleanly (npm run dev)
□ Go Retrieval responds (curl http://127.0.0.1:8100/health)
□ Postgres healthy (psql -c "SELECT 1")
□ Valkey healthy (redis-cli PING)
□ Qdrant healthy (curl http://127.0.0.1:6333/)
□ Neo4j healthy (curl http://127.0.0.1:7474)
□ RabbitMQ healthy (rabbitmqctl status)
□ Gemma4 healthy (curl http://127.0.0.1:8090/v1/models)
```

Exit non-zero if any service unavailable.

### 2. Data Synchronization

```bash
□ ontology_tuples populated in atlas_packets
□ packet_keywords table synchronized
□ feature_keywords table synchronized
□ Qdrant payload enrichment current (random sample check)
□ Named vectors present in Qdrant (content, summary, title, keywords)
□ Bitmap cache warmed (Redis keys count > 1000)
□ Identity lanes assigned (coverage check)
```

Exit non-zero if any sync is stale (e.g., last updated > 1h ago).

### 3. Retrieval Readiness

```bash
□ Content lane responds (Qdrant query)
□ Summary lane responds (Qdrant query via error vector)
□ Title lane responds (Qdrant query via signature vector)
□ Keyword lane responds (BM25 search in payload)
□ RRF weights configured (0.40/0.30/0.20/0.10)
□ Feature flag test: MULTI_VECTOR_RAMP_ENABLED=false → unified results
□ Feature flag test: MULTI_VECTOR_RAMP_ENABLED=true → multi-vector results
□ Rollback path tested (feature flag → unified, latency < 500ms)
```

Exit non-zero if any lane fails or weights are wrong.

### Implementation

```typescript
// scripts/atlas/phase6-preflight.mjs

async function runPreflightCheck() {
  const checks = {
    sveltekit: await testSvelteKit(),
    postgres: await testPostgres(),
    valkey: await testValkey(),
    qdrant: await testQdrant(),
    neo4j: await testNeo4j(),
    rabbitmq: await testRabbitMQ(),
    gemma4: await testGemma4(),
    ontology: await checkOntologySync(),
    keywords: await checkKeywordSync(),
    vectors: await checkNamedVectors(),
    bitmap: await checkBitmapCache(),
    retrieval: await testRetrievalLanes(),
    featureFlag: await testFeatureFlagLogic(),
    rollback: await testRollbackPath()
  };

  const allPass = Object.values(checks).every(c => c.passed);
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), checks, allPass }, null, 2));
  process.exit(allPass ? 0 : 1);
}
```

Add to package.json:
```json
{
  "scripts": {
    "atlas:phase6:preflight": "node scripts/atlas/phase6-preflight.mjs"
  }
}
```

---

## Phase B: Canary (5% → 25% → 100%)

**Goal: Collect structured traces for every request. No surprise failures.**

### Trace Schema

Every request to `/api/retrieval/go?q=...` during canary should emit:

```json
{
  "trace_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-07-08T14:30:45.123Z",
  "query_hash": "abc123def456",
  "traffic_percent": 5,
  "multi_vector_enabled": true,
  
  "candidates": {
    "count": 64,
    "before_identity_filter": 67,
    "quarantined": 3,
    "identity_validated": 64
  },

  "lane_scores": {
    "content": { "rank_sum": 156, "normalized_score": 0.42 },
    "summary": { "rank_sum": 198, "normalized_score": 0.31 },
    "title": { "rank_sum": 267, "normalized_score": 0.18 },
    "keywords": { "rank_sum": 425, "normalized_score": 0.09 }
  },

  "latency_ms": {
    "qdrant_content": 18,
    "qdrant_summary": 16,
    "qdrant_title": 15,
    "postgres_join": 6,
    "neo4j_traversal": 7,
    "rrf_fusion": 2,
    "total": 54
  },

  "rrf_config": {
    "weights": [0.40, 0.30, 0.20, 0.10],
    "k_constant": 60,
    "normalization": "min_max"
  },

  "selected_packets": [
    { "packet_key": "ace:packet:001", "rrf_score": 1.0, "source_lanes": ["content", "summary"] },
    { "packet_key": "ace:packet:002", "rrf_score": 0.98, "source_lanes": ["content"] }
  ]
}
```

### Implementation in go-retrieval-facade.ts

```typescript
async function executeMultiVectorRetrieval(q: string): Promise<RetrievalResult> {
  const trace_id = crypto.randomUUID();
  const startTime = performance.now();

  // Query all lanes in parallel
  const [contentResults, summaryResults, titleResults, keywordResults] = await Promise.all([
    qdrantSearch(q, 'content'),
    qdrantSearch(q, 'summary'),
    qdrantSearch(q, 'title'),
    keywordSearch(q)
  ]);

  const latency = {
    qdrant_content: contentResults.latency,
    qdrant_summary: summaryResults.latency,
    qdrant_title: titleResults.latency,
    postgres_join: 0,
    neo4j_traversal: 0,
    rrf_fusion: 0,
    total: 0
  };

  // RRF fusion
  const rffStart = performance.now();
  const fusedResults = rffFusion([
    { lane: 'content', results: contentResults, weight: 0.40 },
    { lane: 'summary', results: summaryResults, weight: 0.30 },
    { lane: 'title', results: titleResults, weight: 0.20 },
    { lane: 'keywords', results: keywordResults, weight: 0.10 }
  ]);
  latency.rrf_fusion = performance.now() - rffStart;

  // Identity filtering
  const beforeFilter = fusedResults.length;
  const filtered = fusedResults.filter(r => r.identity_lane !== 'quarantine');
  const quarantined = beforeFilter - filtered.length;

  latency.total = performance.now() - startTime;

  // Build trace
  const trace = {
    trace_id,
    timestamp: new Date().toISOString(),
    query_hash: hashQuery(q),
    traffic_percent: TRAFFIC_RAMP_CONFIG.canary_percent,
    multi_vector_enabled: true,
    candidates: {
      count: filtered.length,
      before_identity_filter: beforeFilter,
      quarantined,
      identity_validated: filtered.length
    },
    lane_scores: extractLaneScores(fusedResults),
    latency_ms: latency,
    rrf_config: {
      weights: [0.40, 0.30, 0.20, 0.10],
      k_constant: 60,
      normalization: 'min_max'
    },
    selected_packets: filtered.slice(0, 10).map(r => ({
      packet_key: r.packet_key,
      rrf_score: r.score,
      source_lanes: r.lanes
    }))
  };

  // Log to Redis for streaming analysis
  const traceKey = `traces:phase6:${Math.floor(Date.now() / 60000)}`;
  await redis.lpush(traceKey, JSON.stringify(trace));
  await redis.expire(traceKey, 86400); // 24h retention

  return {
    candidates: filtered,
    timing: latency,
    trace_id,
    multi_vector_used: true
  };
}
```

### Canary Checklist

**5% Canary (30 minutes)**

```bash
# 1. Enable canary
npm run atlas:phase6:ramp:canary
npm run dev

# 2. Monitor (every 5 minutes):
# - Check for errors: tail -f .logs/multi-vector-ramp.log | grep ERROR
# - Check latency: curl http://127.0.0.1:5173/api/retrieval/go?q=test | jq '.timing.total_ms'
# - Check trace count: redis-cli LLEN traces:phase6:*

# 3. After 30 minutes, verify:
# - p95 latency < 200ms
# - error rate < 0.1%
# - quarantine rate < 1%
# - No silent lane failures

# SUCCESS: Proceed to 25% ramp
# FAILURE: Run npm run atlas:phase6:ramp:rollback
```

**25% Ramp (30 minutes)**

```bash
npm run atlas:phase6:ramp:25pct
npm run dev

# Repeat monitoring checks
# After 30 minutes:
# - Per-lane success rate ≥95% (all 4 lanes healthy)
# - No queue backlogs
# - Qdrant, Postgres, Valkey all responsive

# SUCCESS: Proceed to 100% live
# FAILURE: Rollback
```

**100% Live (5 minutes quickcheck)**

```bash
npm run atlas:phase6:ramp:100pct
npm run dev

# Run 50 queries in quick succession
for i in {1..50}; do
  curl -s "http://127.0.0.1:5173/api/retrieval/go?q=query_$i" > /dev/null
  echo "Query $i: OK"
done

# Verify:
# - All 50 queries returned 200
# - No errors in logs
# - Multi-vector used in 100% of results

# SUCCESS: Phase 6 complete, proceed to Phase 7 soak
```

---

## Phase C: 24-Hour Soak Test

**Goal: Prove stability, correctness, and resource efficiency under sustained traffic.**

### Telemetry Collection

Collect four categories of data on 60-second intervals.

#### 1. Retrieval Quality

```bash
# Save to reports/soak-retrieval-$(date +%Y-%m-%d).jsonl

{
  "timestamp": "2026-07-08T15:00:00Z",
  "recall_at_100": 0.982,
  "mrr": 0.91,
  "ndcg_at_100": 0.847,
  "candidate_diversity_avg": 5.87,
  "identity_validation_rate": 0.998,
  "per_lane_contribution": {
    "content": 0.42,
    "summary": 0.31,
    "title": 0.18,
    "keywords": 0.09
  }
}
```

Computed from:
- Golden replay queries (see below)
- Qdrant payload validation
- Identity lane assignment audit

#### 2. Infrastructure Metrics

```bash
# Save to reports/soak-infrastructure-$(date +%Y-%m-%d).jsonl

{
  "timestamp": "2026-07-08T15:00:00Z",
  "cpu": {
    "npm": 18.5,
    "postgres": 12.3,
    "qdrant": 8.7
  },
  "memory_mb": {
    "npm": 512,
    "postgres": 1024,
    "qdrant": 2048,
    "valkey": 256
  },
  "valkey": {
    "memory_used_mb": 256,
    "memory_peak_mb": 280,
    "key_count": 125000
  },
  "postgres": {
    "active_connections": 12,
    "idle_connections": 8,
    "query_queue": 0
  },
  "qdrant": {
    "points_indexed": 55116,
    "search_latency_p95_ms": 18,
    "indexing_rate": 0
  },
  "neo4j": {
    "query_latency_p95_ms": 7,
    "bolt_connections": 4
  },
  "rabbitmq": {
    "ready_messages": 0,
    "unacked_messages": 0,
    "consumer_count": 6
  }
}
```

Collect via:
```bash
# CPU / Memory
ps aux | grep -E '[n]pm|[p]ostgres|[q]drant' | awk '{print $2, $3, $4}'

# Valkey
redis-cli INFO memory | grep -E 'used_memory|peak_memory'
redis-cli DBSIZE

# Postgres
psql -c "SELECT count(*) FROM pg_stat_activity WHERE state != 'idle';"

# Qdrant
curl -s http://127.0.0.1:6333/collections/codebase_chunks_768

# RabbitMQ
rabbitmqctl list_queues name messages consumers
```

#### 3. Application Metrics

```bash
# Save to reports/soak-application-$(date +%Y-%m-%d).jsonl

{
  "timestamp": "2026-07-08T15:00:00Z",
  "latency_ms": {
    "p50": 48,
    "p95": 156,
    "p99": 312
  },
  "errors": {
    "count_5xx": 0,
    "count_timeout": 0,
    "count_retry": 2
  },
  "requests": {
    "total": 1247,
    "multi_vector": 1247,
    "unified": 0
  }
}
```

Computed from:
- Trace logs (Redis `traces:phase6:*`)
- Error logs
- Request logs

#### 4. AI/Generation Metrics (if Gemma4 in scope)

```bash
{
  "timestamp": "2026-07-08T15:00:00Z",
  "gemma4": {
    "latency_p95_ms": 850,
    "token_count_avg": 156,
    "generation_failure_count": 0,
    "queue_depth": 0
  }
}
```

### Golden Replay

Run every 60 minutes. Fixed query set to catch quality regressions.

**reports/golden-queries.json**

```json
{
  "authentication": "How does Lucia session validation work?",
  "embedding": "What's the embedding model used for retrieval?",
  "ontology": "What's the packet ontology structure in the system?",
  "qdrant": "How is the Qdrant vector index configured?",
  "neo4j": "What topology edges exist in the Neo4j graph?",
  "dispatcher": "How does the 9-node dispatcher route requests?",
  "turbovec": "What does TurboVec prefilter do in the pipeline?",
  "valkey": "How are packets cached in Valkey/Redis?",
  "som": "How is SOM topology computed from embeddings?",
  "bitmap": "How does identity lane routing work?"
}
```

**Replay script**

```bash
#!/bin/bash
# scripts/soak/golden-replay.sh

QUERY_FILE="reports/golden-queries.json"
LOG_FILE="reports/golden-replay-$(date +%Y-%m-%d).log"

while true; do
  jq -r 'to_entries[] | "\(.key): \(.value)"' "$QUERY_FILE" | while IFS=': ' read -r name query; do
    START=$(date +%s%N)
    RESULT=$(curl -s "http://127.0.0.1:5173/api/retrieval/go?q=$(urlencode "$query")")
    END=$(date +%s%N)
    LATENCY=$(( (END - START) / 1000000 ))

    RECALL=$(echo "$RESULT" | jq '.candidates | length')
    SCORE=$(echo "$RESULT" | jq '.candidates[0].score // 0')

    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $name latency=$LATENCY recall=$RECALL top_score=$SCORE" | tee -a "$LOG_FILE"
  done

  sleep 3600  # Run every hour
done
```

Add to package.json:
```json
{
  "scripts": {
    "soak:golden:replay": "bash scripts/soak/golden-replay.sh"
  }
}
```

### Soak Test Execution

```bash
# Terminal 1: Infrastructure monitoring (60s interval)
while true; do
  node scripts/soak/collect-infrastructure-metrics.mjs >> reports/soak-infrastructure-$(date +%Y-%m-%d).jsonl
  sleep 60
done

# Terminal 2: Application metrics (60s interval)
while true; do
  node scripts/soak/collect-application-metrics.mjs >> reports/soak-application-$(date +%Y-%m-%d).jsonl
  sleep 60
done

# Terminal 3: Golden replay (hourly)
npm run soak:golden:replay

# Terminal 4: Tail error logs
tail -f .logs/multi-vector-ramp.log | grep -E "ERROR|CRITICAL|timeout"

# Monitor continuously for 24 hours
```

### Soak Test Gates

After 24 hours, verify:

```bash
✅ All latency gates passed (p95 < 200ms throughout)
✅ Error rate stayed < 0.1%
✅ Recall@100 ≥ 98% (no drift)
✅ Candidate diversity > 5.0 (stable)
✅ Identity validation < 1% quarantine (no degradation)
✅ Golden replay queries remained stable (no unexplained drift)
✅ Infrastructure metrics bounded (no memory leak, no CPU spike)
✅ Valkey memory growth < 10% over 24h
✅ Postgres active connections stable
✅ Qdrant search latency stable
✅ RRF weights unchanged
✅ Zero silent lane failures
```

If any gate fails: rollback and investigate.

---

## Production Sign-Off Criteria

Before merging to main and declaring Phase 6-7 complete:

### Engineering Gate
- ✅ Feature complete and tested in staging
- ✅ Rollback procedure validated
- ✅ Code review approved

### Operations Gate
- ✅ Phase 6 canary completed without manual rollback
- ✅ Phase 6 ramp (25%) completed without manual rollback
- ✅ Phase 6 live (100%) completed without manual rollback
- ✅ 24-hour soak test completed with continuous monitoring
- ✅ All latency/error/recall gates passed throughout soak
- ✅ Golden replay queries remained stable
- ✅ Infrastructure metrics remained within expected bounds
- ✅ No service was capacity-constrained

### Quality Gate
- ✅ Recall@100 maintained at ≥98%
- ✅ NDCG maintained at ≥0.84
- ✅ Candidate diversity maintained at >5.0
- ✅ Identity validation quarantine rate <1%
- ✅ Zero silent failures in any RRF lane
- ✅ Per-lane contribution stable across all queries

**DO NOT merge without all three gates passing.**

---

## Next Commands (Session 123)

```bash
# Pre-canary
npm run atlas:phase6:preflight

# If preflight passes:
npm run atlas:phase6:ramp:canary
npm run dev
# Monitor for 30 minutes

# Then:
npm run atlas:phase6:ramp:25pct
npm run dev
# Monitor for 30 minutes

# Then:
npm run atlas:phase6:ramp:100pct
npm run dev
# Monitor for 5 minutes

# Then: Phase 7 soak test (24h)
# (See Phase C above)

# After 24h, if all gates pass:
git add -A
git commit -m "feat(retrieval): multi-vector RRF live after Phase 6-7 validation

Phase 6-7 production deployment complete:
- Phase 6 canary ramp successful (5% → 25% → 100%)
- Phase 7 24-hour soak test passed all gates
- Latency p95 <200ms (target <150ms)
- Error rate <0.1% (target <0.01%)
- Recall@100 ≥98% maintained
- Identity validation <1% quarantine
- Zero silent lane failures
- Golden replay stable throughout
- Infrastructure metrics within bounds

Ready for production deployment."

git push origin main
```

---

## Summary

| Phase | Duration | Success Criteria | Status |
|-------|----------|------------------|--------|
| **A: Preflight** | 30 min | All infrastructure + data sync gates pass | ⏳ Pending |
| **B: Canary** | 2h | 5% → 25% → 100% traffic, no rollback | ⏳ Pending |
| **C: Soak** | 24h | All 11 production gates pass | ⏳ Pending |
| **Sign-off** | 30 min | Engineering + Ops + Quality gates | ⏳ Pending |

**Total time to production: ~27 hours** (including preflight + ramp + soak)

This is disciplined, measurable, and reversible. The work is ready. Execution is the remaining unknown.
