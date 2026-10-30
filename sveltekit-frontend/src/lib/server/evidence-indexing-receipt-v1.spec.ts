import { describe, expect, it } from 'vitest';
import {
  buildEvidenceIndexingReceiptV1,
  canProjectEvidenceEmbeddingToQdrantV1,
  validateEvidenceEmbeddingV1,
} from './evidence-indexing-receipt-v1.js';

describe('evidence indexing receipt', () => {
  it('admits only finite 768-dimensional evidence embeddings', () => {
    expect(validateEvidenceEmbeddingV1(new Array(768).fill(0.25))).toBe('valid');
    expect(validateEvidenceEmbeddingV1(new Array(384).fill(0.25))).toBe('wrong_dimension');
    const nonFinite = new Array(768).fill(0.25);
    nonFinite[17] = Number.NaN;
    expect(validateEvidenceEmbeddingV1(nonFinite)).toBe('non_finite');
  });

  it('allows Qdrant projection only after a canonical PostgreSQL write', () => {
    const valid = new Array(768).fill(0.25);
    expect(canProjectEvidenceEmbeddingToQdrantV1(valid, true)).toBe(true);
    expect(canProjectEvidenceEmbeddingToQdrantV1(valid, false)).toBe(false);
    expect(canProjectEvidenceEmbeddingToQdrantV1(new Array(384).fill(0.25), true)).toBe(false);
  });

  it('reports independent PostgreSQL and Qdrant success counts', () => {
    expect(
      buildEvidenceIndexingReceiptV1({
        totalChunks: 4,
        embeddedCount: 4,
        pgVectorStored: 4,
        pgVectorFailures: 0,
        qdrantPointCount: 4,
        qdrantStatus: 'indexed',
      })
    ).toEqual({
      hasWarnings: false,
      message: 'Complete: 4/4 chunk(s) embedded; PostgreSQL 4 stored, 0 failed; Qdrant 4 point(s) indexed',
    });
  });

  it('does not report full indexing success when PostgreSQL writes fail', () => {
    expect(
      buildEvidenceIndexingReceiptV1({
        totalChunks: 4,
        embeddedCount: 4,
        pgVectorStored: 1,
        pgVectorFailures: 3,
        qdrantPointCount: 4,
        qdrantStatus: 'indexed',
      })
    ).toEqual({
      hasWarnings: true,
      message:
        'Complete with indexing warnings: 4/4 chunk(s) embedded; PostgreSQL 1 stored, 3 failed; Qdrant 4 point(s) indexed',
    });
  });

  it('reports Qdrant failure and skipped indexing distinctly', () => {
    expect(
      buildEvidenceIndexingReceiptV1({
        totalChunks: 2,
        embeddedCount: 2,
        pgVectorStored: 2,
        pgVectorFailures: 0,
        qdrantPointCount: 2,
        qdrantStatus: 'failed',
      }).hasWarnings
    ).toBe(true);
    expect(
      buildEvidenceIndexingReceiptV1({
        totalChunks: 3,
        embeddedCount: 0,
        pgVectorStored: 0,
        pgVectorFailures: 0,
        qdrantPointCount: 0,
        qdrantStatus: 'skipped',
      }).message
    ).toContain('Qdrant not attempted');
  });

  it('warns when embedding generation is incomplete', () => {
    expect(
      buildEvidenceIndexingReceiptV1({
        totalChunks: 3,
        embeddedCount: 1,
        pgVectorStored: 1,
        pgVectorFailures: 0,
        qdrantPointCount: 1,
        qdrantStatus: 'indexed',
      }).hasWarnings
    ).toBe(true);
  });
});
