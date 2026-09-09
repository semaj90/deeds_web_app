# Parent Atlas Adaptive Execution Fabric — Review and Next Steps

Date: 2026-09-08
Status: REVIEWED / STATIC-SMOKE-ADDED / LIVE-ADMISSION-OPEN
Branch: `agent/adaptive-fabric-smoke-20260908`

## Decision

Keep PostgreSQL as canonical truth. Treat every graph/vector/neural/browser/cache/GPU representation as a revision-qualified projection or executor over canonical packet identity.

Current identity invariant:

- `packet_id`: canonical UUID identity.
- `packet_ulid`: sortable workflow/lineage field only.
- `packet_key`: deterministic duplicate/content guard.
- `title_id`: semantic grouping/retrieval field, never identity.
- GPU ordinals, HNSW/CAGRA node ids, Arrow rows, cache slots and `.okf` section offsets: snapshot-local coordinates only.

Do not introduce UUIDv8 feature semantics or promote ULID/title/ordinal/cache ids into canonical packet identity.

## What is already present / wired

### Canonical / orchestration

- Parent Atlas consolidated package and runtime registry.
- Existing OKF agentic planning smoke through candidate ordinals, ACE manifest, parameter artifact, BitFrost key material and Ornith request metadata.
- LangGraph DAG runtime surface.
- OpenSpec adaptive-DAG design family.

### Retrieval

- Go retrieval service + facade + smoke tooling.
- TurboVec gRPC contract/client/integration evidence.
- Qdrant semantic retrieval.
- cuVS exact/CAGRA sidecar surfaces.
- simdjson N-API/typed-evidence bridge.

### Graph

- NetworkX CPU reference/oracle paths.
- nx-cugraph/cuGraph parity probes.
- RAPIDS cuGraph runtime evidence.
- Neo4j projection/persistence surfaces.
- WebGPU PageRank with browser CPU fallback.

### Neural / policy

- `NeuralExecutionPolicy` with explicit executor semantics.
- GPU GNN candidate (`PYTORCH_CUDA_GNN`).
- cuGraph structural approximation.
- Boost Graph CPU structural fallback.
- NetworkX reference fallback.
- QLoRA dataset/training gates exist, but training remains separately admitted.

### Residency / memory

- Engram session-memory coordination.
- ACE/BitFrost/Valkey cache paths and tracking proof.
- LOD/residency design surfaces.

### cuTile

- cuTile 1.5.0 is proven in separate WSL2 `atlas-cutile-cu132` environment on RTX 3060 Ti / sm_86.
- SIMT and cuTile smoke execution are proven there.
- This is deliberately separate from the RAPIDS environment and remains a challenger/executor lane, not canonical authority.

## Open gates found by review

### GATE A — Same-model CPU GNN fallback

Current `GNN_MESSAGE_PASSING` policy has:

1. `PYTORCH_CUDA_GNN` — learned GPU path.
2. `CUGRAPH_GPU` — structural approximation, not the same GNN.
3. `BOOST_GRAPH_CPU` — structural approximation.
4. `NETWORKX_REFERENCE` — reference only.

Missing: `PYTORCH_CPU_GNN` (or equivalent) using the same weights/operator graph as the CUDA GNN.

Do not claim cuGraph/Boost/NetworkX as numerical GNN fallbacks.

### GATE B — Full local adaptive-DAG action catalog

The OpenSpec audit confirms the local-evidence action catalog is not yet implemented as one code contract. Required action vocabulary should cover at least:

- `FETCH_POSTGRES`
- `FETCH_QDRANT`
- `FETCH_FILE`
- `AST_SCAN`
- `SIMDJSON_SCAN`
- `GRAPH_EXPAND`
- `WEB_SEARCH`
- `RERANK`
- `BUILD_CONTEXT`
- `SYNTHESIZE`

Do not wire the parked `atlas/research/*` experiment as a new production owner. Reuse the actually-live retrieval/search owners.

### GATE C — CandidateFeatureMatrix shared ordinal/revision set

Freeze one `CandidateFeatureMatrixV1` input ABI before adaptive analytics/prefetch:

```text
request_id
workspace_revision
graph_revision
feature_revision
representation_revision
candidate_ordinal uint32
packet_id UUID (side-map / identity join)
packet_key
source_ref
source_revision
title_id
domain_id
semantic_score
lexical_score
graph_score
pagerank
recency
frequency
breadth
utility
cache_hit_probability
estimated_reload_cost
estimated_vram_bytes
```

