# Parent Atlas Native Acceleration Audit — Plan

**Status**: Planning | **Last Updated**: 2026-08-05 Session 193
**Scope**: Proof-first GPU integration audit (Steps 1-9 per specification)
**Context**: Repository root `C:\Users\james\Videos\deeds-web-app`

---

## Dependencies & Blockers

### Hard Blockers (Must Resolve First)
1. **Canonical hydration broken** (`hydrate-candidates.ts`, `feature-envelope.ts`)
   - Current: `stable_symbol_id` globally nullable
   - Blocker: Cannot trust identity before GPU ranking
   - Fix: Discriminated identity schema (file | symbol | chunk)
   - **Must complete before Step 7 (lane proofs)**

2. **SOM training script path broken** (already fixed in Session 193)
   - Status: ✅ FIXED (ADDON_PATH now resolves correctly)
   - Blocker: None, ready to proceed

3. **Addon path resolution** (`scripts/startup-gpu-bridge-probe.mjs`)
   - Current: Hardcoded paths don't match actual addon locations
   - Blocker: Probe gives false negatives
   - Fix: Use same resolver as `src/lib/server/gpu/libtorch-bridge.ts`
   - **Prerequisite for Step 1**

### Soft Blockers (Workaround Possible)
- No execution counters in addon (add via N-API, Step 4)
- No backend metadata export (add, Step 2)
- No numerical parity fixtures (create, Step 3)

---

## Session Breakdown

### Session 194 (Fresh Context)
**Goal**: Repair foundation probes and metadata
**Estimated**: 90 min

**Tasks**:
1. ✅ Repair `scripts/startup-gpu-bridge-probe.mjs` (Step 1)
   - Implement 7 classification outcomes
   - Use same addon resolver as libtorch-bridge.ts
   - Record: path, SHA-256, mtime, build variant
   - **Output**: `docs/reports/native-addon-contract-audit.md` (draft)

2. ✅ Add `getBackendInfo()` N-API export (Step 2)
   - Read addon bindings and add export
   - Report: addon version, build commit, LibTorch version, CUDA capabilities
   - Test: Verify callable and returns structured data
   - **Output**: Sample JSON from probe

3. ⏳ Design execution receipt schema (Step 5)
   - Define versioned envelope for GPU operation results
   - Include: operation_id, function_name, backend, SHA, model_id, revision, input/output dims, duration
   - Document in schema file
   - **Output**: `types/gpu-execution-receipt.ts`

**Blockers to Resolve**: 
- Path resolver alignment (check if libtorch-bridge.ts already has robust resolver, reuse)

**Gate**: Probe and metadata export both CALLABLE and producing valid data

---

### Session 195 (Fresh Context)
**Goal**: Proof-first numerical validation
**Estimated**: 2-3 hours

**Tasks**:
1. ✅ Create deterministic numerical parity proofs (Step 3)
   - Create `scripts/gpu/prove-native-gpu-numerical-parity.mjs`
   - Build 15 fixtures (one per GPU function):
     - batchCosineSimilarity, graphSimilarity, graphSimilarityHalf
     - softmaxGPU, topKIndicesGPU, attentionScoreGPU, rewardScoreGPU
     - pageRankGPU, kmeansWithCentroids, pcaProject
     - autoencoderEncode, autoencoderDecode, computeCaseEmbedding, trainSOM
   - For each: Compare GPU vs CPU oracle
   - Record: max abs error, max rel error, top-k overlap, finite count, elapsed time
   - **Output**: `docs/reports/native-gpu-numerical-parity.json`

2. ✅ Add CUDA execution counters (Step 4)
   - Inspect C++ addon bindings (check if counters already exist)
   - If missing: Add N-API export `getExecutionCounters()`
   - Counters: cuda_execution, cpu_fallback, stub_invocation, cuda_error_fallback, oom_fallback
   - Test: Run each fixture with reset counters, verify expected branch incremented
   - **Output**: Counter test results in parity report

**Blockers to Resolve**:
- Addon source inspection (simd-bridge/cpp/binding.cc) to see if counters exist

**Gate**: All 15 fixtures PASS with numerical agreement > 99.5% (or recorded tolerance)

---

### Session 196 (Fresh Context)
**Goal**: Fix canonical hydration + layer separation
**Estimated**: 2 hours

**Tasks**:
1. ✅ Repair canonical hydration (Step 6) — **BLOCKING STEP 7**
   - Fix `src/lib/server/ace/feature-envelope.ts`
   - Implement discriminated identity: `identity_kind: 'symbol' | 'file' | 'chunk'`
   - symbol → `stable_symbol_id` + `symbol_version_id` non-null
   - file/chunk → explicitly null + `stable_file_id` required
   - Add counters: canonical_row_matched, canonical_identity_resolved, envelope_validated, missing_stable_symbol, missing_stable_file, schema_revision_rejected, representation_rejected
   - Test: `GET /api/retrieval/search-unified?q=test&topK=3`
   - **Output**: Hydration audit in feature-envelope.md

2. ⏳ Design lane-specific fixtures (Step 7 planning)
   - Map each retrieval lane:
     - Lexical: rg exact + trigram (Postgres FTS)
     - AST: tree-sitter symbol identity
     - Dense: Qdrant HNSW vs cuVS brute_force exact oracle
     - ANN: CAGRA recall vs exact oracle
     - Reranking: LibTorch cuBLAS cosine vs CPU cosine
     - Topology: Neo4j GDS vs cuGraph PageRank
     - Hypergraph: Multi-entity participant identity + revision compatibility
   - **Output**: Lane integration test plan

**Blockers to Resolve**:
- Determine if cuVS exact oracle already available in repo

