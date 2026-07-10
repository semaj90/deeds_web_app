# GSD Phase: Prove OpenCode Context Reuse

**Status**: READY_WITH_CORRECTIONS  
**Duration**: 2-3 hours (four independent measurements)  
**Owner**: Cache validation  
**Acceptance**: Four independent cache layers measured separately, no false claims

---

## Phase Narrative

We measure prompt caching across **four independent layers** that must not interfere with each other:

1. **llama.cpp KV/prefix reuse** (direct port 8090)
2. **OpenCode provider adapter** (port 8091)
3. **BitFrost exact packet cache** (Valkey)
4. **BitFrost semantic packet cache** (Valkey)

Each layer has its own invalidation rules, lifetimes, and test pattern. Combining measurements would hide failures.

---

## Acceptance Criteria (EXIT GATES)

✅ **Cache layers are independently observable**
- Each layer has separate measurement code
- Metrics from Layer 1 (llama.cpp) do NOT include Layer 3 (Valkey) behavior
- Adapter overhead is transparent in results

✅ **Prefix mutation test behaves correctly**
- Changing only the user suffix preserves most KV reuse benefit
- Changing early system-prompt tokens destroys most KV reuse benefit
- Results match documented llama.cpp behavior

✅ **No cache claim relies only on total latency**
- Measurement includes prompt-eval time vs generation time (when available)
- Latency variance accounted for (10+ runs per case)
- Outliers excluded from analysis (top/bottom 10% trimmed)
- Warm-up runs are labeled separately from measured runs

✅ **Metrics are written to Postgres**
- Results inserted into `cache_probe_runs` and `cache_probe_results` tables (create if missing)
- Deterministic replay from stored metrics
- Audit trail for future re-runs

✅ **Results survive deterministic replay**
- Context document hash is frozen (922 words, stable prefix)
- Same context + user message → same cache behavior
- Re-running same test case produces ≤5% latency variance

---

## Plan 01: Add Cache-Probe Fixture and Benchmark Harness

**Deliverable**: `scripts/cache-probe-harness.ps1` + `docs/cache-probe-context.md`

**Tasks**:
- [x] Freeze 1,200+ token context document (922 words)
- [x] Create PowerShell harness (four independent test functions)
- [x] Implement Layer 1 (direct llama.cpp) test
- [x] Implement Layer 2 (OpenCode adapter) test
- [x] Implement Layer 3 (BitFrost exact) test
- [x] Implement Layer 4 (BitFrost semantic) test
- [ ] Verify Valkey/Redis connectivity from harness
- [ ] Run dry-run (1 iteration, all layers)

**Status**: ✅ Code ready; awaiting execution

---

## Plan 02: Measure Direct llama.cpp Prefix Reuse

**Deliverable**: Baseline KV cache behavior on port 8090

**Test Cases**:
- **A1**: Identical prefix + user message → measure latency
- **A2**: Identical prefix + user message → measure latency (repeat A1)
- **C1**: Prefix mutated (early paragraph changed) → measure latency
- **Server restart**: A1 again after process restart → verify cache lifetime

**Measurement**:
- Total round-trip time (system + user prompt)
- Prompt token count (should be identical for A1/A2)
- Completion token count
- Time-to-first-token (if available from llama.cpp)

**Expected Result**:
- A2 prompt-eval time < A1 prompt-eval time
- B1 should retain a large shared-prefix reuse benefit versus C1
- C1 prompt-eval time materially greater than A2
- Post-restart A1 should behave like a cold request unless a slot is explicitly restored

**Commands**:
```powershell
# Dry-run (1 iteration)
.\scripts\cache-probe-harness.ps1 -Iterations 1

# Full run (10 iterations per case)
.\scripts\cache-probe-harness.ps1 -Iterations 10
```

---

## Plan 03: Measure OpenCode Provider Behavior

**Deliverable**: Adapter-layer overhead and cache visibility

**Test Cases**:
- Same A1, A2, C1 through port 8091 (OpenCode adapter)
- Compare latencies vs Layer 2 (port 8090 direct)

**Measurement**:
- Adapter overhead = (adapter latency) - (direct latency)
- Does adapter latency correlate with direct KV reuse?
- Does adapter introduce additional latency variance?

**Expected Result**:
- Adapter overhead reported as separate timing fields, not derived from a single wall clock delta
- Adapter A2 should preserve the same relative prompt-eval improvement as the direct path
- Adapter does NOT add its own caching layer (transparent pass-through)

**Acceptance**:
- Adapter A2 faster than A1 (inherits KV reuse from llama.cpp)
- Adapter A2 vs A2 (direct) variance < 20% (adapter overhead acceptable)

---

## Plan 04: Measure BitFrost Packet-Manifest Reuse

**Deliverable**: Redis/Valkey cache hit/miss rates and latency