The matrix is derived. Identity joins back through canonical packet fields.

### GATE D — Parameter artifact ownership

Every DAG operator must receive a revisioned, checksum-sealed parameter artifact rather than arbitrary mutable dictionaries.

Suggested `DagParameterArtifactV1`:

```text
schema
operator_id
operator_kind
request_id
input_revision_set
parameter_revision
parameter_checksum
payload_ref
payload_codec
payload_length
canonical_authority=false
```

### GATE E — Context/prefill stitching

Freeze the exact helper chain:

```text
classify
→ retrieve
→ expand
→ score
→ paginate/top-k
→ exact-promote
→ fetch evidence
→ stitch/concatenate
→ ContextManifestV1
→ PromptPlanV1
→ model request
→ decode/tool loop
→ validator
→ receipt
```

No helper may silently drop `source_ref`, `source_revision`, `workspace_revision`, `packet_id/packet_key`, or evidence refs.

## Fallback ladders

### Graph analytics

```text
cuGraph / nx-cugraph GPU
→ Boost Graph CPU where an equivalent algorithm exists
→ NetworkX CPU reference
```

Graph analytics are not learned GNN inference.

### Learned GNN

```text
PyTorch CUDA GNN
→ PyTorch CPU same-model GNN   [OPEN]
→ structural approximation only when caller explicitly allows degraded semantics
```

### Semantic retrieval

Keep lane and executor separate:

```text
logical semantic lane
  exact oracle: cuVS brute-force / CPU exact reference
  production ANN: admitted Qdrant/candidate executor
  GPU ANN: CAGRA when capability/residency permits
  TurboVec: challenger/routing/rerank according to current contract
```

Never let multiple executors inflate RRF votes for the same logical lane.

### Graph expansion

```text
bounded exact adjacency / Postgres/graph snapshot
→ cuGraph acceleration
→ NetworkX/Boost CPU
→ WebGPU only for browser-local visualization/compute, not server authority
```

### JSON/NDJSON parsing

```text
simdjson typed evidence path when native bridge is admitted
→ normal typed JSON parser fallback
```

### Browser GPU

```text
WebGPU/WGSL
→ CPU JS
```

WebGPU is a browser execution lane, not a fallback for WSL CUDA server kernels.

## Adaptive expansion policy

Start from paginated Top-K rather than unrestricted graph traversal.

Recommended first pass:

```text
retrieve K=50
→ domain/title classify
→ one vote per logical retrieval lane
→ rank
→ retain top 10
→ expand each top candidate with bounded graph budget
→ rerank/promote exact evidence
→ stop when coverage threshold or token budget is met
```

`top10` is a presentation/promotion frontier, not a hard retrieval corpus size.

Graph expansion parameters should be explicit:

```text
max_depth
max_nodes
max_edges
allowed_edge_types
per_seed_fanout
min_score
coverage_target
cost_budget
```

## Prefetch / residency policy

Engram and ACE supply reusable history/features; BitFrost executes hot-object residency. Neither becomes truth.

Use an explicit recommendation score such as:

```text
prefetch_value =
  predicted_reuse_probability
  * expected_utility
  * miss_penalty
  * current_dag_frontier_relevance
  / max(byte_cost * contention_penalty, epsilon)
```

Inputs may include PageRank, recency/frequency/breadth, title/domain affinity, previous task transitions, graph-neighbor overlap, and measured reload latency.

Initial tournament:

1. LRU baseline.
2. Graph-neighbor prefetch.
3. Learned/low-rank recommendation.
4. Optional SOM/KMeans heuristic.

Do not promote tricubic interpolation, Ewin Tang/low-rank, SOM/KMeans or learned policy until it beats deterministic baselines on replay.

## Compression / low-rank / interpolation

- PCA/SVD/low-rank coordinates: derived routing/recommendation features only until exact-recall lift is proven.
- Ewin Tang-inspired approximation: shadow/challenger lane only.
- Tricubic interpolation: appropriate for smooth spatial/LOD feature fields or visualization; do not use it as a generic replacement for graph/retrieval semantics.
- QLoRA: training/adaptation plane only. QLoRA weights are model artifacts, not packet features or retrieval identity.

## RPC boundary

Use gRPC where a long-lived typed sidecar owns expensive resident state or high-rate binary/tensor traffic (TurboVec/cuVS/neural sidecars). Keep FastAPI/HTTP for health, inspection, low-rate orchestration and debugging.

