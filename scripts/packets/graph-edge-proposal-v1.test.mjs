import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGraphEdgeProposalFromBytesV1, buildGraphEdgeProposalFromSnapshotV1, buildGraphEdgeProposalV1, buildSourceEvidenceFromBytesV1 } from './graph-edge-proposal-v1.mjs';

test('legacy unversioned edge becomes a gated proposal with stable identity', () => {
  const edge = {
    source_locator: 'sveltekit-frontend\\src\\routes\\api\\cases\\+server.ts',
    target_label: 'public.cases',
    relation: 'USES_DB',
    line: 24,
    caller: 'pool-client',
    type: 'pool',
    metadata: { operation: 'select' },
  };
  const first = buildGraphEdgeProposalV1(edge);
  const second = buildGraphEdgeProposalV1(edge);
  assert.equal(first.schema, 'atlas.graph-edge-proposal.v1');
  assert.equal(first.source_locator, 'sveltekit-frontend/src/routes/api/cases/+server.ts');
  assert.equal(first.admission_status, 'GATED_MISSING_REVISION');
  assert.equal(first.canonical_authority, false);
  assert.equal(first.proposal_id, second.proposal_id);
  assert.equal('packet_uuid' in first, false);
});

test('revision-qualified proposal retains exact evidence but still requires review', () => {
  const proposal = buildGraphEdgeProposalV1({
    source_locator: 'src/routes/api/cases/+server.ts',
    target_label: 'tool://case-search',
    relation: 'USES_TOOL',
    source_revision: `sha256:${'a'.repeat(64)}`,
    workspace_revision: `sha256:${'b'.repeat(64)}`,
    line: 81,
    caller: 'code-invocation',
    type: 'tool_call',
  });
  assert.equal(proposal.admission_status, 'REVIEW_REQUIRED');
  assert.equal(proposal.evidence.line, 81);
  assert.equal(proposal.canonical_authority, false);
});

test('malformed revision strings cannot qualify proposal lineage', () => {
  const proposal = buildGraphEdgeProposalV1({
    source_locator: 'src/routes/api/cases/+server.ts',
    target_label: 'public.cases',
    relation: 'USES_DB',
    source_revision: 'current',
    workspace_revision: `sha256:${'b'.repeat(64)}`,
  });
  assert.equal(proposal.source_revision, null);
  assert.equal(proposal.workspace_revision, `sha256:${'b'.repeat(64)}`);
  assert.equal(proposal.admission_status, 'GATED_INVALID_REVISION');
});

test('rejects proposals missing an endpoint or relation', () => {
  assert.throws(() => buildGraphEdgeProposalV1({ target_label: 'x', relation: 'USES_DB' }), /SOURCE_LOCATOR_REQUIRED/);
  assert.throws(() => buildGraphEdgeProposalV1({ source_locator: 'src/a.ts', relation: 'USES_DB' }), /TARGET_LABEL_REQUIRED/);
  assert.throws(() => buildGraphEdgeProposalV1({ source_locator: 'src/a.ts', target_label: 'x' }), /RELATION_REQUIRED/);
});

test('byte evidence binds UTF-8 line offsets and remains gated without workspace admission', () => {
  const bytes = Buffer.from('const title = "café";\r\nawait db.select().from(cases);\r\n', 'utf8');
  const evidence = buildSourceEvidenceFromBytesV1('src/cases.ts', bytes, 2);
  const proposal = buildGraphEdgeProposalFromBytesV1({
    source_locator: 'src/cases.ts',
    target_label: 'cases',
    relation: 'USES_DB',
    line: 2,
    caller: 'drizzle-query',
    type: 'drizzle',
  }, bytes);

  assert.equal(evidence.evidenceScope, 'LINE');
  assert.equal(bytes.subarray(evidence.evidenceSpan.startByte, evidence.evidenceSpan.endByte).toString('utf8'), 'await db.select().from(cases);\r');
  assert.equal(proposal.source_revision, evidence.sourceRevision);
  assert.equal(proposal.evidence.source_byte_length, bytes.byteLength);
  assert.equal(proposal.evidence.source_span.digest, evidence.evidenceSpan.digest);
  assert.equal(proposal.workspace_revision, null);
  assert.equal(proposal.admission_status, 'GATED_MISSING_REVISION');
  assert.equal(proposal.canonical_authority, false);
});

test('byte evidence rejects absent lines rather than fabricating a span', () => {
  assert.throws(() => buildSourceEvidenceFromBytesV1('src/a.ts', Buffer.from('one'), 2), /LINE_OUT_OF_RANGE/);
});

test('snapshot-bound proposal carries admitted source/workspace revision but remains review-only', () => {
  const sourceEvidence = {
    sourceRef: 'src/cases.ts',
    sourceRevision: `sha256:${'a'.repeat(64)}`,
    workspaceRevision: `sha256:${'b'.repeat(64)}`,
    contentDigest: `sha256:${'a'.repeat(64)}`,
    byteLength: 24,
    evidenceScope: 'LINE',
    lineNumber: 1,
    evidenceSpan: { startByte: 0, endByte: 10, digest: `sha256:${'c'.repeat(64)}` },
  };
  const proposal = buildGraphEdgeProposalFromSnapshotV1({
    source_locator: 'src/cases.ts',
    target_label: 'cases',
    relation: 'USES_DB',
    line: 1,
  }, { read: ({ sourceRef, lineNumber }) => {
    assert.equal(sourceRef, 'src/cases.ts');
    assert.equal(lineNumber, 1);
    return sourceEvidence;
  } });

  assert.equal(proposal.source_revision, sourceEvidence.sourceRevision);
  assert.equal(proposal.workspace_revision, sourceEvidence.workspaceRevision);
  assert.equal(proposal.admission_status, 'REVIEW_REQUIRED');
  assert.equal(proposal.canonical_authority, false);
});
