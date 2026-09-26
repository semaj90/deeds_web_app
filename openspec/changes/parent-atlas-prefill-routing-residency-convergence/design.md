## Context

Parent Atlas already has separate owners for packet/source lineage, query routing, candidate features, neural prefill, tensor residency, ACE/BitFrost memory, semantic embeddings, Graphify, Qdrant, cuVS/CAGRA, and model execution. The missing piece is a planning-level convergence contract that preserves those boundaries while making the dependency order and proof receipts explicit.

The upstream workspace is admitted, but execution/source producer authority, current packet materialization, `PacketRevisionOwnerV1`, packet→chunk currentness, and packet→AST/span authority remain open. The RPC packet registry is complete and downstream. This change therefore defines contracts and read-only proof plans only.

## Goals / Non-Goals

**Goals:**

- Define one revision-qualified DAG from `UserQuery` to `ExecutionReceipt` and verified offline-learning eligibility.
- Reconcile representation, lane, executor, residency, checkpoint, and receipt ownership without creating competing implementations.
- Define a deterministic executor-capability policy and one GPU residency budget/lease owner.
- Establish an isolated TensorRT-RTX compatibility/proof lane for the RTX 3060 Ti / 8 GB workstation.
- Preserve fail-closed behavior whenever lineage, capacity, parity, residency, or receipt evidence is incomplete.
- Pin official documentation families in an evidence manifest for later proof work.

**Non-Goals:**

- No PostgreSQL DDL, packet/digest backfill, Qdrant/Valkey/Neo4j mutation, model promotion, CUDA/RAPIDS upgrade, or online learning.
- No new canonical packet, source, workspace, embedding, RRF, topology, checkpoint, KV, or recurrent-state owner.
- No TensorRT-RTX installation or engine build in this planning tranche.
- No claim that the local WebGPU 512-token challenger is canonical or equivalent to Ollama.

## Decisions

### Current authority baseline

The admitted workspace revision is `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`; workspace authority is proven and must not be replaced by a diagnostic candidate. The execution-owner planner finds two equivalent candidates and an existing `canonical_authority` flag for `74d50c86-8194-45ea-8c3d-61aab737ef83`, but the explicit owner receipt remains `OWNER_SELECTION_VALIDATED_NOT_APPLIED` with `safeToApply: false`; database flag presence is not write authorization. A bounded current workspace→packet→chunk join against that execution finds `25` binding/exact Graphify sources, only `2` proven lineage sources and `2` exact packet/chunk sources, `10` packet source rows, and `0` packet-revision or full-identity matches. The source-authority repair planner proposes a noncanonical candidate workspace revision `sha256:c4a55f792102019e2f41458e698a8640fe8f329c70d1d28c59984c81f136253b` and owner run `48485685-e773-4433-a1f8-00f5524cca44`, with `22,911` exact candidates, `833` content/source-revision mismatches, `canonicalAuthority: false`, and `authorizationRequired: true`; it must not supersede the admitted revision. The current packet writer audits report `atlas_packets.source_revision` exists but is populated on `0/61,718` packets, while `workspace_revision` and `representation_revision` are populated; packet-key semantics remain unproven. The writer-lineage census classifies `1/5` writers as revision-bound, `2/5` as legacy SHA-256-only, and `2/5` as unqualified or schema-drift blocked. The migration planner remains `PLAN_ONLY_NOT_APPLIED` with five proposed statements; its non-null revision columns cannot be promoted against this live state. Current packet materialization, `PacketRevisionOwnerV1`, packet→chunk current qualification, and packet→AST/span authority remain unresolved. The existing RPC registry has `61,718/61,718` packet parity with no orphans and remains a fail-closed downstream consumer. No convergence task may infer a revision, promote a projection, or convert historical lineage into current authority.

### Ownership and dependency order

`parent-atlas-retrieval-lineage-dag-convergence` owns canonical identity and currentness. `parent-atlas-gate2-chunk-lineage-convergence` owns the chunk-native current join. Existing routing, feature, prefill, residency, and executor changes remain owners of their own contracts. This change only composes their receipts.

The frozen order is:

```text
admitted workspace revision
  → selected execution/source producer
  → current packet + PacketRevisionOwnerV1
  → packet/chunk/AST current closure
  → retrieval lanes + CandidateOrdinalMapV1
  → CandidateFeatureMatrix
  → bounded derived transforms
  → ContextManifestV1 → PromptPlanV1
  → ACE packet → BitFrost/Valkey residency
  → model-native prefill → decode
  → ExecutionReceipt → offline-learning eligibility
```

No downstream receipt can promote an upstream identity or revision.

### Representation, lane, and executor separation

