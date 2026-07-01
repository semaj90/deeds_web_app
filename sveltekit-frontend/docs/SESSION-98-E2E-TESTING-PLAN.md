# Session 98: End-to-End Testing & Validation Plan

**Date**: June 30, 2026  
**Phase**: Phase C Option A (Completed) → Testing & Measurement

---

## Overview

CUDA graph caching has been wired into the hot path (`query-router.ts`). This document outlines the complete testing and measurement strategy to validate speedup and decide whether to proceed with Option B (full observability + production gates).

---

## Step 1: Quick Benchmark (2 min)

**Objective**: Verify CUDA graph caching can provide 2-10x speedup on cache hits.

```bash
cd sveltekit-frontend
npm run bench:cuda-graph-cache:quick
```

**Expected Output**:
```
✓ Batch 32: avg first=22.5ms, avg repeat=4.2ms, speedup=5.4x
✓ Batch 64: avg first=28.3ms, avg repeat=5.1ms, speedup=5.5x

Average speedup: 5.4x
Min speedup: 5.4x
Max speedup: 5.5x
```

**Pass Criteria**:
- ✅ Speedup > 1.5x (expect 2-10x)
- ✅ No errors or timeouts
- ✅ JSON report generated

**If FAIL**:
- Check GPU bridge is loaded: `ls -la simd-bridge/cpp/build/Release/tensorrt_bridge.node`
- Verify CUDA availability: GPU device, drivers, memory
- Check system load (use `gpu-z` or `nvidia-smi`)

---

## Step 2: Integration Test (5 min)

**Objective**: Verify reranking hook works with mocked data.

```bash
npm run test:cuda-graph-rerank
```

**Expected Output**:
```
✓ Test 1: Import reranking hook...
  ✓ Reranking hook imported successfully

✓ Test 2: shouldRerank() decision logic...
  ✓ Decision logic correct

✓ Test 3: Query vector validation...
  ✓ Validation logic correct

✓ Test 4: Hit embedding extraction...
  ✓ Extraction correct (2 valid, 1 missing)

✓ Test 5: Reranking call (GPU or CPU fallback)...
  Reranked 2 hits
  Cache hit: false
  Fast path: capture
  Total ms: 23.45

✓ Test 6: Score ordering...
  ✓ Scores properly ordered

✅ ALL INTEGRATION TESTS PASSED
```

**Pass Criteria**:
- ✅ All 6 tests pass
- ✅ Reranking produces valid scores
- ✅ Output properly sorted by score
- ✅ Graceful fallback if GPU unavailable

**If FAIL**:
- Check module imports: verify hook file exists
- Check TypeScript: `npx tsc --noEmit`
- Run with `--verbose` for detailed trace

---

## Step 3: Wire Integration Verification (5 min)

**Objective**: Verify query-router.ts integration doesn't break retrieval.

```bash
# Compile check
npx tsc --noEmit src/lib/server/ace/query-router.ts

# Or run full type check
npm run lint
```

**Expected Output**:
```
No type errors
No linting issues
```

**Pass Criteria**:
- ✅ No TypeScript errors
- ✅ No ESLint warnings
- ✅ File compiles cleanly

**If FAIL**:
- Review edit at line 376-410 in query-router.ts
- Verify imports: `cuda-graph-rerank-hook.ts`
- Check for syntax errors in async/await block

---

## Step 4: Mock Query Test (10 min)

**Objective**: Test the wired integration with a mock query.

Create `test-query-router-rerank.mts`:

```typescript
import { routeQuery } from './src/lib/server/ace/query-router.js';

const result = await routeQuery({
  query: 'How does authentication work?',
  limit: 20,
  collection: 'codebase_chunks_768',
});

console.log('Query router result:');
console.log(`  Packets found: ${result.packet.ranked_cards.length}`);
console.log(`  Cache hit: ${result.packet.cache_hit}`);
console.log(`  Trace lanes:`);
for (const trace of result.trace) {
  console.log(`    ${trace.lane}: ${trace.hit ? 'HIT' : 'MISS'} (${trace.latency_ms.toFixed(1)}ms)`);
}
```

