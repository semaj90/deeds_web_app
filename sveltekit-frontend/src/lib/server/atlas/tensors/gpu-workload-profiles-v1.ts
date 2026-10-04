/**
 * Workload-specific GPU admission profiles (replaces the single KMEANS_MIN_FREE_MIB=4096 placeholder).
 *
 * This module owns NO admission logic. It maps a named workload to the inputs of the existing owner,
 * `decideGpuMemoryAdmissionV1()` (BITFROST-GPU-MEMORY-ADMISSION-01): requestedBytes = the measured need,
 * reservedHeadroom = minimumFreeMiB - measuredNeedMiB, and `decoderActive` is passed through so the
 * owner's decoder reserve applies when the Ornith server is up. A workload without a measurement is
 * DEFERred with a reason; no number is ever guessed.
 *
 * Evidence levels: MEASURED (this repo's own run), EXISTING_LEDGER (a figure already recorded in the
 * lane-consolidation tasks.md), MEASURE_FIRST (no figure), USE_EXISTING_HEADROOM_GATE (small fixtures
 * go through the existing headroom gate, not a profile number). `canonicalAuthority` is always false.
 */
import {
  decideGpuMemoryAdmissionV1,
  type GpuMemoryAdmissionInputV1,
  type GpuMemoryAdmissionV1,
} from './gpu-memory-admission-v1.js';

export const MIB = 1024 * 1024;

export type GpuWorkloadIdV1 =
  | 'CUVS_KMEANS_SMALL'
  | 'CUVS_KMEANS_MEDIUM'
  | 'CUVS_KMEANS_CORPUS'
  | 'CUVS_CAGRA_64K'
  | 'CUGRAPH_PAGERANK'
  | 'BITFROST_L2'
  | 'CUTILE_FIXTURE';

export type GpuWorkloadEvidenceV1 = 'MEASURED' | 'EXISTING_LEDGER' | 'MEASURE_FIRST' | 'USE_EXISTING_HEADROOM_GATE';

export interface GpuWorkloadProfileV1 {
  id: GpuWorkloadIdV1;
  /** WSL2 `atlas-rapids-cu13` unless noted. */
  description: string;
  measuredNeedMiB: number | null;
  minimumFreeMiB: number | null;
  evidence: GpuWorkloadEvidenceV1;
  evidenceNote: string;
}

export const GPU_WORKLOAD_PROFILES_V1: Readonly<Record<GpuWorkloadIdV1, GpuWorkloadProfileV1>> = {
  CUVS_KMEANS_SMALL: {
    id: 'CUVS_KMEANS_SMALL',
    description: 'cuVS KMeans, up to ~20k x 768 rows (run_cuvs_soft_kmeans)',
    measuredNeedMiB: 512,
    minimumFreeMiB: 1024,
    evidence: 'MEASURED',
    evidenceNote: '2026-10-04 synthetic runs: +~200 MiB at 5,000 x 768 (K=32) and +~330 MiB at 20,000 x 768 (K=64) over a ~1.3 GiB desktop baseline, rounded up to 512. Real semantic_768 (5,000 rows, K=64, 19 iterations): +252 MiB over the run minimum (peak 1,745 MiB total), consistent with 512; 20,000 real rows (K=64, 29 iterations): +391 MiB (peak 1,968 MiB total), still inside 512. 55k+ real rows not measured.',
  },
  CUVS_KMEANS_MEDIUM: {
    id: 'CUVS_KMEANS_MEDIUM',
    description: 'cuVS KMeans at ~55k x 768 rows (the content_embedding column size)',
    measuredNeedMiB: 768,
    minimumFreeMiB: 1536,
    evidence: 'MEASURED',
    evidenceNote: '2026-10-04 real semantic_768, 55,000 rows, K=64, 33 iterations: +591 MiB over the run minimum (peak 2,182 MiB total), rounded up to 768. Growth was sub-linear: +252 (5k), +391 (20k), +591 (55k).',
  },
  CUVS_KMEANS_CORPUS: {
    id: 'CUVS_KMEANS_CORPUS',
    description: 'cuVS KMeans over the whole corpus (219,998 x 768 rows)',
    measuredNeedMiB: 1536,
    minimumFreeMiB: 3072,
    evidence: 'MEASURED',
    evidenceNote: '2026-10-04 real semantic_768, all 219,998 rows (content_embedding_768, ORDER BY id), K=64, 27 iterations, 110 s: peak 2,516 MiB total, about 1,419 MiB above the lowest sample (1,097), rounded up to 1536. Growth by rows: +252 (5k), +391 (20k), +591 (55k), +1,419 (220k). The WSL host was under memory pressure during the run (pinned host memory could not be allocated, synchronous transfer used); that affects wall time, not the VRAM figure.',
  },
  CUVS_CAGRA_64K: {
    id: 'CUVS_CAGRA_64K',
    description: 'cuVS CAGRA / exact ANN at N >= 64K x 768',
    measuredNeedMiB: null,
    minimumFreeMiB: null,
    evidence: 'MEASURE_FIRST',
    evidenceNote: 'Recall is recorded; VRAM is not.',
  },
  CUGRAPH_PAGERANK: {
    id: 'CUGRAPH_PAGERANK',
    description: 'cuGraph BFS / PageRank (162,234 nodes / 108,156 edges parity)',
    measuredNeedMiB: null,
    minimumFreeMiB: null,
    evidence: 'MEASURE_FIRST',
    evidenceNote: 'Parity is recorded; VRAM is not.',
  },
  BITFROST_L2: {
    id: 'BITFROST_L2',
    description: 'BITFROST-L2-01 rerun (L2 persistence benchmark)',
    measuredNeedMiB: 1024,
    minimumFreeMiB: 2048,
    evidence: 'EXISTING_LEDGER',
    evidenceNote: 'Ledger reference: 3 MB persist + 3 MB set-aside + 1024 MB streaming buffer; isolated GPU or record null.',
  },
  CUTILE_FIXTURE: {
    id: 'CUTILE_FIXTURE',
    description: 'cuTile / SIMT ACE-RADIX fixtures (N <= 64,000)',
    measuredNeedMiB: null,
    minimumFreeMiB: null,
    evidence: 'USE_EXISTING_HEADROOM_GATE',
    evidenceNote: 'Tiny buffers; admitted by the existing headroom gate, not a profile number.',
  },
};

