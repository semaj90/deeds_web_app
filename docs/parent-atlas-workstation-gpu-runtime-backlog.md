# Parent Atlas workstation GPU/runtime integration backlog

Updated: 2026-08-14

This backlog is intentionally separate from AST supersession. It does not change GPH-13 through GPH-22 acceptance, and it does not authorize deleting or promoting `ast-extractor.ts`.

## Boundary

```text
Postgres       canonical identity and revisions
Neo4j          structural graph projection
Qdrant         persistent retrieval projection
SearchRuntime  retrieval and fusion owner
8095/8098      compute coprocessor only
Valkey         cache and hot-state projection
```

The GPU sidecar must not own canonical identity, RRF, Qdrant truth, or graph truth.

## Current estimate

**GPU/runtime integration: 58% planned/integrated.** This is a roadmap estimate, not a production gate.

Current read-only runtime check: TRACE MCP `:8788` healthy with Postgres and Redis
dependencies; llama-server `:8090` healthy; the lightweight AST sidecar `:8095`
healthy with treesitter-chunker but without optional GPU packages. No TRACE MCP
tool connector was exposed in this Codex session, so no MCP mutation or promotion
was attempted.

Ownership receipt: `docs/reports/gpu-runtime-ownership-proof.json` and
`docs/reports/gpu-runtime-ownership-proof.md`. The receipt is `PROVEN` for the
control-plane owners and records `RAPIDS_RUNTIME_8098_REACHABLE: false` separately.

| Area | Status | Estimate | Evidence / limitation |
| --- | --- | ---: | --- |
| CUDA/RTX host capability | present | 75% | CUDA/RTX launch and Docker definitions remain |
| PyTorch/LibTorch | partial | 60% | Source and native bridge owners remain; active 8095 container does not install PyTorch |
| cuVS exact oracle | partial | 55% | Dedicated RAPIDS code and exact-KNN contract remain; fresh current-session proof is separate |
| CAGRA | quarantined | 25% | Code exists, but production use is prohibited until explicit architecture revision and recall proof |
| cuGraph | partial | 45% | RAPIDS sidecar support exists; not part of the 8095 AST image |
| CuPy/RMM | deferred | 25% | Capability hooks/source remain; no promotion without measured need |
| TensorRT | partial | 40% | Docker/native bridge sources remain; build/backend execution proof is incomplete |
| Valkey/Redis | proven foundation | 90% | Auth, hot-vector index, and rule seed are proven; revision-safe invalidation remains |
| Arrow/mmap snapshots | experimental | 30% | Architecture candidate; no production promotion |
| simdjson | benchmark-gated | 25% | Candidate performance backend only |
| Multi-threaded extraction | not started | 15% | Must preserve deterministic ordering and receipts |
| Python 3.14/free-threading | deferred | 10% | Do not migrate RAPIDS/PyTorch environment before extension compatibility proof |

## Ordered backlog

### P0 — correctness before optimization

- [ ] GPU-01 Confirm AST owner sequence: `CHUNK0 → GPH-13 → GPH-14 → GPH-15 → GPH-16 → LX0`.
- [x] GPU-02 Record a runtime ownership receipt distinguishing the active 8095 AST container from the dedicated RAPIDS/cuVS runtime (`scripts/atlas/prove-gpu-runtime-ownership.mjs`).
- [x] GPU-03 Prove the `semantic_768` contract read-only: Qdrant `content/error/signature` named vectors are 768-d cosine, chat is llama-server `:8090`, and embeddings are Ollama `:11434` (`docs/reports/semantic-768-contract-proof.{json,md}`). GPU experiments remain outside canonical identity and RRF.
- [ ] GPU-04 Preserve BM42 as `DEGRADED/NOT_RUN` until a sparse collection exists.

### P1 — reproducible workstation runtime

- [ ] GPU-05 Encode the GPU environment reproducibly in Docker/Conda rather than installing packages into a running container.
- [ ] GPU-06 Prove CUDA, PyTorch, and CuPy imports plus a real tensor operation on the intended GPU runtime.
- [ ] GPU-07 Prove Valkey health, cache ownership, revision-safe invalidation, and readback receipts.
- [ ] GPU-08 Record package versions, CUDA version, device identity, image/environment digest, and endpoint ownership.

