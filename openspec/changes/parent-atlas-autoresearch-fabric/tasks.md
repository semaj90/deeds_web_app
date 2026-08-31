# Tasks — Parent Atlas Autoresearch Fabric

See `proposal.md` for full design context, the layer-ownership table, and
the explicit constraint that AUTORESEARCH-04 must bind to the existing
`candidate-feature-gpu-residency-v1.ts` lease contract rather than create a
new one.

**Scope of this file, honestly**: nothing below is implemented yet. Only
AUTORESEARCH-01 and AUTORESEARCH-02 are approved to be drafted next; gates
03-18 are proposal-only until 01-02 are reviewed.

## AUTORESEARCH-01 — ExperimentHypothesisV1 (not started)

- [ ] Define the Zod schema: target operation, `HardwareProfileV1` checksum
  reference, reference implementation identity, allowed challenger set,
  required parity/tolerance contract, benchmark requirements, promotion
  threshold. One declared, independent change per hypothesis instance.
- [ ] Admission/review rule: reject a hypothesis that duplicates an existing
  open or promoted experiment (requires AUTORESEARCH-15's "do not repeat"
  lookup to exist first, or a simpler interim exact-match check).
- [ ] No execution, no GPU touch, no worktree creation in this gate — schema
  and validation only.

## AUTORESEARCH-02 — HardwareProfileV1 (not started)

- [ ] Define the schema per `proposal.md`'s sketch: gpuFamily,
  computeCapability, driverRevision, cudaToolkitRevision, smCount, warpSize,
  globalMemoryBytes, memoryBandwidth, sharedMemoryPerBlock, registerLimits,
  tensorCoreCapabilities, supportedDtypes, compilerProviders.
- [ ] A real, live-captured profile for this repo's dev GPU (RTX 3060 Ti,
  sm_86) as the first fixture — reuse the values already confirmed live this
  session (`driverRevision: 580.88`, `cudaToolkitRevision: 13.2` matching
  the `DECODER-CONTAINER-01` pin) rather than re-deriving them.
- [ ] Checksum function over the profile, so an `ExperimentHypothesisV1` can
  bind to an exact profile revision.

## Explicitly not started (gates 03-18)

Isolated worktrees, GPU-byte leasing, OaK function admission, ACE skill
prefill, the `ExperimentDagV1` executor, provider/challenger registration,
the benchmark harness, `ExperimentReceiptV1`, the promotion gate,
HyperGraphRAG insertion, "do not repeat" retrieval, the reporter surface,
tournament scheduling, and `KernelRevisionV1` promotion all remain proposal-
only per `proposal.md`. Do not start any of these until AUTORESEARCH-01/02
are reviewed and merged.