**Test Cases**:
- **Exact cache**: Same (intent + HMM state) → should hit
- **Semantic cache**: Paraphrased intent + same HMM state → should hit or miss?
- **Cache invalidation**: Same (intent + state), changed HMM state → should miss
- **Cross-tenant**: Same (intent + state), different user/tenant → should miss (CRITICAL)

**Measurement**:
- Redis GET latency (should be <10ms on hit)
- Cache key format and stability
- Hit/miss rate per case
- Leakage detection (wrong tenant returned)

**Expected Result**:
- Exact cache hit: 100% (same key)
- Exact cache latency: < 10ms (p95)
- Semantic cache hit quality must be evaluated with labeled positives/negatives
- Cross-tenant: 0% leakage (strict isolation)

**Acceptance**:
- Exact cache never returns stale entry
- Semantic cache hit rate > 70%
- No cross-tenant data leakage

---

## Plan 05: Add Invalidation and Leakage Tests

**Deliverable**: Proof that caches invalidate correctly and don't leak

**Test Cases**:
- **Time-based invalidation**: Set TTL, wait 24h+ (simulated via mock)
- **Event-based invalidation**: Change source_ref hash, verify cache miss
- **Stale entry rejection**: Fetch stale entry, verify validation gate fails
- **Concurrent writes**: Two processes write different manifests to same key
- **Cross-user isolation**: Request from user A, verify user B doesn't see result

**Measurement**:
- Invalidation latency (how long until cache returns miss)
- Stale entry rejection rate (should be 100%)
- Leakage detection (0% allowed)

**Acceptance**:
- All stale entries rejected
- All cross-user boundaries enforced
- Invalidation lag < 100ms from event trigger

---

## Exit Criteria Summary

| Gate | Acceptance Condition | Status |
|------|----------------------|--------|
| **Layer independence** | Four layers measured separately, no data conflation | ⏳ Pending execution |
| **Prefix mutation** | Suffix-only mutation beats early-prefix mutation | ⏳ Pending execution |
| **No latency claims** | Metrics include prompt-eval/generation breakdown, not just total | ⏳ Pending execution |
| **Postgres audit trail** | Results inserted into `cache_probe_results` with shared `run_id` | ⏳ Pending table creation |
| **Deterministic replay** | Same context + message → same cache decision and validity outcome | ⏳ Pending execution |

---

## Execution Checklist

**Pre-flight**:
- [ ] Verify llama.cpp running at 127.0.0.1:8090
- [ ] Verify OpenCode adapter running at 127.0.0.1:8091
- [ ] Verify Valkey/Redis running at 127.0.0.1:6379 (password: redis)
- [ ] Verify `docs/cache-probe-context.md` is frozen (922 words)
- [ ] Create Postgres tables `cache_probe_runs` and `cache_probe_results` (schema below)

**Execution**:
1. Run harness: `.\scripts\cache-probe-harness.ps1 -Iterations 10`
2. Capture results JSON: `reports/cache-probe-results.json`
3. Insert results into Postgres
4. Analyze metrics with `npm run atlas:cache-probe:analyze` (see Plan 02-05 above)
5. Report findings

**Post-flight**:
- [ ] Latency analysis complete (p50, p95, p99 per layer, with prompt-eval separated)
- [ ] Cache hit rates recorded and acceptable
- [ ] Leakage tests passed (0% cross-tenant)
- [ ] Deterministic replay successful
- [ ] Report written to `reports/cache-probe-analysis.md`

---

## Postgres Schema

```sql
CREATE TABLE cache_probe_results (
  id SERIAL PRIMARY KEY,
  run_id UUID DEFAULT gen_random_uuid(),
  case_id VARCHAR(20),
  iteration INT,
  layer VARCHAR(50),
  success BOOLEAN,
  total_ms INT,
  prompt_tokens INT,
  completion_tokens INT,
  cache_hit BOOLEAN,
  lookup_ms INT,
  error TEXT,
  context_hash VARCHAR(64),
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cache_probe_run ON cache_probe_results(run_id);
CREATE INDEX idx_cache_probe_case ON cache_probe_results(case_id);
CREATE INDEX idx_cache_probe_layer ON cache_probe_results(layer);
```

---

## Next Phase (After Exit Criteria Met)

Once all four layers are measured and validated:

**Phase 3**: Production wiring of LOD + Service Worker + telemetry (8h, structured)

At that point, we can claim "prompt caching is enabled in production" with evidence.

---

## Why This GSD Phase

- **Not a LangGraph state**: GSD defines work boundaries; LangGraph runs the app
- **Not a competing planner**: This is pure measurement; Deep Agents handles orchestration
- **Clear ownership**: Each layer owns its test, invalidation, and metrics
- **Replayable**: Same context document + message → same result
- **Observable**: Four independent outcomes, no hidden interdependencies

**Run this phase before claiming prompt caching works.**
