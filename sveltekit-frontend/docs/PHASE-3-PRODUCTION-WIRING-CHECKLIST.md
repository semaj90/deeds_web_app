# Phase 3: Production Cache Wiring — Implementation Checklist

**Status:** Ready for execution  
**Duration:** 8-12 hours (4 phases)  
**Dependency:** GSD Phase 2 complete (prompt caching verified)  

---

## Phase 3A: Core Integration (4 hours)

### ✅ Created (Session 132)

- [x] Cache layers orchestrator (`cache-layers-orchestrator.ts`, 240 lines)
  - Layer 2: OpenCode adapter (port 8091) health check + latency measurement
  - Layer 3: BitFrost exact cache (Valkey key: `bifrost:packet:{key}`)
  - Layer 4: BitFrost semantic cache (Valkey key: `ace:cache:{intentHash}:{hmmState}`)
  - Parallel measurement, non-blocking, fallback logic

- [x] API endpoints (2 files)
  - GET/POST `/api/retrieval/cache-layers` — orchestration results
  - GET `/api/retrieval/cache-layers/health` — read-only health check

- [x] Test suite (30 tests in `tests/cache-layers.spec.ts`)
  - Health checks (3 tests)
  - Orchestration metrics (7 tests)
  - API endpoints (3 tests)
  - Layer independence (3 tests)
  - Performance characteristics (3 tests)

### ⏳ Pending (Session 133+)

- [ ] Wire orchestrator into retrieval main path
  - Integrate into `go-retrieval-facade.ts`
  - Call `orchestrateCacheLayers()` before executing unified retrieval
  - Route decision based on cache hit/miss

- [ ] Service Worker SOM lookup (Layer 1 browser cache)
  - Fetch SOM cell centroid from `/api/atlas/som/cell/:cellId`
  - Cache in IndexedDB with 1-hour TTL
  - Fallback: fetch radius-1 neighbors (8-neighbor connectivity)

- [ ] LOD manifest emission (4 levels)
  - LOD0: identity only (10 tokens)
  - LOD1: identity + summary (50 tokens)
  - LOD2: full content (1000 tokens)
  - LOD3: neighbors (2000 tokens)
  - Route by cache layer + available bandwidth

---

## Phase 3B: End-to-End Testing (4 hours)

### Smoke Tests

```bash
# Test 1: Health check (read-only)
curl http://localhost:5173/api/retrieval/cache-layers/health

# Expected output:
# {
#   "success": true,
#   "healthy": true/false,
#   "layers": {
#     "layer2_adapter": "UP/DOWN",
#     "layer3_exact_cache": "UP/DOWN",
#     "layer4_semantic_cache": "UP/DOWN"
#   }
# }

# Test 2: Orchestration (baseline)
curl -X POST http://localhost:5173/api/retrieval/cache-layers \
  -H "Content-Type: application/json" \
  -d '{
    "system_prompt": "You are Atlas, a legal AI.",
    "user_prompt": "What is the retrieval router?",
    "measure_direct_ms": 211
  }'

# Expected output:
# {
#   "success": true,
#   "cache_layers": {
#     "layer1_direct_fallback_ms": 211,
#     "layer2_adapter": {"layer": "layer2_adapter", "hit": false/true, "latency_ms": X},
#     "layer3_exact": {"layer": "layer3_exact", "hit": false, "latency_ms": Y},
#     "layer4_semantic": {"layer": "layer4_semantic", "hit": false, "latency_ms": Z},
#     "cache_decision": "layer1_direct" | "layer2" | "layer3" | "layer4",
#     "total_orchestration_ms": N
#   }
# }

# Test 3: A→A→A' pattern with orchestration
# Run cache probe harness with orchestrator measurement
npm run cache:probe:instrumented:with-layers
```

### Integration Tests

- [ ] Verify Layer 2 doesn't break cache inheritance
  - A2 prompt_eval_ms through adapter should match direct llama.cpp
  - Expected: adapter adds <50ms overhead, preserves cache signal

- [ ] Verify Layer 3 exact cache misses (expected, no data seeded)
  - Call orchestrator with known query
  - Confirm layer3_exact.hit = false
  - Confirm latency <10ms (Redis is fast even on miss)

- [ ] Verify Layer 4 semantic cache misses (expected, no data seeded)
  - Call orchestrator with paraphrased query
  - Confirm layer4_semantic.hit = false
  - Confirm latency <10ms

- [ ] Verify fallback to Layer 1 on all cache misses
  - Confirm cache_decision = "layer1_direct"
  - Confirm total_orchestration_ms < layer1_direct_fallback_ms + 100ms (overhead)

### Regression Tests

- [ ] Layer 1 direct llama.cpp still works
  - `/api/retrieval/unified?q=test` returns results
  - Latency baseline unchanged

