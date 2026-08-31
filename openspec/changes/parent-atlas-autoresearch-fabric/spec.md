# Parent Atlas Autoresearch Fabric

## Goal

Adapt the strongest operating discipline from `burtenshaw/multiautoresearch` into
Parent Atlas without importing another canonical agent framework.

The fabric owns the **scientific experiment protocol**:

```
hypothesis
  -> review/admission
  -> isolated worktree
  -> exact hardware/workload binding
  -> bounded execution
  -> correctness proof
  -> benchmark
  -> append-only receipt
  -> promote / reject / block
```

It does not own source identity, ontology truth, graph identity, workflow truth,
or GPU numerical truth.

## External pattern being adapted

`multiautoresearch` uses role isolation, one-hypothesis experiments, isolated
worktrees, real GPU-capacity limits, an append-only run ledger, and promotion
only after a measured benchmark win. Parent Atlas adopts those principles while
binding them to its existing revision/checksum/evidence contracts.

This change does **not** copy `multiautoresearch` as a runtime dependency.

## Existing Parent Atlas contracts that remain owners

Do not duplicate these:

- `GpuResourceEnvelopeV1` / `GpuAdmissionReceiptV1` — GPU-capacity admission.
- `AlgorithmExecutionManifestV1` — actual algorithm/backend/transport execution evidence.
- `AlignedSnapshotExperimentV2` — frozen semantic-768 numerical experiment surface.
- `AdaptiveDagPlanV1` / `KernelBoundDagPlannerV1` — bounded plan structure.
- `AtlasOntologyKernelV1` / OaK contracts — legal schema/function universe.
- `AcePacketV2` — bounded evidence presented to language/agent execution.
- `GraphNodeKeyV1`, projection ordinal and graph-revision contracts — graph identity.
- PostgreSQL canonical identity and revision state — canonical data authority.

The autoresearch fabric composes these contracts; it does not supersede them.

## Control-plane mapping

```
Paperclip
  workforce / watchdog / operator supervision
        |
        v
Mastra / Parent Atlas durable workflow
  branch / loop / retry / suspend / resume
        |
        v
Prime Agent / ACP-style coding worker
  proposes implementation in isolated worktree
        |
        +-------- OaK K=(S,F)
        |         legal concepts/functions
        |
        +-------- ACE
                  bounded evidence/skills/context
        |
        v
ExperimentHypothesisV1
        |
        v
review + duplicate/stale/admission gates
        |
        v
ExperimentWorktreeV1
        |
        v
GpuResourceEnvelopeV1 / GpuAdmissionReceiptV1
        |
        v
GpuExperimentLeaseV1
        |
        v
provider execution
  PYTORCH_ATEN
  TORCH_COMPILE_INDUCTOR
  TRITON
  CUTEDSL
  CUTILE
  CUDA_SIMT
  CUBLASLT
  CUTLASS
  CUVS
  CUGRAPH
  NETWORKX / CPU reference
        |
        v
AlgorithmExecutionManifestV1
        |
        v
correctness before timing
        |
        v
ExperimentRunReceiptV1
        |
        v
ExperimentPromotionDecisionV1
        |
        +---- REJECT/BLOCK -> do-not-repeat / research memory
        |
        +---- PROMOTE -> immutable new kernel/program/executor revision
```

## Ownership rules

### OaK

OaK defines what concepts/functions are legal for a task. An experiment may
reference an `oakKernelRevision`, but the research worker cannot mutate a frozen
kernel in place. A winning experiment proposes a new revision through an
explicit promotion path.

### Prime Agent / coding workers

Prime/ACP/OpenCode/Codex/Claude-style workers may write experimental code only
inside the admitted worktree surface. They do not decide promotion.

### Mastra

Mastra or the existing Parent Atlas workflow engine may provide durable
execution/retry/branching. The workflow engine does not decide numerical truth.

### Paperclip

Paperclip may supervise workers/watchdogs and restart or terminate jobs. It does
not own experiment evidence or promotion state.

### ACE

ACE supplies the small evidence packet for the experiment: relevant source
spans, prior failures, hardware facts, kernel/provider guidance and constraints.
Large tensors/matrices never belong in ACE.

### BitFrost / Redis-Valkey

BitFrost/Valkey may hold leases, heartbeats, resumable run state, descriptors,
and revision-qualified cache entries. Cache state never determines promotion.
Canonical experiment evidence remains append-only and checksum-bound.

### Hypergraph / research memory

Completed experiment receipts are good n-ary research evidence. A later
research-memory projection may bind:

```
experiment
  kernel/provider
  hardware
  shape/dtype
  source revision
  hypothesis
  benchmark
  correctness
  outcome
```

