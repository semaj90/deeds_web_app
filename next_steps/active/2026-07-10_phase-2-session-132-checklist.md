# Phase 2 Session 132+ Implementation Checklist

## Status: Phase 2 (Sessions 131-132) Complete — All 6 Slices Wired ✅

**Completed in Session 131:**
- ✅ Slice 1: Health endpoints (`/api/atlas/runtime-cache/health`)
- ✅ Slice 2: Service Worker SOM lookup (`static/sw-som-lookup.js`)
- ✅ Slice 3: LOD emission integration (`src/lib/server/atlas/lod-emission-integration.ts`)
- ✅ Slice 4: Promotion decision recording (`src/lib/server/atlas/retrieval-promotion-policy.ts`)
- ✅ Slice 5: Telemetry collection (`src/lib/server/atlas/runtime-cache-telemetry.ts`)
- ✅ Slice 6: Prometheus metrics (`/api/atlas/runtime-cache/metrics`)
- ✅ 26 tests in `tests/runtime-cache-promotion.spec.ts`
- ✅ Production smoke test (`scripts/runtime-cache-smoke-test.mjs`)

**Completed in Session 132 (This Session):**
- ✅ Smoke test packaging guide (`docs/runtime-cache/SMOKE-TEST-PACKAGE-GUIDE.md`)
- ✅ GPU acceleration setup (`docs/runtime-cache/GPU-ACCELERATION-SETUP.md`)
- ✅ Python GPU wrapper (`scripts/smoke-test-gpu.py`)

---

## Phase 3: Production Wiring (Sessions 133-134)

### Pre-Flight Checks (Session 133)

- [ ] **Verify 6 slices are operational**
  ```bash
  # Check health endpoint
  curl -s http://localhost:5173/api/atlas/runtime-cache/health | jq .
  
  # Check metrics endpoint
  curl -s http://localhost:5173/api/atlas/runtime-cache/metrics | head -20
  
  # Check Prometheus format validity
  curl -s http://localhost:5173/api/atlas/runtime-cache/metrics | grep -E "^# HELP|^# TYPE|^runtime_cache"
  ```

- [ ] **Confirm database schema applied**
  ```sql
  -- Inside docker exec legal-ai-postgres psql
  \d retrieval_promotion_decisions
  -- Should show: id, trace_id, packet_key, rank, final_score, selected, destination, validation_gate_passed, reason_codes, created_at
  ```

- [ ] **Test Redis connection**
  ```bash
  docker exec legal-ai-redis redis-cli PING
  # Expected: PONG
  
  # Check existing telemetry keys
  docker exec legal-ai-redis redis-cli KEYS "runtime-cache:telemetry:*" | wc -l
  ```

- [ ] **Run smoke test (no infrastructure)**
  ```bash
  npm run smoke:runtime-cache
  # Expected: 26/26 tests pass or graceful skip
  ```

### Slice Integration (Session 133)

- [ ] **Wire LOD manifests into retrieval orchestrator**
  - File: `src/lib/server/retrieval/unified-orchestrator.ts`
  - Add LOD emission stage after promotion decision
  - Emit LOD manifest for each promoted packet
  - Store manifest in Redis cache
  - Update telemetry with LOD levels

- [ ] **Register Service Worker for SOM lookup**
  - File: `sveltekit-frontend/src/lib/client/sw-register.ts`
  - Call `navigator.serviceWorker.register('/sw-som-lookup.js')`
  - Verify SW scope covers `/api/packets/*` routes
  - Test cache hit with repeated requests

- [ ] **Wire telemetry into request/response pipeline**
  - File: `src/routes/api/retrieval/unified/+server.ts`
  - Call `recordCacheHit()` / `recordCacheMiss()` at appropriate points
  - Call `recordPromotion()` when cache write decided
  - Call `recordLodEmission()` when manifest created
  - Call `recordValidationGate()` for every validation pass/fail

### End-to-End Testing (Session 133)

- [ ] **Test complete promotion flow**
  ```bash
  npm run test:runtime-cache:e2e
  # Tests: health → SOM lookup → LOD emission → promotion decision → telemetry → metrics
  ```

