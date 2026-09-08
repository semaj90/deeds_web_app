import { describe, expect, it } from 'vitest';
import { admitNaryFactProposalV1, type GraphifyCurrentnessProofV1 } from './nary-fact-admission-v1.js';
import { createNaryFactProposalV1 } from './nary-fact-proposal-v1.js';
import { materializeAdmittedNaryFactProposalV1 } from './nary-proposal-hyperedge-materializer-v1.js';

const owners = [
  { canonicalId: 'route:search', entityType: 'ROUTE', entityRevision: 'source:v1' },
  { canonicalId: 'symbol:search', entityType: 'SYMBOL', entityRevision: 'source:v1' },
  { canonicalId: 'schema:request', entityType: 'SCHEMA', entityRevision: 'source:v1' },
];

function makeProposal() {
  const proposal = createNaryFactProposalV1({
    sourceRef: 'src/routes/search.ts', sourceRevision: 'source:v1', workspaceRevision: 'workspace:v1',
    packetKey: 'packet:search', graphRevision: 'graph:v1', producerRevision: 'proposal:v1',
    predicate: 'API_CONTRACT_OBSERVED',
    participants: owners.map((owner) => ({ ...owner, role: owner.entityType.toLowerCase() })),
    evidenceRefs: ['evidence:api'], admission: 'PROPOSED',
  });
  const currentness: GraphifyCurrentnessProofV1 = {
    status: 'GRAPHIFY_RUN_OWNER_COMPLETE', workspaceRevision: 'workspace:v1', graphRevision: 'graph:v1', authoritativeGraphRun: true,
  };
  return admitNaryFactProposalV1({ proposal, owners, expectedWorkspaceRevision: 'workspace:v1', expectedGraphRevision: 'graph:v1', currentness });
}

describe('admitted NaryFactProposalV1 materializer', () => {
  it('uses the existing HyperedgeV1 owner only after admission', () => {
    const edge = materializeAdmittedNaryFactProposalV1(makeProposal());
    expect(edge.schemaVersion).toBe('atlas.hyperedge.v1');
    expect(edge.participants).toHaveLength(3);
    expect(edge.workspaceRevision).toBe('workspace:v1');
  });

  it('rejects a proposal that has not passed admission', () => {
    const proposal = createNaryFactProposalV1({
      sourceRef: 'src/routes.ts', sourceRevision: 'source:v1', workspaceRevision: 'workspace:v1',
      packetKey: 'packet:search', graphRevision: 'graph:v1', producerRevision: 'proposal:v1',
      predicate: 'API_CONTRACT_OBSERVED', participants: owners.map((owner) => ({ ...owner, role: owner.entityType.toLowerCase() })),
      evidenceRefs: ['evidence:api'], admission: 'PROPOSED',
    });
    expect(() => materializeAdmittedNaryFactProposalV1(proposal)).toThrow('NARY_PROPOSAL_NOT_ADMITTED');
  });
});
