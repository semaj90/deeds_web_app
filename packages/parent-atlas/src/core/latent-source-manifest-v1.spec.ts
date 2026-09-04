import { describe, expect, it } from 'vitest';
import {
  buildLatentSourceManifestV1,
  candidateRepresentationBindingV1Schema,
  representationMaterializationV1Schema,
} from './latent-source-manifest-v1.js';

const sha = (seed: string) => seed.repeat(64).slice(0, 64);

function baseInput(overrides: Partial<Parameters<typeof buildLatentSourceManifestV1>[0]['output']> = {}) {
  return {
    candidateSnapshotRevision: 'snapshot:v1',
    candidateOrdinalMapChecksum: sha('a'),
    candidateCount: 15,
    inputRepresentation: {
      representationId: 'semantic_768' as const,
      representationRevision: 'semantic_768:v1',
      artifactRef: 'artifact:semantic768:v1',
      vectorsChecksum: sha('b'),
      ordinalAlignmentChecksum: sha('c'),
    },
    latentFamily: {
      familyId: 'nested-semantic-autoencoder' as const,
      familyRevision: 'family:v1',
      checkpointRevision: 'checkpoint:v3',
      modelChecksum: sha('d'),
      parametersDigest: 'params:v1',
      transformPolicyRevision: 'transform:v1',
    },
    output: {
      representationId: 'latent_256' as const,
      representationRevision: 'latent_256:v1',
      dimensions: 256 as const,
      origin: { kind: 'LEARNED' as const, coProducedWith: null },
      ...overrides,
    },
    outputVectorsChecksum: sha('e'),
    ordinalAlignmentChecksum: sha('c'),
    sourceManifestChecksum: sha('f'),
  };
}

describe('LatentSourceManifestV1', () => {
  it('builds a valid latent_256 manifest (LEARNED, no sibling)', () => {
    const manifest = buildLatentSourceManifestV1(baseInput());
    expect(manifest.schema).toBe('atlas.latent-source-manifest.v1');
    expect(manifest.canonicalAuthority).toBe(false);
  });

  it('builds a valid latent_64 manifest: DERIVED from latent_256 via prefix+L2-renormalize', () => {
    const manifest = buildLatentSourceManifestV1(
      baseInput({
        representationId: 'latent_64',
        representationRevision: 'latent_64:v1',
        dimensions: 64,
        origin: {
          kind: 'DERIVED', parentRepresentationId: 'latent_256', parentRepresentationRevision: 'latent_256:v1',
          transform: 'NESTED_PREFIX_L2_RENORMALIZE', prefixDimensions: 64, parentVectorsChecksum: sha('e'),
        },
      }),
    );
    expect(manifest.output.origin).toMatchObject({ kind: 'DERIVED', parentRepresentationId: 'latent_256', prefixDimensions: 64 });
  });

  it('rejects latent_64 framed as LEARNED co-produced when the producer is prefix-derived', () => {
    const invalid = baseInput({
      representationId: 'latent_64',
      representationRevision: 'latent_64:v1',
      dimensions: 64,
      origin: { kind: 'LEARNED', coProducedWith: 'latent_256' },
    });
    expect(() => buildLatentSourceManifestV1(invalid)).toThrow();
  });

  it('builds a valid latent_128 manifest: DERIVED from latent_256 via prefix+L2-renormalize', () => {
    const manifest = buildLatentSourceManifestV1(
      baseInput({
        representationId: 'latent_128',
        representationRevision: 'latent_128:v1',
        dimensions: 128,
        origin: {
          kind: 'DERIVED',
          parentRepresentationId: 'latent_256',
          parentRepresentationRevision: 'latent_256:v1',
          transform: 'NESTED_PREFIX_L2_RENORMALIZE',
          prefixDimensions: 128,
          parentVectorsChecksum: sha('e'),
        },
      }),
    );
    expect(manifest.output.dimensions).toBe(128);
  });

  it('rejects latent_256 claiming a sibling coProducedWith (must be null)', () => {
    const invalid = baseInput({ origin: { kind: 'LEARNED', coProducedWith: 'latent_256' as any } });
    expect(() => buildLatentSourceManifestV1(invalid)).toThrow();
  });

  it('rejects a dimension mismatch (e.g. latent_128 claiming 256 dimensions)', () => {
    const invalid = baseInput({
      representationId: 'latent_128',
      representationRevision: 'latent_128:v1',
      dimensions: 256 as any,
      origin: {
        kind: 'DERIVED',
        parentRepresentationId: 'latent_256',
        parentRepresentationRevision: 'latent_256:v1',
        transform: 'NESTED_PREFIX_L2_RENORMALIZE',
        prefixDimensions: 128,
        parentVectorsChecksum: sha('e'),
      },
    });
    expect(() => buildLatentSourceManifestV1(invalid)).toThrow();
  });
});

