import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { buildAtlasAstNodesV2RowProposalV1, compareAtlasAstNodesV2IndependentReadbackV1 } from './atlas-ast-nodes-v2-row-contract-v1.mjs';
import { buildAtlasAstNodesV2ProposalV1 } from './atlas-ast-nodes-v2-proposal-contract-v1.mjs';

function proposal() {
  const sourceBytes = Buffer.from('function run() {}', 'utf8');
  return buildAtlasAstNodesV2ProposalV1({
    repoId: '01a13137-1378-7df9-9968-53738dbf0e48', workspaceId: 'workspace-v2-test',
    workspaceRevision: `sha256:${'a'.repeat(64)}`, pathNamespace: 'FRONTEND_ROOT', relativePath: 'src/test.ts',
    sourceRevision: `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`, sourceBytes, parserName: 'typescript-language-server',
    parserVersion: '5.3.0', parserLanguage: 'typescript', grammarVersion: 'typescript-5.9',
    extractionContractRevision: `sha256:${'b'.repeat(64)}`,
    nodes: [{ nodeKind: 'file', qualifiedSymbol: 'src/test.ts', occurrence: 0, parentIndex: null,
      startByte: 0, endByte: sourceBytes.length, startUtf16: 0, endUtf16: sourceBytes.length, lineStart: 1, lineEnd: 1 },
    { nodeKind: 'function', qualifiedSymbol: 'run', occurrence: 0, parentIndex: 0,
      startByte: 0, endByte: sourceBytes.length, startUtf16: 0, endUtf16: sourceBytes.length, lineStart: 1, lineEnd: 1 }],
  });
}

test('maps a dry-run proposal to every required V2 writer column without inventing packet identity', () => {
  const envelope = buildAtlasAstNodesV2RowProposalV1(proposal());
  assert.equal(envelope.status, 'WRITER_INPUT_PROPOSAL_NOT_WRITTEN');
  assert.equal(envelope.canonicalAuthority, false);
  assert.equal(envelope.writesPerformed, false);
  assert.equal(envelope.packetIdentity, 'UNRESOLVED');
  assert.equal(envelope.rows.length, 2);
  assert.equal(envelope.rows[1].workspace_revision, `sha256:${'a'.repeat(64)}`);
  assert.match(envelope.rows[1].source_span_sha256, /^sha256:[0-9a-f]{64}$/);
  assert.equal(envelope.rows[1].parent_tree_node_id, envelope.rows[0].tree_node_id);
  assert.equal(envelope.rows[1].packet_key, null);
});

test('independent readback comparator distinguishes exact, missing, unexpected, and conflicting rows', () => {
  const expected = buildAtlasAstNodesV2RowProposalV1(proposal()).rows;
  assert.equal(compareAtlasAstNodesV2IndependentReadbackV1(expected, structuredClone(expected)).status, 'INDEXED_READBACK_MATCH');
  assert.equal(compareAtlasAstNodesV2IndependentReadbackV1(expected, expected.slice(0, 1)).status, 'READBACK_MISMATCH');
  assert.equal(compareAtlasAstNodesV2IndependentReadbackV1(expected, [...expected, { ...expected[0], tree_node_id: 'extra' }]).status, 'READBACK_MISMATCH');
  const conflict = structuredClone(expected);
  conflict[1].workspace_revision = `sha256:${'c'.repeat(64)}`;
  const result = compareAtlasAstNodesV2IndependentReadbackV1(expected, conflict);
  assert.equal(result.status, 'READBACK_MISMATCH');
  assert.ok(result.conflicts[0].differingColumns.includes('workspace_revision'));
  const lifecycleConflict = structuredClone(expected);
  lifecycleConflict[1].superseded_at = '2026-10-20T00:00:00.000Z';
  const lifecycleResult = compareAtlasAstNodesV2IndependentReadbackV1(expected, lifecycleConflict);
  assert.equal(lifecycleResult.status, 'READBACK_MISMATCH');
  assert.ok(lifecycleResult.conflicts[0].differingColumns.includes('superseded_at'));
});

test('rejects duplicate readback identities and non-proposal input', () => {
  const expected = buildAtlasAstNodesV2RowProposalV1(proposal()).rows;
  assert.equal(compareAtlasAstNodesV2IndependentReadbackV1(expected, [expected[0], expected[0]]).status, 'DUPLICATE_READBACK_ID');
  assert.throws(() => buildAtlasAstNodesV2RowProposalV1({ ...proposal(), canonicalAuthority: true }), /ROW_PROPOSAL_INPUT_INVALID/);
});