### P2 — GPU retrieval and graph compute

- [x] GPU-09 Prove cuVS exact `semantic_768` KNN against the CPU/PyTorch oracle. Live fixture proof passed on 2026-08-14 through `127.0.0.1:8098` with cuVS `26.06.00`, RTX 3060 Ti, stable identity-qualified ordering across three runs. See `docs/reports/gpu-knn-exact-runtime-proof.{json,md}`.
- [ ] GPU-09A Freeze the exact metric contract before scale comparisons: `semantic_768`, float32, cosine, explicit L2-normalization policy, higher-is-better score direction, and workspace/source/ordinal-map revisions. Tied distances must use a deterministic secondary identity order.
- [ ] GPU-10 Prove Arrow/mmap immutable snapshot transport only if profiling shows a copy/serialization bottleneck.
- [ ] GPU-11 Evaluate CAGRA recall/latency against the exact oracle; tiny live fixture passed Recall@3 = 1.0 with identity parity, but larger-corpus recall and production performance remain open. Keep production disabled until separately approved. See `docs/reports/gpu-knn-cagra-runtime-proof.{json,md}`.
- [ ] GPU-11A Run CAGRA evaluation progressively on frozen 10K, 50K, and current-corpus snapshots. Record Recall@5/@10/@50, top-1 agreement, distance error, p50/p95 latency, build time, VRAM, filter parity, revision parity, and fallback behavior. Defer nDCG until relevance labels exist; the three-row proof is transport evidence only, not ANN-quality proof.
- [ ] GPU-12 Prove cuGraph CPU/GPU parity on the same graph revision.
- [ ] GPU-13 Reconcile RF6/EV1 promotion gates before any GPU result influences ranking.
- [ ] GPU-14 Promote CAGRA only after explicit architecture revision, identity parity, recall, latency, and rollback proofs.

### CAGRA semantic_768 parity gate

The canonical Qdrant `codebase_chunks_768` contract uses cosine distance. The
cuVS exact oracle and CAGRA comparison must therefore use the same
`semantic_768`/`content` representation, float32 data, cosine metric, explicit
normalization policy, and deterministic tie-breaking. The earlier toy
sqeuclidean fixture is runtime evidence only and is not semantic retrieval
parity evidence.

- [ ] **CAGRA-00** Runtime/import/device proof: installed, reachable, RTX and cuVS detected.
- [ ] **CAGRA-01** Snapshot contract: workspace/source/representation/ordinal-map revisions, checksum, 768 dimensions, float32, cosine, and `content` vector slot.
- [ ] **CAGRA-02** 10K real Parent Atlas rows: exact cuVS versus CAGRA Recall@5/@10/@50, identity parity, and latency.
- [ ] **CAGRA-03** 50K real Parent Atlas rows: repeat the same proof.
- [ ] **CAGRA-04** Full frozen semantic snapshot: recall, latency, build cost, resident index size, and peak VRAM.
- [ ] **CAGRA-05** SearchFilter to ordinal bitset parity: zero false positives, empty-set behavior, and revision match.
- [ ] **CAGRA-06** VRAM arbitration and failover: use the existing memory-pressure owner; fall back to Qdrant when headroom is insufficient.
- [ ] **CAGRA-07** Qdrant-versus-CAGRA executor comparison on the same queries; neither executor adds a second semantic-lane vote.
- [ ] **CAGRA-08** Production eligibility decision; remains `false` until all preceding gates and rollback evidence pass.

Required identity checks for every scale:

```text
ordinal_map_revision_match = PASS
packet_key_parity = PASS
symbol_version_id_parity = PASS where present
source_revision_parity = PASS
unknown_ordinals = 0
duplicate_canonical_ids = 0
```

### Current GPU-KNN gate state — 2026-08-14