**Run**:
```bash
npx ts-node --esm test-query-router-rerank.mts
```

**Expected Output**:
```
Query router result:
  Packets found: 10
  Cache hit: qdrant
  Trace lanes:
    redis-hot: MISS (2.3ms)
    bifrost-sem: MISS (5.1ms)
    qdrant: HIT (145.2ms)
    gpu-rerank: HIT (22.5ms)  ← GPU reranking applied!
    nes-chrom: HIT (8.7ms)
```

**Pass Criteria**:
- ✅ Query completes without errors
- ✅ gpu-rerank lane appears in trace (if batch size 5-500)
- ✅ Latency is reasonable
- ✅ Results ranked by GPU similarity

**If FAIL**:
- Check Qdrant connectivity: `curl http://localhost:6333/health`
- Check Ollama embedding service: `curl http://localhost:11434/api/tags`
- Review error trace for specific failure point

---

## Step 5: Full Benchmark (5 min)

**Objective**: Comprehensive speedup measurements across batch sizes.

```bash
npm run bench:cuda-graph-cache
```

**Expected Output**:
```
📊 CUDA Graph Cache Benchmark
   Iterations: 10 per batch size
   Batch sizes: 16,32,64,128

✓ Batch 16: avg first=14.2ms, avg repeat=2.8ms, speedup=5.1x
✓ Batch 32: avg first=22.5ms, avg repeat=4.2ms, speedup=5.4x
✓ Batch 64: avg first=28.3ms, avg repeat=5.1ms, speedup=5.5x
✓ Batch 128: avg first=35.7ms, avg repeat=6.3ms, speedup=5.7x

Average speedup: 5.4x
Total savings: 523.5ms (72%)
```

**Pass Criteria**:
- ✅ Speedup > 2x across all batch sizes
- ✅ Cache hit rate > 80% on repeated shapes
- ✅ No outliers (timeouts, OOM)
- ✅ Total savings > 50% of first-call time

**Capture Report**:
- Location: `docs/reports/benchmarks/cuda-graph-cache-YYYY-MM-DD.json`
- Include in Phase C summary

---

## Step 6: Latency Measurement (10 min)

**Objective**: Measure end-to-end retrieval latency improvement.

Create `test-e2e-latency.mts`:

```typescript
import { routeQuery } from './src/lib/server/ace/query-router.js';

const queries = [
  'auth session validation',
  'database client',
  'cache layer',
  'vector search',
  'graph traversal',
];

const results = [];

for (const query of queries) {
  const start = Date.now();
  const result = await routeQuery({
    query,
    limit: 50,  // Force gpu-rerank (batch 5-500)
  });
  const latency = Date.now() - start;

  const gpuRerank = result.trace.find(t => t.lane === 'gpu-rerank');
  results.push({
    query,
    totalLatency: latency,
    gpuRerankLatency: gpuRerank?.latency_ms ?? null,
    gpuRerankHit: gpuRerank?.hit ?? false,
  });

  console.log(`${query.padEnd(30)} ${latency.toFixed(0)}ms (GPU rerank: ${gpuRerank?.latency_ms.toFixed(1) ?? 'N/A'}ms, hit: ${gpuRerank?.hit ?? false})`);
}

const avgTotal = results.reduce((sum, r) => sum + r.totalLatency, 0) / results.length;
const avgGpuRerank = results.filter(r => r.gpuRerankLatency).reduce((sum, r) => sum + (r.gpuRerankLatency ?? 0), 0) / results.filter(r => r.gpuRerankLatency).length;
const cacheHitRate = results.filter(r => r.gpuRerankHit).length / results.length;

console.log(`\nAverage total latency: ${avgTotal.toFixed(0)}ms`);
console.log(`Average GPU rerank latency: ${avgGpuRerank.toFixed(1)}ms`);
console.log(`GPU cache hit rate: ${(cacheHitRate * 100).toFixed(1)}%`);
```

