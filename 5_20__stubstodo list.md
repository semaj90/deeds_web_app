# To Do List - Stubbed Methods, E2E Mapping, and Policy Env Gates

## Goal
- Build an end-to-end task list for missing/stubbed methods.
- Define feature mapping and policy/env gates before changing smoke warning behavior.

## GraphRAG Hybrid GPU/CPU Pipeline (2026-05-21)

### Delivery status
- Implemented new sidecar scaffold at `services/topology-gpu/` with four stage-mapped endpoints:
  - `POST /semantic-path-synthesis`
  - `POST /som-neighborhood`
  - `POST /materialize-pathway`
  - `POST /manifold-synthesis`
- Compile check passed (`python -m py_compile` on all modules, exit `0`).

### Stage mapping (tool-aligned)
1. **Structural graph path search**
  - Module: `services/topology-gpu/graph_paths.py`
  - Implements BFS/SSSP + k-shortest expansion + personalized PageRank scoring blend.
  - Backend: `networkx` now, `cugraph` detection path included for GPU environments.
2. **Semantic/vector neighborhood + SOM topology expansion**
  - Module: `services/topology-gpu/som.py`
  - Implements BMU search + radius expansion + structural-neighbor merge.
  - Backend: `cupy` if available, `numpy` fallback.
3. **Pathway card materialization**
  - Module: `services/topology-gpu/app.py` + `schemas.py`
  - Emits stable `GraphPathwayCard` payload and optional persistence adapters (Postgres JSONB, Redis, Qdrant).
4. **Manifold synthesis**
  - Module: `services/topology-gpu/manifold.py`
  - Implements 4D manifold reduction + clustering + bridge-card synthesis.
  - Backend: `cuml` if available, `sklearn` fallback.

### Immediate index readiness
- Sidecar can be started with `python app.py` from `services/topology-gpu`.
- Persistence toggles via env:
  - `TOPOLOGY_PG_DSN`
  - `TOPOLOGY_REDIS_URL`
  - `TOPOLOGY_QDRANT_URL`
  - `TOPOLOGY_GPU_PORT` (default `8107`)
- Runtime validation:
  - Stage smoke test passed with native fallback selection:
    - Stage 1 backend: `networkx`
    - Stage 2 backend: `numpy-fallback` (graceful fallback when CUDA runtime deps are absent)
    - Stage 4 backend: `sklearn-kmeans`, reducer: `pca-fallback`

## Goal Plan (0-100%)

### Program Scoreboard (ranked)
1. **Smoke Policy + Env Gating**: **85%**
  - Status: core env gates were wired and default-warning behavior is in place.
  - Remaining: enforce-profile proof run + docs sync + artifact links.
2. **Graphify/Semantic Caching E2E Completion**: **45%**
  - Status: pre-semantic stages pass consistently (deep smoke, fast-ast smoke, kag smoke, kag/docstore).
  - Remaining: complete full `codebase:index:tags` + downstream cluster/pagerank/authority in one uninterrupted run.
3. **ACE Cache Refresh Completion**: **50%**
  - Status: refresh executes and performs upserts; bounded runs confirm it works but can exceed short timeout windows.
  - Remaining: complete one long-bound run and capture final completion markers.
4. **ONNX Inference Stub Replacement**: **10%**
  - Status: identified and scoped.
  - Remaining: implement tokenizer/model path + deterministic tests.
5. **Benchmark Stub Replacement**: **10%**
  - Status: identified and scoped.
  - Remaining: wire real quantization benchmark + fixture + persisted artifacts.
6. **MCP Internal Contract Triage**: **25%**
  - Status: candidate area isolated.
  - Remaining: confirm degraded envelope contract and formalize typed fallback if needed.

### Milestones to Reach 100%
- **M1 (60%)**: complete long-bound verification for `graphify:daily:both:tags` and `ace:cache:index:refresh` with stamped exit codes.
- **M2 (75%)**: close smoke policy acceptance criteria (default profile + enforced profile) with saved artifacts.
- **M3 (90%)**: replace ONNX inference stub with working inference path + tests.
- **M4 (100%)**: replace benchmark stub and finalize MCP degraded-contract decision with docs updated.

### Current Top Risks
- Long semantic indexing stage stalls or exceeds short timeout windows.
- Operational port/process contention can contaminate completion capture.
- Stubbed ONNX/benchmark code paths can hide true performance/readiness.

### Immediate Next Actions (ordered)
1. Run long-bound `graphify:daily:both:tags` (600s, then 1800s fallback if needed).
2. Run long-bound `ace:cache:index:refresh` (600s, then 1800s fallback if needed).
3. Save stamped completion markers and update this file with final percentages.

## Live Status Checkpoint (2026-05-21)

### Ranked Progress (current)
1. **Graphify/Semantic Caching E2E**: **48%**
  - Latest chained long-bound run (`600s`) timed out with stamped `NPM_EXIT_CODE ... =124`.
  - Semantic phase continues to show healthy cached progress with `0 errors`, but still lacks a full uninterrupted completion marker.
2. **ACE Cache Refresh Completion**: **52%**
  - Confirmed execution in same chained run after graphify stage.
  - Latest chained long-bound run (`600s`) also timed out with stamped `NPM_EXIT_CODE ... =124`.
3. **Benchmark Stub Replacement**: **80%**
  - Real INT8 quantization benchmark now runs and reports measured before/after/improvement values.
  - Remaining: persist JSON benchmark artifacts with timestamp/profile metadata.
