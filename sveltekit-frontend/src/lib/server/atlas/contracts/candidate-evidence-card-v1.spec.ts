// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  CandidateEvidenceCardV1Schema,
  GroundedFactV1Schema,
  CANDIDATE_EVIDENCE_EXTRACTION_MAX_BATCH,
  assertExtractionBatchBounded,
} from './candidate-evidence-card-v1.js';

const validCard = {
  canonicalId: 'cand:1',
  packetKey: 'packet:abc123',
  sourceRef: 'src/lib/server/retrieval/service.ts',
  workspaceRevision: 'ws-r1',
  sourceRevision: 'src-r1',
  retrieval: {
    lexicalRank: 3,
    structuralRank: 1,
    semanticRank: 2,
    graphRank: 5,
    rrfScore: 0.82,
    crossRankScore: 0.91,
  },
  extracted: {
    symbols: ['mergeDuplicateIdentityScores'],
    apis: [],
    tests: ['service.spec.ts'],
    constraints: [],
    groundedFacts: [
      {
        factText: 'sums duplicate-identity scores instead of discarding them',
        sourceRef: 'src/lib/server/retrieval/service.ts',
        spanStart: 100,
        spanEnd: 140,
        confidence: 0.95,
      },
    ],
  },
  tokenCost: 512,
  evidenceRefs: ['src/lib/server/retrieval/service.ts#L100-140'],
  extractionRevision: 'ext-r1',
  checksum: 'a'.repeat(64),
};

describe('CandidateEvidenceCardV1', () => {
  it('accepts a valid card', () => {
    const parsed = CandidateEvidenceCardV1Schema.parse(validCard);
    expect(parsed.canonicalId).toBe('cand:1');
    expect(parsed.extracted.groundedFacts).toHaveLength(1);
  });

  it('rejects unknown top-level fields (strict)', () => {
    expect(() => CandidateEvidenceCardV1Schema.parse({ ...validCard, extra: true })).toThrow();
  });

  it('rejects a malformed checksum (not 64-hex)', () => {
    expect(() => CandidateEvidenceCardV1Schema.parse({ ...validCard, checksum: 'not-a-hash' })).toThrow();
  });
});

describe('GroundedFactV1 — evidence must resolve to a real span', () => {
  it('accepts a fact with spanEnd > spanStart', () => {
    expect(() =>
      GroundedFactV1Schema.parse({
        factText: 'x',
        sourceRef: 'a.ts',
        spanStart: 0,
        spanEnd: 10,
        confidence: 1,
      })
    ).not.toThrow();
  });

  it('rejects a fact where spanEnd <= spanStart (no real span)', () => {
    expect(() =>
      GroundedFactV1Schema.parse({
        factText: 'x',
        sourceRef: 'a.ts',
        spanStart: 10,
        spanEnd: 10,
        confidence: 1,
      })
    ).toThrow();
  });
});

describe('assertExtractionBatchBounded — batch extraction never runs on the full corpus', () => {
  it('allows a batch at the documented bound', () => {
    expect(() => assertExtractionBatchBounded(CANDIDATE_EVIDENCE_EXTRACTION_MAX_BATCH)).not.toThrow();
  });

  it('rejects a batch exceeding the documented bound', () => {
    expect(() => assertExtractionBatchBounded(CANDIDATE_EVIDENCE_EXTRACTION_MAX_BATCH + 1)).toThrow();
  });

  it('rejects a corpus-scale batch (100K) with a clear message', () => {
    expect(() => assertExtractionBatchBounded(100_000)).toThrow(/exceeds the bounded maximum/);
  });
});
