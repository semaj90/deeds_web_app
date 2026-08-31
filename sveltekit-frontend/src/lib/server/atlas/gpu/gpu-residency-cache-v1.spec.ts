import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { GpuResidencyCacheV1, gpuArtifactKeyChecksumV1 } from './gpu-residency-cache-v1.js';

const H = (value: string) => createHash('sha256').update(value).digest('hex');
const key = (revision = 'semantic:r1', payload = 'payload') => ({
  schema: 'atlas.gpu-artifact-key.v1' as const, artifactKind: 'CANDIDATE_FEATURE_MATRIX', artifactRevision: revision,
  candidateSnapshotRevision: 'candidate:r1', graphRevision: null, projectionRevision: null, representationRevision: 'semantic_768:r1',
  ordinalMapChecksum: H('ordinal-map'), payloadChecksum: H(payload), dtype: 'float32' as const, shape: [32, 12], layout: 'row-major-f32',
  deviceId: 0, materializationPolicyRevision: 'gpu-policy:r1',
});

describe('GpuResidencyCacheV1', () => {
  it('reuses an exact revision-qualified entry and rejects movable revisions', () => {
    const cache = new GpuResidencyCacheV1<string>(100, () => 1);
    expect(cache.get(key())).toMatchObject({ status: 'MISS' });
    expect(cache.set(key(), 'resident-buffer', 40).status).toBe('STORED');
    expect(cache.get(key())).toMatchObject({ status: 'HIT', value: 'resident-buffer', bytes: 40 });
    expect(() => cache.set({ ...key(), artifactRevision: 'semantic:latest' }, 'bad', 1)).toThrow(/MOVABLE_REVISION/);
  });

  it('invalidates only entries bound to the changed revision', () => {
    const cache = new GpuResidencyCacheV1<string>(100, () => 1);
    cache.set(key('semantic:r1', 'one'), 'one', 40);
    cache.set(key('semantic:r2', 'two'), 'two', 40);
    expect(cache.invalidateByRevision('semantic:r1')).toBe(1);
    expect(cache.get(key('semantic:r1', 'one')).status).toBe('MISS');
    expect(cache.get(key('semantic:r2', 'two')).status).toBe('HIT');
  });

  it('evicts least-recently-used entries deterministically under byte pressure', () => {
    let now = 0;
    const cache = new GpuResidencyCacheV1<string>(80, () => now);
    cache.set(key('r1', 'one'), 'one', 40); now += 1;
    cache.set(key('r2', 'two'), 'two', 40); now += 1;
    cache.get(key('r1', 'one')); now += 1;
    expect(cache.set(key('r3', 'three'), 'three', 40).evicted).toBe(1);
    expect(cache.get(key('r1', 'one')).status).toBe('HIT');
    expect(cache.get(key('r2', 'two')).status).toBe('MISS');
    expect(cache.get(key('r3', 'three')).status).toBe('HIT');
    expect(gpuArtifactKeyChecksumV1(key('r1', 'one'))).toHaveLength(64);
  });
});