- `GPU-KNN-01` 8098 health/capabilities: **PASS**.
- `GPU-KNN-02` exact `semantic_768`: **PASS_ON_LIVE_FIXTURE**.
- `GPU-KNN-03` CAGRA request: **PROHIBITED_BY_OPENSPEC**; capability metadata is contradictory and is not accepted as proof.
- `GPU-KNN-03` CAGRA build/search: **PASS_ON_TINY_FIXTURE**; production remains quarantined.
- `GPU-KNN-04` packet/revision identity: **PASS_ON_LIVE_FIXTURE**.
- `GPU-KNN-05` exact-vs-CAGRA Recall@3: **1.0_ON_TINY_FIXTURE**; larger-corpus evaluation remains open.
- `GPU-KNN-07` latency measurement: **PASS_ON_TINY_FIXTURE**; graph-build-per-request latency is not a production benchmark.

The sidecar now reports CAGRA on separate axes: `available=true`,
`authorized_for_experiment=true`, `proof_status=RUNTIME_PROVEN_ON_TINY_FIXTURE`,
and `production_status=QUARANTINED`. Importability/capability is therefore not
treated as production authorization.

Graph expansion remains a separate bounded evidence gate: seed cap, explicit
depth, per-seed neighbor limit, canonical visited dedupe, final candidate cap,
and fail-open behavior. It is not a second fusion owner or a custom replacement
for CAGRA/HNSW graph ANN.
- `GPU-KNN-06` extra RRF vote: **DESIGN_GUARD_PASS**; executor choice remains inside one semantic lane.

The exact proof did not modify Qdrant, Valkey, Neo4j, RRF, or canonical data.

Current bounded implementation note: `atlas-rapids-knn-client.ts` targets the
existing RAPIDS sidecar endpoints `/v1/knn/exact` and `/v1/knn/cagra`. It accepts
only `semantic_768`/768-dimensional vectors and requires `(packetKey,
sourceRevision)` identity for every corpus row. This is a dense executor seam,
not a new Qdrant writer, RRF lane, PageRank ranker, or Valkey vector owner.

### P3 — optimization experiments

- [ ] GPU-15 Audit and consolidate TensorRT/LibTorch ownership; prove the active backend rather than relying on historical names.
- [ ] GPU-16 Benchmark multi-threaded repository extraction; require deterministic sorted output and bounded memory.
- [ ] GPU-17 Run `PERF0` for JSON parsing before considering simdjson/Sonic.
- [ ] GPU-18 Test Python 3.14 compatibility in a separate environment.
- [ ] GPU-19 Test Python 3.14 free-threaded mode only after PyTorch/RAPIDS/CuPy extension compatibility is proven.
- [ ] GPU-20 Add RMM only after measured allocator pressure or fragmentation justifies it.

### P1/P2 hardening gates added after the semantic contract review

These gates are required before GPU retrieval becomes a production compute
plane. They do not change canonical identity, RRF, Qdrant ownership, or the
AST supersession gates.

- [ ] GPU-21 Prove filter-semantics parity: the same `SearchFilter` and revision
  mask produce zero false positives between the exact/Qdrant oracle and a
  future cuVS/CAGRA bitset search.
- [ ] GPU-22 Prove atomic index revision swaps: build and validate an off-path
  index, then switch `active_revision` atomically; serialized indexes remain
  rebuildable cache artifacts, never canonical truth.
- [ ] GPU-23 Record CUDA resource/stream ownership and synchronization
  boundaries for retrieval, graph, transfer, and inference work.
- [ ] GPU-24 Add one VRAM arbitration policy using the existing memory-pressure
  owner; fall back to Qdrant/CPU/Neo4j when generation or retrieval headroom is
  insufficient.
- [ ] GPU-25 Benchmark host-to-device transfer variants: JSON/HTTP baseline,
  Arrow/mmap CPU load, ordinary H2D, and pinned `non_blocking` H2D.
- [ ] GPU-26 Prove metric equivalence for `semantic_768`: float32, cosine
  normalization, score direction, CPU exact, cuVS exact, Qdrant `content`, and
  future CAGRA.
- [ ] GPU-27 Define typed GPU degradation reasons and safe fallbacks for OOM,
  device loss, timeout, stale index, stale filter, and checksum mismatch.
- [ ] GPU-28 Prove the NVIDIA container boundary: host driver, NVIDIA
  Container Toolkit, requested device, image digest, and in-container `nvidia-smi`.
- [ ] GPU-29 Prove TensorRT lifecycle state: engine/model hash, version,
  compute capability, dynamic-shape profile, warmup, cache, and bounded memory.
