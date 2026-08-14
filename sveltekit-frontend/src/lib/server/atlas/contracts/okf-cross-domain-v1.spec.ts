import { describe, expect, it } from 'vitest';
import {
  DomainClassificationV1Schema,
  OkfFeatureMatrix4x6V1Schema,
  OkfRecommendationV1Schema,
} from './okf-cross-domain-v1.js';
import { OntologyLinkedTupleV1Schema } from './ontology-linked-tuple-v1.js';

const featureValue = (featureId: string) => ({
  featureId,
  featureRevision: 'features:r1',
  subjectRef: 'packet:one',
  ontologyRefs: ['ontology:code'],
  value: 0.5,
  coverage: 1,
  provenanceRefs: ['tuple:one'],
});

describe('OKF cross-domain contracts', () => {
  it('requires revisioned domain evidence without making it identity', () => {
    const classification = DomainClassificationV1Schema.parse({
      schemaVersion: 'atlas.okf.domain-classification.v1',
      classificationId: 'classification:one',
      subjectRef: 'packet:one',
      subjectKind: 'feature',
      domainId: 'domain:retrieval',
      taxonomyRevision: 'taxonomy:r1',
      confidence: 0.9,
      evidenceRefs: ['tuple:one'],
      sourceRevision: 'source:r1',
      producerId: 'classifier:test',
      producerRevision: 'classifier:r1',
      lifecycle: 'OBSERVED',
    });

    expect(classification.subjectRef).toBe('packet:one');
    expect(classification).not.toHaveProperty('symbolId');
    expect(classification).not.toHaveProperty('packetKey');
  });

  it('validates exactly four families of six derived values', () => {
    const families = ['semantic', 'structural', 'domain', 'operational'].map((family) => ({
      family,
      values: Array.from({ length: 6 }, (_, index) => featureValue(`${family}:${index}`)),
    }));

    const matrix = OkfFeatureMatrix4x6V1Schema.parse({
      schemaVersion: 'atlas.okf.feature-matrix-4x6.v1',
      matrixId: 'matrix:one',
      subjectRef: 'packet:one',
      workspaceRevision: 'workspace:r1',
      representationRevision: 'representation:semantic-768:r1',
      families,
      lifecycle: 'DERIVED',
    });

    expect(matrix.families).toHaveLength(4);
    expect(matrix.families.every((family) => family.values.length === 6)).toBe(true);
  });

  it('links recommendations to evidence and acceptance gates without authorizing mutation', () => {
    const recommendation = OkfRecommendationV1Schema.parse({
      schemaVersion: 'atlas.okf.recommendation.v1',
      recommendationId: 'recommendation:one',
      category: 'MISSING_GROUNDING',
      severity: 'HIGH',
      subjectRefs: ['file:one'],
      evidenceRefs: ['report:langextract'],
      graphifyReceiptRefs: ['receipt:graphify:r1'],
      featureRowRefs: ['feature-row:one'],
      acceptanceGates: ['LANGEXTRACT_GROUNDING_PROVEN'],
      prohibitedMutations: ['canonical_graph', 'qdrant_projection'],
      status: 'RECOMMENDED',
      sourceRevision: 'source:r1',
      producerId: 'okf-audit',
      producerRevision: 'okf-audit:r1',
    });

    expect(recommendation.status).toBe('RECOMMENDED');
    expect(recommendation.prohibitedMutations).toContain('canonical_graph');
  });

  it('keeps tuple lifecycle and source span separate from canonical identity', () => {
    const tuple = OntologyLinkedTupleV1Schema.parse({
      tupleId: 'tuple:one',
      schemaVersion: 'ontology-linked-tuple.v1',
      packetKey: 'packet:one',
      sourceRef: 'src/one.ts',
      surfaceText: 'calls',
      label: 'calls',
      labelKind: 'ontology',
      labelSource: 'semantic_tagger',
      ontologyIds: ['ontology:code'],
      conceptIds: ['concept:call'],
      evidenceRefs: ['src/one.ts:1-3'],
      relationRevision: 'relations:r1',
      evidenceSpan: { sourceRef: 'src/one.ts', start: 1, end: 3 },
      confidence: 0.8,
      evidenceState: 'ACTIVE_VERIFIED',
      provenance: {
        sourceTables: ['atlas_packets'],
        labelerVersion: null,
        taggerVersion: 'tagger:r1',
        ontologyVersion: 'ontology:r1',
        nlpVersion: null,
      },
    });

    expect(tuple.lifecycle).toBe('OBSERVED');
    expect(tuple.evidenceSpan?.sourceRef).toBe('src/one.ts');
    expect(tuple).not.toHaveProperty('symbolId');
  });
});
