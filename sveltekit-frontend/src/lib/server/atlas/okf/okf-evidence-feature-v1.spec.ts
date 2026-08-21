import { describe, expect, it } from 'vitest';
import { CANDIDATE_FEATURE_NAMES } from '../contracts/feature-extraction-v1.js';
import {
  FeatureValueV1Schema,
  OkfRevisionSetV1Schema,
  SemanticObservationV1Schema,
  compileDerivedFeatureMatrixV1,
  type RetrievalFeatureRowV1,
} from './okf-evidence-feature-v1.js';

const revisions = {
  schemaRevision: 'okf-schema-r1',
  taxonomyRevision: 'okf-taxonomy-r7',
  classifierRevision: 'domain-classifier-r3',
  featureMappingRevision: 'feature-map-r5',
};

const evidence = {
  evidenceRef: 'receipt:ast:1',
  evidenceKind: 'AST' as const,
  producerId: 'tree-sitter',
  producerRevision: 'grammar-r1',
};

function feature(featureName: string, value: number, present = true) {
  return {
    featureName,
    value,
    present,
    definitionRevision: `def:${featureName}:1`,
    compilerRevision: 'compiler-r1',
    evidenceRefs: [evidence],
  };
}

function row(ordinal: number, suffix: string): RetrievalFeatureRowV1 {
  return {
    schema: 'atlas.retrieval-feature-row.v1',
    queryId: 'query-1',
    candidateCanonicalId: `canonical-${suffix}`,
    candidatePacketKey: `ace:packet:${suffix}`,
    rowOrdinal: ordinal,
    lineage: {
      workspaceRevision: 'workspace-742',
      sourceRevision: 'source-r1',
      representationRevision: 'semantic-512-r1',
      featureRevision: 'features-r1',
      revisions,
    },
    features: [
      feature('semantic_similarity_768', 0.9),
      feature('lexical_score', 0.4),
      feature('execution_utility', 0, false),
    ],
    evidenceAuthority: false,
    canonicalWritesAllowed: false,
  };
}

describe('OKF evidence and feature contracts', () => {
  it('keeps revision dimensions independent', () => {
    expect(OkfRevisionSetV1Schema.parse(revisions)).toEqual(revisions);
  });

  it('preserves evidence kind separation on semantic observations', () => {
    const observation = SemanticObservationV1Schema.parse({
      schema: 'atlas.semantic-observation.v1',
      canonicalId: 'canonical-a',
      subjectId: 'symbol-a',
      workspaceRevision: 'workspace-742',
      sourceRevision: 'source-r1',
      revisions,
      producerId: 'langextract',
      producerRevision: 'langextract-r1',
      evidenceRefs: [{ ...evidence, evidenceKind: 'LANGEXTRACT' }],
      confidence: 0.8,
      canonicalWritesAllowed: false,
      observationKind: 'CONCEPT',
      label: 'retrieval',
      value: true,
      evidenceKind: 'LANGEXTRACT',
    });
    expect(observation.evidenceKind).toBe('LANGEXTRACT');
    expect(observation.evidenceRefs[0].evidenceKind).toBe('LANGEXTRACT');
  });

  it('requires missing features to be encoded as zero with provenance', () => {
    expect(() => FeatureValueV1Schema.parse(feature('execution_utility', 0.2, false))).toThrow();
    const parsed = FeatureValueV1Schema.parse(feature('execution_utility', 0, false));
    expect(parsed.present).toBe(false);
    expect(parsed.evidenceRefs).toHaveLength(1);
  });

  it('compiles canonical Cx25 order and preserves row identity/evidence', () => {
    const matrix = compileDerivedFeatureMatrixV1({ queryId: 'query-1', rows: [row(0, 'a'), row(1, 'b')] });
    expect(matrix.columnNames).toEqual([...CANDIDATE_FEATURE_NAMES]);
    expect(matrix.columnCount).toBe(25);
    expect(matrix.rowCount).toBe(2);
    expect(matrix.rowCanonicalIds).toEqual(['canonical-a', 'canonical-b']);
    expect(matrix.rowPacketKeys).toEqual(['ace:packet:a', 'ace:packet:b']);
    expect(matrix.rowOrdinals).toEqual([0, 1]);
    expect(matrix.values).toHaveLength(50);
    expect(matrix.presenceMask).toHaveLength(50);
    expect(matrix.matrixSha256).toMatch(/^[a-f0-9]{64}$/);
    const executionIndex = CANDIDATE_FEATURE_NAMES.indexOf('execution_utility');
    expect(matrix.values[executionIndex]).toBe(0);
    expect(matrix.presenceMask[executionIndex]).toBe(0);
    expect(matrix.cellEvidenceRefs[executionIndex]).toEqual(['receipt:ast:1']);
  });

  it('rejects row ordinal drift', () => {
    expect(() => compileDerivedFeatureMatrixV1({ queryId: 'query-1', rows: [row(1, 'a')] }))
      .toThrow(/ROW_ORDINAL_MISMATCH/);
  });

  it('rejects duplicate canonical identity', () => {
    const b = row(1, 'b');
    b.candidateCanonicalId = 'canonical-a';
    expect(() => compileDerivedFeatureMatrixV1({ queryId: 'query-1', rows: [row(0, 'a'), b] }))
      .toThrow(/DUPLICATE_CANONICAL_ID/);
  });

  it('rejects mixed feature mapping revisions', () => {
    const b = row(1, 'b');
    b.lineage.revisions = { ...revisions, featureMappingRevision: 'feature-map-r6' };
    expect(() => compileDerivedFeatureMatrixV1({ queryId: 'query-1', rows: [row(0, 'a'), b] }))
      .toThrow(/MIXED_FEATURE_MAPPING_REVISION/);
  });
});
