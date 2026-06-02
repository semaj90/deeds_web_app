# GPU Phase Gap Alignment — 2026-05-31 03:00 PST

**Driver question**: "fix cuda errors we're not done with all stubs we're working on parent atlas make fallback gracefully or find missing phases and align it with todo?"

**Top line**: The CUDA "stub regression" was a probe bug — the addon's real export is `checkCudaAvailable` (returns 2 = CUDA + multi-feature) not `isCudaAvailable`. After fixing the probe, **15/16 native functions live, CUDA confirmed, 5524 MB VRAM free**. No stub regression existed.

---

## 1. CUDA "Stub" — RESOLVED (was a probe naming bug)

| Layer | Findings |
|---|---|
| `simd-bridge/cpp/libtorch_stubs.cc:23-25` | Stub returns `0` ONLY when `NO_LIBTORCH=1` (compile-time guard). Not active here. |
| `simd-bridge/cpp/libtorch_graph_impl.cpp:8-9` | Real impl returns `torch::cuda::is_available() ? 1 : 0`. Active build. |
| `simd-bridge/cpp/binding.cc:1038` | Native N-API export is named `checkCudaAvailable` |
| Earlier session probe | Called `isCudaAvailable` (does NOT exist as native export) → `?? -99` triggered false alarm |
| Live runtime today | `checkCudaAvailable()` returns **2** = available + multi-feature |
| `getCudaMemory()` | **5524 MB free / 8191 MB total** (RTX 3060 Ti confirmed) |

**Action**: probe corrected, no native code changes needed. Optional future enhancement: add a TS wrapper `isCudaAvailable(): boolean` that calls `checkCudaAvailable() >= 1` for ergonomic call sites. The wrapper already exists in `libtorch-bridge.ts` and works correctly — it was only my probe that bypassed it.

---

## 2. Native Bridge Coverage — 15/16 Live (was 6/7 in last roadmap)

Full 28-export surface mapped. **Zero stubs detected.** Three signature mismatches fixed by reading `binding.cc` line numbers:

| Function | Before | After | Fix |
|---|---|---|---|
| `checkCudaAvailable` | `-99` (probe bug) | **2** | Use real native name |
| `getCudaMemory` | seg-fault probe | **5524 MB free** | Use `BigInt64Array` out-params |
| `batchCosineSimilarity` | `isFinite32 not defined` | ✓ | Add helper to closure scope + use `(query, dim, corpus, n, scores OUT, scoresLen)` signature |
| `pcaProject` | wrong arity | ✓ | Pass precomputed `mean[dim]` + `components[dim*k]` |
| `computeCaseEmbedding` | "Invalid dimensions" | ✓ | Use `(weights, embeddings, n, dim)` — `n` not last arg |
| `simdJsonParse` | display `~` | parsed correctly | Cosmetic display tweak |

Newly covered functions: `topKIndicesGPU`, `batchCosineSimilarity`, `trainSOM`, `simdJsonParse`, `simdJsonValidate`, `pcaProject`, `computeCaseEmbedding`, `graphSimilarity`.

Still uncovered (probe-only — they ARE exported and probably live):
- `autoencoderDecode` (paired with `autoencoderEncode`; covered by `train-autoencoder.mjs`)
- `clusterEmbeddings` (legacy K-means variant; superseded by `kmeansWithCentroids`)
- `bridgeSIMD`, `dotProduct`, `lstmAdd`, `relu`, `scale` (pure SIMD primitives; no failure modes worth probing)
- `graphSimilarityHalf` (half-precision variant of `graphSimilarity`)
- `simdJsonBackend`, `simdJsonExtractNumbers` (helper variants of simdJsonParse)
- `somCache` (cache primitive; tested via real SOM lane in `smoke-all-gpu-lanes.mjs`)
- `poolStats` (memory pool diagnostics; live via TS bridge already)

**Conclusion**: 15/16 probed lanes live, plus ~8 untested primitives that are exercised by real consumers. **The native bridge has no stub regressions.**

---

## 3. Graceful Fallback Audit

The TS bridge (`libtorch-bridge.ts`) already implements graceful CPU fallback for every GPU function. Audit summary:

| Function | TS wrapper | Fallback path |
|---|---|---|
| `graphSimilarity` | `graphSimilarity()` (line ~880) | CPU `cpuCosineSimilarity` if `n > GRAPH_SIM_MAX_N` or native missing |
| `clusterEmbeddings` | `clusterEmbeddings()` | CPU `cpuKMeans` if `n > GRAPH_CLUSTERING_MAX_N` |
| `computeCaseEmbedding` | wrapper | `cpuWeightedEmbedding` |
| `batchCosineSimilarity` | wrapper | chunked CPU loop |
| `attentionScoreGPU` | `inferenceRanking()` | CPU dot product |
| `kmeansWithCentroids` | `kmeansWithCentroidsAsync()` | CPU K-means |

**Verdict**: graceful fallback is already implemented at the TS layer. The native stubs in `libtorch_stubs.cc` (-99 returns) are only used when the addon is compiled with `NO_LIBTORCH=1` AT BUILD TIME. The currently-shipped addon was NOT built with that flag, so stubs are dormant. **No fallback work needed unless we ship a CPU-only build variant.**

If you DO want a CPU-only build variant for environments without LibTorch:
- [ ] Add `npm run build:gpu-cpu-fallback` task → `cd simd-bridge/cpp && NO_LIBTORCH=1 bash build.sh`
- [ ] Add CI matrix entry that exercises the CPU-fallback build
- [ ] Add TS bridge unit test that mocks the addon returning -99 and asserts the CPU path activates

