# Parent Atlas GPU runtime ABI alignment

- [x] Define one Zod receipt for GPU, CUDA, framework, Node N-API, LibTorch,
  cuTile, shared-memory, and checkpointing identity.
- [x] Keep Node N-API stability separate from LibTorch ABI stability.
- [x] Require real-target execution and numerical parity before promotion.
- [x] Keep canonical authority permanently false for this receipt.
- [ ] Implement and compile the native C ABI/N-API spectral/GEMM bridge.
- [ ] Capture a real RTX 3060 Ti cuTile or LibTorch receipt.
- [ ] Prove CPU/GPU spectral parity using the same frozen ordinal map.

## Web-verification corrections — 2026-08-23

An external-docs verification pass over this tranche's ABI/cuTile
assumptions found the following corrections. These refine (not replace) the
four checked items above.

- **PyTorch 2.6 is NOT the right "stable LibTorch ABI" threshold.** PyTorch
  2.8 introduced the *limited* stable LibTorch ABI surface for third-party
  C++/CUDA extensions — it only applies when the extension stays within that
  stable subset (the `torch/csrc/stable` headers and stable C shim surfaces;
  ordinary `at::Tensor` usage is outside the promise). PyTorch 2.10 is the
  current recommended stable-ABI extension path with version-targeting
  compatibility machinery. Freeze the receipt's `LibTorchAbiMode` enum as
  `VERSION_PINNED` (build against an exact LibTorch revision, rebuild when
  needed) vs. `LIMITED_STABLE_ABI` (PyTorch 2.8+ stable subset only) — do
  not collapse these into a single "stable" boolean.
- **Node-API (N-API) ABI stability is only the Node-facing boundary.** It
  does NOT make LibTorch, CUDA, or any other linked native library
  transitively ABI stable — Node's own docs call this out explicitly. A
  valid, permitted receipt combination is
  `NodeApi.nodeAbiStable=true, LibTorch.mode='VERSION_PINNED',
  externalLibraryAbiStable=false` — Node can load the same N-API addon
  across Node releases while the native binary still needs a rebuild for
  each LibTorch revision. Do not let a Node-API-stable claim imply
  LibTorch-stable.
- **cuTile on RTX 3060 Ti (SM86) targets cuTile 1.2 + CUDA Toolkit 13.2**
  (the Ampere/Ada support path NVIDIA's 1.2 release notes introduced) — this
  is NOT implied by the current CUDA 13.0 RAPIDS import proof, which is a
  different toolkit-version lane. Any cuTile SM86 receipt must record its
  own `systemToolkitVersion`/`compilerToolkitVersion` distinct from whatever
  RAPIDS reports.
- **Shared memory is a kernel-launch resource, not an ABI concern.** It has
  nothing to do with C/C++/Node ABI stability. Record it in the performance
  receipt (`KernelPerfReceiptV1`: `sharedMemoryBytes`, `registersPerThread`,
  `workspaceBytes`, launch shape, latency, peak VRAM — this contract already
  exists per the hardware-specialization work) — not in this ABI receipt.
- **Checkpointing (recomputation/memory policy) is explicitly NOT ABI
  policy** — keep it a separate field/decision. For the bounded
  CandidateFeature GEMM work, default it off; only enable if a larger
  PyTorch training workload proves recomputation savings justify the added
  latency.
- **RAPIDS/CUDA version receipt fields must not collapse into one ambiguous
  `cudaVersion`.** RAPIDS 26.06 officially supports CUDA Toolkit 13.0–13.2
  (580-family driver); RAPIDS 26.08 expanded that to 13.0–13.3. The
  installed system `nvcc` version does not necessarily equal the CUDA
  runtime each loaded library actually uses. Any GPU runtime receipt
  (spectral or otherwise) must record, separately and measured (not
  inferred): `driverVersion`, `gpuName`, `computeCapability`,
  `systemNvccVersion`, `cudfVersion`, `cugraphVersion`, `cuvsVersion`,
  `cupyVersion`, `cupyRuntimeVersion`, `torchVersion`,
  `torchCudaRuntimeVersion`, `loadedCudaRuntimeVersion`,
  `loadedCuBlasVersion`, `loadedCuSolverVersion`, `loadedCuSparseVersion`.
  This lets a receipt truthfully say e.g. "system nvcc 13.3, RAPIDS 26.06
  (RAPIDS-supported range 13.0–13.2), loaded runtime measured at 13.0,
  driver 580.88" instead of incorrectly concluding the installed `nvcc`
  version defines what every loaded Python library actually runs against.

### Frozen priority order (do not reorder without a new decision)

This GPU-ABI tranche must NOT displace the three missing real corpus
artifacts — those are higher priority:

1. Real corpus artifact producers: `CandidateOrdinalMapV1`,
   `CandidateFeatureColumnarV1`, exact `CandidateOrdinalSetV1` (join
   `xgboost-features.csv` to the semantic parquet by `packet_key`, never by
   row position).
2. Sample-query exact evaluation.
3. WSL2 RAPIDS runtime re-census, using the separated per-library version
   fields above (not a single collapsed CUDA version).
4. cuTile SM86 real kernel proof (CTK 13.2 lane).
5. CUTLASS real SM86 receipt.
6. LibTorch/Node-API ABI parity bridge (this tranche's remaining unchecked
   items above).

### Representation architecture (design principle, frozen)

Keep `semantic_768` a pure `N×768` FP32 matrix — identity is
`CandidateOrdinal + representationRevision` only. Do not fold PageRank,
AST depth, domain ID, KMeans ID, or any other scalar feature into extra
embedding dimensions; those belong in a separately-versioned
`CandidateFeatureMatrixV1` (or an explicitly-versioned fused representation
if a fusion point is ever needed — e.g. `concat(S_selected, X_selected)` as
its own new representation, never an in-place mutation of `semantic_768`).
pgvector/Qdrant/cuVS-CAGRA are index/executor artifacts, not identity
authorities — `halfvec`/binary-quantized/HNSW/IVFFlat forms are derived
execution optimizations layered on top of the FP32 canonical snapshot, not
replacements for it. CAGRA is an ANN executor artifact, not a structural
graph — keep it distinct from the Neo4j/cuGraph code-relationship graph and
the Tree-sitter AST graph (four graphs, four distinct owners, never merged).
cuVS's CAGRA→hnswlib serialization is explicitly experimental and readable
only by cuVS's own wrapper — do not assume Qdrant (which maintains its own
independent HNSW implementation) can import a CAGRA-derived graph without a
documented supported contract. Keep the large corpus mmap-backed
(`torch.Storage.from_file`) with a small bounded/reusable staging pool for
GPU transfer, benchmarking before any blanket `pin_memory` use — PyTorch's
own current guidance notes pinning can be slower than a plain copy in some
cases. AST proof ordering stays: byte-offset coordinate parity → span
self-validity → named-symbol coverage → semantic-kind parity → exact span
parity (Tree-sitter's `startIndex`/`endIndex` are explicitly byte offsets,
not character offsets).
