import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRepairProposalV1, verifyRepairProposalV1 } from '../dist/index.js';

const digest = `sha256:${'a'.repeat(64)}`;
const proposalInput = (overrides = {}) => ({
  proposalId: 'proposal:repair:1',
  executionId: 'execution:diagnostic:1',
  workspaceRevision: digest,
  candidateSnapshotRevision: digest,
  graphSnapshotRevision: null,
  diagnosticEvidenceRefs: ['receipt:compiler-error:1'],
  candidates: [{
    functionId: 'symbol:repo:root/src/example.ts#run',
    repositoryId: '01a13137-1378-7df9-9968-53738dbf0e48',
    sourceRef: 'repo:root/src/example.ts',
    sourceRevision: digest,
    candidateSnapshotRevision: digest,
    rank: 1,
    score: 0.75,
    evidenceRefs: ['receipt:source-span:1'],
    graphFeatures: { mode: 'EXCLUDED' },
  }],
  patchHypothesis: 'Handle the missing optional value before dereferencing it.',
  proposedTestIds: ['test:src/example.spec.ts#handles-missing-value'],
  riskClass: 'LOW',
  ...overrides,
});

test('proposal is checksummed, revision-bound, non-authoritative, and write-free', () => {
  const proposal = buildRepairProposalV1(proposalInput());
  assert.equal(proposal.mode, 'PROPOSE_ONLY');
  assert.equal(proposal.authorizationGranted, false);
  assert.equal(proposal.canonicalAuthority, false);
  assert.equal(proposal.writesPerformed, false);
  assert.deepEqual(verifyRepairProposalV1(proposal), proposal);
});

test('stale candidate snapshots and duplicate or non-contiguous ranks are rejected', () => {
  assert.throws(() => buildRepairProposalV1(proposalInput({
    candidates: [{ ...proposalInput().candidates[0], candidateSnapshotRevision: `sha256:${'b'.repeat(64)}` }],
  })), /STALE_CANDIDATE_SNAPSHOT/);
  assert.throws(() => buildRepairProposalV1(proposalInput({
    candidates: [proposalInput().candidates[0], { ...proposalInput().candidates[0], functionId: 'symbol:other', rank: 3 }],
  })), /CANDIDATE_RANKS_MUST_BE_CONTIGUOUS/);
});

test('graph evidence requires the exact proposal graph snapshot revision', () => {
  const candidate = proposalInput().candidates[0];
  assert.throws(() => buildRepairProposalV1(proposalInput({
    candidates: [{ ...candidate, graphFeatures: { mode: 'ADMITTED', graphSnapshotRevision: digest, evidenceRefs: ['receipt:graph:1'] } }],
  })), /GRAPH_FEATURE_REVISION_MISMATCH/);
  const proposal = buildRepairProposalV1(proposalInput({
    graphSnapshotRevision: digest,
    candidates: [{ ...candidate, graphFeatures: { mode: 'ADMITTED', graphSnapshotRevision: digest, evidenceRefs: ['receipt:graph:1'] } }],
  }));
  assert.equal(proposal.candidates[0].graphFeatures.mode, 'ADMITTED');
});

test('changed proposal content fails checksum verification and arbitrary fields are rejected', () => {
  const proposal = buildRepairProposalV1(proposalInput());
  assert.throws(() => verifyRepairProposalV1({ ...proposal, patchHypothesis: 'changed' }), /REPAIR_PROPOSAL_CHECKSUM_MISMATCH/);
  assert.throws(() => buildRepairProposalV1({ ...proposalInput(), command: 'arbitrary shell' }));
});
