import { describe, expect, it } from 'vitest';
import { tensorArtifactManifestChecksumV1, TensorArtifactManifestV1Schema } from './tensor-artifact-manifest-v1.js';

const checksum = (letter: string) => `sha256:${letter.repeat(64)}`;

describe('TensorArtifactManifestV1', () => {
  it('binds a semantic tile matrix to the ordinal snapshot without becoming canonical', () => {
    const manifest = TensorArtifactManifestV1Schema.parse({
      schema: 'atlas.tensor-artifact-manifest.v1', artifactId: 'artifact:tiles', artifactKind: 'SEMANTIC_TILE_MATRIX',
      artifactFormat: 'ARROW_IPC', artifactUri: 'atlas-artifact://tiles.arrow', artifactChecksum: checksum('a'),
      candidateSnapshotRevision: 'candidate:v1', ordinalMapChecksum: 'b'.repeat(64), representationId: 'semantic_768',
      representationRevision: 'semantic:v1', featureSchemaRevision: null, rowCount: 2, columnCount: 768,
      shape: [2, 768], dtype: 'float32', byteLength: 6144, producerId: 'tile-writer', producerRevision: 'writer:v1', canonicalAuthority: false,
    });
    expect(tensorArtifactManifestChecksumV1(manifest)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(manifest.canonicalAuthority).toBe(false);
  });

  it('rejects a semantic artifact with a non-768 shape', () => {
    expect(() => TensorArtifactManifestV1Schema.parse({
      schema: 'atlas.tensor-artifact-manifest.v1', artifactId: 'artifact:bad', artifactKind: 'SEMANTIC_TILE_MATRIX',
      artifactFormat: 'MMAP', artifactUri: 'atlas-artifact://bad', artifactChecksum: checksum('a'),
      candidateSnapshotRevision: 'candidate:v1', ordinalMapChecksum: 'b'.repeat(64), representationId: 'semantic_768',
      representationRevision: 'semantic:v1', featureSchemaRevision: null, rowCount: 2, columnCount: 512,
      shape: [2, 512], dtype: 'float32', byteLength: 4096, producerId: 'tile-writer', producerRevision: 'writer:v1', canonicalAuthority: false,
    })).toThrow();
  });
});
