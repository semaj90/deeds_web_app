# Phase 72 Performance Optimization – Implementation Roadmap

**Status:** Ready to implement
**Priority:** High (10-100x speedup)
**Effort:** Medium (3-5 days)

## Phase 1: Go Error Parser (Day 1-2)

### Task 1.1: Create Go project structure
```bash
mkdir -p go-services/phase72-error-parser
cd go-services/phase72-error-parser
go mod init github.com/deeds-web-app/phase72-error-parser
```

### Task 1.2: Implement ripgrep + simdjson parser
- [ ] Parse svelte-check raw output (regex patterns)
- [ ] Parse svelte-check JSON output (simdjson-go)
- [ ] Normalize to Error struct: `{ file, line, column, code, message }`
- [ ] Handle concurrent parsing (goroutines)

### Task 1.3: Implement gRPC service
- [ ] Define proto: `ParseSvelteCheckLog(raw_log) → []Error`
- [ ] Implement gRPC server
- [ ] Add HTTP gateway for Node.js clients
- [ ] Health check endpoint

### Task 1.4: Test & benchmark
- [ ] Unit tests for parsing
- [ ] Benchmark: 10k errors → latency
- [ ] Compare vs Node regex (should be 10-100x faster)

**Deliverable:** `go-services/phase72-error-parser` with gRPC service

---

## Phase 2: Python GPU Vectorizer Service (Day 1-2)

### Task 2.1: Wrap existing vectorizer as FastAPI service
- [ ] Create `python-services/phase72_vectorizer_service.py`
- [ ] Load PyTorch model at startup (not per-request)
- [ ] Implement `/embed` endpoint (batch encode)
- [ ] Implement `/health` endpoint

### Task 2.2: Optimize for long-lived service
- [ ] Keep model in GPU memory
- [ ] Handle concurrent requests (thread pool)
- [ ] Batch processing for efficiency
- [ ] Error handling & graceful degradation

### Task 2.3: Test & benchmark
- [ ] Verify model loads correctly
- [ ] Benchmark: 10k errors → latency (should be ~1.5s)
- [ ] Compare vs current script (should avoid reload cost)

**Deliverable:** `python-services/phase72_vectorizer_service.py` with FastAPI

---

## Phase 3: Redis Cache Layer (Day 2)

### Task 3.1: Implement Redis cache
- [ ] Create `scripts/phase72-redis-cache.mjs`
- [ ] Key: `hash(error_message)`
- [ ] Value: `JSON.stringify(vector)`
- [ ] TTL: 24 hours

### Task 3.2: Integrate with orchestrator
- [ ] Check cache before vectorizing
- [ ] Store vectors after vectorizing
- [ ] Track hit rate

### Task 3.3: Test & benchmark
- [ ] Verify cache hits/misses
- [ ] Benchmark: cache lookup latency (<1ms)
- [ ] Measure hit rate on repeated errors (target >80%)

**Deliverable:** `scripts/phase72-redis-cache.mjs` with cache logic

---

## Phase 4: Qdrant Clustering (Day 2-3)

### Task 4.1: Implement Qdrant integration
- [ ] Create `scripts/phase72-qdrant-clustering.mjs`
- [ ] Upload vectors to Qdrant collection
- [ ] Query K nearest neighbors per error
- [ ] Build clustering graph (connected components)

### Task 4.2: Identify error clusters
- [ ] Group errors by similarity
- [ ] Assign cluster IDs
- [ ] Export cluster assignments

### Task 4.3: Test & benchmark
- [ ] Verify clustering works
- [ ] Benchmark: 10k errors → latency (<500ms)
- [ ] Compare vs WebGPU SOM (should be faster)

**Deliverable:** `scripts/phase72-qdrant-clustering.mjs` with clustering logic

---

## Phase 5: AST Topology Graph (Day 3)