export interface GpuWorkloadObservationV1 {
  /** Free bytes observed out-of-process (nvidia-smi). */
  deviceFreeObserved: number | null;
  wddmBudget?: number | null;
  wddmCurrentUsage?: number | null;
  cudaContextFree?: number | null;
  /** True while the Ornith llama-server (:8090) is live: the owner then withholds its decoder reserve. */
  decoderActive: boolean;
}

export interface GpuWorkloadAdmissionV1 {
  schema: 'atlas.gpu-workload-admission.v1';
  workload: GpuWorkloadIdV1;
  evidence: GpuWorkloadEvidenceV1;
  decision: 'ADMIT' | 'DEFER' | 'EVICT_THEN_ADMIT' | 'REJECT';
  reason: string;
  /** The owner's receipt, present only when the owner was consulted. */
  admission: GpuMemoryAdmissionV1 | null;
  canonicalAuthority: false;
  writesPerformed: false;
}

/** Route a named workload through `decideGpuMemoryAdmissionV1()`. Unmeasured workloads are DEFERred, never guessed. */
export function admitGpuWorkloadV1(
  workload: GpuWorkloadIdV1,
  observation: GpuWorkloadObservationV1,
): GpuWorkloadAdmissionV1 {
  const profile = GPU_WORKLOAD_PROFILES_V1[workload];
  if (!profile) throw new Error(`UNKNOWN_GPU_WORKLOAD: ${String(workload)}`);
  const base = { schema: 'atlas.gpu-workload-admission.v1' as const, workload, evidence: profile.evidence, canonicalAuthority: false as const, writesPerformed: false as const };

  if (profile.measuredNeedMiB === null || profile.minimumFreeMiB === null) {
    return {
      ...base,
      decision: 'DEFER',
      reason: profile.evidence === 'USE_EXISTING_HEADROOM_GATE'
        ? 'small fixture: use the existing headroom gate directly (no profile number)'
        : `no measured need for ${workload}; measure first (${profile.evidenceNote})`,
      admission: null,
    };
  }

  const input: GpuMemoryAdmissionInputV1 = {
    deviceFreeObserved: observation.deviceFreeObserved,
    wddmBudget: observation.wddmBudget ?? null,
    wddmCurrentUsage: observation.wddmCurrentUsage ?? null,
    cudaContextFree: observation.cudaContextFree ?? null,
    requestedBytes: profile.measuredNeedMiB * MIB,
    reservedHeadroom: (profile.minimumFreeMiB - profile.measuredNeedMiB) * MIB,
    decoderActive: observation.decoderActive,
    evidenceRefs: [`profile:${workload}:${profile.evidence}`],
  };
  const admission = decideGpuMemoryAdmissionV1(input);
  return { ...base, decision: admission.decision, reason: admission.reason, admission };
}
