import { describe, expect, it } from 'vitest';
import { createNaryFactProposalV1 } from './nary-fact-proposal-v1.js';
import { admitNaryFactProposalV1 } from './nary-fact-admission-v1.js';

const owners = [
  { canonicalId: 'route:search', entityType: 'ROUTE', entityRevision: 'source:v1' },
  { canonicalId: 'symbol:search', entityType: 'SYMBOL', entityRevision: 'source:v1' },
  { canonicalId: 'schema:request', entityType: 'SCHEMA', entityRevision: 'source:v1' },
];

const currentness = {
  status: 'GRAPHIFY_RUN_OWNER_COMPLETE' as const,
  workspaceRevision: 'workspace:v1',
  graphRevision: 'graph:v1',
  authoritativeGraphRun: true as const,
};

function proposal() {
  return createNaryFactProposalV1({
    sourceRef: 'src/routes/search.ts',
    sourceRevision: 'source:v1',
    workspaceRevision: 'workspace:v1',
    packetKey: 'packet:search',
    graphRevision: 'graph:v1',
    producerRevision: 'proposal:v1',
    predicate: 'API_CONTRACT_OBSERVED',
    participants: owners.map((owner) => ({ ...owner, role: owner.entityType.toLowerCase() })),
    evidenceRefs: ['evidence:api'],
    admission: 'PROPOSED',
  });
}

describe('NaryFactProposal admission', () => {
  it('admits a checksum-valid, revision-bound proposal with proven owners', () => {
    const admitted = admitNaryFactProposalV1({
      proposal: proposal(),
      owners,
      expectedWorkspaceRevision: 'workspace:v1',
      expectedGraphRevision: 'graph:v1',
      currentness,
    });

    expect(admitted.admission).toBe('ADMITTED');
    expect(admitted.canonicalAuthority).toBe(false);
  });

  it('rejects revision drift and never returns an admitted proposal', () => {
    expect(() => admitNaryFactProposalV1({
      proposal: proposal(),
      owners,
      expectedWorkspaceRevision: 'workspace:stale',
      expectedGraphRevision: 'graph:v1',
      currentness: { ...currentness, workspaceRevision: 'workspace:stale' },
    })).toThrow('NARY_PROPOSAL_WORKSPACE_REVISION_MISMATCH');
  });

  it('rejects caller revisions without a completed Graphify proof', () => {
    expect(() => admitNaryFactProposalV1({
      proposal: proposal(),
      owners,
      expectedWorkspaceRevision: 'workspace:v1',
      expectedGraphRevision: 'graph:v1',
      currentness: { ...currentness, status: 'GRAPHIFY_RUN_OWNER_BLOCKED' as never, authoritativeGraphRun: false as never },
    })).toThrow('NARY_PROPOSAL_GRAPHIFY_CURRENTNESS_UNPROVEN');
  });
});
