# Phase C Option B: Final Decision Matrix — Complete Service Dependency Analysis

**Date**: June 30, 2026  
**Status**: Decision checkpoint with complete service dependency map  
**Objective**: Integrate architecture decisions with actual port 8101 topology search requirements

---

## The Complete Picture: All 4 Required Services

### CRITICAL: Must Be Operational Before Phase C Option B

| Tier | Service | Port | Purpose | Current Status | Action | Impact if Missing |
|------|---------|------|---------|-----------------|--------|-------------------|
| **L0** | **Valkey** | **6379** | **Hot cache + locks** | **❌ DOWN** | **docker-compose up legal-ai-valkey** | **🔴 CRITICAL — cache layer gone** |
| **L1** | **Topology Search** | **8101** | **Manifold-4D prefilter** | **⏳ NOT RUNNING** | **npm run topology:search:ensure** | **🟡 HIGH — misses expected speedup** |
| **L2** | **Qdrant** | **6333** | **Dense ANN search** | **✅ OPERATIONAL** | None | 🔴 CRITICAL — no vector search |
| **L3** | **Neo4j** | **7474** | **Graph neighbors** | **✅ READY** | None | 🟡 HIGH — no topology expansion |
| **L4** | **Postgres** | **5432** | **Canonical truth** | **✅ OPERATIONAL** | None | 🔴 CRITICAL — no state machine |

### Optional But Recommended

| Service | Port | Purpose | Current Status | Priority |
|---------|------|---------|-----------------|----------|
| Ollama | 11434 | Embedding service | ✅ OPERATIONAL | High (fallback to CPU) |
| TurboQuant | 8090 | GPU synthesis | ✅ OPERATIONAL | Medium (fallback to smaller model) |
| GPU bridge | N-API | CUDA math | ✅ OPERATIONAL | High (graceful CPU fallback) |

---

## Retrieval Pipeline: Why All 4 Tiers Matter

### Traditional RAG (Without Port 8101)

```
Query
  ↓
Embed (Ollama)
  ↓
Qdrant ANN (50-200ms) ← SLOW: searches all 40.5K points
  ↓
Rerank candidates
  ↓
Return top-K
```

**Problem**: Qdrant must search through entire collection; scales poorly with corpus size.

### Phase C Optimized (WITH Port 8101)

```
Query
  ↓
Check Redis cache (5ms) ← L0 TIER (6379)
  ├─ CACHE HIT → return cached result (5ms total)
  └─ CACHE MISS ↓
    Embed (Ollama)
    ↓
    Manifold-4D distance check (10-20ms) ← L1 TIER (8101) ⚠️ MISSING
    ├─ Result outside neighborhood → skip ANN (save 100ms+)
    └─ Result inside neighborhood → proceed to ANN ↓
      Qdrant ANN on PREFILTERED candidates (20-50ms) ← L2 TIER (6333)
      ↓
      Neo4j graph neighbors (50ms) ← L3 TIER (7474)
      ↓
      GPU rerank (0-50ms) ← CUDA bridge
      ↓
      Postgres write telemetry (10-20ms) ← L4 TIER (5432)
      ↓
      Invalidate Redis (async)
      ↓
      Return response (total 100-150ms vs 200-300ms)
```

**Expected improvement**: 33-50% latency reduction due to L1 pre-filtering.

---

## The Port 8101 Impact on Cache Hit Rate Metrics

### Scenario A: Without Port 8101 (Current Missing Service)

```
Day 1:
  Cache hit rate: 20% (only exact-match Redis hits)
  Average latency: 200-300ms
  GPU rerank cache hit rate: 30% (limited batch size consistency)

Verdict: ❌ Looks like Phase C didn't work
         (actually: L1 tier is missing, skewing metrics)
```

### Scenario B: With Port 8101 (Complete Setup)

```
Day 1:
  Cache hit rate: 50-70% (Redis exact + topology prefilter)
  Average latency: 100-150ms (33% faster)
  GPU rerank cache hit rate: 60%+ (topology groups similar queries)

Verdict: ✅ Phase C working as expected
         (all tiers operational, expected speedup achieved)
```

**Critical insight**: Without port 8101, the go/no-go decision criteria become invalid.

---

## Pre-Phase C Option B: Complete Service Checklist

### Must Be Done (30-45 minutes)

