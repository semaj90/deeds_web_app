import { describe, expect, it } from 'vitest';
import { SemanticCorpusBundleV1Schema } from './semantic-corpus-bundle-v1.js';

const bundle = {
  schemaVersion: 'semantic-corpus-bundle.v1' as const,
  workspaceId: 'deeds-web-app',
  repositoryId: 'semaj90/deeds_web_app',
  representationId: 'semantic_768' as const,
  representationRevision: 'semantic_768:embeddinggemma:latest:eg-task-prefix-v1:sha256:abc',
  eligibilityPolicyRevision: 'eligibility:sha256:def',
  eligibleCount: 51788,
  populationChecksum: 'sha256:population',
  modelRevision: 'model:embeddinggemma:latest',
  producerRevision: 'producer:sha256:reembed-corpus-document-prefix-v1',
  sourceAuthorityStatus: 'PARTIAL' as const,
  checksum: 'sha256:bundle',
  canonicalAuthority: false as const,
  authorityScope: 'REPRESENTATION_INPUT' as const,
};

describe('SemanticCorpusBundleV1', () => {
  it('accepts a representation-scoped bundle with PARTIAL source authority and no source revision', () => {
    expect(() => SemanticCorpusBundleV1Schema.parse(bundle)).not.toThrow();
  });

  it('accepts UNPROVEN source authority', () => {
    expect(() => SemanticCorpusBundleV1Schema.parse({ ...bundle, sourceAuthorityStatus: 'UNPROVEN' })).not.toThrow();
  });

  it('rejects PROVEN source authority without a referenced source revision', () => {
    expect(() =>
      SemanticCorpusBundleV1Schema.parse({ ...bundle, sourceAuthorityStatus: 'PROVEN' }),
    ).toThrow('SOURCE_AUTHORITY_PROVEN_REQUIRES_A_REFERENCED_SOURCE_REVISION');
  });

  it('accepts PROVEN source authority when a source revision is referenced', () => {
    expect(() =>
      SemanticCorpusBundleV1Schema.parse({
        ...bundle,
        sourceAuthorityStatus: 'PROVEN',
        sourceSnapshotRevision: 'sha256:source',
      }),
    ).not.toThrow();
  });

  it('rejects a bundle claiming canonicalAuthority=true', () => {
    expect(() =>
      SemanticCorpusBundleV1Schema.parse({ ...bundle, canonicalAuthority: true }),
    ).toThrow();
  });

  it('rejects a bundle without authorityScope=REPRESENTATION_INPUT', () => {
    const invalid: unknown = { ...bundle, authorityScope: 'CANONICAL_SOURCE_LINEAGE' };
    expect(() => SemanticCorpusBundleV1Schema.parse(invalid)).toThrow();
  });
});
