import { describe, expect, it } from 'vitest';
import {
  assertProductionLatent,
  buildLatentRepresentationManifest,
  buildLowRankFeatureBlock,
} from './latent-lod-contract.js';

describe('latent-lod contract', () => {
  it('keeps the source semantic lane canonical and deterministic', () => {
    const manifest = buildLatentRepresentationManifest({
      representationId: 'latent_128',
      representationRevision: 'latent_128@v1',
      latentDimension: 128,
      kind: 'LOW_RANK',
      fidelity: 'INT8_WARM',
      deterministic: true,
      checkpointHash: 'ckpt:low-rank:v1',
    });

    expect(manifest.sourceRepresentationId).toBe('semantic_768');
    expect(manifest.sourceDimension).toBe(768);
    expect(() => assertProductionLatent({ ...manifest, deterministic: false })).toThrow();
  });

  it('builds a provenance-backed low-rank feature block with stable identity', () => {
    const manifest = buildLatentRepresentationManifest({
      representationId: 'latent_128',
      representationRevision: 'latent_128@v1',
      latentDimension: 128,
      kind: 'LOW_RANK',
      fidelity: 'INT8_WARM',
      deterministic: true,
      checkpointHash: 'ckpt:low-rank:v1',
    });

    const first = buildLowRankFeatureBlock({
      packetKey: 'packet:1',
      sourceRef: 'src/lib/server/example.ts',
      sourceRevision: 'source:v1',
      sourceRepresentationRevision: 'semantic_768@v1',
      latentManifest: manifest,
      approximationMethod: 'EWIN_TANG',
      rank: 32,
      seed: 17,
      producerId: 'low-rank-feature-builder',
      producerRevision: 'builder:v1',
      featureRevision: 'low-rank-features:v1',
      inputDigest: 'input:sha256:111',
      outputDigest: 'output:sha256:222',
      components: {
        semantic: 0.91,
        graph: 0.44,
        workflow: 0.33,
        cache: 0.21,
        execution: 0.78,
      },
    });

    const second = buildLowRankFeatureBlock({
      ...first,
      components: { ...first.components },
    });

    expect(first.blockId).toBe(second.blockId);
    expect(first.sourceRepresentationId).toBe('semantic_768');
    expect(first.latentManifest.kind).toBe('LOW_RANK');
    expect(first.components.semantic).toBeGreaterThan(first.components.graph);
  });
});