### Task 5.1: Implement AST topology
- [ ] Create `scripts/phase72-ast-topology.mjs`
- [ ] Parse error locations with ts-morph
- [ ] Extract AST nodes
- [ ] Find related errors (same scope, type, etc.)

### Task 5.2: Build graph
- [ ] Create graph structure: Error → AST Node → Related Nodes
- [ ] Store in memory (or Neo4j if needed)
- [ ] Enable "fix this + related" patterns

### Task 5.3: Test & benchmark
- [ ] Verify graph builds correctly
- [ ] Benchmark: <100ms per error (cached)
- [ ] Verify related errors are identified

**Deliverable:** `scripts/phase72-ast-topology.mjs` with graph logic

---

## Phase 6: Unified Orchestrator (Day 3-4)

### Task 6.1: Create orchestrator script
- [ ] Create `scripts/phase72-optimized.mjs`
- [ ] Orchestrate all components in sequence
- [ ] Handle service unavailability (fallbacks)
- [ ] Log all steps to JSONL

### Task 6.2: Add npm script
- [ ] Add `npm run phase72:optimized` to package.json
- [ ] Ensure all services are started first

### Task 6.3: Test end-to-end
- [ ] Run with all services available
- [ ] Run with services unavailable (test fallbacks)
- [ ] Benchmark: total latency <5s for 10k errors

**Deliverable:** `scripts/phase72-optimized.mjs` with orchestration

---

## Phase 7: Documentation & Testing (Day 4-5)

### Task 7.1: Write documentation
- [ ] Update `PHASE_72_QUICK_START.md` with optimized path
- [ ] Create `PHASE_72_PERFORMANCE_GUIDE.md`
- [ ] Document each component
- [ ] Add troubleshooting guide

### Task 7.2: Create tests
- [ ] Unit tests for each component
- [ ] Integration tests
- [ ] Performance tests
- [ ] Fallback tests

### Task 7.3: Benchmarking
- [ ] Compare old vs new Phase 72
- [ ] Measure speedup (target 6-12x)
- [ ] Document results

**Deliverable:** Complete documentation + test suite

---

## Implementation Order

**Recommended:** Do in parallel where possible

```
Day 1:
  - Task 1.1-1.2 (Go parser basics)
  - Task 2.1-2.2 (Python service)

Day 2:
  - Task 1.3-1.4 (Go parser gRPC)
  - Task 2.3 (Python benchmarking)
  - Task 3.1-3.2 (Redis cache)

Day 3:
  - Task 3.3 (Redis testing)
  - Task 4.1-4.2 (Qdrant clustering)
  - Task 5.1-5.2 (AST topology)

Day 4:
  - Task 4.3 (Qdrant testing)
  - Task 5.3 (AST testing)
  - Task 6.1-6.2 (Orchestrator)

Day 5:
  - Task 6.3 (E2E testing)
  - Task 7.1-7.3 (Documentation + tests)
```

## Success Metrics

- [ ] Phase 72 latency: <5s for 10k errors (vs ~30-60s)
- [ ] Cache hit rate: >80%
- [ ] All services have health checks
- [ ] Graceful fallback works
- [ ] JSONL logging complete
- [ ] Tests passing
- [ ] Documentation complete

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Go parser slower than expected | Use ripgrep + simdjson (proven fast) |
| Python service model reload | Keep model in GPU memory (long-lived) |
| Redis cache misses | Hash error message consistently |
| Qdrant clustering slow | Use nearest-neighbor (not full SOM) |
| Service unavailability | Implement fallbacks to current Phase 72 |

## Next Steps

1. **Approve spec** (this document)
2. **Start Phase 1** (Go parser)
3. **Parallelize** where possible
4. **Benchmark** each component
5. **Integrate** into Phase 72 orchestrator
6. **Test** end-to-end
7. **Deploy** and measure speedup

---

**Status:** Ready to implement
**Estimated Effort:** 3-5 days
**Expected Speedup:** 6-12x (30-60s → <5s)