- `semantic_768` remains the canonical dense semantic oracle.
- `hidden_256` is internal neural state; it is not a registered representation.
- `latent_128` and `latent_64` are revisioned derived challengers.
- A lane is a logical retrieval role; an executor is a compute implementation. They are never interchangeable.
- PyTorch CPU is the numerical reference. PyTorch CUDA, LibTorch/Node-API, ONNX Runtime, WebGPU/DirectML, TensorRT-RTX, cuVS, and CAGRA require independent receipts.
- Hamming is a prefilter, Hilbert is a locality key, and neither receives an RRF vote. KMeans, SOM20x20, and Topology4 remain distinct derived outputs.

### Routing and derived features

`QueryRouterTensorV1[154]` remains the primary routing tensor. A future `RoutingFeatureTile4x6V1` is derived/debug-only with rows QUERY, TOKEN_OR_SPAN, CANDIDATE_OR_PACKET, EXECUTION_OR_CACHE and columns LEXICAL, SEMANTIC, AST, GRAPH, DOMAIN, RUNTIME. Every cell carries a feature revision and missingness policy; unavailable canonical features are never silently zero-filled.

Learned routing may predict logical needs only. Deterministic capability policy maps those needs to eligible lanes/executors; it must not predict implementation names such as Qdrant, CAGRA, cuVS, TensorRT, or DirectML.

### Checkpoint taxonomy

- ML activation checkpoint: PyTorch training-memory/recompute policy.
- `AtlasPassCheckpointV1`: resumable PCA/SVD/KMeans/SOM/Graphify/DAG algorithm state.
- Residency checkpoint: RAM/VRAM/BitFrost/Valkey residency metadata.
- LLM KV/recurrent state: ephemeral model-owned execution state.

These are separate schemas, owners, lifecycles, and rollback units.

### Owner matrix

| Capability | Existing owner | This change may consume | Canonical authority |
| --- | --- | --- | --- |
| Workspace/source/packet/chunk/AST identity | Retrieval lineage and Gate 2 changes | Qualified receipts only | PostgreSQL lineage tables |
| Query routing and logical needs | Query-routing/classifier changes | Revisioned routing outputs | No identity authority |
| Candidate ordinal/features | Candidate-feature execution fabric | Existing maps/matrices | PostgreSQL-bound evidence |
| ACE/context assembly | ACE/BitFrost integration | Qualified context manifests | BitFrost/Valkey are control/cache only |
| Dense semantic search | semantic_768 contract | Canonical vectors and receipts | PostgreSQL `content_embedding_768` |
| ANN/vector execution | Qdrant and cuVS/CAGRA lanes | Rebuildable projections | No identity authority |
| Structural graph | Graphify/AST and graph retrieval changes | Revision-qualified observations | No packet identity authority |
| GPU residency | Existing residency/memory architecture | One budget/lease decision | Single residency owner |
| Model prefill/decode state | Model-native runtime | Revisioned execution receipts | Model-owned ephemeral state |

If more than one runtime path claims the same canonical capability, the convergence result is `DUPLICATE_CAPABILITY_OWNER` and promotion is blocked until ownership is explicitly resolved.

### RTX proof lane

TensorRT-RTX is an isolated challenger. The proof sequence is PyTorch CPU FP32 → PyTorch CUDA/sm_86 → LibTorch/Node-API → ONNX Runtime GPU → TensorRT-RTX. Each step requires same-input output parity before the next is considered eligible. The first TensorRT-RTX artifact path is ONNX → portable AOT engine → device JIT/runtime-cache receipt; native integration is later.

The tiny `QueryRouterTensorV1[154]` → hidden → heads model is correctness and contract-plumbing reference only. It is not the TensorRT-RTX success or performance criterion because launch, build, JIT, and cache overhead can dominate such a small workload. Before a TensorRT-RTX performance claim, select a heavier bounded neural component—such as a reranker, prefill encoder, or decoder-side auxiliary network—and record its immutable component/model revision, checksum, bounded shapes, workload rationale, and evidence that AOT/JIT/runtime-cache costs can be amortized. The selected component must still pass the complete numerical-oracle ladder and cannot bypass PyTorch CPU, PyTorch CUDA, LibTorch/Node-API, or ONNX Runtime parity.

The current CUDA/RAPIDS installation is not changed. CUDA Graphs, reduced precision, and Torch-TensorRT-RTX are later optimization/experimental gates, not correctness prerequisites. Dynamic shapes require explicit optimization profiles, and quantization requires operator/Q-DQ evidence.

One `GpuResidencyBudgetV1` owner accounts for PyTorch CUDA, cuVS, TensorRT-RTX, DirectML, WebGPU, and the LLM runtime. Exceeding the budget produces `GPU_RESIDENCY_BUDGET_EXCEEDED`; implicit OOM or silent fallback is not permitted.