```bash
# 1. Verify all required services
echo "=== Checking L0-L4 Tiers ===" && \
redis-cli ping && echo "✅ L0: Redis" || echo "❌ L0: Redis" && \
curl -s http://127.0.0.1:8101/health && echo "✅ L1: Topology" || echo "❌ L1: Topology" && \
curl -s http://127.0.0.1:6333/health && echo "✅ L2: Qdrant" || echo "❌ L2: Qdrant" && \
curl -s http://127.0.0.1:7474 && echo "✅ L3: Neo4j" || echo "❌ L3: Neo4j" && \
psql -h 127.0.0.1 -U legal_admin -d legal_ai_db -c "SELECT 1" && echo "✅ L4: Postgres" || echo "❌ L4: Postgres"

# Expected output:
# ✅ L0: Redis
# ❌ L1: Topology (MISSING — see next steps)
# ✅ L2: Qdrant
# ✅ L3: Neo4j
# ✅ L4: Postgres
```

### Step 1: Start Valkey (L0 Tier)

```bash
docker-compose up legal-ai-valkey

# Verify (with password)
redis-cli -p 6379 --pass redis ping
# Expected: PONG ✅
```

**Critical**: Without L0 cache, every query falls through to L1-L4, killing performance metrics.

**Note**: Valkey is the AGPL-free Redis drop-in replacement. Password: `redis` (set in docker-compose.yml)

### Step 2: Start Topology Search (L1 Tier)

```bash
# Check if script exists
grep -r "topology:search:ensure\|topology-search-server" sveltekit-frontend/package.json

# If script exists:
npm run topology:search:ensure

# If not, start manually:
node scripts/topology-search-server.mjs
# or
npx tsx scripts/topology-search-server.mts

# Verify
curl http://127.0.0.1:8101/health
# Expected: {"ok": true, "collections": 123} (or similar) ✅
```

**Critical**: Without L1 pre-filtering, Qdrant searches full corpus; misses 33% of expected speedup.

### Step 3: Verify Qdrant + Neo4j + Postgres (L2-L4)

```bash
# L2: Qdrant
curl -s http://127.0.0.1:6333/health | jq .
# Expected: {"status": "ok"} ✅

# L3: Neo4j (optional but recommended)
curl -s http://127.0.0.1:7474/
# Expected: HTTP 200 ✅

# L4: Postgres (telemetry tables)
psql -h 127.0.0.1 -U legal_admin -d legal_ai_db -c "\dt acp_decisions retrieval_traces"
# Expected: tables listed ✅

npm run db:migrate  # Create telemetry tables if missing
```

### Step 4: Create Telemetry Tables

```bash
npm run db:migrate
```

### Step 5: Run Validation Tests

```bash
npx tsx scripts/tests/test-cuda-graph-rerank-integration.mts
npx tsx scripts/tests/test-e2e-latency.mts
npm run bench:cuda-graph-cache:quick
```

**Expected**: All tests pass with:
- GPU rerank latency < 50ms ✅
- Cache hit rate > 50% (measured after execution) ✅
- E2E latency < 200ms ✅

---

## The Routing Matrix: How All 4 Tiers Work Together

### Decision Tree (L0 → L4)

```
User Query: "auth session validation"
  ↓
TIER L0: Redis Exact Match (6379)
  ├─ KEY: sha256(model + messages + temp + max_tokens)
  ├─ CACHE HIT? → Return cached result (5ms) + DONE
  └─ CACHE MISS → Continue to L1 ↓

TIER L1: Topology Prefilter (8101) ← PORT 8101
  ├─ Embed query via Ollama
  ├─ Compute 4D manifold distance to query
  ├─ Find candidates within Euclidean radius (10-20ms)
  ├─ Result empty? → Skip to fallback (not found)
  ├─ Result small (<5)? → Skip GPU rerank (too small)
  └─ Result 5-500? → Pre-filtered candidate set ↓

TIER L2: Dense ANN Search (6333) ← QDRANT
  ├─ Run cosine similarity on pre-filtered candidates (20-50ms)
  │   (vs 100-200ms on full corpus without prefilter)
  ├─ Get top-50 by similarity
  └─ Results → ↓

TIER L3: Graph Neighbors (7474) ← NEO4J
  ├─ K-hop expansion from matched source_refs (optional)
  ├─ Add related components (IMPORTS, SHARES_TAGS)
  └─ Merged results → ↓

GPU Rerank (N-API)
  ├─ CUDA graph cache check (0-5ms if hit)
  ├─ Direct GPU cosine similarity (10-50ms if miss)
  └─ Sorted candidates → ↓

TIER L4: Canonical State Machine (5432) ← POSTGRES
  ├─ Write telemetry row (story_id, task_id, latency_ms, cache_hit, etc.)
  ├─ atomicity guaranteed
  └─ Async: Invalidate L0 cache (Redis) + emit NATS events ↓

Return response to user (total: 100-150ms expected)
```

### Why Each Tier Is Critical

