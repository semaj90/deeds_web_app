# To Do List - Stubbed Methods, E2E Mapping, and Policy Env Gates

## Goal
- Build an end-to-end task list for missing/stubbed methods.
- Define feature mapping and policy/env gates before changing smoke warning behavior.

## Parent Atlas Phase 2 Alignment (current, 2026-08-25)

This section supersedes the older “ready to execute” wording for Qdrant payload
enrichment. The Parent Atlas workstation contract is:

`Postgres atlas_packets` → canonical packet identity and feature metadata

`Qdrant` → rebuildable semantic projection and payload filter mirror

`Redis/Valkey` → derived Karpathy/ACE cache, never identity authority

### Phase 2 — Qdrant payload mirror

- **Owner:** `scripts/atlas/upsert-qdrant-packet-payload.mjs`
- **Target:** legacy `codebase_chunks_768` collection; this is not proof for
  `codebase_chunks_768_v2`.
- **Payload fields:** `packet_key`, `source_ref`, `feature_id`,
  `community_id`, `concept_ids`, `tags`, `qdrant_vector_dim`, and lineage
  metadata where available.
- **Canonical source:** `atlas_packets`; Qdrant point IDs remain projection
  identifiers and must not become Parent Atlas identity.
- **Dry-run evidence:** `--dry-run --limit=100` prepared `100/100` rows with
  `0` errors and performed no Qdrant writes.
- **Apply status:** `BLOCKED_PENDING_IDENTITY_RECONCILIATION`. Do not run
  `--apply` until the collection, source path policy, packet key mapping, and
  revision/hash overlap receipt pass.
- **Current blocker:** the full `codebase_chunks_768` identity audit reports
  ambiguous and unmatched points; the collection is not admitted as a safe
  canonical-bound retrieval projection.

### Phase 2 acceptance gates

- [ ] Confirm the selected Qdrant collection and vector lane are explicitly
  `semantic_768` / 768-dimensional.
- [ ] Produce a read-only identity receipt covering `source_ref`, `packet_key`,
  `content_hash`, `workspace_revision`, and `source_revision` where present.
- [ ] Require duplicate, ambiguous, and unmatched identity counts to be
  reviewed before any payload apply.
- [ ] Run a bounded apply only after approval, with an immutable report of
  attempted, updated, skipped, and failed points.
- [ ] Read back the same bounded points and verify payload values against
  `atlas_packets`; Qdrant must not be used as the source of truth.
- [ ] Regenerate the multihop map only after the payload readback passes.

### Phase 2 downstream alignment

- Karpathy GPU enrichment consumes only candidates with a proven Qdrant/path
  join. A zero-match candidate funnel is a blocked dependency, not successful
  empty enrichment.
- `feature_id` identifies the Parent Atlas feature classification; it does not
  replace `packet_key`, `source_ref`, `tree_node_id`, or `CandidateOrdinal`.
- `community_id`, SOM coordinates, PageRank, and Karpathy scores are derived
  routing/ranking metadata and must remain revisioned.
- Phase 3 and Phase 4 cannot claim full completion until their receipts report
  nonzero, identity-qualified Qdrant and Karpathy coverage separately from
  structural node coverage.

### Phase 2 to neural/GPU feature handoff

The Phase 2 payload mirror helps the neural encoder/decoder and GPU graph lanes
only as a revisioned metadata source. It does not train a model or make Qdrant
authoritative.

Use the existing owners:

`atlas_packets` + reviewed features -> `CandidateOrdinalMapV1` ->
`CandidateFeatureMatrixV1` -> PyTorch/ATen reference -> cuGraph/cuVS executor ->
cuTile/SIMT challenger -> decoder/reranker

Required handoff invariants:

- `candidateOrdinal` is the stable row position for the frozen snapshot.
- `packet_key`, `source_ref`, and `feature_id` remain provenance fields.
- `feature_id` is a categorical feature label, not a numeric coordinate or
  replacement for packet identity.
- `semantic_768` remains the canonical dense embedding representation.
- PageRank, PPR, community, SOM, and topology coordinates are derived feature
  columns with independent revisions.
- Presence masks distinguish missing derived features from numeric zero.
- Every matrix receipt records `featureRevision`, `graphRevision`,
  `ordinalMapChecksum`, shape, dtype, normalization, and producer.

What this alignment enables:

- PyTorch/ATen can build the correctness-reference feature matrix.
- cuGraph can consume the same frozen ordinal graph snapshot for PageRank,
  PPR, community, and induced-subgraph operations.