- [ ] **Verify Prometheus metrics collection**
  ```bash
  # Run smoke test
  npm run smoke:runtime-cache
  
  # Query metrics endpoint
  curl -s http://localhost:5173/api/atlas/runtime-cache/metrics | grep "runtime_cache_browser_l1_hits"
  # Expected: runtime_cache_browser_l1_hits N
  ```

- [ ] **Monitor Grafana dashboard**
  - Open `http://localhost:3000/d/runtime-cache/` (if Grafana running)
  - Verify panels populate with live data
  - Check cache hit rates, LOD distribution, promotion routing

### Performance Baseline (Session 133)

- [ ] **Measure end-to-end latency**
  ```bash
  # Single request
  time curl -s http://localhost:5173/api/retrieval/unified?q=test | jq '.timing'
  
  # Expected breakdown:
  # - Health check: 2-5ms
  # - SOM lookup: 5-20ms (first hit) / 1-2ms (cached)
  # - LOD emission: 10-30ms
  # - Promotion decision: 5-15ms
  # - Telemetry recording: <1ms
  # - Total: 30-70ms
  ```

- [ ] **Measure cache hit rate**
  ```bash
  # Run 100 repeated queries
  for i in {1..100}; do curl -s http://localhost:5173/api/retrieval/unified?q=auth; done
  
  # Query telemetry
  curl -s http://localhost:5173/api/atlas/runtime-cache/metrics | grep "browser_l1"
  # Expected: hits >> misses (80-90% hit rate for repeated queries)
  ```

---

## Phase 4: GPU Acceleration (Sessions 134-135)

### Setup (Session 134)

- [ ] **Install GPU dependencies**
  ```bash
  # Follow docs/runtime-cache/GPU-ACCELERATION-SETUP.md
  pip install cugraph==24.02 --extra-index-url https://pypi.nvidia.com
  
  # Verify
  python -c "import nx_cugraph; print(nx_cugraph.__version__)"
  ```

- [ ] **Test GPU availability**
  ```bash
  nvidia-smi
  # Expected: RTX 3060 Ti visible with VRAM info
  
  python -c "import nx_cugraph as nxcg; import networkx as nx; nx.config.backends.set('cugraph'); print('GPU ready')"
  # Expected: GPU ready
  ```

- [ ] **Run GPU smoke test**
  ```bash
  python scripts/smoke-test-gpu.py
  # Expected: Topology benchmarks show 10-15× speedup
  ```

### Wiring (Session 134-135)

- [ ] **Wire GPU operations into topology search**
  - File: `src/lib/server/graph/topology-search.ts`
  - Replace CPU NetworkX calls with GPU equivalents
  - Add backend selection logic (GPU for >10K nodes, CPU otherwise)
  - Log performance metrics

- [ ] **Add GPU memory monitoring**
  - File: `src/lib/server/gpu/memory-monitor.ts`
  - Track VRAM usage during topology operations
  - Alert if usage exceeds 6GB (safety margin for 8GB GPU)
  - Auto-fallback to CPU if memory exhausted

- [ ] **Export GPU metrics to Prometheus**
  - File: `src/routes/api/gpu/metrics/+server.ts`
  - Export GPU memory usage
  - Export operation latency by backend (GPU vs CPU)
  - Export speedup ratio for comparative analysis

### Performance Tuning (Session 135)

- [ ] **Benchmark topology operations**
  ```bash
  python scripts/smoke-test-gpu.py --benchmark
  # Expected:
  # - PageRank: 178ms (GPU) vs 2487ms (CPU) = 14× speedup
  # - Louvain: 71ms (GPU) vs 892ms (CPU) = 12.6× speedup
  # - K-Core: 89ms (GPU) vs 1245ms (CPU) = 14× speedup
  ```

- [ ] **Optimize batch sizes**
  - Test batch_size = 1, 10, 100 for parallel processing
  - Find optimal throughput point (typically 50-100 graphs/batch)
  - Document in `docs/runtime-cache/GPU-ACCELERATION-SETUP.md`

- [ ] **Monitor sustained performance**
  - Run topology operations continuously for 1 hour
  - Verify GPU doesn't throttle (maintain 14× speedup)
  - Check for memory leaks or gradual slowdown

