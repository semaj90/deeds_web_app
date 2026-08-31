# Tasks — Parent Atlas Autoresearch Fabric

See `proposal.md` for full design context, the layer-ownership table, and
the explicit constraint that AUTORESEARCH-04 must bind to the existing
`candidate-feature-gpu-residency-v1.ts` lease contract rather than create a
new one.

**Scope of this file, honestly**: AUTORESEARCH-01 and AUTORESEARCH-02 are
implemented as pure Zod schema + validation modules (no execution, no GPU
touch, no worktree automation — exactly the scope approved). Gates 03-18
remain proposal-only until 01-02 are reviewed and merged.

## AUTORESEARCH-01 — ExperimentHypothesisV1 (implemented, 2026-08-31)

`sveltekit-frontend/src/lib/server/atlas/autoresearch/experiment-hypothesis-v1.ts`
+ `experiment-hypothesis-v1.spec.ts` (12 tests, all passing).

- [x] Define the Zod schema: target operation, `HardwareProfileV1` checksum
  reference, reference implementation identity, allowed challenger set,
  required parity/tolerance contract, benchmark requirements, promotion
  threshold. One declared, independent change per hypothesis instance.
  `referenceProvider` is a schema literal (`'PYTORCH_ATEN'`) so a hypothesis
  cannot silently name a different reference implementation, matching
  AUTORESEARCH-08's own invariant. Self-referential `hypothesisChecksum`
  (via the shared `canonicalSha256V1` from `atlas/prefill/canonical-hash-v1.ts`,
  not a locally re-duplicated hash function) makes tampering detectable on
  parse.
- [x] Admission/review rule: `admitExperimentHypothesisV1()` rejects an exact
  duplicate (same target operation + hardware profile checksum + reference
  revision + input spec) against an already-admitted list. This is
  deliberately the simpler interim exact-match check named in the original
  task text — the fuzzier "nearest prior experiment" lookup is
  AUTORESEARCH-15 (HyperGraphRAG-backed), not built here.
- [x] No execution, no GPU touch, no worktree creation in this gate — schema
  and validation only. Verified by reading the file: zero I/O, zero network,
  zero child-process calls, pure functions only.
- [x] Tests: builds + determinism + tamper-rejection + duplicate-challenger
  rejection + missing/duplicate benchmark-metric rejection + reference-
  provider-literal enforcement + admission accept/reject/differentiate-by-
  shape. 12/12 pass.

## AUTORESEARCH-02 — HardwareProfileV1 (implemented, 2026-08-31)

`sveltekit-frontend/src/lib/server/atlas/autoresearch/hardware-profile-v1.ts`
+ `hardware-profile-v1.spec.ts` (8 tests, all passing).

- [x] Define the schema per `proposal.md`'s sketch: gpuFamily,
  computeCapability, driverRevision, cudaToolkitRevision, smCount, warpSize,
  globalMemoryBytes, memoryBandwidth, sharedMemoryPerBlock, registerLimits,
  tensorCoreCapabilities, supportedDtypes, compilerProviders. Cross-field
  validation rejects duplicate dtypes, duplicate compiler providers, and any
  `tensorCoreCapabilities` entry not also present in `supportedDtypes`.
- [x] A real, live-captured profile for this repo's dev GPU (RTX 3060 Ti,
  sm_86) as the first fixture: `buildDevWorkstationAmpereProfileV1()`. Reuses
  the values already confirmed live this session (`driverRevision: 580.88`,
  `cudaToolkitRevision: 13.2` matching the `DECODER-CONTAINER-01` pin) rather
  than re-deriving them. `captureMethod` field is explicit about which values
  were directly queried (`nvidia-smi`/`nvcc --version`, live) versus which
  come from NVIDIA's published Ampere GA104 specs (SM count, shared memory,
  register file, memory bandwidth) rather than a direct query this session —
  not presented as more directly-measured than it is.
- [x] Checksum function over the profile (`buildHardwareProfileV1()` +
  self-referential `profileChecksum`, same `canonicalSha256V1` mechanism as
  AUTORESEARCH-01), so an `ExperimentHypothesisV1` can bind to an exact
  profile revision by checksum.
- [x] Tests: builds + determinism + tamper-rejection + duplicate-dtype
  rejection + tensor-core-capability-not-in-supported-dtypes rejection +
  duplicate-compiler-provider rejection + the real dev-workstation profile
  parses and has the expected values. 8/8 pass.

## Verification (2026-08-31)

`tsc --noEmit -p tsconfig.json --skipLibCheck`: zero errors mentioning
`autoresearch` (checked by grepping the full error list against the new
files' directory, not assumed). `npx vitest run` on both new spec files:
20/20 tests pass.

## Explicitly not started (gates 03-18)

Isolated worktrees, GPU-byte leasing, OaK function admission, ACE skill
prefill, the `ExperimentDagV1` executor, provider/challenger registration,
the benchmark harness, `ExperimentReceiptV1`, the promotion gate,
HyperGraphRAG insertion, "do not repeat" retrieval, the reporter surface,
tournament scheduling, and `KernelRevisionV1` promotion all remain proposal-
only per `proposal.md`. Do not start any of these until AUTORESEARCH-01/02
are reviewed and merged.