Node-API/node-addon-api is the ABI-stable native boundary across supported Node versions. Addons must not own application state through direct V8 internals; they expose bounded typed buffers and revisioned receipts, with lifecycle and cancellation controlled by the host runtime.

### Evidence manifest

The following primary documentation families are pinned for later receipts:

- [TensorRT-RTX prerequisites](https://docs.nvidia.com/deeplearning/tensorrt-rtx/latest/installing-tensorrt-rtx/prerequisites.html) and [support matrix](https://docs.nvidia.com/deeplearning/tensorrt-rtx/latest/getting-started/support-matrix.html): Windows, Ampere/sm_86, driver, CUDA 12.9 Update 1/13.4 compatibility.
- [TensorRT-RTX architecture](https://docs.nvidia.com/deeplearning/tensorrt-rtx/latest/architecture/how-trt-rtx-works.html), [native runtime API](https://docs.nvidia.com/deeplearning/tensorrt-rtx/latest/inference-library/runtime-api.html), [dynamic shapes](https://docs.nvidia.com/deeplearning/tensorrt-rtx/latest/inference-library/work-with-dynamic-shapes.html), [quantized types](https://docs.nvidia.com/deeplearning/tensorrt-rtx/latest/inference-library/work-with-quantized-types.html), [runtime cache](https://docs.nvidia.com/deeplearning/tensorrt-rtx/latest/inference-library/work-with-runtime-cache.html), and [RTX CUDA Graphs](https://docs.nvidia.com/deeplearning/tensorrt-rtx/latest/inference-library/work-with-cuda-graphs.html).
- [CUDA Graphs and CUDA runtime documentation](https://docs.nvidia.com/cuda/cuda-c-programming-guide/index.html): streams, events, synchronization, memory pools, graph capture, and version rules.
- [PyTorch C++ API](https://pytorch.org/cppdocs/), [activation checkpointing](https://pytorch.org/docs/stable/checkpoint.html), and [custom C++/CUDA operators](https://pytorch.org/tutorials/advanced/cpp_custom_ops.html): reference execution, training memory policy, and registered native operators.
- [Node-API](https://nodejs.org/api/n-api.html) and [node-addon-api](https://github.com/nodejs/node-addon-api): stable JS/native boundary; no direct V8 ownership.
- [cuVS brute force](https://docs.nvidia.com/cuvs/user-guide/api-guides/indexing-guide/brute-force) and [CAGRA](https://docs.rapids.ai/api/cuvs/stable/cpp_api/neighbors_cagra/): exact oracle versus ANN challenger, never additional semantic votes.
- [ONNX Runtime execution providers](https://onnxruntime.ai/docs/execution-providers/), [DirectML](https://onnxruntime.ai/docs/execution-providers/DirectML-ExecutionProvider.html), and [WebGPU](https://onnxruntime.ai/docs/execution-providers/WebGPU-ExecutionProvider.html): distinct provider receipts and fallback rules.

## Risks / Trade-offs

- [Unqualified lineage is consumed] → Require workspace/source/packet/chunk/AST revision predicates before any live receipt can be promoted.
- [TensorRT-RTX/CUDA mismatch] → Record exact versions and support-matrix result; do not assume CUDA 13.0 compatibility and do not upgrade the working stack.
- [VRAM contention] → Centralize budget/lease accounting and fail closed on over-budget requests.
- [Dynamic-shape nondeterminism or JIT cost] → Use explicit profiles, separate warmup from steady state, and bind runtime-cache identity to engine, driver, GPU, and runtime revisions.
- [Duplicate executor votes] → SearchRuntime remains the sole fusion owner; derived topology and executor lanes do not add votes.
- [Training contamination] → Only receipts with verified lineage and execution evidence may become offline training tuples; no online weight updates are allowed.

## Migration Plan

1. Inventory existing owners and freeze the dependency/receipt matrix.
2. Add read-only schema and parity probes for the convergence contracts.
3. Resolve upstream lineage gates through their owning OpenSpec changes.
4. Prove executor parity and residency in isolated lanes.
5. Only after explicit promotion receipts exist, wire bounded runtime consumers.

Rollback is artifact-level: discard unpromoted receipts, runtime caches, and challenger outputs; do not mutate canonical stores. Any future durable migration requires a separately authorized OpenSpec change with additive DDL, rollback, and independent readback.

## Open Questions

- Which existing writer can prove `PacketRevisionOwnerV1` without deriving identity from timestamps or mutable projection state?
- Which completed execution supplies the admitted current packet/source cohort?
- What numerical thresholds will admit CPU↔CUDA, ONNX, and TensorRT-RTX parity for each representation?
- What exact runtime/driver/CUDA versions are installed on the RTX workstation, and do they match the TensorRT-RTX support matrix?
- Which existing residency owner can account for all participating processes without adding a second budget ledger?
