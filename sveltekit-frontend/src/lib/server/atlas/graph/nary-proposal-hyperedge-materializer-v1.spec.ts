import { describe, expect, it } from 'vitest';
import { admitNaryFactProposalV1, type GraphifyCurrentnessProofV1 } from './nary-fact-admission-v1.js';
import { createNaryFactProposalV1 } from './nary-fact-proposal-v1.js';
import type { ResearchEvidenceV1 } from '../contracts/research-evidence-v1.js';
import {
  buildAdmittedNaryHyperEdgeEvidenceV1,
  materializeAdmittedNaryFactProposalV1,
} from './nary-proposal-hyperedge-materializer-v1.js';

const owners = [
  { canonicalId: 'route:search', entityType: 'ROUTE', entityRevision: 'source:v1' },
  { canonicalId: 'symbol:search', entityType: 'SYMBOL', entityRevision: 'source:v1' },
  { canonicalId: 'schema:request', entityType: 'SCHEMA', entityRevision: 'source:v1' },
];

function makeProposal() {
  const proposal = createNaryFactProposalV1({
    sourceRef: 'src/routes/search.ts', sourceRevision: 'source:v1', workspaceRevision: 'workspace:v1',
    packetKey: 'packet:search', graphRevision: 'graph:v1', producerRevision: 'proposal:v1', ontologyRevision: 'ontology:v1',
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
    const proposal = makeProposal();
    const edge = materializeAdmittedNaryFactProposalV1(proposal);
    expect(edge.schemaVersion).toBe('atlas.hyperedge.v1');
    expect(edge.participants).toHaveLength(3);
    expect(edge).toMatchObject({
      predicate: proposal.predicate,
      evidenceRefs: proposal.evidenceRefs,
      workspaceRevision: proposal.workspaceRevision,
      graphRevision: proposal.graphRevision,
      sourceRevision: proposal.sourceRevision,
      producerRevision: proposal.producerRevision,
    });
    expect(edge.participants).toEqual(proposal.participants.map(({ canonicalId, role, ordinal }) => ({
      canonicalId,
      role,
      ...(ordinal !== undefined ? { ordinal } : {}),
    })));
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

  it('preserves tuple identity and revisions in the non-authoritative evidence envelope', () => {
    const proposal = makeProposal();
    const evidenceRef = proposal.evidenceRefs[0];
    const evidence: ResearchEvidenceV1 = {
      schema: 'atlas.research-evidence.v1',
      evidenceId: 'evidence:search',
      sourceKind: 'CODE',
      sourceRef: proposal.sourceRef,
      sourceRevision: proposal.sourceRevision,
      contentDigest: `sha256:${'a'.repeat(64)}`,
      proposition: 'The source contains the observed API relation.',
      confidence: 0.9,
      evidenceRefs: [evidenceRef],
      webProvenance: null,
      producerRevision: 'source-reader:v1',
      canonicalAuthority: false,
    };
    const value = buildAdmittedNaryHyperEdgeEvidenceV1(proposal, {
      evidence: [evidence],
      bindings: [{ evidenceId: evidence.evidenceId, evidenceRef }],
      producerRevision: 'evidence-envelope:v1',
    });

    expect(value.originBinding).toEqual({
      proposalChecksum: proposal.proposalChecksum,
      packetKey: proposal.packetKey,
      sourceRef: proposal.sourceRef,
      sourceRevision: proposal.sourceRevision,
      workspaceRevision: proposal.workspaceRevision,
      ontologyRevision: proposal.ontologyRevision,
      graphRevision: proposal.graphRevision,
      proposalProducerRevision: proposal.producerRevision,
    });
    expect(value.canonicalAuthority).toBe(false);
    expect(value.writesPerformed).toBe(false);
  });

  it('rejects source evidence that does not match the proposal source revision', () => {
    const proposal = makeProposal();
    const evidenceRef = proposal.evidenceRefs[0];
    expect(() => buildAdmittedNaryHyperEdgeEvidenceV1(proposal, {
      evidence: [{
        schema: 'atlas.research-evidence.v1',
        evidenceId: 'evidence:stale',
        sourceKind: 'CODE',
        sourceRef: proposal.sourceRef,
        sourceRevision: 'source:stale',
        contentDigest: `sha256:${'a'.repeat(64)}`,
        proposition: 'Stale evidence must not bind.',
        confidence: 0.8,
        evidenceRefs: [evidenceRef],
        webProvenance: null,
        producerRevision: 'source-reader:v1',
        canonicalAuthority: false,
      }],
      bindings: [{ evidenceId: 'evidence:stale', evidenceRef }],
      producerRevision: 'evidence-envelope:v1',
    })).toThrow('NARY_PROPOSAL_SOURCE_EVIDENCE_MISSING');
  });
});