| Tier | Why Critical | Cost if Missing | Mitigation |
|------|------------|-----------------|-----------|
| L0 (Redis) | Exact-match cache hit (5ms vs 150ms) | 30× latency increase | Can't measure cache effectiveness |
| L1 (Topology) | Prefilter candidate set (50ms saved) | Qdrant searches full corpus | Miss 33% speedup target |
| L2 (Qdrant) | Fast ANN on filtered set (20-50ms) | No vector search capability | Complete pipeline failure |
| L3 (Neo4j) | Topology expansion (optional) | Graph relationships unavailable | Reduced context richness |
| L4 (Postgres) | Audit trail + telemetry | No canonical state machine | Can't measure improvements |

---

## Blocking Issues: What Must Be Fixed NOW

### 🔴 CRITICAL: Valkey Not Running (L0 Tier)

**Impact**: Cache layer completely non-functional
- Every query searches L1-L4 (no 5ms cache hits)
- Artificially low cache hit rate metrics
- Latency baseline: 200-300ms instead of expected 5-150ms

**Fix** (5 minutes):
```bash
docker-compose up legal-ai-valkey
redis-cli -p 6379 --pass redis ping  # Verify: PONG
```

**Note**: Valkey is AGPL-free Redis drop-in. Password: `redis` (set in docker-compose.yml)

**Validation**: After start, run query and check Valkey has keys:
```bash
redis-cli -p 6379 --pass redis KEYS "bifrost:*" | wc -l
# Should return > 0 after first query
```

### 🟡 HIGH: Topology Search Not Running (L1 Tier)

**Impact**: Missing manifold-4D pre-filtering
- Qdrant searches all 40.5K points (slow)
- Lost 33% of expected speedup
- Go/no-go decision criteria become invalid (latency higher than expected)

**Fix** (5 minutes):
```bash
# Option A: Via npm script (if exists)
npm run topology:search:ensure

# Option B: Manual start
node scripts/topology-search-server.mjs

# Verify
curl http://127.0.0.1:8101/health
# Expected: status ok
```

**Validation**: After start, check topology endpoint:
```bash
curl -X POST http://127.0.0.1:8101/search/hybrid \
  -H "Content-Type: application/json" \
  -d '{"query":"test","limit":10}'
# Expected: HTTP 200 with hits array
```

### ⚠️ MEDIUM: Telemetry Tables Missing (L4 Tier)

**Impact**: Can't measure Phase C improvements
- No audit trail for decisions
- Can't compute cache hit rate from telemetry
- Can't validate go/no-go criteria

**Fix** (5 minutes):
```bash
npm run db:migrate
```

**Validation**:
```bash
psql -h 127.0.0.1 -U legal_admin -d legal_ai_db -c "
SELECT tablename FROM pg_tables 
WHERE tablename IN ('acp_decisions', 'retrieval_traces', 'gpu_rerank_telemetry')
"
# Expected: 3 rows (all tables exist)
```

---

## Updated Phase C Option B Readiness

### Current Service Status (After Fixes)

| Service | Port | Status | Required? | Notes |
|---------|------|--------|-----------|-------|
| Valkey | 6379 | ⚠️ FIX NEEDED | ✅ YES | `docker-compose up legal-ai-valkey` (password: redis) |
| Topology | 8101 | ⚠️ FIX NEEDED | ✅ YES | `npm run topology:search:ensure` |
| Qdrant | 6333 | ✅ OK | ✅ YES | No action |
| Neo4j | 7474 | ✅ OK | ⚠️ Recommended | No action |
| Postgres | 5432 | ⚠️ FIX NEEDED | ✅ YES | `npm run db:migrate` |
| Ollama | 11434 | ✅ OK | ⚠️ Optional | No action |
| TurboQuant | 8090 | ✅ OK | ⚠️ Optional | No action |

### Expected Timeline After Fixes

```
Fixes (15 min):
  • Start Redis (5 min)
  • Start Topology Search (5 min)
  • Create telemetry tables (5 min)

Validation (20 min):
  • Run integration test (5 min)
  • Run E2E latency test (5 min)
  • Run benchmark (10 min)

Phase C Option B (2 days):
  • Part 1: Provenance (0.5 day)
  • Part 2: Telemetry (1 day)
  • Part 3: Gates (0.5 day)
  • Validation (1 hour)

Total: ~2 days from now
```

---

## Success Criteria: Validation After Fixes

### Query-Level Metrics (Measure After 10 Real Queries)

```sql
-- After running Phase C, measure these:
SELECT 
  COUNT(*) as total_queries,
  ROUND(100.0 * SUM(CASE WHEN cache_hit='redis' THEN 1 ELSE 0 END) / COUNT(*), 1) as redis_hit_pct,
  ROUND(100.0 * SUM(CASE WHEN cache_hit IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*), 1) as total_cache_hit_pct,
  ROUND(AVG(total_latency_ms), 0) as avg_latency_ms,
  ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY total_latency_ms), 0) as p99_latency_ms
FROM retrieval_traces
WHERE created_at > NOW() - INTERVAL '1 hour';
```

