# Phase 17 GPU Acceleration — Performance Measurement Guide

**Status**: Phase 17.1 Complete ✅ | Phase 17.2 Ready (1–2 weeks)  
**Date**: 2026-06-15  
**Scope**: Measure GPU reranker + simdjson speedup, stress test CUDA guards

---

## Phase 17.1 Completion ✅

### What's Live
- **GPU Reranker**: Injected into ACE Stage A1 (context-assembler.ts:991–1024)
  - Threshold: ≥20 candidates trigger GPU reranking
  - Blending: 0.6 GPU + 0.4 original score
  - Fallback: CPU sort on CUDA error or VRAM pressure
  - Expected speedup: 50× for 1000 candidates (2.5s CPU → 50ms GPU)

- **simdjson JSON Parsing**: Integrated in 20+ files
  - Qdrant response parsing (parse-qdrant-json.ts)
  - Ollama chat responses (ollama.ts)
  - Bifrost L2 semantic cache hits
  - LRU cache: 32 MB, 30s TTL
  - Fallback: V8 JSON.parse if addon unavailable
  - Expected speedup: 5× for 100KB JSON (12ms CPU → 2.4ms GPU)

- **Error Audit Infrastructure**: Ready for production use
  - `npm run atlas:error:audit` — baseline established (0 errors)
  - Schema: error_logs table + 2 new columns (error_text, error_embedding)
  - Ready to capture errors during Phase 17.2 testing

### What's Verified
- Adaptive schema applied: 8,823 tree nodes, 3,251 topology entries intact
- GPU reranker syntax correct, no parse errors
- simdjson LRU cache operational with 3-level fallback
- CUDA device detection working

---

## Phase 17.2: Performance Measurement (1–2 Weeks)

### Objective
Establish performance baselines under realistic load and harden CUDA error handling.

### Test 1: GPU Reranker Speedup (ACE Stage A1)

**Setup**:
```bash
# Run a real ACE query that will have > 20 candidates
# This happens naturally when searching a large codebase (Qdrant returns 100+ results)

# Recommended test case:
#   1. Upload 500+ code files to Qdrant (if not already indexed)
#   2. Run a natural-language query: "authentication handling" or "database connection"
#   3. Monitor Stage A1 latency with GPU enabled vs disabled
```

**Measurement Points**:
1. **Query → Qdrant ANN** (baseline, no GPU)
   - Qdrant returns ~100–200 candidates
   - Target: < 500ms

2. **Stage A1 GPU Reranking** (with GPU)
   - Input: 100+ candidates with Qdrant scores
   - GPU kernel: batchCosineSimilarity (100× speedup expected)
   - Score merge + sort: 50–100ms expected
   - Target: < 100ms total (vs ~2.5s CPU sort)

3. **Blended Scores** (GPU + original)
   - Verify final top-K still high quality
   - Should not degrade ranking quality