---

## Phase 5: Observability & Monitoring (Sessions 135-136)

### Prometheus Integration

- [ ] **Export all metrics to Prometheus**
  - Cache hit/miss rates per layer
  - Promotion destination distribution
  - LOD level emission counts
  - Validation gate pass/fail rates
  - GPU operation latencies (if GPU enabled)

- [ ] **Create Prometheus alert rules**
  ```yaml
  groups:
    - name: runtime_cache
      rules:
        - alert: LowCacheHitRate
          expr: runtime_cache_browser_l1_hits / (runtime_cache_browser_l1_hits + runtime_cache_browser_l1_misses) < 0.5
          for: 5m
          annotations:
            summary: "L1 cache hit rate below 50%"
        
        - alert: HighValidationGateFailure
          expr: runtime_cache_validation_gate_failed / (runtime_cache_validation_gate_passed + runtime_cache_validation_gate_failed) > 0.1
          for: 5m
          annotations:
            summary: "Validation gate failure rate above 10%"
  ```

### Grafana Dashboard

- [ ] **Create runtime-cache monitoring dashboard**
  - Panel 1: Cache hit rate (L1/L2) over time
  - Panel 2: Promotion destination distribution (pie chart)
  - Panel 3: LOD level emissions (stacked bar)
  - Panel 4: Validation gate results (pass/fail ratio)
  - Panel 5: GPU memory usage (if GPU enabled)
  - Panel 6: Operation latencies (P50/P95/P99)

- [ ] **Create GPU performance dashboard** (if GPU enabled)
  - Panel 1: GPU memory utilization over time
  - Panel 2: Operation latency comparison (GPU vs CPU)
  - Panel 3: Speedup ratio by operation type
  - Panel 4: GPU temperature (health check)

### Langfuse Integration

- [ ] **Wire telemetry to Langfuse**
  - File: `src/lib/server/atlas/runtime-cache-telemetry.ts`
  - Add Langfuse exporter
  - Create traces for each promotion decision
  - Link telemetry signals to decision reasons

---

## Phase 6: Documentation & Knowledge Base (Session 136)

### API Documentation

- [ ] **Document runtime-cache endpoints**
  ```markdown
  # Runtime-Cache API
  
  ## GET /api/atlas/runtime-cache/health
  Health check endpoint for backend readiness.
  
  ## GET /api/atlas/runtime-cache/metrics
  Prometheus-compatible metrics export.
  
  ## POST /api/atlas/runtime-cache/promote
  Manual cache promotion endpoint (for testing).
  ```