**Gate**: `search-unified` returns hydrated packets with all identity fields populated

---

### Session 197 (Fresh Context)
**Goal**: Lane-specific integration proofs
**Estimated**: 3-4 hours

**Tasks**:
1. ✅ Implement lane proofs (Step 7)
   - For each lane: bounded fixture with oracle comparison
   - Lexical: trigram score vs exact match — stable ordering
   - AST: symbol tree identity consistency across representations
   - Dense: Qdrant recall@k vs cuVS brute_force (expect >95%)
   - ANN: CAGRA recall@k vs exact (document tolerance)
   - Reranking: cuBLAS cosine vs NumPy/PyTorch (expect <1e-5 relative error)
   - Topology: PageRank top-20 overlap (expect >80%)
   - Hypergraph: Multi-hop participant provenance (no phantom identities)
   - **Output**: 7 lane reports in `docs/reports/parent-atlas-acceleration-integration.json`

2. ✅ Verify ownership boundaries (Step 8 check)
   - Audit: Postgres identity never manufactured by GPU ops
   - Qdrant projections read-only in canonical flow
   - Redis caches invalidate after Postgres writes
   - **Output**: Ownership audit checklist

**Blockers to Resolve**:
- CAGRA availability (is it built into addon? or external?)

**Gate**: All 7 lanes report > 80% agreement with oracle; canonical identity preserved

---

### Session 198 (Fresh Context)
**Goal**: Final audit reports + integration sign-off
**Estimated**: 1-2 hours

**Tasks**:
1. ✅ Consolidate audit reports (Step 9)
   - Merge Sessions 194-197 outputs into 6 final documents:
     - `docs/reports/native-addon-contract-audit.json` (probe + metadata)
     - `docs/reports/native-addon-contract-audit.md` (human summary)
     - `docs/reports/native-gpu-numerical-parity.json` (15 fixtures)
     - `docs/reports/native-gpu-numerical-parity.md` (oracle comparisons)
     - `docs/reports/parent-atlas-acceleration-integration.json` (7 lanes)
     - `docs/reports/parent-atlas-acceleration-integration.md` (ownership + gates)

2. ✅ Apply consistent status language
   - PASS: All gates verified experimentally
   - FAIL: One or more gates returned false positive/negative
   - PARTIAL_PROVEN: Subset of fixtures passed
   - FIXTURE_PROVEN: Deterministic test harness passes; production unproven
   - NOT_PROVEN: Code path exists but not instrumented
   - NOT_APPLICABLE: Feature not in scope (e.g., TensorRT if addon built without it)

3. ✅ Produce integration sign-off
   - Cannot claim CUDA or TensorRT as PASS without:
     ✗ Imports alone (MISSING if not exported)
     ✗ Array shape matching (NOT_PROVEN)
     ✗ Process exit code (SKIPPED_EXTERNAL_PROOF)
     ✓ Execution counters + numerical parity
     ✓ Backend metadata reporting actual implementation

**Gate**: All 6 reports complete; consistent status language; no false PASS claims

---

## Prerequisite Checks (Before Session 194)

Run these in Session 193 cleanup:

```bash
# 1. Verify addon locations (already found in Session 193)
find simd-bridge -name "tensorrt_bridge.node" -type f

# 2. Verify libtorch-bridge.ts path resolver exists
grep -n "REPO_ROOT\|resolve.*simd-bridge" src/lib/server/gpu/libtorch-bridge.ts

# 3. Verify N-API bindings file
ls -la simd-bridge/cpp/binding.cc

# 4. Check if getBackendInfo export already exists
node -e "const a = require('./simd-bridge/cpp/build/Release/tensorrt_bridge.node'); console.log('getBackendInfo' in a ? 'EXISTS' : 'MISSING')"

# 5. Verify cuVS exact oracle available
grep -r "brute_force\|exact.*knn" scripts --include="*.mjs" --include="*.ts"
```

---

## Success Criteria (All Must PASS)

| Gate | Session | Status |
|------|---------|--------|
| **Probe classifications accurate** | 194 | NOT_PROVEN |
| **getBackendInfo() callable** | 194 | NOT_PROVEN |
| **Execution receipt schema defined** | 194 | NOT_PROVEN |
| **15 numerical fixtures agree** | 195 | NOT_PROVEN |
| **Execution counters increment correctly** | 195 | NOT_PROVEN |
| **Canonical hydration fixed** | 196 | NOT_PROVEN |
| **7 lane proofs >80% oracle agreement** | 197 | NOT_PROVEN |
| **Ownership boundaries verified** | 197 | NOT_PROVEN |
| **6 audit reports consistent** | 198 | NOT_PROVEN |
| **No false PASS claims** | 198 | NOT_PROVEN |

---

## Risk Mitigation

**If cuVS brute_force unavailable**: Use NumPy/PyTorch exact oracle in separate Python worker
**If addon counters difficult to add**: Instrument via LD_PRELOAD or manual printf wrapping
**If hydration fix too large**: Scope to symbol identity only, defer file/chunk in Phase 2
**If any lane fails >20% divergence**: Mark PARTIAL_PROVEN, document root cause, re-plan for Phase 2

---

## Commit Strategy

- Session 194: Merge probe + metadata fixes (atomic)
- Session 195: Merge parity proofs (atomic, includes fixture data)
- Session 196: Merge hydration fix (atomic, large)
- Session 197: Merge lane proofs (atomic, reference data)
- Session 198: Merge audit reports (documentation only, no code)

**All commits include**: consistent status language, no false PASS claims, references to proof gates

---

**Next Action**: Start Session 194 with fresh context. Run prerequisite checks first, then repair probe.