- cuTile/SIMT can later test bounded ordinal gather/pack kernels without
  changing logical feature dimensions.
- A neural decoder or reranker can consume bounded `CandidateOrdinal` rows
  instead of joining Qdrant payloads or source paths inside a GPU kernel.

What it does not prove:

- Full Qdrant identity coverage or safe payload apply.
- CandidateOrdinal mappings from Qdrant point IDs.
- Neural encoder/decoder training or promotion.
- cuGraph CPU/GPU parity or cuTile kernel parity.

### Neural/GPU acceptance gates

- [ ] Freeze one revision-qualified `CandidateOrdinalMapV1`.
- [ ] Build one read-only `CandidateFeatureMatrixV1` receipt from canonical
  packet rows and derived feature revisions.
- [ ] Compare PyTorch/ATen matrix shape, masks, finite values, and checksum.
- [ ] Run cuGraph on the same ordinal graph snapshot and compare checksums.
- [ ] Treat cuTile/SIMT as a gather/pack challenger only after PyTorch parity.
- [ ] Keep the neural decoder/reranker shadow-only until held-out
  Recall/NDCG/MRR and source-revision leakage checks pass.

### Current evidence

- Payload dry run: `docs/reports/upsert-qdrant-packet-payload.json`
- Full 768 identity audit: `docs/reports/qdrant-768-identity-full-v1.json`
- Multihop status correction: `MULTIHOP-ENRICHMENT-STATUS.txt`
- CandidateOrdinal proof: `npx tsx scripts/atlas/produce-sample-query-candidate-ordinal-map-v1.mts`
  with `vector-snapshot-5k.ndjson` produced `100` rows, checksum
  `0ad301c1fdf3aa45a92881df8b1792b9b27607b2b2ea3e8a85346d4df4a14d96`, and
  `storeWritesAttempted: false`. The filename says `5k`, but the current NDJSON
  contains `100` lines; this is a bounded proof, not 5,000-row coverage.
- Authoritative 768 snapshot proof: `freeze-vector-snapshot-5k-768.mts --verify`
  confirmed `5,000` finite, normalized 768-dimensional vectors. A read-only
  Parquet-to-NDJSON bridge then produced `4,999` valid CandidateOrdinal rows
  from the `4,999` non-empty `source_ref` values, checksum
  `29ebdd410ae407ed422e38fe3c51d7e862072b2418f4524ffa2a66cc07940d2d`, with
  `storeWritesAttempted: false`. One row was rejected by the existing Zod
  contract because `source_ref` was empty; no synthetic identity was created.
- Feature-matrix handoff proof: `produce-sample-query-feature-columnar-v1.mts`
  consumed the same `4,999`-row map and produced `12` semantic-control feature
  columns with checksum
  `b48d553dbffc05ee4a71f2ec3409f1f0f968cfcd13e333e7d5b8a468dfbc86b7`.
  This proves the CandidateOrdinal-to-feature-fabric boundary only; graph
  features, cuGraph parity, cuTile parity, and neural decoder training remain
  unproven.
- PyTorch CUDA feature-pack proof: `prove-candidate-feature-gpu-parity.py`
  passed on the same snapshot with logical rows `4,999`, physical rows `5,024`,
  `25` padding rows, `12` features, and six selected ordinals. CUDA execution
  was observed on an RTX 3060 Ti using PyTorch `2.8.0+cu128`; ordinal,
  feature-value, presence, lane-mask, degraded-identity, padding-mask, and
  padding-zero parity all passed with maximum feature delta `0.0`. Receipt:
  `docs/reports/candidate-feature-gpu-parity-5k-v1.json`. This is a PyTorch
  reference/execution proof, not cuGraph or cuTile promotion.
- GPU residency lease proof: `prove-candidate-feature-gpu-resident-lease.py`
  passed with the same GPU pack checksum and `PAGEABLE_SYNC` staging. The
  bounded lease gathered the six selected ordinals, reported resident buffer
  checksums, rejected access after release, and exposed neither raw pointers
  nor CUDA IPC handles. `canonicalWritesAttempted`, Postgres, Qdrant, Neo4j,
  and Valkey writes were all `false`. Receipt status was
  `CANDIDATE_FEATURE_GPU_RESIDENT_RUNTIME_PROVEN` on the RTX 3060 Ti with
  PyTorch `2.8.0+cu128`. This proves bounded lifetime and gather behavior;
  it does not prove persistent GPU residency, cuGraph parity, cuTile parity,
  or neural decoder training.
- Safe next check:
  `node scripts/atlas/upsert-qdrant-packet-payload.mjs --dry-run --limit=100`

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
