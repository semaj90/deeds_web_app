import { describe, expect, it } from 'vitest';
import { CANDIDATE_FEATURE_NAMES } from '../contracts/feature-extraction-v1.js';
import { CANDIDATE_FEATURE_REGISTRY_REVISION } from './candidate-feature-registry-v1.js';
import { compileRetrievalFeatureRowV1 } from './retrieval-feature-row-compiler-v1.js';

const executionEvidence = {
  evidenceRef: 'receipt:retrieval:1',
  evidenceKind: 'EXECUTION' as const,
  producerId: 'search-runtime',
  producerRevision: 'r1',
};

const astEvidence = {
  evidenceRef: 'receipt:ast:1',
  evidenceKind: 'AST' as const,
  producerId: 'tree-sitter',
  producerRevision: 'r1',
};

const absenceEvidence = {
  evidenceRef: 'receipt:feature-availability:1',
  evidenceKind: 'EXECUTION' as const,
  producerId: 'feature-availability',
  producerRevision: 'r1',
};

function baseInput() {
  return {
    queryId: 'q1',
    candidateCanonicalId: 'canonical-a',
    candidate: {
      packet_key: 'ace:packet:a',
      semantic_similarity_768: 0.91,
      ast_signal: 0.8,
    },
    rowOrdinal: 0,
    workspaceRevision: '742',
    sourceRevision: 'source-r1',
    representationRevision: 'semantic-512-r1',
    featureRevision: 'features-r1',
    revisions: {
      schemaRevision: 'schema-r1',
      taxonomyRevision: 'taxonomy-r1',
      classifierRevision: 'classifier-r1',
      featureMappingRevision: CANDIDATE_FEATURE_REGISTRY_REVISION,
    },
    featureEvidenceRefs: {
      semantic_similarity_768: [executionEvidence],
      ast_signal: [astEvidence],
    },
    absenceEvidenceRef: absenceEvidence,
  };
}

describe('retrieval feature row compiler', () => {
  it('compiles all 25 cells in canonical order with explicit absence provenance', () => {
    const row = compileRetrievalFeatureRowV1(baseInput());
    expect(row.features.map((feature) => feature.featureName)).toEqual([...CANDIDATE_FEATURE_NAMES]);
    expect(row.features).toHaveLength(25);
    const missing = row.features.find((feature) => feature.featureName === 'execution_utility')!;
    expect(missing.present).toBe(false);
    expect(missing.value).toBe(0);
    expect(missing.evidenceRefs[0].evidenceRef).toBe('receipt:feature-availability:1');
  });

  it('rejects non-finite present feature values', () => {
    const input = baseInput();
    input.candidate.semantic_similarity_768 = Number.POSITIVE_INFINITY;
    expect(() => compileRetrievalFeatureRowV1(input)).toThrow(/NON_FINITE/);
  });

  it('rejects missing provenance for present values', () => {
    const input = baseInput();
    delete input.featureEvidenceRefs.semantic_similarity_768;
    expect(() => compileRetrievalFeatureRowV1(input)).toThrow(/PROVENANCE_MISSING/);
  });

  it('rejects evidence kinds that are not allowed by the feature registry', () => {
    const input = baseInput();
    input.featureEvidenceRefs.ast_signal = [executionEvidence];
    expect(() => compileRetrievalFeatureRowV1(input)).toThrow(/EVIDENCE_KIND_NOT_ALLOWED/);
  });

  it('rejects a feature mapping revision that is not the registry revision', () => {
    const input = baseInput();
    input.revisions.featureMappingRevision = 'other';
    expect(() => compileRetrievalFeatureRowV1(input)).toThrow(/FEATURE_MAPPING_REVISION_MISMATCH/);
  });
});