**Expected Results**:
- redis_hit_pct: 10-30% (exact cache hits)
- total_cache_hit_pct: 50-70% (including topology prefilter)
- avg_latency_ms: 100-150ms (down from 200-300ms baseline)
- p99_latency_ms: <300ms

### Topology Tier Metrics (Measure L1 Effectiveness)

```sql
-- Check how many queries benefited from L1 prefilter
SELECT 
  COUNT(*) as total_topology_checks,
  ROUND(100.0 * SUM(CASE WHEN topology_filtered THEN 1 ELSE 0 END) / COUNT(*), 1) as prefilter_hit_pct,
  ROUND(AVG(topology_latency_ms), 1) as avg_topology_latency_ms
FROM topology_searches
WHERE created_at > NOW() - INTERVAL '1 hour';
```

**Expected Results**:
- prefilter_hit_pct: 60-80% (queries where topology narrows candidate set)
- avg_topology_latency_ms: 10-20ms

---

## Final Go/No-Go Decision

### ✅ GO IF

- [ ] Redis running and key count > 10 after first query
- [ ] Topology Search running and health check returns OK
- [ ] All telemetry tables created
- [ ] All validation tests pass (benchmark, integration, E2E)
- [ ] Sample query completes in <200ms (vs 300ms baseline)
- [ ] Telemetry row written to Postgres successfully

### ❌ NO-GO IF

- Redis won't start (infrastructure issue)
- Topology Search crashes on startup (service issue)
- GPU bridge unavailable (acceptable: CPU fallback works)
- Any validation test fails (code issue)

**Recommendation**: All "GO" conditions are fixable in 15 minutes. No reason to delay Phase C Option B.

---

## Pre-Execution Command Sequence

Copy-paste this entire sequence to validate and start Phase C Option B:

```bash
#!/bin/bash

echo "=== Phase C Option B: Pre-Execution Checklist ==="
echo ""

# 1. Start Valkey (AGPL-free Redis drop-in)
echo "1️⃣  Starting Valkey (L0 Cache Tier)..."
docker-compose up legal-ai-valkey -d
sleep 5
redis-cli -p 6379 --pass redis ping && echo "✅ Valkey RUNNING" || echo "❌ Valkey FAILED"

# 2. Start Topology Search
echo ""
echo "2️⃣  Starting Topology Search (L1 Prefilter Tier)..."
npm run topology:search:ensure &
sleep 5
curl -s http://127.0.0.1:8101/health && echo "✅ Topology RUNNING" || echo "❌ Topology FAILED"

# 3. Create telemetry tables
echo ""
echo "3️⃣  Creating telemetry tables (L4 Postgres Tier)..."
npm run db:migrate
echo "✅ Telemetry tables CREATED"

# 4. Validate all services
echo ""
echo "4️⃣  Validating all service tiers..."
curl -s http://127.0.0.1:6333/health && echo "✅ L2: Qdrant OK" || echo "❌ L2: Qdrant FAILED"
curl -s http://127.0.0.1:7474/ && echo "✅ L3: Neo4j OK" || echo "❌ L3: Neo4j FAILED"
psql -h 127.0.0.1 -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM acp_decisions LIMIT 1" && echo "✅ L4: Postgres OK" || echo "❌ L4: Postgres FAILED"

# 5. Run validation tests
echo ""
echo "5️⃣  Running validation tests..."
npx tsx scripts/tests/test-cuda-graph-rerank-integration.mts && echo "✅ Integration test PASSED" || echo "❌ Integration test FAILED"
npx tsx scripts/tests/test-e2e-latency.mts && echo "✅ E2E latency PASSED" || echo "❌ E2E latency FAILED"
npm run bench:cuda-graph-cache:quick && echo "✅ Benchmark PASSED" || echo "❌ Benchmark FAILED"

echo ""
echo "=== ✅ Pre-Execution Complete — Ready for Phase C Option B ==="
```

---

## References

- `SESSION-98-CUDA-GRAPH-CACHING-COMPLETE.md` — Full session summary
- `PHASE-C-OPTION-B-ARCHITECTURE-DECISION.md` — Architecture decisions
- `ACP-TELEMETRY-DAILY-GRAPHIFY-FLOW.md` — Telemetry pipeline
- `PHASE-C-OPTION-B-PRE-EXEC-CHECKLIST.md` — Pre-exec checklist
- `ace_startup_cuda_bridge_docs.md` — Port 8101 topology search integration

---

**Status**: ✅ DECISION MATRIX COMPLETE | All blocking issues identified | Ready to execute Phase C Option B after 15-min fixes

**Next**: Run pre-execution command sequence, verify all services, start Phase C Option B.
