import { describe, expect, it } from 'vitest';
import {
  UnifiedResidencyAdapter, admitResidency, admitWithSharedGpuResidencyLeaseV1, assertNoPersistedGpuState, descriptorCacheKey,
  domainRoutingCacheKey, packFloat32Tile, requireProvider, routeDomainWithLut, serializeResidencyControl, transitionResidency, unpackFloat32Tile, validateUnifiedDescriptor, type UnifiedResidencyDescriptor
} from './unified-residency-adapter-v1';

const base: UnifiedResidencyDescriptor = {
  schema: 'atlas.unified-residency.v1', residencyKey: 'tile-0', kind: 'FEATURE_TILE',
  workspaceRevision: 'wr-1', sourceRevision: 'sr-1', representationRevision: 'rep-1', featureRevision: 'feat-1',
  modelRevision: 'model-1', tokenizerRevision: 'tok-1', ropeRevision: 'rope-1', candidateOrdinal: 0,
  artifactChecksum: 'sha256:artifact', shape: [256, 768], dtype: 'float16', byteLength: 393216, state: 'EMPTY'
};

describe('unified residency adapter v1', () => {
  it('routes only an exact, revisioned LUT entry', () => {
    const result = routeDomainWithLut({ domain: 'contracts', lutRevision: 'lut-1', table: { contracts: { lutRevision: 'lut-1', tokenBudget: 512, featureMask: ['lexical', 'ast'], tileWidth: 256, contextWindow: 1024, residencyPriority: 1 } } });
    expect(result.tileWidth).toBe(256);
    expect(domainRoutingCacheKey({ domain: 'contracts', lutRevision: 'lut-1', table: { contracts: result } })).not.toBe(domainRoutingCacheKey({ domain: 'contracts', lutRevision: 'lut-2', table: { contracts: { ...result, lutRevision: 'lut-2' } } }));
    expect(() => routeDomainWithLut({ domain: 'contracts', lutRevision: 'lut-2', table: { contracts: result } })).toThrow('DOMAIN_LUT_STALE_OR_MISSING');
  });
  it('validates lineage and rejects RoPE-incomplete KV descriptors', () => {
    validateUnifiedDescriptor(base);
    expect(() => validateUnifiedDescriptor({ ...base, kind: 'TRANSFORMER_KV', contextWindow: 512 })).toThrow('positionBase_REQUIRED');
    expect(() => validateUnifiedDescriptor({ ...base, sourceRevision: '' })).toThrow('sourceRevision_REQUIRED');
  });
  it('enforces state transitions, leases, LRU, and ceiling', () => {
    expect(transitionResidency('EMPTY', 'LOADING')).toBe('LOADING');
    expect(() => transitionResidency('EMPTY', 'RESIDENT')).toThrow();
    const adapter = new UnifiedResidencyAdapter(500000);
    adapter.admit(base);
    expect(adapter.acquire('tile-0').state).toBe('IN_USE');
    adapter.release('tile-0');
    expect(adapter.evictLeastRecentlyUsed()?.state).toBe('EVICTED');
    expect(() => admitResidency({ ...base, byteLength: 700000 }, 500000, 0)).toThrow('GPU_RESIDENCY_BUDGET_EXCEEDED');
  });
  it('keys all revision and artifact inputs and blocks GPU-state persistence', () => {
    expect(descriptorCacheKey(base)).not.toBe(descriptorCacheKey({ ...base, ropeRevision: 'rope-2' }));
    expect(() => assertNoPersistedGpuState({ tensor: true })).toThrow('GPU_STATE_MUST_NOT_BE_PERSISTED');
    expect(() => assertNoPersistedGpuState({ workspaceRevision: 'wr-1', artifactChecksum: 'sha256:x' })).not.toThrow();
  });
  it('packs typed numeric tiles without JSON and rejects unavailable providers', () => {
    const packed = packFloat32Tile([1, 2, 3]);
    expect(unpackFloat32Tile(packed.buffer, 3)).toEqual(new Float32Array([1, 2, 3]));
    expect(() => packFloat32Tile([Number.NaN])).toThrow('NUMERIC_TILE_NONFINITE');
    expect(() => requireProvider(null, 'TITANS_MEMORY')).toThrow('TITANS_MEMORY_PROVIDER_UNAVAILABLE');
    expect(JSON.parse(serializeResidencyControl(base)).artifactChecksum).toBe('sha256:artifact');
  });
  it('loads through the matching provider and retains no buffer', async () => {
    const adapter = new UnifiedResidencyAdapter(500000);
    const loaded = await adapter.load({ ...base, residencyKey: 'provider-tile' }, {
      kind: 'FEATURE_TILE',
      async load(descriptor) { return { byteLength: descriptor.byteLength, buffer: new Uint8Array(descriptor.byteLength) }; }
    });
    expect(loaded.state).toBe('RESIDENT');
    expect(() => adapter.acquire('provider-tile')).not.toThrow();
    await expect(adapter.load({ ...base, residencyKey: 'bad-provider' }, {
      kind: 'FEATURE_TILE',
      async load() { return null; }
    })).rejects.toThrow('RESIDENCY_BUFFER_LENGTH_MISMATCH');
  });

  it('routes executor admission through the shared budget owner before residency', () => {
    const adapter = new UnifiedResidencyAdapter(500000);
    const budget = {
      schema: 'atlas.gpu-residency-budget.v1' as const,
      telemetry: { schema: 'atlas.gpu-memory-telemetry.v1' as const, source: 'nvml' as const, capturedAt: '2026-09-20T00:00:00.000Z', totalVramBytes: 8_000_000_000, freeVramBytes: 4_000_000_000, usedVramBytes: 4_000_000_000 },
      policy: {} as never,
      requestedCandidateCount: 1,
      requestedCandidateBucket: 32,
      totalReservedBytes: 0,
      leaseableBytes: 400000,
      semanticCacheBudgetBytes: 0,
      maxResidentVectors: 1,
      maxCandidateBucket: 32,
      executionTarget: 'gpu' as const,
      degraded: false,
      reason: 'test',
    };
    const lease = admitWithSharedGpuResidencyLeaseV1({ adapter, descriptor: base, budget, budgetRevision: 'budget-1', leaseId: 'lease:test:shared', leaseEpoch: 1, executor: 'pytorch_cuda' });
    expect(lease.admission).toBe('ALLOW');
    expect(adapter.usedBytes()).toBe(base.byteLength);
    expect(lease.writesPerformed).toBe(false);
  });

  it('rejects the executor before mutating residency when the shared budget is exceeded', () => {
    const adapter = new UnifiedResidencyAdapter(500000);
    const budget = {
      schema: 'atlas.gpu-residency-budget.v1' as const,
      telemetry: { schema: 'atlas.gpu-memory-telemetry.v1' as const, source: 'nvml' as const, capturedAt: '2026-09-20T00:00:00.000Z', totalVramBytes: 8_000_000_000, freeVramBytes: 4_000_000_000, usedVramBytes: 4_000_000_000 },
      policy: {} as never,
      requestedCandidateCount: 1,
      requestedCandidateBucket: 32,
      totalReservedBytes: 0,
      leaseableBytes: 1,
      semanticCacheBudgetBytes: 0,
      maxResidentVectors: 1,
      maxCandidateBucket: 32,
      executionTarget: 'gpu' as const,
      degraded: false,
      reason: 'test',
    };
    expect(() => admitWithSharedGpuResidencyLeaseV1({ adapter, descriptor: base, budget, budgetRevision: 'budget-1', leaseId: 'lease:test:reject', leaseEpoch: 1, executor: 'tensorrt_rtx' })).toThrow('GPU_EXECUTOR_RESIDENCY_ADMISSION_GPU_RESIDENCY_BUDGET_EXCEEDED');
    expect(adapter.usedBytes()).toBe(0);
  });
});
