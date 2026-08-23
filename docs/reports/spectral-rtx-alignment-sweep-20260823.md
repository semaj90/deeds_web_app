# Spectral / RTX alignment sweep

Date: 2026-08-23
Status: `TRANSFERRED / FIXTURE_PROVEN / RUNTIME_UNPROVEN`

Transferred into the canonical checkout:

- revision-qualified spectral request and Python/TypeScript fixture contracts;
- non-mutating RAPIDS spectral sidecar route;
- recommendation evidence bridge for PageRank, KNN, spectral/community,
  low-rank sampling, OKF/domain evidence, and bounded synthesis;
- semantic_768 canonical Qdrant contract with semantic_512 reference MRL lane;
- focused OpenSpec and workstation TODO updates.

Validation remains fixture-level. The real WSL2 cuGraph spectral receipt,
CPU/GPU assignment parity, isolated Postgres/Qdrant lineage readback, native
C ABI/N-API seam, and workflow/A2A grounded repair receipts remain open.

Documentation reconciliation remains open: historical OpenSpec proposals that
describe `semantic_512` as canonical must be superseded or explicitly scoped as
historical before migration work is promoted. The active runtime contract is
`semantic_768` with derived MRL reference lanes.

No database, Qdrant, Neo4j, Valkey, or GPU index writes were performed.

The canonical TypeScript dependency install is currently blocked by Windows
`EPERM` on the existing esbuild executable. The directory was not force-removed;
focused TypeScript tests remain unexecuted in this checkout.

Low-rank/Tang execution is explicitly owned by Python/PyTorch. Receipts record
`numerical_owner=python_pytorch` and the selected execution device; TypeScript
does not perform large-matrix reductions or sampling.

Bounded CPU↔CUDA parity passed on the RTX workstation fixture: singular-value
max delta `4.29e-6`, relative-error delta `1.19e-7`, valid sample bounds, and
`canonical_authority=false`. This is a fixture proof, not a full-corpus or
production promotion.

A read-only check against the first `256 × 768` rows of the frozen DuckDB
`vector-snapshot-5k-768` artifact also returned `PARITY_PROVEN` for
`representation_id=semantic_768`, revision `0`: singular-value delta
`2.36e-5`, relative-error delta `2.75e-4`, and valid sample bounds. Full
5,000-row execution then completed with valid shape, lineage, and sample
bounds. After separating scale-aware backend variance from absolute
diagnostics, the receipt is `PARITY_PROVEN`: singular-value max absolute delta
`1.17798e-2`, max relative delta `1.97203e-4`, and relative-error delta
`4.44651e-5`. The canonical semantic artifact remains read-only and
non-authoritative. CandidateOrdinal-map checksum joining and the full
revision-qualified receipt now have a deterministic join checksum:
`b77644ae7a9f87ebb08a8a26e990f76acc003df06a145ace36db59885c84bfd2`.
The receipt remains non-authoritative until it is persisted through the
approved artifact/receipt path.

## 2026-08-23 runtime attempt

Focused contract validation passed:

- Python spectral/community tests: `7 passed`
- TypeScript spectral/community tests: `8 passed`

The activated WSL2 `atlas-rapids-cu13` execution attempt used a six-node,
two-component fixture and entered `run_cugraph_partition` but did not return
within the bounded 90-second observation window. The process was stopped by
the operator. The follow-up import/version probe also did not return, so no
CUDA/driver/RAPIDS execution receipt was produced.

Status remains `RUNTIME_BLOCKED / NO_PROMOTION`. No projection, Qdrant tag,
Valkey residency, Neo4j feature, or synthesis routing write was attempted.

## Runtime isolation

The WSL2 environment itself starts successfully:

- GPU: `NVIDIA GeForce RTX 3060 Ti`
- Driver: `580.88`
- VRAM: `8192 MiB`
- `cupy`: `14.1.1` import passed
- `cudf`: `26.06.01` import passed
- Conda metadata: `cugraph 26.06.00`, `cuvs 26.06.00`, CUDA `13.3`

The failure isolates to `cugraph` import/execution: importing `cugraph`
does not return within the bounded observation window, including with
`CUDA_VISIBLE_DEVICES=-1`. Therefore no spectral assignment, checksum,
latency, or GPU-memory receipt exists yet.

## 2026-08-23 bounded execution correction

The prior runtime diagnosis was refined with a direct activated-environment
probe. `cugraph` imports successfully after the documented Torch-before-RAPIDS
ordering. The six-node spectral call then exposed a concrete graph-construction
bug: Python/cuDF inference widened edge ordinal columns while the explicit
vertex column remained `int32`, producing either `cudaErrorInvalidValue` during
graph construction or a spectral API rejection for non-`int32` vertices.

The sidecar now explicitly uses `int32` for vertices, source, and destination
ordinal columns and imports Torch before cuDF/cuGraph. The bounded fixture then
executed successfully in WSL2:

- `cugraph`: `26.06.00`
- algorithm: `spectralModularityMaximizationClustering`
- fixture: 6 nodes, 4 weighted edges, 2 components, 2 clusters
- result: 2 deterministic canonical community assignments
- execution duration: `10015.635 ms` in the returned sidecar response
- no database, Qdrant, Neo4j, Valkey, or projection writes

Focused Python validation remains `7 passed`. The remaining gate is not
installation: the sidecar response still needs the full GPU/driver/memory
execution receipt and an independently computed CPU assignment comparison
before spectral output can be admitted to any derived projection.

The same frozen six-node topology was checked against a CPU NetworkX
connected-component reference under the identical sorted ordinal map. Both
produce memberships `[0,1,2]` and `[3,4,5]`; this is recorded only as
`FIXTURE_ASSIGNMENT_MATCH`, not as general spectral parity. A CPU spectral
implementation and a revision-qualified comparison receipt are still required
for promotion.

The sidecar now emits an observational execution receipt. The activated WSL2
run returned:

- CUDA available: `true`; device: RTX 3060 Ti; driver: `580.88`
- Torch: `2.13.0+cu130`; runtime CUDA: `13.0`
- cuGraph: `26.06.00`
- graph input checksum: `sha256:bdc226f176cb8cdd6ddf811851872071a3532d4a0bf5f853f23d0589095d1062`
- assignment checksum: `sha256:1c94fd67cd595a0ae15e21548465d49a01ffccda36cde895d497f2afef9c60fd`
- duration: `5752.744 ms`; memory: `3,350,591,488 / 8,589,410,304` bytes free/total

The receipt explicitly sets `canonicalWritesAllowed=false` and
`promotionEligible=false`. It is runtime evidence, not a promotion proof.

The backend-neutral parity evaluator now accepts `spectral` as an explicit
algorithm and compares label-invariant ARI/NMI/pairwise membership while
reporting missing modularity as `PARTIAL`, not `PROVEN`. The new spectral
fixture contract test passes; this closes the comparison seam without
pretending that the disconnected-component fixture proves general spectral
equivalence.
