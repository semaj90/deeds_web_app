import { describe, expect, it } from 'vitest';
import {
  RepresentationArtifactV1Schema,
  assertPromotionReadyRepresentationArtifact,
  assertRepresentationFamilyRevisionBinding,
  NESTED_LATENT_REPRESENTATION_FAMILY_V1,
} from './representation-artifact-v1.js';

const artifact = {
  schema: 'atlas.representation-artifact.v1' as const,
  representationId: 'latent_256',
  representationFamily: 'nested-semantic-autoencoder',
  representationRevision: 'latent:sha256:revision',
  // LATENT256-REPRESENTATION-CONTRACT-02: was 64, mismatched against representationId
  // 'latent_256' — never caught before because the pre-fix assertPromotionReadyRepresentationArtifact
  // only special-cased the literal string 'ae_latent_64', so this fixture's own dimensions field
  // was never actually validated against its representationId. Corrected to 256 to match.
  dimensions: 256,
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

describe('LATENT256-REPRESENTATION-CONTRACT-02: nested latent family', () => {
  it('accepts a latent_128 (derived-view) artifact declaring latent_256 as its input', () => {
    const latent128 = RepresentationArtifactV1Schema.parse({
      ...artifact,
      representationId: 'latent_128',
      dimensions: 128,
      inputRepresentationId: 'latent_256',
      inputRepresentationRevision: 'latent:sha256:input',
    });
    expect(() => assertPromotionReadyRepresentationArtifact(latent128)).not.toThrow();
  });

  it('rejects a latent_128 artifact that (incorrectly) declares semantic_768 as its input', () => {
    const invalid = RepresentationArtifactV1Schema.parse({
      ...artifact,
      representationId: 'latent_128',
      dimensions: 128,
      // inputRepresentationId left as 'semantic_768' from the base fixture — wrong for latent_128
    });
    expect(() => assertPromotionReadyRepresentationArtifact(invalid)).toThrow(
      'LATENT_INPUT_REPRESENTATION_MISMATCH',
    );
  });

  it('accepts a latent_64 artifact declaring latent_256 as its input (prefix-derived view)', () => {
    const latent64 = RepresentationArtifactV1Schema.parse({
      ...artifact,
      representationId: 'latent_64',
      dimensions: 64,
      inputRepresentationId: 'latent_256',
    });
    expect(() => assertPromotionReadyRepresentationArtifact(latent64)).not.toThrow();
  });

  it('rejects a latent_128 artifact whose dimensions do not match the frozen family (128)', () => {
    const invalid = RepresentationArtifactV1Schema.parse({
      ...artifact,
      representationId: 'latent_128',
      dimensions: 64,
      inputRepresentationId: 'latent_256',
    });
    expect(() => assertPromotionReadyRepresentationArtifact(invalid)).toThrow(
      'LATENT_128_DIMENSION_MISMATCH',
    );
  });

  it('records latent_64 as physically stored and latent_128 as a derived view, matching live Postgres (not the reverse)', () => {
    expect(NESTED_LATENT_REPRESENTATION_FAMILY_V1.members.latent_64.physical).toBe(true);
    expect(NESTED_LATENT_REPRESENTATION_FAMILY_V1.members.latent_128.physical).toBe(false);
    expect(NESTED_LATENT_REPRESENTATION_FAMILY_V1.members.latent_256.physical).toBe(true);
  });

  it('accepts family members that share one root modelChecksum/modelRevision/parametersDigest/transformPolicyRevision', () => {
    const latent256 = RepresentationArtifactV1Schema.parse(artifact);
    const latent64 = RepresentationArtifactV1Schema.parse({
      ...artifact,
      representationId: 'latent_64',
      dimensions: 64,
      inputRepresentationId: 'semantic_768',
    });
    expect(() => assertRepresentationFamilyRevisionBinding([latent256, latent64])).not.toThrow();
  });

  it('rejects a latent_64 artifact silently derived from a different latent_256 checkpoint than it claims (the exact bug this gate closes)', () => {
    const latent256 = RepresentationArtifactV1Schema.parse(artifact);
    const latent64WrongChecksum = RepresentationArtifactV1Schema.parse({
      ...artifact,
      representationId: 'latent_64',
      dimensions: 64,
      inputRepresentationId: 'semantic_768',
      modelChecksum: 'b'.repeat(64),
    });
    expect(() =>
      assertRepresentationFamilyRevisionBinding([latent256, latent64WrongChecksum]),
    ).toThrow('REPRESENTATION_FAMILY_REVISION_MISMATCH');
  });

  it('does nothing for a single artifact or unrelated representationIds (no cross-artifact claim to check)', () => {
    const latent256 = RepresentationArtifactV1Schema.parse(artifact);
    expect(() => assertRepresentationFamilyRevisionBinding([latent256])).not.toThrow();
    expect(() => assertRepresentationFamilyRevisionBinding([])).not.toThrow();
  });
});

describe('LATENT-REPRESENTATION-SEMANTICS-03: origin/materialization axes', () => {
  it('latent_256 is LEARNED + PERSISTED, not co-produced with anything', () => {
    const m = NESTED_LATENT_REPRESENTATION_FAMILY_V1.members.latent_256;
    expect(m.origin).toBe('LEARNED');
    expect(m.materialization).toBe('PERSISTED');
    expect(m.coProducedWith).toBeNull();
    expect(m.parentRepresentationId).toBeNull();
  });

  it('latent_128 is DERIVED + VIRTUAL, a true transform of the latent_256 parent', () => {
    const m = NESTED_LATENT_REPRESENTATION_FAMILY_V1.members.latent_128;
    expect(m.origin).toBe('DERIVED');
    expect(m.materialization).toBe('VIRTUAL');
    expect(m.parentRepresentationId).toBe('latent_256');
    expect(m.transform).toBe('NESTED_PREFIX_L2_RENORMALIZE');
    expect(m.coProducedWith).toBeNull();
  });

  it('latent_64 is DERIVED + PERSISTED from latent_256 via prefix+L2-renormalize', () => {
    const m = NESTED_LATENT_REPRESENTATION_FAMILY_V1.members.latent_64;
    expect(m.origin).toBe('DERIVED');
    expect(m.materialization).toBe('PERSISTED');
    expect(m.parentRepresentationId).toBe('latent_256');
    expect(m.coProducedWith).toBeNull();
    expect(m.inputRepresentationId).toBe('latent_256');
    expect(m.transform).toBe('NESTED_PREFIX_L2_RENORMALIZE');
  });
});
