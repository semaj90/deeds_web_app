# Proposal — Parent Atlas Autoresearch Fabric

## Status

DRAFTED_UNAPPROVED / NO_CODE_WRITTEN / GATES_01-02_ONLY_APPROVED_FOR_FIRST_PASS

## Problem

This repo already runs a real reference-vs-challenger executor pattern for
numerical GPU work — confirmed live, not aspirational: `docs/reports/
gpu-residency-cutile-simt-readiness-v1.json` records `referenceExecutor:
PYTORCH`, `challengerExecutors: [CUTILE, CUDA_SIMT]`,
`promotionExecutors: [CUVS, CUGRAPH]`, `identityAuthority: false`. What it
does not have is a *formal, repeatable, receipted lifecycle* for running one
of these comparisons: propose a hypothesis, isolate it, benchmark it against
a fixed reference, and gate promotion on a measured win. Today that pattern
exists as an architectural stance in a JSON audit, not as a system agents
can actually drive.

Separately, this repo has a documented, repeated failure mode this proposal
must not reproduce: two independent audits landed on the same day
(2026-08-31) both found `CANDIDATE_FEATURE_GPU_LEASE` had a duplicate owner
(`candidate-feature-gpu-residency-v1.ts` vs `candidate-feature-gpu-resident-
lease-v1.ts`), first flagged 10 days earlier and left unresolved as an
"operator decision" the whole time (see `openspec/changes/
parent-atlas-candidate-feature-execution-fabric/tasks.md`, "CANDIDATE_FEATURE_GPU_LEASE
duplicate owner" section). An autoresearch fabric that mints its own new
`GpuLeaseV1`/residency contract instead of binding to the existing one would
manufacture a third competing owner in the same subsystem within the same
week this duplication was finally archived. This proposal treats that as a
hard constraint, not a nice-to-have.

## Decision

Adopt the *operating discipline* of the "multiautoresearch" pattern —
planner/reviewer/researcher/reporter roles are read-only, only an isolated
experiment worker mutates code, worker concurrency is capped by real GPU
capacity, every run is recorded, promotion happens only after a measured
benchmark win — without importing it, or any other named framework
(OaK/Prime Agent/Paperclip/Mastra), as a dependency. Those names describe
*roles* this repo already has partial owners for; the fabric's job is to
formalize the missing role (the experiment lifecycle itself), not to bolt on
a new agent framework.

```text
ExperimentHypothesisV1 (one declared, independent change)
        |
        v
REVIEW / ADMISSION  -- reject duplicate, stale, unsafe, or ungrounded hypotheses
        |
        v
HardwareProfileV1 (exact toolchain + device checksums)
        |
        v
ExperimentWorker (isolated worktree, bounded by a REAL GPU-byte lease against
                  the EXISTING candidate-feature-gpu-residency-v1.ts contract
                  -- not a new lease type)
        |
        v
PyTorch/ATen reference  vs.  one admitted challenger
                              (CUDA_SIMT | CUTILE | Triton | ...)
        |
        v
correctness parity (exact fixture, bounded tolerance, no OOB, deterministic replay)
        |
        v
benchmark (warmup, p50/p95, peak VRAM, end-to-end — not microbenchmark-only)
        |
        v
ExperimentReceiptV1 (append-only, WIN/LOSE, immutable)
        |
        v
promotion gate: measured win + zero correctness regression
        |
        v
KernelRevisionV1 (immutable; promotion never silently rewrites the baseline)
```

Layer ownership this fabric must respect, not duplicate:

| Layer | Owner (existing, unless noted) |
|---|---|
| Canonical identity, revisions, evidence, artifact contracts, retrieval graph, numerical substrate | Parent Atlas (this repo, established) |
| GPU residency / lease | `candidate-feature-gpu-residency-v1.ts` (canonical per today's archival) |
| Bounded evidence context handed to an agent | ACE |
| Numeric artifact location/reference | `ArtifactAddressV1` (existing, per `docs/reports/gpu-residency-cutile-simt-readiness-v1.json`) |
| Competing numerical execution providers | PyTorch/ATen (reference), CUDA SIMT, cuTile, Triton, CUTLASS, cuVS, cuGraph (challengers/promotion executors) |
| Research memory over past experiments | HyperGraphRAG (n-ary hyperedges: experiment × kernel × hardware × provider × shape × outcome — deliberately not flattened to binary edges) |
| Durable multi-step execution | *not decided this proposal* — see "Explicitly deferred" |

## Why HyperGraphRAG, not plain GraphRAG, for experiment memory

A kernel experiment is naturally an n-ary fact (experiment, kernel, hardware,
provider, PyTorch version, dtype, shape, source revision, optimization
strategy, result, correctness verdict — one event, many co-occurring
attributes). Flattening that into pairwise edges loses the ability to query
"experiments on sm_86 where a tiled strategy beat ATen for D in [512,1024]
without increasing VRAM" as one bounded traversal. This repo already has a
live n-ary/hyperedge precedent (`SHARES_TAGS`/4-lane hypergraph, `HyperRAG
Packet RPC` in this file's canonical operator order) — this proposal extends
that existing pattern to experiment records, it does not introduce a new
graph technology.

`cuGraph` gets a second, explicitly non-authoritative job here: PageRank /
community detection over the *experiment* graph (`derived_from`,
`invalidates`, `improves_on`, `contradicts`, `same_hardware`, `same_kernel`,
`same_failure` edges) to help a planner spot high-impact optimization
families or dead-end clusters. This is planner guidance, never promotion
authority — matches this repo's existing rule that a model/graph score
proposes, deterministic evidence decides.

## Storage boundary (explicit, to prevent the markdown-ledger anti-pattern)

`multiautoresearch` itself uses append-only markdown/tsv result files as its
ledger. This repo already has a stronger primitive and must use it instead:

| Concern | Store | Not |
|---|---|---|
| Experiment truth, receipts, promotion state | Postgres (OpenSpec-adjacent receipt tables, schema TBD in a later gate) | markdown/tsv ledger files |
| Workflow state, leases, heartbeats, active GPU reservations | Valkey | — |
| Artifact residency policy (hot/warm/cold tensor placement) | BitFrost, via the existing residency contract | a second bespoke cache |
| Research memory / prior-experiment retrieval | HyperGraphRAG | — |

## HardwareProfileV1 (sketch, not final — belongs to gate 02)

A concrete profile, checksummed, attached to every experiment, e.g. for this
repo's actual dev GPU:

```text
gpuFamily: Ampere
computeCapability: 8.6          # RTX 3060 Ti, confirmed via nvidia-smi this session
driverRevision: 580.88          # confirmed live this session
cudaToolkitRevision: 13.2       # matches the neural-decoder container pin, DECODER-CONTAINER-01
smCount, warpSize, globalMemoryBytes, memoryBandwidth,
sharedMemoryPerBlock, registerLimits, tensorCoreCapabilities,
supportedDtypes: [fp32, fp16, bf16, tf32, int8]
compilerProviders: [nvcc, cutile, triton, torch.inductor]
```

An experiment hypothesis names a target like: *"Optimize `RMSNormV1` for
`HardwareProfile` checksum `H`, `sm_86`, CUDA 13.2, input BF16 `[N,D]`,
reference PyTorch/ATen, allowed challengers `{CUDA_SIMT, CUTILE, TRITON}`,
required: exact fixture parity, bounded numerical tolerance, no OOB,
deterministic replay, p50/p95 timing, peak VRAM, end-to-end benchmark,
promotion threshold: X% improvement with zero correctness regression."* —
not "make RMSNorm faster."

CUDA Tile IR support begins at Ampere (`sm_86`) as of CUDA Tile IR 13.2 (see
`claude.md`'s "Neural Decoder Container + PyTorch/CUDA Pin Reference"
section, verified via live web search this session) — this host's dev GPU is
a legitimate tile-compilation target, not an H100-only experiment. This does
not change this repo's *existing* CUDA pin anywhere; it only means a future
cuTile challenger experiment on this hardware is not speculative.

## Reference numbers, cited honestly

The Hugging Face kernel-agent result quoted in the source discussion for
this proposal (~1.88x RMSNorm) is a per-shape H100 microbenchmark average
(range 1.64x–2.26x), not a full-application speedup — end-to-end LTX Video
went 2.87s → 2.70s without `torch.compile`, 2.01s with optimized kernels
*plus* `torch.compile`. A separate Qwen3-8B RMSNorm test averaged 1.94x, also
H100. The lesson taken from this is methodological (pin exact hardware
target + operation + dtype + bindings + correctness tests + microbenchmark
+ end-to-end benchmark, exactly what `ExperimentHypothesisV1` /
`ExperimentReceiptV1` below formalize), not a promised speedup number for
this repo's Ampere hardware. A cited "35% LiveCodeBench, Qwen3-0.6B" figure
traces to a conference-talk transcript, not an independently-reproduced
model-card claim — treat it as directional evidence for the agentic-kernel-
engineering approach in general, not a number this repo can cite as its own.

## AUTORESEARCH gates (planned; NONE implemented by this proposal)

| Gate | Scope |
|---|---|
| AUTORESEARCH-01 | `ExperimentHypothesisV1` schema — exactly one declared, independent change per hypothesis |
| AUTORESEARCH-02 | `HardwareProfileV1` schema — exact toolchain + device checksums |
| AUTORESEARCH-03 | Isolated worktree per experiment, explicit parent revision |
| AUTORESEARCH-04 | GPU lease sourced from real available capacity — **binds to `candidate-feature-gpu-residency-v1.ts`, does not create a new lease contract** |
| AUTORESEARCH-05 | OaK-side allowed-function admission (which optimization targets are legal to propose) |
| AUTORESEARCH-06 | ACE skill/evidence prefill (bounded — hardware guide + relevant prior experiments only, not a generic CUDA corpus dump) |
| AUTORESEARCH-07 | `ExperimentDagV1`, executed by a bounded Atlas executor (durable-workflow-engine choice deferred, see below) |
| AUTORESEARCH-08 | PyTorch/ATen as immutable reference implementation |
| AUTORESEARCH-09 | Provider/challenger registration (cuTile, SIMT, Triton, ...) |
| AUTORESEARCH-10 | Correctness parity gate, evaluated before any timing gate |
| AUTORESEARCH-11 | Warmup + p50/p95 + peak-VRAM + end-to-end benchmark harness |
| AUTORESEARCH-12 | `ExperimentReceiptV1`, append-only |
| AUTORESEARCH-13 | Accept/reject/promote gate |
| AUTORESEARCH-14 | HyperGraphRAG insertion of experiment records |
| AUTORESEARCH-15 | "Do not repeat" retrieval (nearest prior success/failure lookup before admitting a new hypothesis) |
| AUTORESEARCH-16 | Reporter/visualization surface (tool TBD — see deferred list) |
| AUTORESEARCH-17 | Bounded parallel experiment tournament |
| AUTORESEARCH-18 | Promotion produces an immutable `KernelRevisionV1`; never silently modifies the baseline |

**This proposal approves drafting AUTORESEARCH-01 and AUTORESEARCH-02 only**
(pure Zod/pydantic schema work, no execution, no GPU, no worktree
automation) as the first bounded experiment in this fabric's own terms — one
hypothesis, one isolated change, reviewed before anything downstream is
built. Gates 03+ remain proposals until 01-02 are reviewed and merged.

## Explicitly deferred (not decided by this proposal)

- **Durable workflow engine for `ExperimentDagV1`** (AUTORESEARCH-07). A
  Mastra-style DAG engine was suggested as a fit (sequential/parallel/
  branch/loop graphs, persisted state, resumable) but this repo has no
  existing Mastra integration — evaluate against what this repo already
  uses for durable multi-step execution before adding a new workflow engine
  dependency.
- **Fleet supervision / watchdog layer** (long-running worker health,
  restart policy). Named as a Paperclip-shaped role; no commitment to that
  specific tool.
- **Reporter/observability surface** (AUTORESEARCH-16). Named as a
  Trackio-shaped role; this repo's existing telemetry stack
  (`docs/architecture/runtime-ownership-registry.json`-adjacent tooling)
  should be evaluated first.
- **Postgres receipt schema** for `ExperimentReceiptV1` — table design,
  migration, and how it composes with the existing `atlas_graph_authority_*`
  / `runtime-ownership-registry.json` governance machinery.
- **Host-level "generative systems optimization"** (CPU thread affinity,
  NUMA policy, io_uring, RMM pool config, container images). If ever
  pursued, the experimental unit is `SystemVariantV1` × `HardwareProfileV1`
  × `WorkloadFixtureV1`, run only in disposable containers/VMs/worktrees —
  never a direct mutation of this host's OS. Out of scope for AUTORESEARCH-01/02.

## Non-goals

- Not a second GPU-residency/lease contract.
- Not an agent framework import (no new dependency on any named external
  multi-agent research tool).
- Not authority to redefine Parent Atlas canonical identity, evidence, or
  retrieval graph — `identityAuthority: false` for every provider/challenger
  in this fabric, matching the existing GPU-residency audit's own invariant.
- Not a promise of any specific speedup number on this repo's hardware.
