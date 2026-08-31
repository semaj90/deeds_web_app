# Candidate Feature GPU Residency + Batch Handoff Addendum

Status: **IMPLEMENTED_UNPROVEN**

### 2026-08-31 runtime separation update

The live `atlas-neural-decoder` container is now a separate, proven learned
projection runtime (`torch 2.13.0+cu132`, port `8121`). The workstation
`torch 2.8.0+cu128` probe remains a reference environment only. Neither
runtime changes this addendum's ownership rules: PyTorch/cuTile/SIMT/RMM are
execution or allocation providers, while CandidateOrdinal, artifact
checksums, and canonical PostgreSQL lineage remain outside the GPU cache.

The decoder health/lineage proof does **not** close GPU-BATCH-01..10. Those
gates still require a valid FEAT-04 pack/gather envelope and an owner-process
residency receipt. cuTile, SIMT, and RMM remain challenger lanes until the
PyTorch reference and residency input are available.

This tranche extends the merged FEAT-03D/FEAT-04 physical-pack/CUDA-parity work through owner-process GPU residency and a lease-bound batch request. It does not alter canonical identity, FANOUT admission, graph revision authority, retrieval fusion, or external stores.

## Runtime path

```text
CandidateFeatureGpuPackV1
        ↓ source checksum validation
host staging
  PAGEABLE_SYNC | PINNED_ASYNC
        ↓
owner-process CUDA buffers
        ↓ readback
CandidateFeatureGpuResidencyObservationV1
        ↓ lineage binding
CandidateFeatureGpuResidencyLeaseV1
        ↓
GPU_RESIDENT ArtifactAddressV1[]
        ↓
CandidateFeatureGpuBatchRequestV1
  actionId
  leaseId + leaseEpoch + leaseChecksum
  candidateOrdinals[]
  topK
  opaque buffer refs
        ↓
owner CUDA executor
```

The request carries no feature matrix and no raw GPU pointer. `CandidateOrdinal` remains snapshot-scoped execution identity only.

## Lease-bound request invariants

A batch request is rejected when any of these are true:

- lease is expired or inactive;
- lease ID/epoch/checksum do not match;
- any candidate ordinal is outside `logicalRows`;
- duplicate ordinals appear;
- `topK` exceeds the candidate count;
- any expected GPU buffer role is missing/duplicated;
- an opaque `bufferId`, artifact ID, checksum, device ID, or role is substituted;
- request checksum fails.

The request therefore expresses:

```text
calculate over CandidateOrdinal[]
using these exact verified resident artifacts
under this exact active lease
```

rather than serializing tensors through JSON/protobuf.

## CUDA IPC remains deferred

This tranche intentionally keeps:

```text
ownerProcessResident = true
cudaIpcExported = false
```

CUDA IPC is only needed when another process must import the allocation. It should be implemented behind a dedicated allocation/export owner instead of exposing allocator-dependent pointers as Atlas identity.

## Host staging remains observable

Pinned memory is not promoted as an unconditional optimization. `PINNED_ASYNC` and `PAGEABLE_SYNC` remain distinct receipt values so the RTX workstation can benchmark actual transfer behavior before making residency policy decisions.

## Added files

```text
sveltekit-frontend/src/lib/server/atlas/features/
  candidate-feature-gpu-batch-request-v1.ts
  candidate-feature-gpu-batch-request-v1.spec.ts
```

The underlying residency implementation already lives on current `main`:

```text
candidate-feature-gpu-residency-v1.ts
parent_atlas_tensor/gpu_resident_executor.py
prove-candidate-feature-gpu-residency.py
```

## Proof gates

- [ ] GPU-BATCH-01 active lease required.
- [ ] GPU-BATCH-02 exact lease ID/epoch/checksum required.
- [ ] GPU-BATCH-03 only logical CandidateOrdinals accepted.
- [ ] GPU-BATCH-04 no duplicate ordinals.
- [ ] GPU-BATCH-05 topK bounded by candidate count.
- [ ] GPU-BATCH-06 all five opaque GPU buffer refs match the lease.
- [ ] GPU-BATCH-07 substituted buffer ID/checksum/device rejected.
- [ ] GPU-BATCH-08 request checksum verifies.
- [ ] GPU-BATCH-09 no bulk tensor bytes are present in the request.
- [ ] GPU-BATCH-10 identityAuthority=false and canonicalOwnerChanged=false.

All remain unchecked until workstation execution.

## Workstation proof

```powershell
cd C:\Users\james\Videos\deeds_web_app\sveltekit-frontend
node_modules\.bin\vitest run `
  src/lib/server/atlas/features/candidate-feature-gpu-residency-v1.spec.ts `
  src/lib/server/atlas/features/candidate-feature-gpu-batch-request-v1.spec.ts
```

Then run the existing real-CUDA residency proof against the FEAT-04 envelope:

```powershell
cd C:\Users\james\Videos\deeds_web_app
python scripts/atlas/prove-candidate-feature-gpu-residency.py --input <feat04-envelope.json>
```

Required real-CUDA terminal status remains:

```text
CANDIDATE_FEATURE_GPU_RESIDENCY_BOUNDED_PROVEN
```

## Next seam

After these proofs are green, implement the worker-facing adapter that accepts `CandidateFeatureGpuBatchRequestV1`, resolves the lease in the CUDA owner process, executes `GATHER`/bounded `RANK`, and returns ranked CandidateOrdinals plus a receipt. gRPC may transport that compact request/receipt, but bulk resident buffers remain in the GPU owner process.

FANOUT remains behind its separate revision-authority/read-only admission gates.
