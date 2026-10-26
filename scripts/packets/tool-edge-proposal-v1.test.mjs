import assert from 'node:assert/strict';
import test from 'node:test';
import { buildToolEdgeProposalV1 } from './tool-edge-proposal-v1.mjs';
import { createGraphifySnapshotEvidenceBinderV1 } from '../atlas/lib/graphify-snapshot-evidence-binder-v1.mjs';
import { createHash } from 'node:crypto';

test('file-level route observations keep null line evidence and a non-use relation', () => {
  const proposal = buildToolEdgeProposalV1({
    type: 'api_route',
    tool: '/api/cases',
    line_num: null,
    evidence_scope: 'FILE',
  }, 'src/routes/api/cases/+server.ts');

  assert.equal(proposal.relation, 'HANDLES_ENDPOINT');
  assert.equal(proposal.evidence.line, null);
  assert.equal(proposal.evidence.metadata.evidence_scope, 'FILE');
  assert.equal(proposal.admission_status, 'GATED_MISSING_REVISION');
  assert.equal(proposal.canonical_authority, false);
});

test('line-level tool invocation retains its line and USES_TOOL relation', () => {
  const proposal = buildToolEdgeProposalV1({
    type: 'tool_call',
    tool: 'atlas.search',
    line_num: 27,
    evidence_scope: 'LINE',
    source_revision: `sha256:${'a'.repeat(64)}`,
    workspace_revision: `sha256:${'b'.repeat(64)}`,
  }, 'src/agent/tool-runner.ts');

  assert.equal(proposal.relation, 'USES_TOOL');
  assert.equal(proposal.evidence.line, 27);
  assert.equal(proposal.evidence.metadata.evidence_scope, 'LINE');
  assert.equal(proposal.admission_status, 'REVIEW_REQUIRED');
});

test('missing source locator or target label is rejected', () => {
  assert.throws(() => buildToolEdgeProposalV1({ type: 'tool_call', tool: 'x' }, ''), /TOOL_EDGE_SOURCE_LOCATOR_REQUIRED/);
  assert.throws(() => buildToolEdgeProposalV1({ type: 'tool_call' }, 'src/a.ts'), /TOOL_EDGE_TARGET_LABEL_REQUIRED/);
});

test('contradictory evidence scope and line metadata are rejected', () => {
  assert.throws(() => buildToolEdgeProposalV1({ type: 'api_route', tool: '/api/x', line_num: 1, evidence_scope: 'FILE' }, 'src/x.ts'), /TOOL_EDGE_EVIDENCE_SCOPE_LINE_MISMATCH/);
  assert.throws(() => buildToolEdgeProposalV1({ type: 'tool_call', tool: 'atlas.x', line_num: null, evidence_scope: 'LINE' }, 'src/x.ts'), /TOOL_EDGE_EVIDENCE_SCOPE_LINE_MISMATCH/);
  assert.throws(() => buildToolEdgeProposalV1({ type: 'tool_call', tool: 'atlas.x', evidence_scope: 'SPAN' }, 'src/x.ts'), /TOOL_EDGE_EVIDENCE_SCOPE_INVALID/);
});

test('snapshot-bound source evidence is carried into the proposal without granting authority', () => {
  const bytes = Buffer.from('callTool("atlas.search")\n', 'utf8');
  const sourceRevision = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const workspaceRevision = `sha256:${'b'.repeat(64)}`;
  const snapshotRevision = `sha256:${'c'.repeat(64)}`;
  const sourceEvidence = createGraphifySnapshotEvidenceBinderV1({
    admission: {
      status: 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED',
      authority: true,
      workspaceRevision,
      snapshotRevision,
    },
    manifest: {
      workspaceRevision,
      snapshotRevision,
      canonicalAuthority: false,
      datastoreWritesPerformed: false,
      sources: [{ sourceRef: 'src/agent.ts', sourceRevision, contentDigest: sourceRevision, byteLength: bytes.length }],
    },
    snapshotRoot: `C:/snapshots/${snapshotRevision.slice(7)}`,
  }).bind({ sourceRef: 'src/agent.ts', bytes, lineNumber: 1, requiredText: 'atlas.search' });
  const proposal = buildToolEdgeProposalV1({ type: 'tool_call', tool: 'atlas.search', line_num: 1, evidence_scope: 'LINE' }, 'src/agent.ts', { sourceEvidence });

  assert.equal(proposal.source_revision, sourceRevision);
  assert.equal(proposal.workspace_revision, workspaceRevision);
  assert.equal(proposal.evidence.source_content_digest, sourceRevision);
  assert.equal(proposal.evidence.source_byte_length, bytes.length);
  assert.equal(proposal.evidence.source_span.digest, `sha256:${createHash('sha256').update(Buffer.from('callTool("atlas.search")')).digest('hex')}`);
  assert.equal(proposal.evidence.evidence_scope, 'LINE');
  assert.equal(proposal.admission_status, 'REVIEW_REQUIRED');
  assert.equal(proposal.canonical_authority, false);
});
