# Candidate Feature GPU Pack + Parity Addendum

Status: **IMPLEMENTED_UNPROVEN**

This addendum extends the candidate feature execution fabric through FEAT-03D and FEAT-04 without promoting GPU residency, executor fanout, or canonical identity ownership.

## Boundary

```text
CandidateFeatureColumnarV1
  logicalRows = N
        |
        v
CandidateFeatureGpuPackV1
  physicalRows = align_up(N, rowAlignment)
  validMask[0:N] = 1
  validMask[N:physicalRows] = 0
  padded feature values = 0
  padded presence = 0
  padded lane/degraded metadata = 0
        |
        +--> CPU gather reference
        |
        `--> PyTorch CUDA gather challenger
                |
                v
CandidateFeatureGpuParityReceiptV1
```

`CandidateOrdinal` remains snapshot-local execution coordinate under `candidateSnapshotRevision`. Valid physical rows preserve `physicalRow == CandidateOrdinal` only for the logical prefix. Padded rows are not candidates and carry no identity.

## FEAT-03D physical pack contract

Implemented:

```text
sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-gpu-pack-v1.ts
sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-gpu-pack-v1.spec.ts
sveltekit-frontend/scripts/atlas/prove-candidate-feature-gpu-pack.mts
```

`CandidateFeatureGpuPackV1` records:

```text
logicalRows
physicalRows
paddingRows
rowAlignment
featureCount = 12
featureValues      float32 [physicalRows, 12]
featurePresence    uint8   [physicalRows, 12]
validMask          uint8   [physicalRows]
laneMaskU16        uint16 source semantics [physicalRows]
degradedIdentity  uint8   [physicalRows]
```

Default `rowAlignment=32`; callers may choose another bounded power-of-two alignment. No logical padding occurs. For `row >= logicalRows` every physical field is zero and `validMask=0`.

The pack receipt explicitly states:

```text
paddingPolicy = ZERO_INVALID_MASKED_V1
logicalOrdinalEqualsPhysicalRowForValidPrefix = true
paddedRowsCarryIdentity = false
gpuResident = false
identityAuthority = false
canonicalOwnerChanged = false
```

`gpuResident=false` is deliberate: producing a GPU-friendly physical buffer is not the same as allocating a durable GPU-resident artifact or lease.

## CPU gather reference

`gatherCandidateFeatureGpuRows()` accepts only logical CandidateOrdinal values, rejects duplicates and padded/out-of-range rows, and preserves requested ordinal order. It emits deterministic checksums for selected ordinals, values, presence bits and the full gather receipt.

## FEAT-04 canonical parity receipt

Implemented:

```text
sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-gpu-parity-v1.ts
sveltekit-frontend/scripts/atlas/verify-candidate-feature-gpu-parity.mts
scripts/atlas/prove-candidate-feature-gpu-parity.py
```

`CandidateFeatureGpuParityReceiptV1` requires all of:

```text
ordinalParity = true
featureValueParity = true
featurePresenceParity = true
laneMaskParity = true
degradedIdentityParity = true
paddingMaskParity = true
paddingZeroParity = true
maxAbsFeatureDelta = 0
```

A CPU-only reference may emit `challenger=CPU_PACK_REFERENCE` only with `gpuExecutionObserved=false`.

Any CUDA-labelled challenger (`PYTORCH_CUDA`, `LIBTORCH_CUDA`, `CUDF_CUDA`) must have `gpuExecutionObserved=true`; otherwise the verifier fails closed.

## Real PyTorch CUDA challenger

`scripts/atlas/prove-candidate-feature-gpu-parity.py` does not fall back to CPU.

It requires:

1. PyTorch import succeeds.
2. `torch.cuda.is_available()` is true.
3. the exact `CandidateFeatureGpuPackV1` buffers are allocated/copied to CUDA;
4. selected CandidateOrdinal rows are gathered on-device with `torch.index_select`;
5. gathered values/presence/lane/degraded metadata are copied back and compared exactly to the CPU gather reference;
6. padded CUDA rows remain zero and invalid;
7. only then it emits `CANDIDATE_FEATURE_GPU_PARITY_PROVEN` with `gpuExecutionObserved=true`.

If PyTorch import or CUDA availability fails, the script emits `GPU_PARITY_BLOCKED` and exits nonzero.

The Python observation does not mint the canonical TypeScript parity receipt. `verify-candidate-feature-gpu-parity.mts` checks the observation against the original `columnarChecksum`, `gpuPackChecksum`, `gatherChecksum`, ordinals, values and presence before producing `CandidateFeatureGpuParityReceiptV1`.

## Proof gates

- [ ] **FEAT-03D-01** physical row count aligns deterministically from logical row count.
- [ ] **FEAT-03D-02** logical prefix preserves `physicalRow == CandidateOrdinal`.
- [ ] **FEAT-03D-03** padded rows have `validMask=0` and all feature/presence/metadata cells zero.
- [ ] **FEAT-03D-04** no padded row can be selected by logical CandidateOrdinal gather.
- [ ] **FEAT-03D-05** missing `0/presence=0` remains distinct from real `0/presence=1` after packing.
- [ ] **FEAT-03D-06** pack and gather checksums are deterministic.
- [ ] **FEAT-04-01** CPU reference gather has exact ordinal/value/presence parity.
- [ ] **FEAT-04-02** CUDA challenger cannot be claimed without observed CUDA execution.
- [ ] **FEAT-04-03** PyTorch CUDA gathers the requested CandidateOrdinal order exactly.
- [ ] **FEAT-04-04** CUDA feature values and presence bits equal CPU reference exactly (`maxAbsFeatureDelta=0`).
- [ ] **FEAT-04-05** CUDA padded rows remain zero + invalid.
- [ ] **FEAT-04-06** TypeScript verifier accepts the CUDA observation and emits the canonical parity receipt.

These gates remain unchecked until workstation execution.

## Workstation proof

```powershell
cd C:\Users\james\Videos\deeds_web_app\sveltekit-frontend