- [ ] Layer 2 adapter still works
  - OpenCode agents at port 8091 respond
  - Tool call support preserved

- [ ] Valkey Redis still works
  - `docker exec legal-ai-valkey redis-cli -a redis ping` returns PONG
  - Key patterns accessible: `bifrost:*`, `ace:*`

---

## Phase 3C: Telemetry Wiring (2 hours)

### Non-Blocking Telemetry Collection

Add to orchestration result:

```typescript
// Record cache layer decision to telemetry (non-blocking)
recordCacheLayerDecision({
  query_hash: sha256(userPrompt),
  cache_decision: result.cache_decision,
  layer2_latency_ms: result.layer2_adapter?.latency_ms,
  layer3_latency_ms: result.layer3_exact?.latency_ms,
  layer4_latency_ms: result.layer4_semantic?.latency_ms,
  cache_hits: {
    layer2: result.layer2_adapter?.hit ?? false,
    layer3: result.layer3_exact?.hit ?? false,
    layer4: result.layer4_semantic?.hit ?? false
  },
  timestamp: new Date()
});
```

### Metrics Export

- [ ] Prometheus `/metrics` endpoint includes:
  - `cache_orchestration_decisions_total` (counter by decision)
  - `cache_layer_latency_ms` (histogram by layer)
  - `cache_hit_rate` (gauge by layer)

- [ ] Redis telemetry keys (for quick access):
  - `telemetry:cache:decisions` (hash, decision counts)
  - `telemetry:cache:latencies` (hash, p50/p95/p99 per layer)
  - `telemetry:cache:hit_rates` (hash, per-layer hit rate)

---

## Phase 3D: Rollback Plan (30 min)

If any layer fails in production:

### Option 1: Disable Layer (Fastest)
```typescript
// In orchestrator, set layer availability to false
const layer2Available = false; // disables measurement, fallback to Layer 1
const layer3Available = false;
const layer4Available = false;
```

### Option 2: Reduce Timeout
```typescript
// Reduce measurement timeout from 100ms to 10ms
const cached = await Promise.race([
  redis.get(cacheKey),
  new Promise<null>((resolve) => setTimeout(() => resolve(null), 10)) // faster fallback
]);
```

### Option 3: Full Revert
```bash
git revert <commit-sha>  # Revert cache layers wiring
npm run dev             # Restart dev server
```

---

## Success Criteria

| Criterion | Measure | Target |
|-----------|---------|--------|
| Health check latency | P95 response time | <100ms |
| Orchestration latency | P95 total time | <300ms |
| Layer 2 overhead | adapter - direct | <50ms |
| Layer 3 latency (hit) | Redis GET | <10ms |
| Layer 4 latency (hit) | Redis GET | <10ms |
| Fallback correctness | decision = layer1_direct | 100% on all misses |
| API availability | GET /health | 99.9% |
| Zero regressions | Layer 1 latency | unchanged |

---

## Deployment Sequence

1. **Merge to main** (commit cache-layers-orchestrator.ts + endpoints + tests)
2. **Dev server restart** (loads new modules)
3. **Run smoke tests** (health check + orchestration baseline)
4. **Run integration tests** (Layer 1-4 behavior verification)
5. **Enable telemetry** (record decisions for 24h baseline)
6. **Monitor metrics** (confirm no regressions)
7. **Phase 4 planning** (GPU acceleration, cuGraph, PageRank speedup)

---

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `cache-layers-orchestrator.ts` | 240 | Core orchestrator for Layers 2-4 |
| `routes/api/retrieval/cache-layers/+server.ts` | 85 | GET/POST orchestration endpoint |
| `routes/api/retrieval/cache-layers/health/+server.ts` | 45 | Health check endpoint |
| `tests/cache-layers.spec.ts` | 280 | 30 test cases |

**Total new code:** ~650 lines (TypeScript)  
**Dependencies:** Existing (no new packages)  
**Breaking changes:** None (backward compatible)

---

## What's NOT in Phase 3

❌ GPU acceleration (Phase 4)  
❌ ML-based cache prediction (Phase 5)  
❌ Cross-tenant leakage tests (Phase 5+)  
❌ LLM-based cache key generation (deferred)  
❌ Distributed cache replication (deferred)  

---

## Next Phase (Phase 4: GPU Acceleration)

After cache layers verified:

1. Install cuGraph (nx-cugraph backend)
2. Wire PageRank speedup (14×)
3. Wire Louvain speedup (12.6×)
4. Measure end-to-end impact on retrieval quality

Expected: 15-20% improvement in retrieval latency via GPU topology acceleration.

---

**Document Version:** 1.0  
**Last Updated:** 2026-07-10  
**Status:** Ready for Session 133 implementation
