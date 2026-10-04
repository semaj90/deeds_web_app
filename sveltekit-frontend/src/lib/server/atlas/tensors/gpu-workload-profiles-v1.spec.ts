// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { GPU_WORKLOAD_PROFILES_V1, MIB, admitGpuWorkloadV1, type GpuWorkloadIdV1 } from './gpu-workload-profiles-v1.js';

const free = (mib: number, decoderActive: boolean) => ({ deviceFreeObserved: mib * MIB, decoderActive });

describe('gpu workload profiles route through decideGpuMemoryAdmissionV1', () => {
  it('measured small KMeans is admitted when the GPU is free (Ornith stopped, ~7 GiB free)', () => {
    const r = admitGpuWorkloadV1('CUVS_KMEANS_SMALL', free(6978, false));
    expect(r.decision).toBe('ADMIT');
    expect(r.admission?.schema).toBe('atlas.gpu-memory-admission.v1');
    expect(r.admission?.requestedBytes).toBe(512 * MIB);
    expect(r.admission?.reservedHeadroom).toBe(512 * MIB); // minimumFree 1024 - need 512
    expect(r).toMatchObject({ canonicalAuthority: false, writesPerformed: false, evidence: 'MEASURED' });
  });

  it('with the Ornith server up (~207 MiB free) the owner does not admit it', () => {
    const r = admitGpuWorkloadV1('CUVS_KMEANS_SMALL', free(207, true));
    expect(r.decision).not.toBe('ADMIT');
    expect(r.admission).not.toBeNull();
  });

  it('the decoder reserve applies even when raw free memory looks large', () => {
    // 2200 MiB free with a decoder live: the owner withholds its reserve (~1.9 GiB), leaving too little for 1024 MiB.
    const r = admitGpuWorkloadV1('CUVS_KMEANS_SMALL', free(2200, true));
    expect(r.decision).not.toBe('ADMIT');
  });

  it('an unmeasured workload is DEFERred with no guessed number and the owner is not consulted', () => {
    for (const id of ['CUVS_KMEANS_CORPUS', 'CUVS_CAGRA_64K', 'CUGRAPH_PAGERANK'] as GpuWorkloadIdV1[]) {
      const r = admitGpuWorkloadV1(id, free(6978, false));
      expect(r.decision).toBe('DEFER');
      expect(r.admission).toBeNull();
      expect(r.reason).toMatch(/measure first/);
      expect(GPU_WORKLOAD_PROFILES_V1[id].measuredNeedMiB).toBeNull();
    }
  });

  it('the 55k profile is measured above the small profile and is not admitted beside the Ornith server', () => {
    const small = GPU_WORKLOAD_PROFILES_V1.CUVS_KMEANS_SMALL;
    const medium = GPU_WORKLOAD_PROFILES_V1.CUVS_KMEANS_MEDIUM;
    expect(medium.evidence).toBe('MEASURED');
    expect(medium.measuredNeedMiB!).toBeGreaterThan(small.measuredNeedMiB!);
    expect(admitGpuWorkloadV1('CUVS_KMEANS_MEDIUM', free(6403, false)).decision).toBe('ADMIT');
    expect(admitGpuWorkloadV1('CUVS_KMEANS_MEDIUM', free(207, true)).decision).not.toBe('ADMIT');
  });

  it('BITFROST_L2 uses the existing-ledger figures (need 1024, minimum free 2048)', () => {
    const profile = GPU_WORKLOAD_PROFILES_V1.BITFROST_L2;
    expect([profile.measuredNeedMiB, profile.minimumFreeMiB, profile.evidence]).toEqual([1024, 2048, 'EXISTING_LEDGER']);
    expect(admitGpuWorkloadV1('BITFROST_L2', free(6978, false)).decision).toBe('ADMIT');
    expect(admitGpuWorkloadV1('BITFROST_L2', free(1500, false)).decision).not.toBe('ADMIT');
  });

  it('cuTile fixtures defer to the existing headroom gate', () => {
    const r = admitGpuWorkloadV1('CUTILE_FIXTURE', free(6978, false));
    expect(r.decision).toBe('DEFER');
    expect(r.reason).toMatch(/existing headroom gate/);
  });

  it('an unknown workload fails closed', () => {
    expect(() => admitGpuWorkloadV1('NOPE' as never, free(6978, false))).toThrow(/UNKNOWN_GPU_WORKLOAD/);
  });
});