- [ ] GPU-30 Produce a separate Python 3.14 extension-compatibility receipt;
  do not migrate the RAPIDS/PyTorch environment until extensions are proven.
- [ ] GPU-31 Add accelerator observability: request/fallback/error rates,
  latency percentiles, transfer/kernel timings, memory deltas, revision/filter
  identity, and exact-overlap/recall samples.
- [ ] GPU-32 Prove Valkey cache disappearance behavior: expiry, eviction, cache
  miss, Valkey-down fail-open, revision mismatch, and canonical reconstruction.

### Adjacent workstation lanes (deferred, separate ownership)

- [ ] ACE-RLM-01 Freeze `RLMEnvironment` with query, filters, packet/source
  identity, graph/process inspection, recursion depth, budgets, and revision.
- [ ] ACE-RLM-02 Expose SearchRuntime as the only retrieval/fusion tool; RLM
  may decompose and request evidence but must not implement a second RRF.
- [ ] ACE-RLM-03 Add bounded packet, source-span, graph-neighborhood, and
  process inspection tools with explicit read-only receipts.
- [ ] ACE-RLM-04 Enforce recursion, token, latency, and subcall budgets.
- [ ] ACE-RLM-05 Compile the final RLM state into the canonical ContextManifest.
- [ ] ACE-RLM-06 Persist `RLMTrace → ContextManifest → ExecutionReceipt`
  linkage without making RLM state canonical evidence.
- [ ] ACE-RLM-07 Add ACE Generator/Reflector inputs from successful and failed
  execution receipts.
- [ ] ACE-RLM-08 Persist Curator-approved playbook deltas to Postgres; Valkey
  stores only the hot copy.
- [ ] BF-01 Use revision-qualified BitFrost keys for packet, card, manifest,
  symbol, graph, retrieval, and ACE namespaces.
- [ ] BF-02 Prove Valkey `CLIENT TRACKING` invalidation for exact keys and
  approved prefixes; keyspace notifications remain telemetry only.
- [ ] BF-03 Add optional process-local L0 cache invalidation from Valkey.
- [ ] BF-04 Add short-lived negative eligibility caches that fail open.
- [ ] BF-05 Cache CAGRA filter material only by `indexRevision` and `filterHash`.
- [ ] BF-06 Prove cache miss, expiry, eviction, revision mismatch, and Valkey
  outage reconstruct from canonical sources.
- [ ] SIMD-01 Measure PERF0 for current JSON/JSONL parsing before adding C++.
- [ ] SIMD-02 Prototype C simdjson On-Demand only under the receipt/JSONL
  boundary; retain Zod/Pydantic as semantic validation authorities.
- [ ] SIMD-03 Benchmark `iterate_many` for Graphify, execution, RLM, and ACE
  receipt streams with one parser per worker/thread.
- [ ] SIMD-04 Promote only if the measured threshold is crossed and preserve a
  JSON-compatible fallback.

Official references reviewed for these gates:

- cuVS filtering/CAGRA bitsets: https://docs.rapids.ai/api/cuvs/stable/filtering/
- PyTorch pinned/non-blocking transfers: https://docs.pytorch.org/tutorials/intermediate/pinmem_nonblock.html
- Valkey client tracking: https://valkey.io/topics/client-side-caching/
- TensorRT memory/error isolation: https://docs.nvidia.com/deeplearning/tensorrt/latest/architecture/how-trt-works.html
- simdjson `iterate_many`: https://simdjson.github.io/simdjson/classsimdjson_1_1_s_i_m_d_J_S_O_N___I_M_P_L_E_M_E_N_T_A_T_I_O_N_1_1ondemand_1_1parser.html

## Do not mix into AST supersession

These remain outside GPH acceptance:

- PyTorch/CUDA package installation
- cuVS/CAGRA/cuGraph promotion
- TensorRT or LibTorch consolidation
- Python 3.14/free-threading
- simdjson or multithreading
- Arrow/mmap transport
- Valkey cache policy expansion

The AST lane can prove structural evidence while this backlog remains deferred.

## Safe next task

Complete GPH-13 AST parity first. In parallel, the first GPU backlog task is GPU-02: produce an ownership/runtime receipt without rebuilding or mutating the active GPU environment.