node_modules\.bin\vitest run `
  src/lib/server/atlas/features/candidate-feature-gpu-pack-v1.spec.ts

npx tsx scripts/atlas/prove-candidate-feature-gpu-pack.mts `
  --output=tmp/candidate-feature-gpu-parity-input.json
```

Expected CPU physical-pack status:

```text
CANDIDATE_FEATURE_GPU_PACK_BOUNDED_PROVEN
```

Then run actual CUDA from repository root:

```powershell
cd C:\Users\james\Videos\deeds_web_app

python scripts/atlas/prove-candidate-feature-gpu-parity.py `
  --input=sveltekit-frontend/tmp/candidate-feature-gpu-parity-input.json `
  --output=sveltekit-frontend/tmp/candidate-feature-gpu-cuda-observation.json
```

Required CUDA status:

```text
CANDIDATE_FEATURE_GPU_PARITY_PROVEN
```

Finally mint/recheck the canonical receipt:

```powershell
cd sveltekit-frontend

npx tsx scripts/atlas/verify-candidate-feature-gpu-parity.mts `
  --input=tmp/candidate-feature-gpu-parity-input.json `
  --observation=tmp/candidate-feature-gpu-cuda-observation.json
```

Required terminal status:

```text
CANDIDATE_FEATURE_GPU_PARITY_RECEIPT_PROVEN
```

No proof command above writes Postgres, Qdrant, Valkey, Neo4j, RabbitMQ, or a GPU-resident artifact registry.

## Still deferred

- FANOUT-01 executor result normalization to CandidateOrdinal
- Qdrant/cuVS/CAGRA/TurboVec executor adapters
- GPU-resident ArtifactAddressV1 lifecycle / lease verifier
- pinned-memory vs pageable-memory transfer benchmark
- executor-specific scatter/sort/compact kernels beyond the PyTorch gather proof

FANOUT-01 remains separately blocked by revision ownership in the canonical task ledger and must not be inferred from FEAT-04 parity.
