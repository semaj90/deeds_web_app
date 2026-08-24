import { describe, expect, it } from 'vitest';
import { validateIndexedRpcCapabilityV1 } from './indexed-rpc-capability-v1.js';

describe('indexed RPC capability v1', () => {
  it('requires read-only non-authoritative executor metadata', () => {
    const capability = validateIndexedRpcCapabilityV1({
      schema: 'atlas.indexed-rpc-capability.v1',
      capabilityId: 'go-retrieval:bm25:v1',
      operation: 'BM25_SEARCH',
      executor: 'GO_RETRIEVAL',
      revisionRequirements: { workspaceRevision: true, graphRevision: false, representationRevision: false },
      proofState: 'PROVEN',
      expectedP50Ms: 25,
      maxInput: 256,
      readOnly: true,
      canonicalAuthority: false,
      producerRevision: 'go-retrieval:bm25:v1',
    });

    expect(capability.operation).toBe('BM25_SEARCH');
    expect(capability.canonicalAuthority).toBe(false);
  });
});
