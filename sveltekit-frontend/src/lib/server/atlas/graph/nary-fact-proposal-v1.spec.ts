import { describe, expect, it } from 'vitest';
import {
  createNaryFactProposalV1,
  verifyNaryFactProposalChecksumV1,
} from './nary-fact-proposal-v1.js';

describe('NaryFactProposalV1', () => {
  it('creates a deterministic, non-canonical n-ary proposal', () => {
    const proposal = createNaryFactProposalV1({
      sourceRef: 'src/routes.ts',
      sourceRevision: 'source:1',
      workspaceRevision: 'workspace:1',
      packetKey: 'packet:1',
      graphRevision: 'graph:1',
      producerRevision: 'api-observer:1',
      predicate: 'API_CONTRACT_OBSERVED',
      participants: [
        { canonicalId: 'symbol:handler', role: 'handler', entityType: 'symbol' },
        { canonicalId: 'route:/users', role: 'route', entityType: 'route' },
        { canonicalId: 'packet:1', role: 'source', entityType: 'packet' },
      ],
      evidenceRefs: ['z:evidence', 'a:evidence', 'z:evidence'],
      admission: 'PROPOSED',
    });

    expect(proposal.schema).toBe('atlas.nary-fact-proposal.v1');
    expect(proposal.canonicalAuthority).toBe(false);
    expect(proposal.participants.map((participant) => participant.role)).toEqual(['handler', 'route', 'source']);
    expect(proposal.evidenceRefs).toEqual(['a:evidence', 'z:evidence']);
    expect(verifyNaryFactProposalChecksumV1(proposal)).toBe(true);
  });

  it('rejects duplicate role-labelled identities', () => {
    expect(() => createNaryFactProposalV1({
      sourceRef: 'src/a.ts', sourceRevision: 's1', workspaceRevision: 'w1', packetKey: 'p1',
      graphRevision: 'g1', producerRevision: 'p1', predicate: 'RELATES', admission: 'PROPOSED',
      evidenceRefs: ['e1'],
      participants: [
        { canonicalId: 'x', role: 'actor', entityType: 'symbol' },
        { canonicalId: 'x', role: 'actor', entityType: 'symbol' },
        { canonicalId: 'y', role: 'target', entityType: 'symbol' },
      ],
    })).toThrow('NARY_PROPOSAL_DUPLICATE_PARTICIPANT');
  });
});
