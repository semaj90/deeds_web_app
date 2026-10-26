import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildSnapshotBoundProposalGraphV1, verifySnapshotBoundProposalGraphV1 } from './snapshot-bound-proposal-graph-v1.mjs';

const workspaceRevision = `sha256:${'a'.repeat(64)}`;
const sourceRevision = `sha256:${'b'.repeat(64)}`;
const inputArtifactDigest = `sha256:${'c'.repeat(64)}`;

function proposal(overrides = {}) {
  return {
    schema: 'atlas.graphify-edge-candidate.v1',
    workspace_revision: workspaceRevision,
    source_ref: 'src/example.ts',
    source_revision: sourceRevision,
    predicate: 'CALLS',
    subject_symbol_id: 'symbol-1',
    subject_qualified_name: 'Example.run',
    subject_evidence_key: 'evidence-1',
    object_symbol_id: null,
    unresolved_target: 'client.execute',
    evidence_span: { occurrence_byte_span: [4, 12], digest: `sha256:${'d'.repeat(64)}`, start_line: 2, end_line: 2 },
    source_content_digest: sourceRevision,
    source_byte_length: 20,
    canonical_authority: false,
    admission_status: 'REVIEW_REQUIRED',
    persisted: false,
    proposal_id: 'proposal-1',
    ...overrides,
  };
}

function toolProposal(overrides = {}) {
  return {
    schema: 'atlas.graph-edge-proposal.v1',
    source_locator: 'src/routes/api/example/+server.ts',
    target_label: '/api/example',
    relation: 'HANDLES_ENDPOINT',
    source_revision: sourceRevision,
    workspace_revision: workspaceRevision,
    evidence: {
      line: null,
      evidence_scope: 'FILE',
      source_content_digest: sourceRevision,
      source_byte_length: 30,
      source_span: null,
      caller: 'api-handler',
      type: 'api_route',
      metadata: {},
    },
    admission_status: 'REVIEW_REQUIRED',
    canonical_authority: false,
    proposal_id: 'tool-proposal-1',
    ...overrides,
  };
}

test('composes a deterministic proposal graph with revision-qualified evidence', () => {
  const inputs = [proposal(), proposal({ proposal_id: 'proposal-2', subject_symbol_id: null, subject_qualified_name: null, unresolved_target: 'client.close' })];
  const first = buildSnapshotBoundProposalGraphV1({ proposals: inputs, workspaceRevision, inputArtifactDigest });
  const second = buildSnapshotBoundProposalGraphV1({ proposals: inputs, workspaceRevision, inputArtifactDigest });

  assert.equal(first.receipt.status, 'INTEGRATED_PROPOSAL_GRAPH_REVIEW_REQUIRED');
  assert.equal(first.receipt.canonicalAuthority, false);
  assert.equal(first.receipt.writesPerformed, false);
  assert.equal(first.receipt.proposalCount, 2);
  assert.equal(first.receipt.edgeCount, 2);
  assert.equal(first.receipt.unresolvedCallerCount, 1);
  assert.equal(first.receipt.unresolvedTargetCount, 2);
  assert.equal(first.receipt.graphDigest, second.receipt.graphDigest);
  assert.equal(first.edges[0].evidence.workspaceRevision, workspaceRevision);
  assert.equal(first.edges[0].evidence.sourceRevision, sourceRevision);
});

test('rejects revision drift, malformed spans, duplicate identity and promotion-shaped inputs', () => {
  const build = (item) => buildSnapshotBoundProposalGraphV1({ proposals: [item], workspaceRevision, inputArtifactDigest });
  assert.throws(() => build(proposal({ workspace_revision: `sha256:${'e'.repeat(64)}` })), /PROPOSAL_WORKSPACE_REVISION_MISMATCH/);
  assert.throws(() => build(proposal({ evidence_span: { occurrence_byte_span: [0, 21], digest: `sha256:${'d'.repeat(64)}` } })), /PROPOSAL_SPAN_INVALID/);
  assert.throws(() => buildSnapshotBoundProposalGraphV1({ proposals: [proposal(), proposal()], workspaceRevision, inputArtifactDigest }), /PROPOSAL_ID_INVALID_OR_DUPLICATE/);
  assert.throws(() => build(proposal({ canonical_authority: true })), /PROPOSAL_NOT_REVIEW_ONLY/);
});

test('rejects invalid source digest and unsupported relation lanes', () => {
  const build = (item) => buildSnapshotBoundProposalGraphV1({ proposals: [item], workspaceRevision, inputArtifactDigest });
  assert.throws(() => build(proposal({ source_content_digest: `sha256:${'f'.repeat(64)}` })), /PROPOSAL_SOURCE_LINEAGE_INVALID/);
  assert.throws(() => build(proposal({ predicate: 'USES_DB' })), /PROPOSAL_PREDICATE_UNSUPPORTED/);
});