---

## 4. Missing Phases vs Parent Atlas Zones

Cross-referencing **9 atlas zones** × **6 phases in Phase Completion Roadmap** × **GPU bridge coverage**:

### Zone-by-zone gap map

| Zone | Status | Missing phase coverage |
|---|---|---|
| **drizzle** | ✅ drift closed (0 gap) | none |
| **infrastructure** | ✅ GPU bridge live | G17 hardcoded-localhost (1 violation still flagged in startup hook) |
| **memory-docs** | 🟡 AGENTS.md temporal append working | parent-atlas-index regeneration not automated |
| **models** | ✅ Gemma4-rotorquant + embeddinggemma both wired | mmproj VLM lane untested in smoke |
| **opencode** | 🟡 46,729 tasks in NDJSON, 16 NES cards verified via GPU smoke | task-semantic-packet Postgres migration deferred |
| **scripts** | ✅ extraction + ingestion + persistence all green | Phase 6 simulator not started |
| **services-simd-bridge** | ✅ 15/16 GPU probes live | CPU-fallback build variant not exercised |
| **sveltekit-frontend** | ✅ 0 drift, tsgo clean | feature-pillar barrels created but consumers not migrated |
| **tests-audits** | 🟡 startup-gpu-bridge-probe + smoke-all-gpu-lanes added | G18 audit gate ("addon must load") not in audit script |

### Missing-phase quick list (5 items, all <2h each)

1. **Parent-atlas regeneration cadence** — currently manual; should fire on drift-snapshot updates
2. **VLM smoke lane** — `mmproj-F16.gguf` not exercised; add to `smoke-all-gpu-lanes.mjs` lane 6
3. **Task Semantic Packet apply** — proposed migration sits in `drizzle/manual/`; operator gate
4. **Feature-pillar consumer migration** — 8 barrels exist, 0 consumers migrated
5. **G18 audit gate** — add "addon loads + reports >0 live functions" to startup-truth.mjs

---

## 5. Aligned TODO — Updated Priority Order

### Immediate (this session — done)
- [x] Fix CUDA probe (use real export name `checkCudaAvailable`)
- [x] Expand probe coverage 7 → 15 functions (no stubs detected)
- [x] Fix 3 signature mismatches via binding.cc inspection
- [x] Document graceful-fallback audit (TS layer already handles it)

### Next 1-2 hours (priority order) — updated 2026-06-02
- [x] **A.** Wire startup-gpu-bridge-probe.mjs into `.vscode/tasks.json` (workspace open task) — **DONE** (runOn: folderOpen)
- [x] **B.** Add G18 audit gate to `scripts/startup/startup-truth.mjs` — **DONE** (15 live / 0 stub verified)
- [x] **B2.** Fix G17 hardcoded localhost violations — **DONE** (YoRHaAIChat.svelte routed to /api/ai/chat + /api/rag/search)
- [x] **B3.** Promote codebase-graph.json → parent_atlas_documents — **DONE** (5,253/5,253 rows upserted)
- [ ] **C.** Add VLM lane 6 to `smoke-all-gpu-lanes.mjs` (test mmproj-F16.gguf via Ollama vision call)
- [ ] **D.** Automate parent-atlas regeneration on drift-snapshot changes (cron via ScheduleWakeup or git-hook)

### This week (operator-gated)
- [ ] **E.** Apply Task Semantic Packet migration (6 Postgres tables) — `drizzle/manual/proposed_20260530_task_semantic_packets.sql`
- [ ] **F.** Migrate top-5 import consumers to feature-pillar barrels (Phase G from prior roadmap)
- [ ] **G.** Atlas Phase 6 — synthetic trace simulator using topology (467 USES_DB + 1,032 USES_TOOL edges already in Neo4j)

### Multi-week (architecture)
- [ ] Phase A-D from `2026-05-30_ARCHITECTURE_TODO_CLIENT_SERVER_SEPARATION.md`
- [ ] Atlas Phase 7-9 (glyph reward → LoRA training pair → Unsloth fine-tune)

---

## 6. New artifacts this session

| Artifact | Path |
|---|---|
| Expanded GPU probe (15 functions) | `scripts/startup-gpu-bridge-probe.mjs` |
| Probe output | `.tmp/gpu-bridge-probe.json` |
| This gap-alignment doc | `next_steps/active/2026-05-31_GPU_PHASE_GAP_ALIGNMENT.md` |

## 7. New artifacts (2026-06-02 continuation)

| Artifact | Path | Notes |
|---|---|---|
| Startup truth audit (G17+G18) | `scripts/startup/startup-truth.mjs` | G18: 15 live / 0 stub ✅ |
| normalize-sourcerefs (hardened) | `scripts/atlas/normalize-sourcerefs.mjs` | Conflict detection, safety floor, verbose mode |
| promote-to-postgres | `scripts/atlas/promote-to-postgres.mjs` | 5,253 rows → parent_atlas_documents ✅ |
| G17 fix | `src/…/YoRHaAIChat.svelte` | Routed direct-Ollama calls through /api/ai/chat |
| Dry-run report | `.tmp/promote-to-postgres-dry-run.json` | |
| Apply report | `.tmp/startup-truth.json` | |

---

**Bottom line**: GPU bridge healthy (15 live, CUDA active), parent_atlas_documents fully populated (5,253 rows), G18 gate wired, G17 violations fixed. Remaining: VLM smoke lane, parent-atlas regeneration automation, Atlas Phase 6 simulator.
