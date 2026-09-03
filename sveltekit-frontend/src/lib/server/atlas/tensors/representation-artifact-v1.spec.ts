import { describe, expect, it } from 'vitest';
import {
  RepresentationArtifactV1Schema,
  assertPromotionReadyRepresentationArtifact,
} from './representation-artifact-v1.js';

const artifact = {
  schema: 'atlas.representation-artifact.v1' as const,
  representationId: 'latent_256',
  representationFamily: 'nested-semantic-autoencoder',
  representationRevision: 'latent:sha256:revision',
  dimensions: 64,
  dtype: 'float32' as const,
  normalization: 'none' as const,
  inputRepresentationId: 'semantic_768',
  inputRepresentationRevision: 'semantic:sha256:input',
  workspaceId: 'workspace-1',
  repositoryId: 'repo-1',
  workspaceRevision: 'sha256:workspace',
  sourceRevisionDigest: 'sha256:source-set',
  sourceAuthorityStatus: 'PROVEN' as const,
  candidateSnapshotRevision: 'candidate:sha256:snapshot',
  ordinalMapChecksum: 'sha256:ordinal',
  producerId: 'atlas-latent-producer',
  producerRevision: 'producer:sha256:revision',
  modelChecksum: 'a'.repeat(64),
  modelRevision: 'model:sha256:model',
  parametersDigest: 'sha256:parameters',
  transformPolicyRevision: 'nested-semantic-autoencoder-v1:sha256:transform',
  inputDigest: 'sha256:input-tensor',
  inputPopulationChecksum: 'sha256:input-population',
  outputDigest: 'sha256:output-tensor',
  rowCount: 55853,
  eligibleCount: 55169,
  processedCount: 15,
  writtenCount: 15,
  unchangedCount: 0,
  rejectedCount: 0,
  outputPopulationChecksum: 'sha256:output-population',
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

  it('rejects an eligibleCount larger than rowCount', () => {
    expect(() =>
      RepresentationArtifactV1Schema.parse({ ...artifact, eligibleCount: 999_999 }),
    ).toThrow();
  });

  it('rejects a writtenCount larger than eligibleCount', () => {
    expect(() =>
      RepresentationArtifactV1Schema.parse({ ...artifact, writtenCount: 999_999 }),
    ).toThrow();
  });

  it('accepts a fully-idempotent replay with zero effective writes', () => {
    const replay = { ...artifact, writtenCount: 0 };
    const parsed = RepresentationArtifactV1Schema.parse(replay);
    expect(() => assertPromotionReadyRepresentationArtifact(parsed)).not.toThrow();
  });

  it('allows a corpus artifact without retrieval execution coordinates', () => {
    const { candidateSnapshotRevision: _snapshot, ordinalMapChecksum: _ordinal, ...corpusArtifact } = artifact;
    expect(() => RepresentationArtifactV1Schema.parse(corpusArtifact)).not.toThrow();
  });

  it('rejects only one retrieval execution coordinate', () => {
    const { ordinalMapChecksum: _ordinal, ...invalid } = artifact;
    expect(() => RepresentationArtifactV1Schema.parse(invalid)).toThrow(
      'CANDIDATE_EXECUTION_COORDINATES_MUST_BE_PROVIDED_TOGETHER',
    );
  });

  it('accepts UNPROVEN source authority with no workspace/source revision at all', () => {
    const { workspaceRevision: _w, sourceRevisionDigest: _s, ...rest } = artifact;
    const unproven = { ...rest, sourceAuthorityStatus: 'UNPROVEN' as const };
    const parsed = RepresentationArtifactV1Schema.parse(unproven);
    expect(() => assertPromotionReadyRepresentationArtifact(parsed)).not.toThrow();
  });

  it('accepts PARTIAL source authority with only a workspace identity, no content revision', () => {
    const { sourceRevisionDigest: _s, ...rest } = artifact;
    const partial = { ...rest, sourceAuthorityStatus: 'PARTIAL' as const };
    expect(() => RepresentationArtifactV1Schema.parse(partial)).not.toThrow();
  });

  it('rejects PROVEN source authority without sourceRevisionDigest', () => {
    const { sourceRevisionDigest: _s, ...invalid } = artifact;
    expect(() => RepresentationArtifactV1Schema.parse(invalid)).toThrow(
      'SOURCE_AUTHORITY_PROVEN_REQUIRES_SOURCE_REVISION_DIGEST',
    );
  });
});