Do not introduce a second RPC stack for a capability already owned by an existing service unless benchmark evidence requires it.

Suggested common sidecar envelope:

```text
request_id
workspace_revision
representation_revision
model_revision
input_checksum
parameter_checksum
payload_descriptor
trace_id
```

## Subhelper registry to define next

Each helper gets a stable `helper_id`, typed input/output schema, revision, checksum behavior, authority flag and fallback semantics.

Minimum registry:

```text
classify_domain
classify_title
fetch_postgres
fetch_qdrant
fetch_file
scan_ast
scan_simdjson
expand_graph
retrieve_semantic
retrieve_lexical
rerank_candidates
paginate_candidates
select_topk
compute_pagerank_features
compute_low_rank_features
recommend_prefetch
promote_exact_evidence
fetch_artifact
stitch_evidence
concatenate_prompt_segments
build_context_manifest
build_prompt_plan
prepare_prefill
invoke_ornith
parse_decode_step
execute_tool_action
validate_patch
emit_execution_receipt
```

Helpers must never return anonymous positional arrays when identity-bearing records are available. Use candidate ordinals only within one revision-qualified snapshot and carry the identity join map.

## Smoke validation added

`scripts/atlas/smoke-adaptive-execution-fabric-v1.mjs`

Static/read-only responsibilities:

- required source surfaces exist;
- identity-role separation is documented;
- fabric lanes exist;
- neural GNN fallback semantics are truthful;
- WebGPU boundary is explicit;
- cuTile receipt proves sm_86 challenger execution without authority/writes;
- stale cross-environment cuTile capability documentation is surfaced as a warning;
- existing OKF planning proof remains non-executing/non-writing;
- open DAG/GNN gates are reported rather than silently treated as complete.

Expected state before closing GATE A/B:

`PASSED_STATIC_ALIGNMENT_WITH_OPEN_GATES`

## Ordered implementation plan

1. **Run static smoke locally** and preserve its JSON output as a receipt.
2. **Add same-model CPU GNN executor** and a tiny deterministic CPU/CUDA parity fixture; do not involve production graph writes.
3. **Implement the local adaptive-DAG action vocabulary** against existing owners rather than creating new retrieval systems.
4. **Freeze `CandidateFeatureMatrixV1`** with one ordinal/revision set and identity side-map.
5. **Freeze `DagParameterArtifactV1`** and helper registry; require parameter checksums.
6. **Trace all existing retrieval helper callers** into the action vocabulary: Postgres, Qdrant, file, AST, simdjson, graph, web, rerank.
7. **Build bounded Top-K → top-10 → graph-expansion replay** with NetworkX/CPU oracle first.
8. **Run cuGraph GPU parity** on the exact same frozen graph snapshot.
9. **Run cuVS exact/CAGRA retrieval parity/recall** over the exact same candidate snapshot.
10. **Add residency replay**: LRU vs graph-neighbor vs learned/low-rank recommendation; no live cache mutation initially.
11. **Add cuTile/SIMT packed-feature benchmark** in the isolated cuTile venv; consume the same `CandidateFeatureMatrixV1` data, not a separate schema.
12. **Stitch ContextManifest/PromptPlan** from exact-promoted evidence and prove checksum determinism.
13. **Run Ornith 1.5 read-only synthesis/tool-shape smoke** against the resulting PromptPlan.
14. **Add agentic error-fixing dry workflow**: propose patch → compiler/tests → receipt, without auto-apply.
15. **Only after replay parity/lift gates pass**, allow selected ACE/BitFrost prefetch and adaptive execution decisions to become live.

## Live admission receipt target

`ATLAS-ADAPTIVE-EXECUTION-FABRIC-01`

Required fields:

```text
workspace_revision
candidate_snapshot_checksum
graph_snapshot_checksum
feature_matrix_checksum
parameter_artifact_checksums[]
executors_attempted[]
executors_selected[]
fallbacks_taken[]
retrieval_topk_overlap
pagerank_topk_overlap
gnn_cpu_cuda_max_error
context_manifest_checksum
prompt_plan_checksum
cache_mutations=false
model_writes=false
source_writes=false
```

Success means the same canonical/revision-qualified inputs survive CPU/GPU/fallback execution and converge into one deterministic context/prompt plan. It does not mean every challenger is promoted to production.