as a hyperedge. KMeans/SOM/centroid clusters over experiments are recommendation
signals only, never knowledge truth.

## Frozen contracts

### `ExperimentHypothesisV1`

Required properties:

- exactly one declared independent variable;
- baseline and candidate values differ;
- the independent variable cannot simultaneously be declared controlled;
- frozen parent revision;
- frozen workload fixture revision/checksum;
- target metric and optimization direction;
- explicit minimum relative improvement;
- admitted provider set;
- mutation scope exactly `ISOLATED_WORKTREE`;
- `canonicalAuthority=false`.

### `HardwareProfileV1`

Binds a result to hardware/toolchain evidence:

- OS / CPU / RAM;
- GPU name/device/compute capability/VRAM;
- driver and CUDA toolkit revision;
- optional PyTorch/cuDNN/cuTile/Triton/CuTeDSL/cuGraph/cuVS/NVCC/PTXAS revisions;
- deterministic checksum.

A benchmark from a different hardware/toolchain profile is a different evidence
cohort unless an explicit cross-hardware comparison contract says otherwise.

### `GpuExperimentLeaseV1`

This is **not** a second GPU admission owner. It binds an already-produced
`GpuAdmissionReceiptV1` to one experiment/device/resource ceiling and expiry.

### `ExperimentWorktreeV1`

Requires:

- exact parent revision;
- exact worktree revision/path;
- allowed/forbidden mutation paths;
- `sourceMutationIsolated=true`;
- `canonicalStateWritable=false`.

### `ExperimentRunReceiptV1`

Binds:

- hypothesis checksum;
- hardware profile checksum;
- worktree checksum;
- optional GPU lease checksum;
- workload fixture revision/checksum;
- provider and provider revision;
- baseline/candidate `AlgorithmExecutionManifestV1` checksums;
- correctness result against an explicit reference provider;
- benchmark baseline/candidate values and distribution;
- compiler/test diagnostic checksums;
- evidence refs;
- zero canonical mutation and zero writes outside worktree.

### `ExperimentPromotionDecisionV1`

Promotion is deterministic and fail-closed.

The decision function independently re-derives relative improvement from raw
baseline/candidate values and the hypothesis optimization direction. A worker
cannot promote itself by supplying a fabricated improvement scalar.

`PROMOTE` requires all of:

- exact experiment/hypothesis/workload identity parity;
- provider admitted by the hypothesis;
- correctness `PASS`;
- target metric parity;
- independently-derived improvement equals the receipt value;
- independently-derived improvement meets the frozen floor;
- no canonical mutation;
- no writes outside the isolated worktree.

Correct-but-slower experiments are `REJECT`, not errors. Identity/mutation/
provider/derived-metric mismatches are `BLOCKED`.

## GPU/kernel campaign policy

The first GPU campaign should be small and reference-driven, not PageRank or
CAGRA.

Recommended first fixture:

```
semantic_768
  -> prefix 512 / 256 / 128
  -> L2 normalization
```

Providers:

```
REFERENCE:     PYTORCH_ATEN
CHALLENGER A:  CUTILE
CHALLENGER B:  CUDA_SIMT
OPTIONAL:      TRITON / CUTEDSL
```

Required sequence:

1. frozen input tensor/checksum;
2. correctness parity;
3. deterministic replay;
4. warmup;
5. measured distribution (p50/p95/mean);
6. peak VRAM;
7. promotion decision.

The GPU residency/cache layer remains host/runtime-owned. cuTile/SIMT kernels
operate on admitted arrays and do not implement the cache themselves.

## Current sequencing

This change is additive and should not preempt current correctness P0s:

```
SEMANTIC P0
QDRANT-PROJECTION-ID-OWNER-02
  -> semantic_768 corpus
  -> CandidateOrdinalMapV1

GRAPH P0
READ_ONLY graph snapshot
  -> graphRevision
  -> GraphProjectionReceiptV1

THEN AUTORESEARCH GPU RUNTIME
HardwareProfileV1
GpuExperimentLeaseV1
GPU residency/provider contracts
cuTile/SIMT/PyTorch parity campaign
semantic MRL tournament
```

Contract/schema work may proceed in parallel now because it has no runtime or
canonical-state side effects.

## Non-goals for v1

- no autonomous writes to canonical PostgreSQL/Qdrant/Neo4j state;
- no automatic merge to main;
- no automatic production-kernel cutover;
- no GEPA optimization of live production policy;
- no agent-generated host OS/kernel mutation;
- no GPU cache implemented inside a cuTile/SIMT kernel;
- no claim that a microbenchmark speedup equals application-level speedup;
- no replacement of existing Mastra/OaK/ACE/GPU admission contracts.