test('integrates proposal-only tool relations without treating target labels as canonical identities', () => {
  const graph = buildSnapshotBoundProposalGraphV1({
    proposals: [proposal(), toolProposal()],
    workspaceRevision,
    inputArtifactDigest,
    inputArtifacts: [{ kind: 'CALLS', sha256: inputArtifactDigest }, { kind: 'TOOL', sha256: inputArtifactDigest }],
  });

  assert.deepEqual(graph.edges.map((edge) => edge.predicate), ['CALLS', 'HANDLES_ENDPOINT']);
  assert.equal(graph.receipt.proposalCount, 2);
  assert.equal(graph.inputArtifacts.length, 2);
  assert.ok(graph.nodes.some((node) => node.kind === 'proposal_target' && node.identityStatus === 'PROPOSAL_LABEL_NOT_CANONICAL_ID'));
});

test('rejects tool proposal revision drift and non-review-only claims', () => {
  const build = (item) => buildSnapshotBoundProposalGraphV1({ proposals: [item], workspaceRevision, inputArtifactDigest });
  assert.throws(() => build(toolProposal({ workspace_revision: `sha256:${'e'.repeat(64)}` })), /PROPOSAL_WORKSPACE_REVISION_MISMATCH/);
  assert.throws(() => build(toolProposal({ canonical_authority: true })), /PROPOSAL_NOT_REVIEW_ONLY/);
  assert.throws(() => build(toolProposal({ relation: 'INVENTS_CANONICAL_ID' })), /PROPOSAL_PREDICATE_UNSUPPORTED/);
});

test('attaches advisory symbol candidates without resolving or promoting CALLS targets', () => {
  const graph = buildSnapshotBoundProposalGraphV1({
    proposals: [proposal()],
    workspaceRevision,
    inputArtifactDigest,
    symbolCandidatesByTarget: {
      'client.execute': [{ stableSymbolId: 'symbol-candidate', matchBases: ['EXACT_ALIAS'], workspaceVersionCount: 0 }],
    },
  });
  const target = graph.nodes.find((node) => node.label === 'client.execute');
  assert.equal(target.identityStatus, 'UNRESOLVED_PROPOSAL_LABEL');
  assert.equal(target.advisoryResolutionStatus, 'CANDIDATES_NOT_WORKSPACE_VERSION_QUALIFIED');
  assert.deepEqual(target.advisorySymbolCandidates.map((candidate) => candidate.stableSymbolId), ['symbol-candidate']);
  assert.equal(graph.receipt.callTargetsWithAdvisoryCandidates, 1);
  assert.equal(graph.canonicalAuthority, false);
});

test('independently verifies proposal graph digest, topology, and proposal-only state', () => {
  const manifestDigest = `sha256:${createHash('sha256').update('[]').digest('hex')}`;
  const graph = buildSnapshotBoundProposalGraphV1({ proposals: [proposal()], workspaceRevision, inputArtifactDigest: manifestDigest });
  const verified = verifySnapshotBoundProposalGraphV1(graph);
  assert.equal(verified.status, 'VERIFIED_PROPOSAL_GRAPH');
  assert.deepEqual(verified.failures, []);

  const tampered = structuredClone(graph);
  tampered.edges[0].evidence.sourceRevision = `sha256:${'e'.repeat(64)}`;
  const rejected = verifySnapshotBoundProposalGraphV1(tampered);
  assert.equal(rejected.status, 'INVALID');
  assert.ok(rejected.failures.includes('GRAPH_DIGEST_MISMATCH'));
});

test('verifies input artifact byte length and digest and rejects mismatched readback', () => {
  const artifactBytes = Buffer.from('{"proposal":true}\n');
  const artifactDigest = `sha256:${createHash('sha256').update(artifactBytes).digest('hex')}`;
  const inputArtifacts = [{ kind: 'CALLS', path: '.tmp/atlas/calls.ndjson', sha256: artifactDigest, byteLength: artifactBytes.byteLength }];
  const manifestDigest = `sha256:${createHash('sha256').update(JSON.stringify(inputArtifacts)).digest('hex')}`;
  const graph = buildSnapshotBoundProposalGraphV1({ proposals: [proposal()], workspaceRevision, inputArtifactDigest: manifestDigest, inputArtifacts });

  assert.equal(verifySnapshotBoundProposalGraphV1(graph, { readArtifactBytes: () => artifactBytes }).status, 'VERIFIED_PROPOSAL_GRAPH');
  const rejected = verifySnapshotBoundProposalGraphV1(graph, { readArtifactBytes: () => Buffer.from('changed') });
  assert.equal(rejected.status, 'INVALID');
  assert.ok(rejected.failures.includes('INPUT_ARTIFACT_READBACK_MISMATCH:CALLS'));
});

test('requires snapshot plan and authority receipts for strict lineage readback', () => {
  const manifestDigest = `sha256:${createHash('sha256').update('[]').digest('hex')}`;
  const graph = buildSnapshotBoundProposalGraphV1({ proposals: [proposal()], workspaceRevision, inputArtifactDigest: manifestDigest });
  const result = verifySnapshotBoundProposalGraphV1(graph, { requireSnapshotLineage: true });
  assert.equal(result.status, 'INVALID');
  assert.ok(result.failures.includes('SNAPSHOT_LINEAGE_ARTIFACTS_MISSING'));
});
