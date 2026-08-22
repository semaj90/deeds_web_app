# Candidate Feature GPU Pack + Parity Addendum

Status: **IMPLEMENTED_UNPROVEN**

This addendum advances the candidate feature fabric through FEAT-03D and FEAT-04 without changing canonical identity, GPU residency, or executor-fanout ownership.

## Physical boundary

```text
CandidateFeatureColumnarV1
        |
        v
CandidateFeatureGpuPackV1
  logicalRows = N
  physicalRows = align_up(N, rowAlignment)
  validMask[0:N] = 1
  validMask[N:] = 0
  padded values/presence/metadata = 0
        |
        +--> CPU gather reference by CandidateOrdinal
        |
        `--> PyTorch CUDA gather observer
                |
                v
CandidateFeatureGpuParityReceiptV1
```

For valid rows only, `physicalRow == CandidateOrdinal`. Padded rows are never candidates, carry no identity, and cannot be selected through the logical gather API.

## FEAT-03D

Implemented:

```text
sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-gpu-pack-v1.ts
sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-gpu-pack-v1.spec.ts
```

The pack freezes:

```text
feature values       float32 [physicalRows, 12]
feature presence     uint8   [physicalRows, 12]
valid mask           uint8   [physicalRows]
lane mask source     uint16  [physicalRows]
degraded identity    uint8   [physicalRows]
row alignment        power-of-two, default 32
padding policy       ZERO_INVALID_MASKED_V1
```

The source `CandidateFeatureColumnarV1` ordinal/value/presence/columnar checksums are revalidated before packing. Missing evidence remains `0 + presence=0`; a real numerical zero remains `0 + presence=1`.

The physical pack explicitly records:

```text
logicalOrdinalEqualsPhysicalRowForValidPrefix = true
paddedRowsCarryIdentity = false
gpuResident = false
identityAuthority = false
canonicalOwnerChanged = false
```

Producing a GPU-friendly batch is not permission to claim a durable `GPU_RESIDENT` artifact or lease.

## FEAT-04

Implemented:

```text
sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-gpu-parity-v1.ts
scripts/atlas/prove-candidate-feature-gpu-parity.py
sveltekit-frontend/scripts/atlas/prove-candidate-feature-gpu-parity.mts
```

The Python process is an executor observer only. It has no CPU fallback: PyTorch import and `torch.cuda.is_available()` are required. It copies the exact pack buffers to CUDA, performs selected-row gather with `torch.index_select`, copies results back, and verifies padded CUDA rows remain zero/invalid.

The Python result does not become parity authority. The TypeScript orchestrator checks observation schema/status, lineage checksums, lane/degraded metadata, selected ordinals, float32 values and uint8 presence, then invokes `verifyCandidateFeatureGpuParity()` to produce the canonical receipt.

The receipt requires:

```text
challenger = PYTORCH_CUDA
gpuExecutionObserved = true
ordinalParity = true
featureValueParity = true
featurePresenceParity = true
laneMaskParity = true
degradedIdentityParity = true
paddingMaskParity = true
paddingZeroParity = true
maxAbsFeatureDelta = 0
```

A CUDA-labelled challenger with `gpuExecutionObserved != true` fails closed. CPU reference packing may not claim CUDA execution.

## Proof gates

- [ ] **FEAT-03D-01** deterministic logical→physical row alignment.
- [ ] **FEAT-03D-02** valid mask is exactly the logical prefix.
- [ ] **FEAT-03D-03** all padded values/presence/lane/degraded fields are zero.
- [ ] **FEAT-03D-04** padded rows cannot be gathered as CandidateOrdinal.
- [ ] **FEAT-03D-05** missing zero and real zero remain distinguishable.
- [ ] **FEAT-03D-06** pack/gather checksums are deterministic.
- [ ] **FEAT-04-01** actual PyTorch CUDA execution is observed.
- [ ] **FEAT-04-02** CUDA selected CandidateOrdinals exactly match CPU gather order.
- [ ] **FEAT-04-03** CUDA float32 values exactly match the CPU reference.
- [ ] **FEAT-04-04** CUDA presence bits exactly match the CPU reference.
- [ ] **FEAT-04-05** CUDA lane/degraded metadata matches the CPU reference.
- [ ] **FEAT-04-06** CUDA padded rows remain zero and invalid.
- [ ] **FEAT-04-07** final acceptance is emitted by the TypeScript parity receipt, not the Python observer alone.

All remain unchecked until workstation execution.

## Workstation proof

```powershell
cd C:\Users\james\Videos\deeds_web_app\sveltekit-frontend

node_modules\.bin\vitest run `
  src/lib/server/atlas/features/candidate-feature-gpu-pack-v1.spec.ts

npx tsx scripts/atlas/prove-candidate-feature-gpu-parity.mts
```

Required terminal status:

```text
CANDIDATE_FEATURE_GPU_PARITY_BOUNDED_PROVEN
```

If PyTorch or CUDA is unavailable, the proof must return `GPU_PARITY_BLOCKED` and non-zero. CPU-only parity is diagnostic and does not complete FEAT-04.

The bounded proof mutates no Postgres, Qdrant, Valkey, Neo4j, RabbitMQ, SearchRuntime, or canonical artifact store.

## Deferred

- FANOUT-01 executor result normalization to CandidateOrdinal
- Qdrant/cuVS/CAGRA/TurboVec executor adapters
- GPU-resident `ArtifactAddressV1` lifecycle and leases
- pinned-vs-pageable host transfer benchmark
- executor-specific compact/sort/scatter kernels beyond this exact gather proof

FANOUT-01 remains blocked by the separate revision-ownership gate and is not implied by successful FEAT-04 parity.
