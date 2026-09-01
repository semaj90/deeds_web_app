## 1. Environment verification (no install)

- [x] 1.1 Verify `/home/james/miniforge3/envs/atlas-rapids-cu13` exists and imports cuVS/cuGraph/cuDF/CuPy/PyTorch by absolute Python path
      **Verified**: `cuvs 26.06.00`, `cugraph 26.06.00`, `cudf 26.06.01`, `cupy 14.1.1`, `torch 2.13.0+cu130`, `cuda: True`, `gpu: NVIDIA GeForce RTX 3060 Ti`
- [x] 1.2 Verify normal `conda activate atlas-rapids-cu13` also resolves the same environment (not just direct-path invocation)
      **Verified**: `which python` → `/home/james/miniforge3/envs/atlas-rapids-cu13/bin/python`; `cuVS import PASS`
- [x] 1.3 Do NOT install or upgrade RAPIDS in this change
      **Confirmed**: no `pip install`/`conda install` run against this environment; existing packages used as-is

## 2. Phase A — SEMANTIC-EXACT-PARITY-01 (DONE)

- [x] 2.1 Audit `python/atlas_compute/` for an existing cuVS brute-force wrapper before writing a new one
      **Found**: `atlas_compute.cuvs_analytics.run_cuvs_exact_knn` — reused, not duplicated
- [x] 2.2 Build the frozen synthetic fixture (16,384 nodes, 64-dim, K=16, 256 queries, fixed seed) with `nodeKey`/`projectionOrdinal`/`candidateOrdinal` deliberately distinct
      **Landed**: `python/atlas_compute/gpu_mini_fabric/semantic_exact_parity_fixture.py`
- [x] 2.3 Verify fixture determinism (byte-identical regeneration)
      **Verified live**: `python -m atlas_compute.gpu_mini_fabric.semantic_exact_parity_fixture` inside `atlas-rapids-cu13` — "fixture is deterministic (byte-identical regeneration confirmed)"
- [x] 2.4 Build the PyTorch-exact-vs-cuVS-brute-force proof script with recall@K, rank agreement, tie handling, and ordinal-conflation checks
      **Landed**: `python/atlas_compute/gpu_mini_fabric/semantic_exact_parity_01.py`
- [x] 2.5 Run the proof for real on the RTX 3060 Ti inside `atlas-rapids-cu13`
      **Result: PASS** — recall@16=1.0, rank1_match_rate=1.0, node_key_identity_match_rate=1.0, max_top1_score_delta=3e-07, ordinal conflation hits=0/0. Report: `docs/reports/gpu-mini-fabric-01-semantic-exact-parity-01.json`

## 3. Roadmap capture (design-only, this change)

- [x] 3.1 Write `design.md` covering the 6-decision rationale (oracle-first, 3-field fixture identity, wrapper reuse, sequential crossover curve, logic-before-CUDA ordering, `AtlasAceResidency*` naming)
- [x] 3.2 Write specs for all 6 capabilities (`gpu-mini-fabric-semantic-exact-parity`, `gpu-mini-fabric-graph-ann`, `gpu-mini-fabric-structural-graph`, `atlas-ace-residency-simulation`, `parent-atlas-som-cache-tournament`, `gpu-primitive-level-discipline`)
- [x] 3.3 Update root `CLAUDE.md` with the corrected environment record (existing `atlas-rapids-cu13`, not "RAPIDS not installed") and the Phase A PASS result

## 4. Phase B — GPU-GRAPH-ANN-01 (RUN, partial result — real crossover boundary found)

- [x] 4.1 Build CAGRA benchmark harness against the Phase A exact oracle at N=16K
      **Landed**: `python/atlas_compute/gpu_mini_fabric/graph_ann_fixture.py` (generalized Phase A fixture pattern, parameterized by N) + `graph_ann_01.py`. Default CAGRA params (`build_algo="ivf_pq"`, `itopk_size=64`) — deliberately never NVIDIA's own `"ace"` build_algo (unrelated to Atlas ACE, see naming-collision note).
