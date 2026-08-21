import { describe, expect, it } from 'vitest';
import { buildExactPromotionHandoff } from '../../ai/exact-promotion-handoff.js';
import { exactPromotionHandoffToDagInput } from './exact-promotion-dag-adapter.js';

describe('exactPromotionHandoffToDagInput', () => {
  it('creates the existing read-only EXACT_PROMOTION DAG node from canonical handoff input', () => {
    const handoff = buildExactPromotionHandoff({
      requestId: 'req-1',
      workspaceRevision: 'ws-7',
      graphRevision: 'graph-3',
      representationRevision: 'semantic-768-r4',
      recommendationReceiptId: 'recommendation:req-1',
      required: true,
      candidates: [{
        candidateOrdinal: 0,
        canonicalId: 'packet:P1',
        identityStatus: 'canonical',
        identitySource: 'packet_key',
        packetKey: 'packet:P1',
        sourceRef: 'src/a.ts',
        sourceRevision: 'src-9',
        semanticScore: 0.8,
        recommendationScore: 0.9,
        qdrantPointId: '99',
      }],
    });

    const adapted = exactPromotionHandoffToDagInput({
      handoff,
      dependsOn: ['rerank'],
    });

    expect(adapted.node.kind).toBe('EXACT_PROMOTION');
    expect(adapted.node.readOnly).toBe(true);
    expect(adapted.node.canonicalIds).toEqual(['packet:P1']);
    expect(adapted.node.dependsOn).toEqual(['rerank']);
    expect(adapted.evidenceRefs).toContain(handoff.checksum);
    expect(adapted).not.toHaveProperty('exactPromotionReceiptId');
  });

  it('rejects blocked identity handoffs', () => {
    const handoff = buildExactPromotionHandoff({
      requestId: 'req-2',
      workspaceRevision: 'ws-7',
      representationRevision: 'semantic-768-r4',
      recommendationReceiptId: 'recommendation:req-2',
      required: true,
      candidates: [{
        candidateOrdinal: 0,
        canonicalId: 'src/a.ts',
        identityStatus: 'degraded',
        identitySource: 'source_ref',
        sourceRef: 'src/a.ts',
        semanticScore: 0.8,
        recommendationScore: 0.9,
        qdrantPointId: null,
      }],
    });

    expect(() => exactPromotionHandoffToDagInput({ handoff, dependsOn: ['rerank'] }))
      .toThrow('EXACT_PROMOTION_HANDOFF_NOT_READY');
  });
});