describe('RepresentationMaterializationV1', () => {
  it('accepts a valid Postgres materialization record, independent of latent source identity', () => {
    const materialization = representationMaterializationV1Schema.parse({
      kind: 'POSTGRES',
      artifactRef: 'row:codebase_chunk_index:abc',
      storageRevision: 'schema:v1',
      materializationChecksum: sha('a'),
    });
    expect(materialization.kind).toBe('POSTGRES');
  });

  it('accepts a GPU_RUNTIME kind for the :8121 neural-decoder service', () => {
    expect(() =>
      representationMaterializationV1Schema.parse({
        kind: 'GPU_RUNTIME',
        artifactRef: 'service:neural-decoder:8121',
        materializationChecksum: sha('a'),
      }),
    ).not.toThrow();
  });
});

describe('CandidateRepresentationBindingV1', () => {
  const commonOrdinal = {
    candidateSnapshotRevision: 'snapshot:v1',
    candidateOrdinalMapChecksum: sha('a'),
    ordinalAlignmentChecksum: sha('c'),
    presenceMaskChecksum: sha('0'),
    canonicalAuthority: false,
  };

  it('requires a source manifest reference for latent representations', () => {
    expect(() =>
      candidateRepresentationBindingV1Schema.parse({
        representationId: 'latent_256',
        representationRevision: 'latent_256:v1',
        dimensions: 256,
        representationArtifactRef: 'artifact:latent256:v1',
        representationVectorsChecksum: sha('e'),
        ...commonOrdinal,
      }),
    ).toThrow();
  });

  it('accepts a latent_256 binding with a source manifest reference', () => {
    expect(() =>
      candidateRepresentationBindingV1Schema.parse({
        representationId: 'latent_256',
        representationRevision: 'latent_256:v1',
        dimensions: 256,
        representationArtifactRef: 'artifact:latent256:v1',
        representationVectorsChecksum: sha('e'),
        sourceManifestRef: 'artifact:latent-source-manifest:v1',
        sourceManifestChecksum: sha('f'),
        ...commonOrdinal,
      }),
    ).not.toThrow();
  });

  it('rejects a semantic_768 binding that claims a latent source manifest (it has none -- it IS the input)', () => {
    expect(() =>
      candidateRepresentationBindingV1Schema.parse({
        representationId: 'semantic_768',
        representationRevision: 'semantic_768:v1',
        dimensions: 768,
        representationArtifactRef: 'artifact:semantic768:v1',
        representationVectorsChecksum: sha('e'),
        sourceManifestRef: 'artifact:should-not-exist',
        sourceManifestChecksum: sha('f'),
        ...commonOrdinal,
      }),
    ).toThrow();
  });

  it('accepts a semantic_768 binding with no source manifest fields', () => {
    expect(() =>
      candidateRepresentationBindingV1Schema.parse({
        representationId: 'semantic_768',
        representationRevision: 'semantic_768:v1',
        dimensions: 768,
        representationArtifactRef: 'artifact:semantic768:v1',
        representationVectorsChecksum: sha('e'),
        ...commonOrdinal,
      }),
    ).not.toThrow();
  });
});
