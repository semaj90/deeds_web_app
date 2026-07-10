# Phase 3B End-to-End Testing — READY FOR EXECUTION

**Status:** ✅ All test suites created and ready to run  
**Date:** July 10, 2026 (Session 133+ Continuation)  
**Duration:** 4 hours (smoke + integration + regression)

---

## Test Suites Created

### 1. Unit Tests — Cache Layers Orchestration
**File:** `tests/cache-layers.spec.ts` (232 lines, 30 tests)

**Coverage:**
- Health check (3 tests) — Layer 2, 3, 4 availability
- Orchestration metrics (7 tests) — parallel execution, decision logic, timing
- API endpoints (3 tests) — GET/POST health check
- Layer independence (3 tests) — non-cascading failures
- Performance (3 tests) — <10ms hits, <50ms overhead, <300ms orchestration
- Additional (8 tests) — layer-specific validations

**Run:**
```bash
npm run test:cache-layers:unit
```

### 2. Integration Tests — Go Retrieval Facade
**File:** `tests/cache-layers-integration.spec.ts` (260 lines, 14 tests)

**Coverage:**
- Cache layers in response (4 tests) — decision, timing, all layer metrics
- Cache inheritance (2 tests) — Layer 2 overhead, result integrity
- Performance characteristics (4 tests) — parallel orchestration, Redis hits <10ms
- Non-blocking design (3 tests) — failures don't block, fallback to Layer 1
- Health check integration (2 tests) — cache layers in overall health
- Regression tests (3 tests) — identity validation, dispatcher, standard pipeline
- Multi-vector compatibility (1 test) — cache layers with multi-vector routing

**Run:**
```bash
npm run test:cache-layers:integration
```

### 3. Smoke Tests — End-to-End Validation
**File:** `scripts/phase3b-smoke-tests.mjs` (270 lines)

**Tests:**
1. **Health Check** — Cache layers reachable and UP
2. **Orchestration Endpoint** — Returns decision + metrics
3. **A→A→A' Pattern** — Cache hits vs misses vs invalidation
4. **Go Retrieval Integration** — cache_layers in response
5. **Regression Check** — Layer 1 baseline unchanged

**Run:**
```bash
npm run smoke:cache-layers
npm run smoke:cache-layers:verbose  # with detailed output
```

---

## Success Criteria (Exit Gates)

| Criterion | Target | Gate |
|-----------|--------|------|
| Health check P95 | <100ms | GET /api/retrieval/cache-layers/health |
| Orchestration P95 | <300ms | POST /api/retrieval/cache-layers |
| Layer 2 overhead | <50ms | adapter - direct latency |
| Layer 3-4 hit | <10ms | Redis GET latency |
| Fallback correctness | 100% on misses | cache_decision = layer1_direct |
| API uptime | 99.9% | Health check SLA |
| Zero regressions | ±2% baseline | Layer 1 unchanged |

---

## Testing Workflow (Phase 3B)

### Step 1: Verify Preconditions (30m)
```bash
# Check all services are UP
npm run smoke:cache-layers

# If any service is DOWN, fix before continuing
# Critical: Layer 1 (llama.cpp :8090), Layer 2 (adapter :8091), 
#           Valkey (redis :6379), Postgres (:5434)
```

### Step 2: Run Unit Tests (1h)
```bash
# Run cache-layers orchestrator tests
npm run test:cache-layers:unit

# Expected: 30/30 passing
# If failures: check orchestrator logic in cache-layers-orchestrator.ts
```

### Step 3: Run Integration Tests (1.5h)
```bash
# Run Go Retrieval facade integration tests
npm run test:cache-layers:integration

# Expected: 14/14 passing
# If failures: check go-retrieval-facade.ts cache layers wiring
```

### Step 4: Run Smoke Tests (1.5h)
```bash
# Run end-to-end smoke validation
npm run smoke:cache-layers:verbose

# Expected: 5/5 tests passed
# If failures: check individual test output for specific layer issues
```

### Step 5: Verify Regression (30m)
```bash
# Run existing retrieval tests to ensure no degradation
npm run test:cache-layers

# Expected: All tests passing with ±2% baseline latency
```

---

## Test Environment Setup

### Required Services
| Service | Port | Startup Command |
|---------|------|-----------------|
| llama.cpp (Layer 1) | 8090 | `npm run turbo:start:detached` |
| OpenCode adapter (Layer 2) | 8091 | Launched automatically if available |
| Valkey (Layers 3-4) | 6379 | `docker-compose up -d legal-ai-redis` |
| Postgres | 5434 | `docker-compose up -d legal-ai-postgres` |
| SvelteKit dev server | 5173 | `npm run dev` |