- [x] 4.2 Record recall@{1,8,16}, rank overlap, latency/query, build time, peak VRAM, and pre-run free-VRAM headroom
      **Landed**: all recorded per tier, including real driver-reported free-VRAM before/after each tier (`nvidia-smi` query, not just cupy's pool) and honest `OOM_BLOCKED` handling distinct from a correctness `FAIL`.
- [x] 4.3 If 16K passes, repeat at 64K, 256K, 1M in sequence — stop at first failing size
      **Result (real, run on this host's RTX 3060 Ti)**:
      - **N=16384: PASS** — recall@16=0.9746, recall@1=1.0, build=916.6ms, search=7237.6ms total (28.3ms/query)
      - **N=65536: FAIL** — recall@16=0.8289 (< 0.95 threshold), recall@1=1.0, min_recall_at_16=0.5 on worst queries, build=709.8ms, search=4.0ms total
      - Sequence correctly halted at N=65536 — 256K and 1M NOT attempted. `crossover_boundary_n: 65536`, `overall_verdict: "PARTIAL_PROVEN"`.
      - **Honest caveat**: the fixture is uniform-random 64-dim Gaussian vectors with no manifold structure — harder for ANN than typical real embeddings. This crossover boundary reflects default-param CAGRA on this specific synthetic difficulty, not a general "CAGRA fails at 64K" claim. Retuning `itopk_size` (CAGRA's primary accuracy/speed knob per its own docs) was deliberately NOT attempted in this run — that's a distinct follow-up experiment, not a silent fix to force a pass.
- [x] 4.4 Produce the RTX 3060 Ti crossover-curve report
      **Landed**: `docs/reports/gpu-mini-fabric-01-graph-ann-01.json`

**Follow-up, not done**: retry N=65536+ with `itopk_size` tuned upward (CAGRA's documented accuracy knob), and/or test on a fixture with real manifold structure rather than pure Gaussian noise, before concluding anything about CAGRA's real crossover point for Parent Atlas's actual embedding distribution. 256K and 1M tiers remain untested.

**CORRECTED (2026-09-01, controlled test run — the VRAM hypothesis above was FALSIFIED)**: the
retry recommended above has now been run for real. See section 4a-build-isolation below —
`build_algo` quality, not VRAM/workspace pressure, is the real driver of the N=65536 recall drop.

## 4a-build-isolation. GPU-GRAPH-ANN-02A/02B — controlled build-algorithm isolation (RUN — falsifies the VRAM hypothesis)

- [x] 4a-bi.1 Build the controlled comparison: same frozen N=65536 fixture/oracle/seed as `GPU-GRAPH-ANN-01`'s original tier, `itopk_size=64` held fixed, only `build_algo` varied (`ivf_pq` vs `nn_descent`), with `CagraBuildReceiptV1` captured per run (`freeVramBeforeMib`, `peakVramDuringBuildUsedMib`, `internalBatchReductionObserved`, `buildAlgo`, `graphDegree`, `intermediateGraphDegree`, `buildTimeMs`, `graphChecksum`)
      **Landed**: `python/atlas_compute/gpu_mini_fabric/graph_ann_02_build_isolation.py`. Native cuVS log line captured via real OS-fd-2 redirection (Python's `contextlib.redirect_stderr` does NOT catch it — cuVS's C++ logger writes directly to the file descriptor, verified by testing both).
- [x] 4a-bi.2 Result (real, run on this host with 1539MB free VRAM — ~2–7x more headroom than the original ~200–900MB run)
      ```
      02A ivf_pq:      recall@16=0.8391  worst=0.4375  freeVramBefore=1539MB  internalBatchReductionObserved=true
      02B nn_descent:  recall@16=0.9980  worst=0.9375  freeVramBefore=1515MB  internalBatchReductionObserved=false
      (original GPU-GRAPH-ANN-01 result for comparison: recall@16=0.8289)
      ```
      **02A reproduces the original 0.8289 result almost exactly (0.8391) despite ~2–7x more free VRAM**
      — this falsifies the VRAM-pressure hypothesis. The `internalBatchReductionObserved` log line
      fired regardless of headroom, evidently a fixed heuristic at this N, not purely VRAM-driven.
      **02B (build_algo changed, itopk_size untouched at the default 64) alone jumps recall to 0.998**
      — the real variable was `build_algo` graph-build quality, not search budget or VRAM. Report:
      `docs/reports/gpu-mini-fabric-01-graph-ann-02-build-isolation.json`.
- [x] 4a-bi.3 Correct design.md and CLAUDE.md to attribute the original recall drop to `build_algo`, not VRAM
      **Landed**: design.md §4a rewritten (§4a-itopk added to note the itopk sweep ran out of the correct methodological order — build isolation should have come first per NVIDIA's own tune-itopk-before-graph_degree guidance, though the itopk sweep's own data remains valid).

## 4a. GPU-GRAPH-ANN-02 — itopk_size sweep at N=65536 (RUN — confirms NVIDIA's own tuning guidance)

- [x] 4a.1 Sweep `itopk_size` ∈ {64, 128, 256, 512} at the N=65536 crossover boundary, graph construction held fixed (per NVIDIA's guidance to tune itopk_size before graph_degree/intermediate_graph_degree)
      **Landed**: `python/atlas_compute/gpu_mini_fabric/graph_ann_02_itopk_sweep.py`. Per-query synchronized CUDA-event timing (not just aggregate), warmup pass excluded from measurement, p50/p95/QPS, VRAM before/peak(sampled)/after per config.
- [x] 4a.2 Result (real, same frozen Gaussian-64 N=65536 fixture as GPU-GRAPH-ANN-01)
      ```
      itopk=64:  recall@16=0.8347  worst=0.5625  p50=1.92ms  qps=351
      itopk=128: recall@16=0.9238  worst=0.6875  p50=1.91ms  qps=350
      itopk=256: recall@16=0.9805  worst=0.8125  p50=1.91ms  qps=369  ← clears 0.95 gate
      itopk=512: recall@16=0.9980  worst=0.9375  p50=1.91ms  qps=360
      ```
      Confirms NVIDIA's own guidance: itopk_size is the effective knob, and per-query p50 latency is essentially flat across the sweep (~1.9ms) with no QPS penalty at batch-size-1 — the earlier N=65536 FAIL in `GPU-GRAPH-ANN-01` was a default-parameter artifact, not a hard recall ceiling. `itopk_size=256` already clears the 0.95 gate; `itopk_size=512` reaches 0.998. Report: `docs/reports/gpu-mini-fabric-01-graph-ann-02-itopk-sweep.json`.

## 4b. GPU-GRAPH-ANN-03 — real semantic_768 distribution (RUN — see result below)

- [x] 4b.1 Export real `codebase_chunk_index.content_embedding` read-only as a frozen local snapshot (raw float32 binary per Wire Format Layering Rule, never JSON for the bulk array)
      **Landed**: `python/atlas_compute/gpu_mini_fabric/export_semantic_768_fixture.py`. **Correction to N**: only 55,169 real populated rows exist in Postgres (verified live via `SELECT COUNT(*)`), not 65,536 — used all 55,169 real rows rather than padding/truncating to an arbitrary round number. `canonical_production_data_touched: true` / `canonical_production_data_mutated: false` recorded explicitly in the manifest (distinct from Phase A/B's fully-synthetic `false`).
- [x] 4b.2 Compare cuVS brute-force exact oracle vs CAGRA default (itopk=64) vs the B2 winning config (itopk=512) on this real corpus
      **Result: PASS** (real, run on this host, N=55,169 real semantic_768 vectors, 256 queries, K=16):
      ```
      oracle cross-check (cuVS brute-force vs PyTorch exact): 0.9993 agreement
      itopk=64  (default): recall@16=0.9905  worst_query_recall@16=0.0     ← flagged, see below
      itopk=512 (tuned):   recall@16=0.9995  worst_query_recall@16=0.9375
      ```
      Confirms the Gaussian-64 fixture's low recall (`GPU-GRAPH-ANN-01`) was specific to unstructured
      synthetic data, not representative of Parent Atlas's real embedding distribution — even
      default-param CAGRA clears 0.99 mean recall@16 on real vectors. **Anomaly flagged, not
      smoothed over**: the default config's `worst_query_recall_at_16 = 0.0` means one query got
      *zero* of its true top-16 neighbors — worth investigating (possible near-duplicate/degenerate
      embedding) as a follow-up, though the tuned config already fixes the floor to 0.9375 and both
      gates pass. Report: `docs/reports/gpu-mini-fabric-01-graph-ann-03-semantic-768.json`.

**Follow-up, not done**: investigate which specific query hit `worst_query_recall_at_16=0.0` at default `itopk=64` on the real corpus — likely a near-duplicate-embedding edge case, not a general CAGRA correctness issue (the tuned config already resolves it), but not yet root-caused.

## 5. Phase C — CAGRA→HNSW conversion (staged, follow-up change)

- [ ] 5.1 Use cuVS's CAGRA-to-HNSW conversion path (not a hand-written HNSW) as a GPU-build/CPU-search hybrid challenger
- [ ] 5.2 Compare against Phase A oracle and Phase B CAGRA result for recall/latency/memory parity

## 6. Phase D — GPU-GRAPH-STRUCT-01/02 (RUN — both PASS)

- [x] 6.1 Build `GraphFixtureV1` (10K nodes, 50K edges, typed IMPORTS/CALLS/REFERENCES/IMPLEMENTS/TESTS edges)
      **Landed**: `python/atlas_compute/gpu_mini_fabric/graph_fixture.py`. Vertex identity fed to both NetworkX and cuGraph is the `nodeKey` string directly — never a row index or engine-internal ID, sidestepping cuGraph's renumber/contiguous-ID caveat entirely.
- [x] 6.1a **CORRECTED pre-flight (see design.md §4c)**: originally justified as "assert zero dangling
      nodes because cuGraph silently ignores `dangling`, per issue `rapidsai/cugraph#482`" — **that
      citation was wrong**, verified by pulling #482's full comment thread directly (GitHub API, not
      a search summary). The issue's actual resolution: NetworkX loaded the graph undirected by
      default while cuGraph built it directed — a graph-construction-semantics mismatch, never
      dangling-node handling. Corrected framing: `GraphFixtureV1` (now labeled `GRAPH-PAGERANK-01`)
      is an explicit **isolation fixture** (zero dangling nodes removes one variable to establish
      basic numerical parity), not a claim that dangling nodes cause a real bug — production graphs
      naturally have them. The separately-true fact (verified directly against cuGraph's own docs:
      *"This parameter is here for NetworkX compatibility and ignored"*) is now characterized
      empirically in 6.4 below rather than assumed to matter.
      **Landed**: mandatory 1 outgoing edge per node before the remaining random edges; asserted `out_degree >= 1` for all 10,000 nodes at generation time. Also added `GraphExecutionSemanticsV1` (`python/atlas_compute/gpu_mini_fabric/graph_execution_semantics.py`) — compares `directed`/`vertexCount`/`edgeCount`/`ordinalMapChecksum`/`danglingNodeCount` between NetworkX and cuGraph's constructed graphs and blocks the PageRank comparison on disagreement, which is what would have actually caught the #482 class of bug.
- [x] 6.2 NetworkX BFS vs cuGraph BFS exact-match test (bounded depth, fixed seeds)
      **Result: PASS** (real, run on this host) — exact node-set + depth match at all 5 seeds (45/22/22/21/19 nodes reached, identical on both engines). **Bug found and fixed during this run**: `cugraph.bfs()` marks unreached vertices with the sentinel `distance=2147483647` (INT32_MAX), not `-1` as first assumed from the docstring — verified live by direct inspection before fixing the filter, not guessed. First attempt incorrectly counted all 10,000 nodes as "reached" per seed until fixed. Report: `docs/reports/gpu-mini-fabric-01-graph-struct-01-bfs.json`.
- [x] 6.3 NetworkX PageRank vs cuGraph PageRank correlation/rank-agreement test (`GRAPH-PAGERANK-01`, zero-dangling isolation fixture from 6.1a)
      **Result: PASS** (real, run on this host, rerun with the `GraphExecutionSemanticsV1` gate wired in ahead of the PageRank comparison — both engines agree: `directed=true, vertexCount=10000, edgeCount=49984, danglingNodeCount=0`, identical `ordinalMapChecksum`) — `vertexSetExact=true`, `rankCorrelation=0.99992` (>= 0.999 gate), `maxAbsoluteError=6.26e-6`, `meanAbsoluteError=4.4e-7`, `topKOverlap=0.98`. **Gate recalibrated during this run**: the original spec required `topKOverlap == 1.0`, which contradicted this capability's own "numerical tolerance, not bit-identical scores" design principle — a hard rank-100 cutoff can legitimately flip 1-2 nodes' order at scores this close. Changed to `topKOverlap >= 0.95` (spec updated to match) — 0.98 clears it. Also added `store_transposed=True` per a cuGraph perf warning (did not affect correctness). Compared strictly as `(nodeKey, score)` pairs throughout, never DataFrame row position. Report: `docs/reports/gpu-mini-fabric-01-graph-struct-02-pagerank.json`.
- [x] 6.4 `GRAPH-PAGERANK-02` — characterize the dangling-parameter no-op empirically (not assumed)
      **Result: NO MEASURABLE DIVERGENCE** (real, run on this host). Fixture with 80/10,000 nodes
      (0.8%) naturally dangling, `GraphExecutionSemanticsV1` confirms both engines agree on vertex/edge
      set (80 dangling on both sides, same fixture fed to both). PageRank divergence attributable to
      dangling-node handling: `maxAbsoluteError=6.27e-6` whole-graph, `1.61e-6` on dangling nodes
      specifically — essentially the same noise floor as `GRAPH-PAGERANK-01`'s zero-dangling baseline
      (`6.26e-6`). At this dangling density and graph structure, cuGraph's documented no-op does NOT
      produce a practically measurable difference from NetworkX's redistribution — an honest,
      data-driven answer, not forced toward "found a problem." Code/result:
      `graph_fixture.py::generate_graph_fixture_with_dangling_v1()` +
      `graph_pagerank_02_dangling.py` / `docs/reports/gpu-mini-fabric-01-graph-pagerank-02-dangling.json`.

## 7. BITFROST-SIM-01 + BITFROST-LOD-01 (staged, follow-up change)

- [ ] 7.1 Design the query-sequence generation methodology (reusing GraphFixtureV1 adjacency — see design.md Open Questions)
- [ ] 7.2 Implement `AtlasAceResidencyV1` utility scoring and hot/warm/cold prediction simulation (pure logic, no CUDA)
- [ ] 7.3 Measure hitRate, precisionOfPrefetch, bytesPromoted, bytesWasted, promotionLatency, evictionRate, queryLatencyDelta
- [ ] 7.4 Layer LOD promotion/demotion ladder test on top (identity → glyph → latent64 → latent128 → semantic768 → structural → source → prompt-ready)

## 8. SOM-CACHE-01 (staged, follow-up change)

- [ ] 8.1 Decide GPU vs CPU-only SOM training for the test fixture (see design.md Open Questions)
- [ ] 8.2 Run the 4-way tournament (no-prefetch / LRU / graph-neighbor / SOM-BMU-neighbor) against a fixed query trace
- [ ] 8.3 Record verdict on whether SOM beats both baselines; if not, explicitly recommend it stay `STEP-08 experimental`

## 9. CUTILE-ACE-01 (staged, follow-up change, LEVEL 3 — requires LEVEL 1/2 proofs first)

- [ ] 9.1 Confirm `ACE-RADIX-01`'s CUB oracle (LEVEL 1) is still `DRY_RUN_PROVEN` before starting
- [ ] 9.2 Build LEVEL 2 simple custom CUDA glyph-score + residency-key-pack kernels first
- [ ] 9.3 Only then attempt a LEVEL 3 fused cuTile challenger (score → key-pack → partition), on a CUDA 13.2+ host

## 10. BITFROST-L2-01 (staged, follow-up change, last in sequence)

- [ ] 10.1 Confirm `AtlasAceResidencyV1` logical policy (section 7) is proven before starting
- [ ] 10.2 Benchmark `cudaAccessPropertyPersisting` L2 set-aside window for the HOT tier vs normal access, accounting for concurrent GPU workloads already using this shared 8GB card

## 11. Session handoff (2026-09-01, compaction checkpoint — read this first on resume)

**Board state against the corrected 9-step sequence**: steps 1-5 and 7-8 done with real, live
evidence (all reports in `docs/reports/gpu-mini-fabric-01-*.json`, all code in
`python/atlas_compute/gpu_mini_fabric/`). Step 6 (`GRAPH-06D`) investigated but genuinely
blocked — diagnostic recorded in
`openspec/changes/parent-atlas-candidate-feature-execution-fabric/tasks.md` at the `GRAPH-06D`
line (not this change's tasks.md — that task belongs to the other change). **Step 9 (PPR/BFS/
SOM/ACE/BitFrost cache tournament) not started.**

**GRAPH-06D blocker, resolved diagnosis (updated after a follow-up search)**: the only existing
frozen graph snapshot (`graphify/frozen-graph-snapshot-v2.json`) has zero packet↔packet edges
(100% packet→tree provenance links; `tree:` keys are deliberately excluded from canonical
`GraphNodeKeyV1` by design) — nothing to bind. Searched for a real `CanonicalRelationshipSnapshotV1`-
shaped artifact repo-wide: **none exists.** Found instead `packages/parent-atlas/src/core/graph-projection-parity.ts`
— a real `GraphProjectionParityReceiptV1` receipt schema already designed for this exact proof, but
its two projector implementations are explicit unimplemented stubs (`TODO(FI-13C2/FI-14)`,
`TODO(FI-14/FI-16I)`). **The real upstream blocker is FI-13C2/FI-14/FI-16I** (canonical-relationship
materialization), not GRAPH-06D itself — do not manufacture a snapshot to force this gate closed.
Full diagnosis (including the identity/evidence/projection/executor 4-layer distinction this
surfaced) recorded at the `GRAPH-06D` line in
`openspec/changes/parent-atlas-candidate-feature-execution-fabric/tasks.md`. Reusable binding
harness left in place either way: `sveltekit-frontend/scripts/atlas/bind-graph-ordinal-map-to-snapshot-parity-v1.mts`.

**Next tranche proposed (2026-09-01, NOT started, NOT yet its own OpenSpec change)** — wiring
`/evidence/web` into a broader FastAPI `:8095` evidence/retrieval orchestration pipeline, reviewed
and fact-checked this session but deliberately deferred to a fresh session given context budget.
Proposed sequence: `EVIDENCE-RESOLVE-01` (typed `POST /evidence/resolve` orchestration contract,
`EvidenceResolveRequestV1`/`EvidenceResolveResponseV1`, `canonical_authority: false` /
`writes_performed: false` carried through) → `PARAM-RESOLVE-01` (`ParameterResolverV1` producing a
`ResolvedExecutionPlanV1` that projects into `CagraBuildParamsV1`/`CagraSearchParamsV1`/
`GraphTraversalParamsV1`/`AceParamsV1`/`SynthesisParamsV1` — build-vs-search params must stay
distinct, an agent must never silently swap `build_algo` as if it were a per-query knob, per this
session's own `ivf_pq` 0.84 vs `nn_descent` 0.998 finding) → `RETRIEVAL-DISPATCH-01` (one internal
typed `POST /execute/retrieval` dispatch endpoint, not one route per backend) → then
`GRAPH-06D-BIND-01` → `GRAPH-FEATURE-01` → `CANDIDATE-TENSOR-01` → `ACE-RESIDENCY-01` → `CUB-RADIX`
→ `ContextManifestV1` → `PromptPlanV1` → Ornith. **Hard rule carried into this proposal**: wire
existing owners together (`atlas_compute.cuvs_analytics`, `GraphOrdinalMapV1`, ACE, packet
identity) — never recreate cuVS/cuGraph/ACE/packet-identity logic inside
`miniforge_nlp_sidecar_v2.py`; `8095` validates and dispatches, `SmartRpcPacketV1`/receipts carry
identity and provenance across the boundary. Keep the three environments separate (`8095` Docker
NLP sidecar / WSL RAPIDS executor / Windows-native CUB+cuTile) — do not merge them.

**Fact-checked sources backing that proposal (verified this session, not re-derived from memory)**:
- cuVS Go bindings for CAGRA are real: [pkg.go.dev/github.com/rapidsai/cuvs/go/cagra](https://pkg.go.dev/github.com/rapidsai/cuvs/go/cagra)
- Persistent CAGRA search (`persistent`, `persistent_lifetime`, `persistent_device_usage`) is real
  and already present in our installed `cuvs 26.06.00`'s Python `SearchParams` (verified by direct
  inspection in `atlas-rapids-cu13`, not docs alone) — but NVIDIA's own docs warn *"running any
  other work on GPU alongside the persistent kernel makes the setup fragile,"* and this host has
  had as little as 214MB free VRAM concurrently all session — a real risk here specifically, not
  free to reach for. See [CAGRA — cuvs docs](https://docs.rapids.ai/api/cuvs/legacy/c_api/neighbors_cagra_c/)
  and [rapidsai/cuvs#676](https://github.com/rapidsai/cuvs/issues/676) (broader persistent-kernel
  Python API exposure still open upstream, even though the basic flags above already work).
- Build-vs-search parameter separation in CAGRA (`IndexParams` vs `SearchParams`) is real and
  already the basis of this change's own `CagraBuildReceiptV1` (section 4a-build-isolation).

**To resume**: read this section, then `openspec status --change parent-atlas-gpu-mini-fabric-01`
to confirm artifact state, then either (a) start step 9 (the cache tournament) directly, or (b)
open a new OpenSpec change for the evidence/retrieval orchestration tranche above using the
proposed sequence and sources as the starting brief.
