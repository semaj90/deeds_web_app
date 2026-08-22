# Candidate Feature GPU Pack + Parity Addendum

Status: **IMPLEMENTED_UNPROVEN**

This addendum advances the existing candidate feature execution fabric through **FEAT-03D** and **FEAT-04**. It does not promote Qdrant/cuVS/CAGRA/TurboVec fanout and does not create a second feature-row, CandidateOrdinal, artifact, or GPU-residency owner.

## Ownership and physical boundary

```text
CandidateFeatureSnapshotV1
  logical membership / one row per CandidateOrdinal
        |
        v
CandidateFeatureColumnarV1
  CPU reference: float32 values + uint8 presence, [N,12]
        |
        v
CandidateFeatureGpuPackV1
  physical execution batch only
  logicalRows = N
  physicalRows = ceil(N/alignment)*alignment
  validMask[0:N] = 1
  validMask[N:]  = 0
  padded feature/presence/metadata = 0
  paddedRowsCarryIdentity = false
        |
        +--> CPU gather reference by CandidateOrdinal
        |
        `--> PyTorch CUDA observer
                |
                v
CandidateFeatureGpuParityReceiptV1
  TypeScript parity authority
```

A padded physical row is never a logical candidate and can never be gathered by CandidateOrdinal. For the valid prefix only, `physicalRow == CandidateOrdinal`. The GPU pack intentionally carries no padded candidate IDs or sentinel canonical identities.

## FEAT-03D implementation

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

All physical checksums use explicit little-endian encodings where applicable. The source `CandidateFeatureColumnarV1` checksums are revalidated before packing.

`gatherCandidateFeatureGpuRows()` accepts only unique ordinals in `[0, logicalRows)`. Caller order is preserved. A padded row cannot be selected.

## FEAT-04 parity implementation

Implemented:

```text
sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-gpu-parity-v1.ts
scripts/atlas/prove-candidate-feature-gpu-parity.py
sveltekit-frontend/scripts/atlas/prove-candidate-feature-gpu-parity.mts
```

The Python process is an **executor observer only**. It:

1. loads the exact `CandidateFeatureGpuPackV1` physical buffers;
2. requires `torch.cuda.is_available()`;
3. transfers feature values, presence, valid mask, lane mask, degraded identity and selected ordinal indices to CUDA;
4. performs `torch.index_select()` on-device using the selected CandidateOrdinals;
5. copies the selected buffers back;
6. verifies selected valid-mask values are all `1`;
7. verifies padded CUDA rows remain zero/invalid;
8. emits the observed buffers plus CUDA device/runtime telemetry.

The Python receipt does **not** become parity authority. The TypeScript orchestration script feeds the observed CUDA values/presence/ordinals back through `verifyCandidateFeatureGpuParity()` and requires the resulting canonical receipt to say:

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

The TypeScript verifier rejects a non-CPU challenger when `gpuExecutionObserved != true`, so fixture data alone cannot be labeled a CUDA proof.

## Proof gates

- [ ] **FEAT-03D-01** physical row padding is deterministic under the declared power-of-two alignment.
- [ ] **FEAT-03D-02** `validMask` is exactly the logical-row prefix and padded rows are zero.
- [ ] **FEAT-03D-03** padded physical rows carry no candidate identity and cannot be selected by CandidateOrdinal.
- [ ] **FEAT-03D-04** missing evidence (`0 + presence=0`) remains distinct from a real zero (`0 + presence=1`) after packing.
- [ ] **FEAT-03D-05** gather preserves exact selected CandidateOrdinal order.
- [ ] **FEAT-04-01** PyTorch CUDA execution is actually observed on the workstation GPU.
- [ ] **FEAT-04-02** CUDA gather CandidateOrdinals equal the CPU gather CandidateOrdinals exactly.
- [ ] **FEAT-04-03** CUDA float32 feature values equal CPU reference values exactly.
- [ ] **FEAT-04-04** CUDA uint8 feature-presence values equal CPU reference values exactly.
- [ ] **FEAT-04-05** CUDA lane/degraded metadata equals the CPU reference.
- [ ] **FEAT-04-06** CUDA padded rows remain masked and zero.
- [ ] **FEAT-04-07** final acceptance is emitted by `CandidateFeatureGpuParityReceiptV1`, not by the Python observer.

All remain unchecked until workstation execution.

## Workstation validation

```powershell
cd C:\Users\james\Videos\deeds_web_app\sveltekit-frontend

node_modules\.bin\vitest run `
  src/lib/server/atlas/features/candidate-feature-gpu-pack-v1.spec.ts

npx tsx scripts/atlas/prove-candidate-feature-gpu-parity.mts
```

Expected terminal status when CUDA is available and exact parity holds:

```text
CANDIDATE_FEATURE_GPU_PARITY_BOUNDED_PROVEN
```

If PyTorch CUDA is unavailable, the proof must return a blocker/non-zero status. CPU reference parity alone must not promote FEAT-04.

## Safety

The bounded proof writes only temporary local JSON files and deletes them afterward. It does not mutate Postgres, Qdrant, Valkey, Neo4j, SearchRuntime, candidate identity, or canonical artifacts.

## Still deferred

- FANOUT-01 Qdrant/cuVS/CAGRA/TurboVec result normalization to CandidateOrdinal
- GPU-resident artifact lease/ownership
- LibTorch/C++ challenger parity (the old Torch branch remains a reference, not an owner)
- production ranking changes
- automatic GPU promotion

FANOUT remains behind successful FEAT-03C mmap and FEAT-04 CUDA parity proof.
