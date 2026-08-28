import { describe, expect, it } from 'vitest';
import {
  RepresentationArtifactV1Schema,
  assertPromotionReadyRepresentationArtifact,
} from './representation-artifact-v1.js';

const artifact = {
  schema: 'atlas.representation-artifact.v1' as const,
  representationId: 'ae_latent_64',
  representationRevision: 'latent:sha256:revision',
  dimensions: 64,
  dtype: 'float32' as const,
  normalization: 'none' as const,
  inputRepresentationId: 'semantic_768',
  inputRepresentationRevision: 'semantic:sha256:input',
  workspaceRevision: 'sha256:workspace',
  sourceRevisionDigest: 'sha256:source-set',
  candidateSnapshotRevision: 'candidate:sha256:snapshot',
  ordinalMapChecksum: 'sha256:ordinal',
  producerId: 'atlas-latent-producer',
  producerRevision: 'producer:sha256:revision',
  modelRevision: 'model:sha256:model',
  parametersDigest: 'sha256:parameters',
  inputDigest: 'sha256:input-tensor',
  outputDigest: 'sha256:output-tensor',
  rowCount: 15,
  tensorDigest: 'sha256:tensor',
  artifactDigest: 'sha256:artifact',
  canonicalAuthority: false as const,
};

describe('RepresentationArtifactV1', () => {
  it('accepts a fully revision-qualified derived latent artifact', () => {
    const parsed = RepresentationArtifactV1Schema.parse(artifact);
    expect(() => assertPromotionReadyRepresentationArtifact(parsed)).not.toThrow();
  });

  it('rejects an artifact without current workspace/source revisions', () => {
    const invalid = { ...artifact, workspaceRevision: 'workspace-active-v1' };
    expect(() => RepresentationArtifactV1Schema.parse(invalid)).toThrow();
  });

  it('rejects latent artifacts that do not consume semantic_768', () => {
    const invalid = RepresentationArtifactV1Schema.parse({
      ...artifact,
      inputRepresentationId: 'latent_128',
    });
    expect(() => assertPromotionReadyRepresentationArtifact(invalid)).toThrow(
      'LATENT_INPUT_REPRESENTATION_MISMATCH',
    );
  });
});
