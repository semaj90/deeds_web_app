import { describe, expect, it } from 'vitest';
import {
  buildExactPromotionCandidate,
  buildExactPromotionHandoff,
  resolvePromotionIdentity,
} from '../src/lib/server/ai/exact-promotion-handoff.js';

describe('ExactPromotionHandoffV1', () => {
  it('uses canonical identity precedence and never falls back to qdrant point id', () => {
    expect(resolvePromotionIdentity({
      canonical_id: 'canonical:C1',
      symbol_version_id: 'symbol:S1',
      packet_key: 'packet:P1',
      source_ref: 'src/a.ts',
    })).toEqual({
      canonicalId: 'canonical:C1',
      identityStatus: 'canonical',
      identitySource: 'canonical_id',
    });

    const missing = buildExactPromotionCandidate({
      candidateOrdinal: 0,
      payload: {},
      semanticScore: 0.9,
      recommendationScore: 0.95,
      qdrantPointId: '12345',
    });
    expect(missing).toBeNull();
  });

  it('marks source_ref-only identity as degraded and blocks required promotion', () => {
    const candidate = buildExactPromotionCandidate({
      candidateOrdinal: 0,
      payload: { source_ref: 'src/lib/a.ts' },
      semanticScore: 0.8,
      recommendationScore: 0.85,
    });
    expect(candidate?.identityStatus).toBe('degraded');

    const handoff = buildExactPromotionHandoff({
      requestId: 'req-1',
      workspaceRevision: 'ws-7',
      graphRevision: 'g-4',
      representationRevision: 'semantic-768-r3',
      recommendationReceiptId: 'rec-1',
      required: true,
      candidates: [candidate],
    });
    expect(handoff.status).toBe('BLOCKED_IDENTITY_GAP');
    expect(handoff.degradedCandidateOrdinals).toEqual([0]);
  });

  it('produces a deterministic ready handoff for canonical candidates', () => {
    const candidate = buildExactPromotionCandidate({
      candidateOrdinal: 0,
      payload: {
        packet_key: 'packet:P1',
        source_ref: 'src/lib/a.ts',
        source_revision: 'src-r9',
      },
      semanticScore: 0.8,
      recommendationScore: 0.9,
      qdrantPointId: '99',
    });
    const input = {
      requestId: 'req-1',
      workspaceRevision: 'ws-7',
      graphRevision: 'g-4',
      representationRevision: 'semantic-768-r3',
      recommendationReceiptId: 'rec-1',
      required: true,
      candidates: [candidate],
    } as const;

    const first = buildExactPromotionHandoff(input);
    const second = buildExactPromotionHandoff(input);
    expect(first.status).toBe('READY_FOR_EXACT_PROMOTION');
    expect(first.candidates[0]?.identitySource).toBe('packet_key');
    expect(first.candidates[0]?.qdrantPointId).toBe('99');
    expect(first.checksum).toBe(second.checksum);
  });
});