**Run**:
```bash
npx ts-node --esm test-e2e-latency.mts
```

**Expected Output**:
```
auth session validation     245ms (GPU rerank: 22.3ms, hit: false)
database client              210ms (GPU rerank: 4.2ms, hit: true)
cache layer                  195ms (GPU rerank: 4.5ms, hit: true)
vector search                220ms (GPU rerank: 4.1ms, hit: true)
graph traversal              240ms (GPU rerank: 23.1ms, hit: false)

Average total latency: 222ms
Average GPU rerank latency: 11.6ms
GPU cache hit rate: 60.0%
```

**Measure Improvement**:
- **Without GPU reranking** (estimated): 222ms total
- **With GPU reranking** (observed): 222ms total
- **Estimated speedup**: (average GPU rerank latency w/o cache) / (average GPU rerank latency with cache)
  - Example: 23.0ms / 4.3ms = 5.3x on GPU operations
  - System-level: 5-15% improvement on total retrieval (expected for 50-hit batch)

**Pass Criteria**:
- ✅ GPU rerank doesn't increase total latency (amortized by cache hits)
- ✅ Cache hit rate > 50% on warm cache
- ✅ Individual rerank operations 2-10x faster on cache hit

---

## Step 7: Telemetry Verification (5 min)

**Objective**: Verify telemetry is being logged without blocking retrieval.

```bash
# Check Postgres for telemetry entries
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT retrieval_strategy, COUNT(*) as count, 
         AVG(latency_ms) as avg_latency_ms
  FROM packet_centric_telemetry
  WHERE retrieval_strategy = 'cuda_graph_cache'
    AND created_at > NOW() - INTERVAL '5 minutes'
  GROUP BY retrieval_strategy;
"
```

**Expected Output**:
```
 retrieval_strategy   | count | avg_latency_ms
─────────────────────┼───────┼────────────────
 cuda_graph_cache    |    47 |       11.23
```