### Health Check Commands
```bash
# Layer 1 (llama.cpp)
curl http://127.0.0.1:8090/v1/models | jq '.data[0] | {id, context_length}'

# Layer 2 (adapter, optional)
curl http://127.0.0.1:8091/v1/models 2>/dev/null || echo "Layer 2 not available"

# Valkey
docker exec legal-ai-redis redis-cli PING

# Postgres
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT 1"

# Dev server
curl http://localhost:5173/api/retrieval/cache-layers/health
```

---

## Test Execution Order

```
Phase 3B Testing Timeline
├─ Step 1: Preconditions (30m) ─→ smoke:cache-layers
├─ Step 2: Unit Tests (1h) ───→ test:cache-layers:unit
├─ Step 3: Integration (1.5h) ─→ test:cache-layers:integration
├─ Step 4: Smoke Tests (1.5h) ─→ smoke:cache-layers:verbose
└─ Step 5: Regression (30m) ──→ test:cache-layers

Total Duration: 4 hours (can run parallel where noted)
```

---

## Key Test Assertions

### Performance Assertions
- Orchestration completes in **<300ms** (parallel, not sequential)
- Layer 3-4 Redis hits: **<10ms**
- Layer 2 adapter overhead: **<50ms**
- Health check: **<100ms**

### Correctness Assertions
- All layers return valid metrics (latency_ms, hit boolean)
- Cache decision is one of: `layer1_direct`, `layer2_adapter`, `layer3_exact`, `layer4_semantic`
- No cache hits (expected until Phase 3C) → fallback to `layer1_direct`
- Layer failures don't cascade (Promise.all error handling)

### Regression Assertions
- Layer 1 baseline measured and unchanged (±2%)
- Identity validation still works
- Dispatcher integration still works
- Standard retrieval pipeline completes

---

## Troubleshooting Guide

### "Health check failed"
**Cause:** One or more cache layers unreachable  
**Fix:** Verify all services are UP via health check commands above

### "Orchestration timeout"
**Cause:** Layers exceeded 100ms timeout  
**Fix:** Check network latency, verify service responsiveness

### "Cache decision is unexpected"
**Cause:** Layer measurement returned unexpected hit  
**Fix:** Verify cache data isn't stale; clear cache if needed

### "Performance regression"
**Cause:** Latency >300ms or individual layer >expected  
**Fix:** Check for network contention, GC pauses, CPU load

### "Test failures in Layer 2-4"
**Cause:** Services not UP or network issues  
**Fix:** Restart services, verify 100% uptime before testing

---

## Phase 3B Outputs

After successful testing:

1. **Test Report** — `reports/phase3b-test-results.md` (auto-generated)
2. **Performance Baseline** — Recorded in test logs
3. **Health Summary** — All services confirmed UP and healthy
4. **Regression Verification** — Zero degradation confirmed

---

## Next Phase (Phase 3C)

After Phase 3B passes:

1. **Telemetry Collection (2h)**
   - Non-blocking decision recording to Redis
   - Prometheus metrics export
   - Cache hit/miss ratios

2. **Rollback Plan Verification (30m)**
   - Disable layer test
   - Reduce timeout test
   - Full revert capability confirmed

---

## Rollback Decision Tree

| Scenario | Action | Rollback Time |
|----------|--------|---------------|
| Single layer timeout | Disable layer | <1m |
| Multiple layer failures | Reduce timeout to 50ms | <2m |
| Critical production issue | Full revert via git | <5m |
| Performance regression | Clear cache, re-run test | <2m |

---

## npm Scripts Reference

```bash
# Unit tests
npm run test:cache-layers:unit

# Integration tests
npm run test:cache-layers:integration

# Both unit + integration
npm run test:cache-layers

# Smoke tests
npm run smoke:cache-layers
npm run smoke:cache-layers:verbose

# Dev server
npm run dev

# Service health
curl http://localhost:5173/api/retrieval/cache-layers/health
curl http://localhost:5173/api/retrieval/cache-layers -X POST \
  -H "Content-Type: application/json" \
  -d '{"system_prompt":"You are Atlas.","user_prompt":"test","measure_direct_ms":211}'
```

---

## Status Summary

| Component | Status |
|-----------|--------|
| Unit tests | ✅ Created (30 tests) |
| Integration tests | ✅ Created (14 tests) |
| Smoke tests | ✅ Created (5 tests) |
| npm scripts | ✅ Added to package.json |
| Documentation | ✅ This file |
| **Phase 3B Readiness** | **✅ READY FOR EXECUTION** |

---

**Timeline:** 4 hours for full Phase 3B  
**Entry Gate:** All services UP  
**Exit Gate:** 5/5 smoke tests pass, no regressions  
**Next:** Phase 3C telemetry collection

---

**Created:** 2026-07-10 (Session 133+ Continuation)  
**Checklist:** See PHASE-3-PRODUCTION-WIRING-CHECKLIST.md for Phase 3A/B/C/D sequence
