import { describe, expect, it } from 'vitest';
import { buildPrefillRoutingDecisionV1, PREFILL_ROUTER_TENSOR_REVISION_V2 } from './prefill-routing-decision-v1.js';

const checksum = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function fixture() {
  return buildPrefillRoutingDecisionV1({
    requestId: 'request-prefill-1',
    workspaceRevision: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    packetRevisionSetChecksum: checksum,
    retrievalRouterTensorRevision: PREFILL_ROUTER_TENSOR_REVISION_V2,
    compactTensorChecksum: checksum,
    classifierRevision: 'classifier-fixture-v1',
    classifierOutputChecksum: checksum,
    executorCapabilityRevision: 'executor-capability-fixture-v1',
    retrievalPlanChecksum: checksum,
    candidateOrdinalMapChecksum: checksum,
    status: 'BLOCKED_LINEAGE',
    canonicalAuthority: false,
    writesPerformed: false,
    producerRevision: 'prefill-routing-decision-v1-test',
  });
}

describe('PrefillRoutingDecisionV1', () => {
  it('binds the current V2 tensor and all upstream checksums without authority', () => {
    const decision = fixture();
    expect(decision.schema).toBe('atlas.prefill-routing-decision.v1');
    expect(decision.retrievalRouterTensorRevision).toBe(PREFILL_ROUTER_TENSOR_REVISION_V2);
    expect(decision.status).toBe('BLOCKED_LINEAGE');
    expect(decision.canonicalAuthority).toBe(false);
    expect(decision.writesPerformed).toBe(false);
    expect(decision.checksumSha256).toHaveLength(64);
  });

  it('is deterministic and changes when a bound input changes', () => {
    const first = fixture();
    const second = fixture();
    expect(second.checksumSha256).toBe(first.checksumSha256);
    const { checksumSha256: _checksum, ...decisionWithoutChecksum } = first;
    const changed = buildPrefillRoutingDecisionV1({
      ...decisionWithoutChecksum,
      requestId: 'request-prefill-2',
    });
    expect(changed.checksumSha256).not.toBe(first.checksumSha256);
  });

  it('rejects legacy tensor revisions at the current decision boundary', () => {
    const { checksumSha256: _checksum, ...decisionWithoutChecksum } = fixture();
    expect(() => buildPrefillRoutingDecisionV1({
      ...decisionWithoutChecksum,
      retrievalRouterTensorRevision: 'atlas.retrieval-router-tensor.v1' as never,
    })).toThrow();
  });
});
