import { describe, expect, it } from 'vitest';
import { compileQueryRoutingFeatures } from './query-routing-features-v1.js';
import {
  adaptToolTrainingExampleToClassificationExample,
  adaptWorkflowExecutionToClassificationExample,
  buildEmbeddingGemmaClassificationExample,
  serializeEmbeddingGemmaClassificationJsonl,
} from './dataset-export.js';

describe('EmbeddingGemma classification dataset export', () => {
  const featureVector = compileQueryRoutingFeatures('find the Graphify Qdrant writer');

  it('emits a revision-qualified features-only row without inventing an embedding', () => {
    const row = buildEmbeddingGemmaClassificationExample({
      exampleId: 'example-1', requestId: 'request-1', queryText: 'find the Graphify Qdrant writer',
      featureVector, embeddingModelRevision: 'embeddinggemma-300m:r1', promptRevision: 'classification-p1',
      domainLabel: 'retrieval', operationLabel: 'inspect', retrievalNeeds: ['semantic', 'ast'],
      candidateBudget: 512, labelRevision: 'labels-r1', evidenceRefs: ['receipt:1'],
    });
    expect(row.status).toBe('FEATURES_ONLY');
    expect(row.embedding).toBeNull();
    expect(row.checksum).toHaveLength(64);
  });

  it('rejects a non-normalized MRL vector and serializes deterministic rows', () => {
    expect(() => buildEmbeddingGemmaClassificationExample({
      exampleId: 'example-2', requestId: 'request-2', queryText: 'debug parser', featureVector,
      embedding: new Array(128).fill(0), embeddingModelRevision: 'embeddinggemma-300m:r1',
      promptRevision: 'classification-p1', domainLabel: 'ast', operationLabel: 'debug',
      retrievalNeeds: ['structural'], candidateBudget: 128, labelRevision: 'labels-r1',
    })).toThrow('CLASSIFICATION_MRL_VECTOR_NOT_NORMALIZED');
    const one = buildEmbeddingGemmaClassificationExample({
      exampleId: 'example-3', requestId: 'request-3', queryText: 'debug parser', featureVector,
      embeddingModelRevision: 'embeddinggemma-300m:r1', promptRevision: 'classification-p1',
      domainLabel: 'ast', operationLabel: 'debug', retrievalNeeds: ['structural'],
      candidateBudget: 128, labelRevision: 'labels-r1',
    });
    expect(serializeEmbeddingGemmaClassificationJsonl([one])).toContain('example-3');
  });

  it('requires explicit labels when adapting a verified execution example', () => {
    const row = adaptToolTrainingExampleToClassificationExample({
      example: {
        schemaVersion: 'atlas.tool-training-example.v1', exampleId: 'tool-example-1', requestId: 'request-4',
        snapshotChecksum: 'a'.repeat(64), routingReceiptChecksum: 'b'.repeat(64), queryText: 'inspect parser',
        toolId: 'ast.inspect', featureValues: new Array(18).fill(0.1), selected: true, label: 1,
        utility: 0.8, verified: true, evidenceRefs: ['receipt:4'], checksum: 'c'.repeat(64),
      },
      featureRevision: 'features-r1', embeddingModelRevision: 'embeddinggemma-300m:r1',
      promptRevision: 'classification-p1', domainLabel: 'ast', operationLabel: 'inspect',
      retrievalNeeds: ['structural'], candidateBudget: 128, labelRevision: 'labels-r1',
    });
    expect(row.status).toBe('FEATURES_ONLY');
    expect(row.domainLabel).toBe('ast');
  });

  it('requires a proven workflow receipt before a row can be verified', () => {
    expect(() => adaptWorkflowExecutionToClassificationExample({
      exampleId: 'workflow-example-1', requestId: 'request-5', queryText: 'repair parser',
      featureVector, executionReceipt: {
        receiptId: 'receipt:5', status: 'PARTIAL', outputs: { evidenceRefs: ['src/parser.ts'] },
        verifier: { schemaValid: true, provenanceValid: true, identityStable: true, replayStable: true },
      }, embeddingModelRevision: 'embeddinggemma-300m:r1', promptRevision: 'classification-p1',
      domainLabel: 'ast', operationLabel: 'repair', retrievalNeeds: ['structural'],
      candidateBudget: 512, labelRevision: 'labels-r1', verified: true,
    })).toThrow('CLASSIFICATION_RECEIPT_NOT_PROVEN');

    const row = adaptWorkflowExecutionToClassificationExample({
      exampleId: 'workflow-example-2', requestId: 'request-6', queryText: 'repair parser',
      featureVector, executionReceipt: {
        receiptId: 'receipt:6', status: 'SUCCESS', outputs: { evidenceRefs: ['src/parser.ts'] },
        verifier: { schemaValid: true, provenanceValid: true, identityStable: true, replayStable: true },
      }, embeddingModelRevision: 'embeddinggemma-300m:r1', promptRevision: 'classification-p1',
      domainLabel: 'ast', operationLabel: 'repair', retrievalNeeds: ['structural'],
      candidateBudget: 512, labelRevision: 'labels-r1', verified: true,
    });
    expect(row.status).toBe('FEATURES_ONLY');
    expect(row.evidenceRefs).toEqual(['receipt:6', 'src/parser.ts']);
  });
});
