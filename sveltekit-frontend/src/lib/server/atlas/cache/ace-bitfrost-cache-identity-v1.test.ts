import { describe, expect, it } from 'vitest';
import {
  AceBitfrostCacheIdentityV1Schema,
  aceBitfrostCacheIdentityChecksumV1,
  buildAceContextManifestCacheKeyV1,
  buildAceBitfrostCacheKeyV1,
} from './ace-bitfrost-cache-identity-v1.js';

const base = {
  cacheKind: 'CENTROID' as const,
  artifactKind: 'som_centroid',
  representationId: 'semantic_768',
  representationRevision: 'semantic:r1',
  candidateSnapshotRevision: 'candidate:r1',
  ordinalMapChecksum: 'sha256:ordinal',
  graphRevision: 'graph:r1',
  featureRevision: 'feature:r1',
  producerRevision: 'producer:r1',
  normalizationPolicyRevision: 'l2-renorm:v1',
  artifactChecksum: 'sha256:artifact',
};

describe('AceBitfrostCacheIdentityV1', () => {
  it('requires the full revision and checksum identity', () => {
    expect(AceBitfrostCacheIdentityV1Schema.parse(base)).toEqual(base);
    expect(() => AceBitfrostCacheIdentityV1Schema.parse({ ...base, graphRevision: '' })).toThrow();
  });

	it('changes identity when the candidate snapshot changes', () => {
    expect(aceBitfrostCacheIdentityChecksumV1(base)).not.toBe(
      aceBitfrostCacheIdentityChecksumV1({ ...base, candidateSnapshotRevision: 'candidate:r2' }),
    );
	});

  it('changes identity when model, source, or packet revision changes', () => {
		const revisioned = {
			...base,
			modelRevision: 'model:r1',
			adapterRevision: 'adapter:r1',
			workspaceRevision: 'workspace:r1',
			sourceRevision: 'source:r1',
			packetRevision: 'packet:r1',
		};
		expect(buildAceBitfrostCacheKeyV1(revisioned)).not.toBe(
			buildAceBitfrostCacheKeyV1({ ...revisioned, packetRevision: 'packet:r2' }),
		);
	});

  it('changes the BitFrost key across workspace, policy, graph, and representation revisions', () => {
    const revisioned = { ...base, workspaceRevision: 'workspace:r1' };
    const key = buildAceBitfrostCacheKeyV1(revisioned);
    for (const field of [
      'workspaceRevision',
      'normalizationPolicyRevision',
      'graphRevision',
      'representationRevision',
    ] as const) {
      expect(buildAceBitfrostCacheKeyV1({ ...revisioned, [field]: `${revisioned[field]}:next` })).not.toBe(key);
    }
  });

  it('keeps representation families distinct at equal dimensions', () => {
    expect(buildAceBitfrostCacheKeyV1(base)).not.toBe(
      buildAceBitfrostCacheKeyV1({ ...base, representationId: 'learned_latent_128' }),
    );
  });

  it('does not use TTL or a mutable runtime timestamp as identity', () => {
    expect(buildAceBitfrostCacheKeyV1(base)).toBe(buildAceBitfrostCacheKeyV1(base));
  });

  it('binds ContextManifest V2 cache identity to its sealed checksum', () => {
    const manifest = {
      schema: 'atlas.context-manifest.v2' as const,
      v1: { requestId: 'request:1', snapshotId: 'snapshot:1' } as never,
      identityInput: {} as never,
      identityChecksum: 'a'.repeat(64),
    };
    const key = buildAceContextManifestCacheKeyV1(manifest);
    expect(key).toContain('request%3A1');
    expect(key).toContain('snapshot%3A1');
    expect(key).toContain('a'.repeat(64));
  });
});