**Pass Criteria**:
- ✅ Telemetry entries exist
- ✅ Latency field is populated
- ✅ Non-blocking (doesn't slow down queries)

**If FAIL**:
- Check if packet-centric-telemetry module is available
- Verify Postgres connection in server env
- Non-critical failure (telemetry is optional)

---

## Decision Criteria: Go/No-Go for Option B

### ✅ GO (Proceed with Option B if)

All of:
1. ✅ Quick benchmark speedup > 2x
2. ✅ Integration tests pass
3. ✅ Full benchmark speedup > 2x across batch sizes
4. ✅ Cache hit rate > 50% on warm cache
5. ✅ End-to-end latency neutral or improving

**Next Steps**: 
- Extend provenance: story_id, task_id, worker_id, trace_id
- Batch telemetry to Postgres (60s or N rows)
- Build Grafana dashboard
- Set production gates (90% cache hit rate before deploy)

### 🟡 REVIEW (Investigate further if)

1. Speedup 1-2x (lower than expected)
   - Check GPU utilization: `nvidia-smi`
   - Verify cache population: `redis-cli INFO memory`
   - Profile GPU execution: run with `--verbose --benchmark deep`

2. Cache hit rate < 50%
   - Check batch size distribution: are queries producing same batch sizes?
   - Verify cache keys are stable: `redis-cli KEYS rerank:*`
   - Consider warmup strategy at startup

3. End-to-end latency regression
   - Check GPU memory pressure (OOM slowing down?)
   - Verify Qdrant isn't saturated (check network)
   - Run profiling to find bottleneck

### ❌ NO-GO (Pause Option B if)

1. Speedup < 1x (cache making things slower)
   - Likely: GPU bridge not loaded or misconfigured
   - Mitigation: Fall back to CPU cosine similarity
   - Investigate: Why are graphs not being captured/replayed?

2. Integration tests fail
   - Likely: Module import issue or type mismatch
   - Mitigation: Fix TypeScript errors first
   - Debug: Run with `--verbose` tracing

3. Production queries timeout
   - Likely: GPU OOM or network saturation
   - Mitigation: Reduce batch size cap, add circuit breaker
   - Measure: Monitor GPU memory during queries

---

## Test Execution Checklist

### Pre-test
- [ ] GPU driver installed and healthy (`nvidia-smi`)
- [ ] CUDA 12.1+ available (`nvcc --version`)
- [ ] tensorrt_bridge.node exists and loads
- [ ] Qdrant running (`curl http://localhost:6333/health`)
- [ ] Ollama running (`curl http://localhost:11434/api/tags`)
- [ ] Redis/Valkey running (`docker exec legal-ai-redis redis-cli ping`)

### Test Execution
- [ ] Step 1: Quick benchmark (2 min)
- [ ] Step 2: Integration test (5 min)
- [ ] Step 3: Type check (5 min)
- [ ] Step 4: Mock query test (10 min)
- [ ] Step 5: Full benchmark (5 min)
- [ ] Step 6: Latency measurement (10 min)
- [ ] Step 7: Telemetry verification (5 min)

### Post-test
- [ ] Save benchmark report: `docs/reports/benchmarks/cuda-graph-cache-YYYY-MM-DD.json`
- [ ] Document findings: create summary memo
- [ ] Make go/no-go decision
- [ ] If GO: proceed to Option B (provenance + full observability)
- [ ] If NO-GO: investigate blockers and retry

---

## Timeline

**Total time**: ~45 minutes for all tests

- **Quick path** (15 min): Step 1, 2, 3 only
- **Standard path** (30 min): Step 1-5
- **Full validation** (45 min): Step 1-7 + analysis

---

## What's Next After Testing

### If Speedup Confirmed (Option B)
1. **Provenance breadth** (0.5 day)
   - Add story_id, task_id, worker_id, trace_id to analysis_pass_results
   - Wire lineage on every enrichment operation

2. **Telemetry persistence** (1 day)
   - Batch rows to Postgres (60s or N=100 threshold)
   - Export metrics to Redis for real-time dashboard
   - Add Grafana panels (cache_hit_rate, latency_heatmap, GPU_utilization)

3. **Production gates** (0.5 day)
   - Require 90% cache hit rate before deploy
   - Monitor for regressions
   - Set alerting thresholds

### If Speedup NOT Confirmed
1. **Debug**
   - Profile GPU execution with `--verbose`
   - Check cache key stability
   - Verify batch size distribution

2. **Optimize**
   - Tune warmup batch sizes
   - Adjust cache key generation
   - Consider fallback strategies

3. **Retry**
   - Rerun tests after fixes
   - Measure incremental improvements

---

## Success Metrics

| Metric | Target | Actual | Pass? |
|--------|--------|--------|-------|
| **Benchmark speedup** | >2x | TBD | ⏳ |
| **Cache hit rate** | >50% | TBD | ⏳ |
| **End-to-end latency** | +0% to -15% | TBD | ⏳ |
| **Integration tests** | 6/6 pass | TBD | ⏳ |
| **Telemetry latency** | <5ms | TBD | ⏳ |
| **Zero errors** | 100% | TBD | ⏳ |

---

## References

- **Implementation**: `docs/CUDA-GRAPH-CACHING-IMPLEMENTATION.md`
- **Session summary**: `docs/SESSION-98-CUDA-GRAPH-CACHING-WIRED.md`
- **Memory**: `c:\Users\james\.claude\projects\...\session-98-cuda-graph-caching-wired.md`
- **Benchmark reports**: `docs/reports/benchmarks/cuda-graph-cache-*.json`

---

**Status**: 🟢 Ready for testing  
**Next action**: Execute Step 1 (quick benchmark)  
**Expected timeline**: 45 min to full validation  
**Decision point**: After Step 5 (full benchmark results)
