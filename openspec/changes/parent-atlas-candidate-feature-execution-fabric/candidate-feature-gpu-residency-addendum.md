# Candidate Feature GPU Residency Lifecycle Addendum

Status: **IMPLEMENTED_UNPROVEN**

This addendum advances the already-merged FEAT-03D/FEAT-04 physical-pack and CUDA-parity boundary into a real owner-process GPU residency lifecycle without changing canonical identity, graph/FANOUT authority, or external store ownership.

## Runtime boundary

```text
CandidateFeatureGpuPackV1
  gpuResident = false
        |
        | verify source buffer checksums
        v
host staging
  PAGEABLE_SYNC
  or PINNED_ASYNC
        |
        v
owner-process CUDA allocations
  feature_values      f32 [physicalRows, 12]
  feature_presence    u8  [physicalRows, 12]
  valid_mask          u8  [physicalRows]
  lane_mask           i32 [physicalRows]
  degraded_identity   u8  [physicalRows]
        |
        | readback verification
        v
CandidateFeatureGpuResidencyObservationV1
        |
        | bind exact FEAT-03D lineage
        v
CandidateFeatureGpuResidencyLeaseV1
        |
        +--> five GPU_RESIDENT ArtifactAddressV1 refs
        |
        +--> ordinal gather in owner CUDA process
        |
        `--> CandidateFeatureGpuReleaseReceiptV1
```

The durable contract contains opaque `bufferId` values. It never exports raw CUDA addresses.

## Why CUDA IPC is deferred

This tranche intentionally records:

```text
ownerProcessResident = true
cudaIpcExported = false
```

CUDA IPC is a second-process sharing mechanism, not a prerequisite for proving GPU residency. NVIDIA documents `cudaIpcGetMemHandle()` / `cuIpcGetMemHandle()` as exporting an existing allocation through its allocation base pointer. Parent Atlas should therefore add IPC only behind a dedicated allocation owner/export adapter rather than treating an arbitrary PyTorch caching-allocator tensor pointer as durable IPC identity.

## Host staging

The worker supports two explicit modes:

```text
PAGEABLE_SYNC
PINNED_ASYNC
```

Pinned staging uses page-locked host tensors plus a non-default CUDA stream and `non_blocking=True`, then synchronizes before publishing the observation. Pageable staging uses a synchronous copy. The mode is part of the receipt because pinned memory has allocation/copy overhead and is a benchmarkable execution choice, not canonical identity.

## Lease invariants

A `CandidateFeatureGpuResidencyLeaseV1` is admitted only when:

- observation checksum is valid;
- `sourceGpuPackChecksum` equals the exact FEAT-03D pack checksum;
- candidate snapshot / ordinal map / feature snapshot / columnar lineage matches;
- all five source buffer checksums match the FEAT-03D pack;
- observed dtype and shape match the frozen physical representation;
- every resulting address is `GPU_RESIDENT` on the same device;
- issue/expiry interval is valid;
- canonical identity ownership remains false.

The lease includes:

```text
leaseId
leaseEpoch
sourceGpuPackChecksum
candidateSnapshotRevision
ordinalMapChecksum
featureSnapshotChecksum
columnarChecksum
workspaceRevision
featureRevision
logicalRows
physicalRows
featureCount
deviceId
deviceName
hostStagingMode
artifacts[]
issuedAt
expiresAt
leaseChecksum
```

The generic `GPU_RESIDENT` locator remains deliberately small:

```text
deviceId
bufferId
dtype
shape
```

Lease lifecycle metadata is not duplicated into every generic artifact locator.

## Release semantics

Release is append-style evidence rather than mutation of the immutable lease:

```text
ACTIVE lease
   |
   v
CandidateFeatureGpuReleaseReceiptV1
   state = RELEASED
```

The owner process deletes its resident tensor references on release. A bounded proof must demonstrate that a subsequent gather using the released lease ID fails.

## Implemented files

```text
sveltekit-frontend/src/lib/server/atlas/features/
  candidate-feature-gpu-residency-v1.ts
  candidate-feature-gpu-residency-v1.spec.ts

sveltekit-frontend/python/parent_atlas_tensor/
  gpu_resident_executor.py
  test_gpu_resident_executor.py

scripts/atlas/
  prove-candidate-feature-gpu-residency.py
```

## Proof gates

- [ ] **GPU-RES-01** FEAT-03D source checksums are revalidated before CUDA allocation.
- [ ] **GPU-RES-02** real CUDA allocation is observed for all five physical buffers.
- [ ] **GPU-RES-03** CUDA readback verifies each materialized buffer before lease publication.
- [ ] **GPU-RES-04** lease lineage exactly matches FEAT-03D pack lineage.
- [ ] **GPU-RES-05** lease-bound `GPU_RESIDENT` addresses cannot be substituted across role/device/checksum.
- [ ] **GPU-RES-06** CandidateOrdinal gather executes on the resident CUDA tensors and matches FEAT-04 CPU gather reference.
- [ ] **GPU-RES-07** release removes owner-process residency and subsequent access is blocked.
- [ ] **GPU-RES-08** pinned/pageable staging mode is explicit in the observation/lease.
- [ ] **GPU-RES-09** no Postgres/Qdrant/Neo4j/Valkey/RabbitMQ mutation occurs.
- [ ] **GPU-RES-10** CUDA IPC remains false until a dedicated cross-process allocation/export proof exists.

All remain unchecked until workstation execution.

## Workstation proof

First run contract and Python tests:

```powershell
cd C:\Users\james\Videos\deeds_web_app\sveltekit-frontend
node_modules\.bin\vitest run src/lib/server/atlas/features/candidate-feature-gpu-residency-v1.spec.ts
python -m unittest python.parent_atlas_tensor.test_gpu_resident_executor
```

Then reuse a FEAT-04 envelope containing the exact `pack` and CPU `gather` reference:

```powershell
cd C:\Users\james\Videos\deeds_web_app
python scripts/atlas/prove-candidate-feature-gpu-residency.py --input <feat04-envelope.json>
```

Required terminal status:

```text
CANDIDATE_FEATURE_GPU_RESIDENCY_BOUNDED_PROVEN
```

If PyTorch/CUDA is unavailable, the proof emits `GPU_RESIDENCY_BLOCKED` and returns non-zero.

## Still deferred

```text
CUDA IPC export/import lifecycle
multi-process GPU sharing
gRPC ExecuteTensorBatch server wiring
weighted/learned GPU rank kernel
cuVS/CAGRA/TurboVec FANOUT adapters
ACE/BitFrost resident-cache publication
pinned-vs-pageable throughput benchmark
```

FANOUT remains governed by its separate revision-authority/read-only admission gates. GPU residency does not imply FANOUT admission or canonical identity authority.