4. **ONNX Inference Stub Replacement**: **55%**
  - Stub return path replaced with functional ONNX autoregressive fallback (session.run + logits sampling + decode fallback).
  - Remaining: harden tokenizer integration and add deterministic regression tests.
5. **MCP Internal Contract Triage**: **25%**
  - Candidate file and degraded-contract concern identified; no final envelope decision merged.

### Evidence Artifacts (current run)
- Graphify bounded summary: `logs/pipeline-runs/bounded_graphify_daily_both_tags_20260521_094922.log`
- Graphify stdout: `logs/pipeline-runs/graphify_daily_both_tags_20260521_094922.out.log`
- ACE bounded summary: `logs/pipeline-runs/bounded_ace_cache_index_refresh_20260521_095924.log`
- ACE stdout: `logs/pipeline-runs/ace_cache_index_refresh_20260521_095924.out.log`
- Chained terminal result: `FINAL_EXIT_CODES graphify=124 ace=124`

## Scope
- Included: active code paths in `sveltekit-frontend/src` and smoke/pipeline control in `sveltekit-frontend/scripts`.
- Excluded from this list: vendor/venv code, generated diagnostic blobs, and backup archives unless explicitly promoted.

## End-to-End Feature Map (Current Lane)
- Request path: `POST /api/v1/chat/completions` -> OpenAI facade -> ACE/HMM -> smoke contract (`smoke-trace-full-loop.mjs`).
- Smoke output currently shows no runtime errors but policy warnings (`missing_memory_gain_score`, `missing_memory_decision`, `agents_md_miss_with_filepath`).
- Policy decision required: treat these as informational by default, and enforce only when env gates are enabled.

## Stub Inventory (Actionable)

### 1) ONNX inference fallback is intentionally stubbed
- File: `sveltekit-frontend/src/lib/ai/onnx/inference.ts`
- Evidence:
  - Stub path replaced with ONNX `session.run` generation loop + top-k/top-p sampling.
  - Includes tokenizer decode path when available and ASCII-safe fallback decoder.
- Impact:
  - ONNX path can now generate fallback output instead of always returning `null`.
- Tasks:
  - [x] Implement tokenizer -> model run -> detokenizer path.
  - [ ] Add deterministic test for non-null generation when model + tokenizer are present.
  - [ ] Keep `isOnnxAvailable()` lightweight and separate from full-run health.

### 2) Benchmark suite contains placeholder result
- File: `sveltekit-frontend/src/lib/server/optimize/benchmark.ts`
- Evidence:
  - Replaced placeholder logic with real quantize/dequantize workload and measured metrics.
- Impact:
  - Benchmark now reflects real measured memory/latency/error data.
- Tasks:
  - [x] Replace synthetic return with real quantization benchmark execution.
  - [ ] Add dataset fixture + reproducible seed for regression comparisons.
  - [ ] Persist benchmark artifacts (json) with timestamp and model/profile metadata.

## Potentially Stub-Like Areas to Triage (Do Not Auto-Edit)
- File: `sveltekit-frontend/src/lib/server/mcp/mcp-internal.ts`
- Notes:
  - Returns `null`/`[]` for no result; this may be valid degraded behavior, not a missing method.
- Tasks:
  - [ ] Confirm degraded contract for internal MCP bridge.
  - [ ] If needed, replace `null` fallback with typed envelope to reduce downstream ambiguity.

## Policy/Env Gating Plan (Before Changing Smoke Semantics)

### Warning-to-policy mapping
- `missing_memory_gain_score`
  - Producer: smoke validator (`validateResult`)
  - Upstream source currently unset: `memory.gainScore`
  - Policy: optional/aspirational unless explicitly enforced.
- `missing_memory_decision`
  - Producer: smoke validator (`validateResult`)
  - Upstream source currently unset: `memory.decision`
  - Policy: optional/aspirational unless explicitly enforced.
- `agents_md_miss_with_filepath`
  - Producer: smoke normalizer when `filePath` is set and `yorha.agentsMd === false`
  - Policy: optional quality signal; enforce only in indexing/memory readiness runs.

### Env gates to add before policy changes
- [ ] Add `TRACE_SMOKE_ENFORCE_MEMORY_SIGNALS` (`0` default).
- [ ] Add `TRACE_SMOKE_ENFORCE_AGENTS_MD` (`0` default).
- [ ] Add `TRACE_SMOKE_WARN_ON_EMPTY_CONTENT` (`1` default) so content fallback remains visible but non-blocking.
- [ ] Document these gates in script header usage block and startup docs.

### Acceptance criteria for policy env work
- [ ] Default run (`npm run smoke:trace:full`) does not fail on aspirational policy warnings.
- [ ] Enforced run (`TRACE_SMOKE_ENFORCE_MEMORY_SIGNALS=1 TRACE_SMOKE_ENFORCE_AGENTS_MD=1`) fails when signals are absent.
- [ ] `latest.json` always includes explicit summary counts and stable warning codes.

## Execution Order
1. Finalize policy defaults (env gates) in smoke script.
2. Implement ONNX inference stub replacement.
3. Replace benchmark placeholder with real measurements.
4. Re-run smoke with default and enforced env profiles.
5. Update this file with completion timestamps and linked artifacts.

## Notes
- Current smoke lane status (latest observed): `0 err`, warnings only, non-strict exit code `0`.
- Port conflicts (`8788`, `11434`) are operational and separate from stub-method completion work.