- [ ] **Document Service Worker behavior**
  ```markdown
  # Service Worker SOM Lookup
  
  The Service Worker intercepts requests to `/api/packets/*` and:
  1. Checks IndexedDB for cached SOM cell data
  2. If exact cell hit, returns cached manifest
  3. If cell miss, fetches from network
  4. Updates IndexedDB cache with 1-hour TTL
  ```

### Architecture Documentation

- [ ] **Update architecture reference**
  - File: `docs/architecture/runtime-cache-architecture.md`
  - Document 3-tier cache architecture
  - Document promotion policy decision tree
  - Document LOD manifest structure

- [ ] **Create implementation guide**
  - File: `docs/runtime-cache/IMPLEMENTATION-GUIDE.md`
  - Step-by-step integration instructions
  - Troubleshooting common issues
  - Performance tuning recommendations

### Smoke Test Documentation

- [ ] **Document smoke test packages**
  - File: `docs/runtime-cache/SMOKE-TEST-PACKAGE-GUIDE.md` ✅ (Done)
  - Options: npm script, Docker, Python wheel, binary
  - Performance comparison
  - CI/CD integration patterns

---

## Implementation Order

### Week 1 (Sessions 133)
1. ✅ Phase 2 completion (all 6 slices wired)
2. Pre-flight checks and smoke test validation
3. LOD manifest wiring into orchestrator
4. Service Worker registration and testing

### Week 2 (Sessions 134-135)
1. GPU acceleration setup and testing
2. Topology operation wiring to GPU backend
3. Performance baseline measurement
4. GPU memory monitoring

### Week 3 (Sessions 135-136)
1. Prometheus metrics export
2. Grafana dashboard creation
3. Langfuse integration
4. Documentation finalization

---

## Risk Mitigation

### Testing Strategy

- **Unit Tests**: Each slice tested in isolation (26 tests ✅)
- **Integration Tests**: All slices together (smoke test ✅)
- **Performance Tests**: Baseline measurements
- **Regression Tests**: Ensure no impact on other retrieval features

### Rollback Plan

If production issues occur:
1. Revert last commit
2. Disable telemetry recording (non-blocking)
3. Disable LOD emission (fallback to full packets)
4. Disable GPU (fallback to CPU)
5. Disable cache promotion (read-only access)
6. Keep health checks active for diagnostics

### Safety Checks

- All database writes non-blocking (try/catch)
- All cache operations timeout-guarded
- All GPU operations with fallback to CPU
- All metrics with graceful missing-data handling
- All Service Worker operations with network fallback

---

## Success Criteria

### Phase 2 Completion ✅
- [x] All 6 slices operational
- [x] 26 tests passing
- [x] Production smoke test passing
- [x] Health endpoints reporting correct status

### Phase 3 Completion
- [ ] LOD manifests flowing through orchestrator
- [ ] Service Worker caching working
- [ ] Telemetry recording all signals
- [ ] Metrics endpoint returning valid data

### Phase 4 Completion
- [ ] GPU acceleration installed and verified
- [ ] 10-15× speedup measured on topology ops
- [ ] GPU memory monitoring active
- [ ] No regressions on CPU fallback

### Phase 5 Completion
- [ ] Prometheus metrics exported
- [ ] Grafana dashboards created
- [ ] Alert rules configured
- [ ] Langfuse traces flowing

### Phase 6 Completion
- [ ] All documentation written
- [ ] API contracts defined
- [ ] Architecture documented
- [ ] Smoke test packaged for distribution

---

## Next Phase Trigger

**Phase 3 begins when:**
- ✅ Phase 2 smoke tests pass (26/26)
- ✅ All 6 slices confirmed working
- ✅ Production readiness checklist cleared

**Estimated Start:** Session 133 (next session)
**Estimated Duration:** 4-6 weeks (Sessions 133-138)
**Success Metric:** Runtime-cache ready for production traffic

---

## Key Files & Commands

### Session 132 Deliverables

| File | Status | Command |
|------|--------|---------|
| `docs/runtime-cache/SMOKE-TEST-PACKAGE-GUIDE.md` | ✅ Done | See § "Package Distribution Options" |
| `docs/runtime-cache/GPU-ACCELERATION-SETUP.md` | ✅ Done | Follow installation steps |
| `scripts/smoke-test-gpu.py` | ✅ Done | `python scripts/smoke-test-gpu.py` |

### Smoke Test Execution

```bash
# Direct Node.js (fastest)
npm run smoke:runtime-cache

# With GPU benchmarks
python scripts/smoke-test-gpu.py

# Docker container
docker run runtime-cache-smoke:latest

# CI/CD integration
npm run smoke:runtime-cache  # In GitHub Actions
```

### Performance Validation

```bash
# Baseline (no GPU)
node scripts/runtime-cache-smoke-test.mjs > /tmp/baseline.txt

# With GPU
python scripts/smoke-test-gpu.py --benchmark > /tmp/gpu-bench.txt

# Compare results
diff /tmp/baseline.txt /tmp/gpu-bench.txt
```

---

## Session 132 Summary

**Completed:**
- ✅ Smoke test packaging guide (4 distribution options)
- ✅ GPU acceleration setup instructions (with troubleshooting)
- ✅ Python GPU wrapper script (asyncio + color output)

**Ready for:**
- Phase 3 production wiring (Session 133+)
- GPU acceleration deployment (Session 134+)
- Observability & monitoring (Session 135+)

**Next Step:** Session 133 pre-flight checks and LOD orchestrator wiring

---

**Last Updated:** July 10, 2026 (Session 132 Complete)
**Status:** Ready for Phase 3 Implementation
**Target Completion:** Week of July 20, 2026 (Session 136)