**Code Location**:
- [context-assembler.ts:991–1024](sveltekit-frontend/src/lib/server/features/ai/ace/context-assembler.ts#L991-L1024)

**Trace/Logging**:
```typescript
// Already in place: gpu-reranker logs to console.warn on failure
// Add Langfuse trace to capture:
//   - GPU result source ('passthrough' vs 'reranked')
//   - latency breakdown (GPU kernel vs CPU sort)
//   - VRAM pressure at time of reranking
```

**Pass Criteria**:
- ✅ GPU reranking triggers for ≥20 candidates
- ✅ Latency improves 20–50× (2.5s → 50–100ms)
- ✅ Final top-K ranking stable (no quality regression)
- ✅ Fallback to CPU sort on CUDA error (non-fatal)

---

### Test 2: simdjson JSON Parsing Speedup

**Setup**:
```bash
# Qdrant responses: already parsing via simdjson (20+KB responses)
# Ollama responses: already parsing via simdjson (large completions)
# Bifrost L2 cache: already using simdjson for fast hit detection
```

**Measurement Points**:
1. **Qdrant Large Response** (1000+ results, ~50KB JSON)
   - Parse time: simdjson vs V8 JSON.parse
   - Target: 2.4ms (simdjson) vs 12ms (V8) = 5× speedup

2. **Ollama LLM Completion** (~30KB response)
   - Tool-call parsing speed
   - Cache hit detection speed
   - Target: 2.4ms (simdjson) vs 12ms (V8) = 5× speedup

3. **Bifrost Semantic Cache** (hit detection on ~10KB payload)
   - Extract embedding + metadata fields
   - Target: < 2ms total (single-file parse + extract)

**Code Locations**:
- [parse-qdrant-json.ts](sveltekit-frontend/src/lib/server/qdrant/parse-qdrant-json.ts) — Qdrant parsing
- [ollama.ts](sveltekit-frontend/src/lib/server/ollama.ts) — Ollama response parsing
- [redis-exact-match.ts](sveltekit-frontend/src/lib/server/cache/redis-exact-match.ts) — cache hit detection

**Trace/Logging**:
```typescript
// parse-qdrant-json.ts already logs parser='simdjson' vs 'json.parse'
// Measure via Langfuse trace:
//   - parser type
//   - payload size
//   - parse latency (ms)
```

**Pass Criteria**:
- ✅ simdjson triggered for payloads ≥ 5KB
- ✅ Latency improves 3–5× (12ms → 2.4–4ms)
- ✅ Fallback to V8 on parse error (non-fatal)
- ✅ No memory bloat (LRU cache stays ≤ 32 MB)

---

### Test 2b: llama-server (TurboQuant) Gemma4 Verification

**Critical**: Ensure Gemma4 chat works through llama-server port 8090, not just Ollama 11434.

**Current State**:
- Ollama (11434): Has `gemma4-rotorquant:latest`
- llama-server (8090): Has `gemma4-legal-iq4xs-direct.gguf` (TurboQuant-capable)
- bifrostChat: Falls back to Ollama (11434) on cache miss, ignores llama-server availability

**Test**:
```bash
# Health check: verify both are ready
curl http://127.0.0.1:11434/api/tags         # Ollama
curl http://127.0.0.1:8090/v1/models         # llama-server

# Functional test: Gemma4 chat through both paths
# 1. Query that misses all caches (forces L3 fallback)
# 2. Verify Ollama responds (current path)
# 3. Manually verify llama-server also works:
curl http://127.0.0.1:8090/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gemma4-legal-iq4xs-direct.gguf","messages":[{"role":"user","content":"hello"}]}'
```

**Decision**:
- **If TurboQuant KV cache improves latency** → Wire `canUseTurboQuant` check into bifrostChat L3 fallback
- **If no measurable difference** → Accept current bifrost → Ollama routing as acceptable

**Pass Criteria**:
- ✅ llama-server responds to health probe
- ✅ Both Ollama and llama-server serve Gemma4 chat successfully
- ✅ bifrostChat doesn't crash if llama-server unavailable (falls back to Ollama)
- ✅ Performance comparison logged for Phase 17.3 decision

---

### Test 3: CUDA OOM Guards Under Stress

**Scenario**: Pathological load with large candidate sets + parallel GPU calls.

**Test Case 1: Large Batch Reranking**
```typescript
// Simulate 10K candidates needing rerank
// GPU memory: ~40 MB (10K × 768-dim × 4 bytes) + overhead
// RTX 3060 Ti: 8GB total, Gemma4 uses ~5.3 GB, leaves ~2.7 GB for ops
// Expected: GPU reranking succeeds, CPU fallback on OOM

const candidates = Array.from({ length: 10_000 }, (_, i) => ({
  documentId: `doc_${i}`,
  similarity: Math.random(),
  content: `...`,
  embedding: new Float32Array(768)
}));

const gpuResult = await gpuRerank(queryEmbedding, candidates);
// Pass: gpuResult.source !== 'passthrough' (GPU succeeded)
// Fail: gpuResult.source === 'passthrough' (CPU fallback needed)
```

**Test Case 2: Parallel GPU Calls**
```typescript
// Simulate 3 concurrent ACE queries hitting GPU reranker
// Each: ~100 candidates, 50ms GPU kernel
// Total: 150ms GPU time, should not OOM

Promise.all([
  gpuRerank(query1, candidates1),
  gpuRerank(query2, candidates2),
  gpuRerank(query3, candidates3)
]);
// Pass: all succeed without OOM
// Fail: one or more fallback to CPU
```

**Test Case 3: VRAM Pressure Monitoring**
```typescript
// Monitor getCudaMemoryInfo() during test
// Expected:
//   - Idle: ~5.3 GB (Gemma4) + metadata
//   - During reranking: +40 MB (large batch) or +5 MB (normal)
//   - After: return to idle level (GPU cleanup working)

const before = getCudaMemoryInfo();
const result = await gpuRerank(query, candidates);
const after = getCudaMemoryInfo();
const leaked = after.usedMB - before.usedMB;

// Pass: leaked ≤ 5 MB (acceptable rounding)
// Fail: leaked > 50 MB (memory leak detected)
```

**Pass Criteria**:
- ✅ Normal candidate sets (100–1000) rerank successfully
- ✅ Large sets (5K–10K) trigger CPU fallback gracefully (no crash)
- ✅ Parallel queries do not interfere (no OOM)
- ✅ VRAM pressure < 10% growth post-query
- ✅ Memory leaks < 5 MB per 1K queries

---

## Measurement Instrumentation

### Langfuse Traces (Recommended)

Wire GPU reranker latency into existing ACE traces:

```typescript
// In context-assembler.ts, Stage A1:
const gpuStartTime = performance.now();
const gpuResult = await gpuRerank(emb, mapped, config);
const gpuDurationMs = performance.now() - gpuStartTime;

// Log to Langfuse
traceGraph('ace:stage:a1-gpu-rerank', {
  input: { candidateCount: mapped.length },
  output: { 
    gpuUsed: gpuResult.source !== 'passthrough',
    finalTopK: mapped.slice(0, 10),
    durationMs: gpuDurationMs
  },
  metadata: {
    cudaAvailable: isCudaAvailable(),
    vramFreeMB: getCudaMemoryInfo().freeMB,
    blendWeight: 0.6
  }
});
```

### Redis Metrics (Optional)

Store performance snapshots in Redis for dashboard:

```typescript
// After ACE query completes:
const key = `metrics:gpu-reranker:${Date.now()}`;
await redis.hset(key, {
  candidates: candidates.length,
  gpuUsed: gpuResult.source !== 'passthrough',
  durationMs: Math.round(duration),
  gpuKernelMs: gpuKernelTime,
  cpuSortMs: cpuSortTime
});
await redis.expire(key, 86400); // 24h retention
```

### Simple Console Logging (Minimum)

Already in place — monitor logs for GPU warnings:

```bash
# Watch for reranker logs
grep "\[ACP\] GPU" <logfile>

# Expected:
# [ACP] GPU reranking succeeded (25ms for 100 candidates)
# [ACP] GPU reranking failed, using CPU sort: CUDA out of memory
```

---

## Success Metrics (Target)

| Metric | Target | Success Criteria |
|--------|--------|------------------|
| **GPU Reranker Speedup** | 50× | 2.5s CPU → ≤ 100ms GPU for 1000 candidates |
| **simdjson Speedup** | 5× | 12ms V8 → ≤ 2.4ms simdjson for 100KB JSON |
| **CPU Fallback Rate** | < 1% | GPU reranking succeeds for ≥99% of queries |
| **VRAM Leak Rate** | < 1% | Memory growth < 5 MB per 1K queries |
| **Query Quality** | ≥ 95% | Top-K ranking unchanged vs CPU baseline |

---

## Timeline

### Week 1 (Immediate)
- [ ] Set up test harness (capture ACE query latencies)
- [ ] Baseline CPU reranker (2.5s for 1000 candidates)
- [ ] Enable GPU reranker, measure speedup
- [ ] Confirm fallback behavior on CUDA error

### Week 2
- [ ] Stress test (parallel queries, large batches)
- [ ] VRAM pressure monitoring over 24h baseline
- [ ] simdjson speedup verification (Qdrant + Ollama)
- [ ] Langfuse trace wiring (optional but recommended)

### Week 2–3
- [ ] Consolidate results, publish performance report
- [ ] Document findings for Phase 17.3 (autoencoder, TurboVec)
- [ ] Decide: proceed to Phase 17.3 or optimize Phase 17.1?

---

## Phase 17.3 Readiness (Post-Phase 17.2)

If Phase 17.2 succeeds, consider:
- **Autoencoder 768→64**: If Karpathy blend Redis footprint becomes bottleneck
- **TurboVec 4-bit KV**: If context-window expansion becomes priority
- **cuVS GPU Search**: If Qdrant ANN latency exceeds 500ms baseline

See [GPU-NATIVE-STACK-INVENTORY.md](GPU-NATIVE-STACK-INVENTORY.md) for timelines and blockers.

---

**Next Action**: Run Phase 17.2 tests over next 1–2 weeks, collect baseline metrics.  
**Owner**: Atlas Team (GPU acceleration performance audit)  
**Ref**: [context-assembler.ts](sveltekit-frontend/src/lib/server/features/ai/ace/context-assembler.ts) | [GPU Inventory](GPU-NATIVE-STACK-INVENTORY.md)
