import { describe, expect, it } from 'vitest';
import { MASTER_FEATURE_MAP } from './master-feature-map';
import { MasterFeatureMapSchema } from './master-feature-map.schema';
import { buildMasterFeatureCards } from '../../../../scripts/cards/master-feature-cards.mjs';

describe('master feature map', () => {
  it('includes the GPU compute plane entry', () => {
    const entry = MASTER_FEATURE_MAP['gpu-compute-plane'];

    expect(entry).toBeDefined();
    expect(entry?.status).toBe('active');
    expect(entry?.service).toBe('GpuPipeline');
    expect(entry?.pathMapping).toContain('src/lib/server/gpu');
    expect(entry?.evidence?.files).toEqual(
      expect.arrayContaining([
        'docs/features/feature_gpu_compute_plane.md',
        'src/lib/server/gpu/gpu-pipeline.ts',
        'src/lib/server/retrieval/gpu-reranker.ts'
      ])
    );
    expect(entry?.params).toMatchObject({
      executionModel: 'queued-gpu-with-cpu-fallback',
      synthesisBoundary: 'bifrost-only'
    });
  });

  it('remains valid against the feature map schema', () => {
    const parsed = MasterFeatureMapSchema.parse(MASTER_FEATURE_MAP);
    expect(parsed['gpu-compute-plane'].id).toBe('gpu-compute-plane');
  });

  it('emits a downstream feature card for the GPU compute plane', () => {
    const cards = buildMasterFeatureCards();
    const gpu = cards.find((card) => card.id === 'feature-map:gpu-compute-plane');

    expect(gpu).toBeTruthy();
    expect(gpu).toMatchObject({
      kind: 'feature',
      payload: expect.objectContaining({
        id: 'gpu-compute-plane',
        status: 'active',
        service: 'GpuPipeline'
      }),
    });
    expect(gpu?.sourceRefs).toEqual(
      expect.arrayContaining([
        'src/lib/server/atlas/master-feature-map.ts',
        'docs/features/feature_gpu_compute_plane.md',
        'src/mcp-gpu-orchestrator.ts'
      ])
    );
  });
});
