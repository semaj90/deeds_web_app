import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildAtlasAstNodesV2ProposalV1 } from './atlas-ast-nodes-v2-proposal-contract-v1.mjs';

const workspaceRevision = `sha256:${'a'.repeat(64)}`;
const repoId = '01a13137-1378-7df9-9968-53738dbf0e48';

function coordinates(bytes, offset) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, offset));
  return { utf16: text.length, line: 1 + (text.match(/\n/g) ?? []).length };
}

function fixture(overrides = {}) {
  const sourceBytes = overrides.sourceBytes ?? Buffer.from('function café() {\r\n  const emoji = "🌱";\r\n}\r\n', 'utf8');
  const start = sourceBytes.indexOf(Buffer.from('const emoji'));
  const end = sourceBytes.indexOf(Buffer.from(';'), start) + 1;
  const parent = { startByte: 0, endByte: sourceBytes.length };
  const parentStart = coordinates(sourceBytes, parent.startByte);
  const parentEnd = coordinates(sourceBytes, parent.endByte);
  const childStart = coordinates(sourceBytes, start);
  const childEnd = coordinates(sourceBytes, end);
  return {
    repoId,
    workspaceId: 'workspace-test',
    workspaceRevision,
    pathNamespace: 'FRONTEND_ROOT',
    relativePath: 'src/lib/example.ts',
    sourceRevision: `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`,
    sourceBytes,
    parserName: 'typescript-compiler',
    parserVersion: '5.9.0',
    parserLanguage: 'typescript',
    grammarVersion: 'typescript-5.9',
    extractionContractRevision: `sha256:${'e'.repeat(64)}`,
    nodes: [
      { nodeKind: 'file', qualifiedSymbol: 'example.ts', occurrence: 0, ...parent, startUtf16: parentStart.utf16, endUtf16: parentEnd.utf16, lineStart: parentStart.line, lineEnd: parentEnd.line, parentIndex: null },
      { nodeKind: 'field', qualifiedSymbol: 'emoji', occurrence: 0, startByte: start, endByte: end, startUtf16: childStart.utf16, endUtf16: childEnd.utf16, lineStart: childStart.line, lineEnd: childEnd.line, parentIndex: 0 },
    ],
    ...overrides,
  };
}

test('builds a deterministic non-persisting proposal with parent-linked IDs', () => {
  const input = fixture();
  const first = buildAtlasAstNodesV2ProposalV1(input);
  const second = buildAtlasAstNodesV2ProposalV1({ ...input, nodes: [
    { ...input.nodes[1], parentIndex: 1 },
    { ...input.nodes[0], parentIndex: null },
  ] });
  assert.equal(first.status, 'DRY_RUN_VALIDATED_NOT_INDEXED');
  assert.equal(first.canonicalAuthority, false);
  assert.equal(first.writesPerformed, false);
  assert.equal(first.identity.sourceRevision, input.sourceRevision);
  assert.equal(first.nodes.length, 2);
  assert.equal(first.nodes[1].parentTreeNodeId, first.nodes[0].treeNodeId);
  assert.match(first.nodes[0].treeNodeId, /^[0-9a-f]{64}$/);
  assert.equal(first.nodes[0].sourceSpanSha256, first.identity.sourceRevision);
  assert.match(first.nodes[1].sourceSpanSha256, /^sha256:[0-9a-f]{64}$/);
  assert.equal(first.proposalChecksum, second.proposalChecksum);
});

test('node identity changes with workspace, source, parser, or extraction revision', () => {
  const base = buildAtlasAstNodesV2ProposalV1(fixture());
  for (const changes of [
    { workspaceId: 'workspace-other' },
    { workspaceRevision: `sha256:${'b'.repeat(64)}` },
    { parserVersion: '5.10.0' },
    { grammarVersion: 'typescript-next' },
    { extractionContractRevision: `sha256:${'f'.repeat(64)}` },
  ]) {
    const changed = buildAtlasAstNodesV2ProposalV1(fixture(changes));
    assert.notEqual(changed.nodes[0].treeNodeId, base.nodes[0].treeNodeId);
  }
  const sourceBytes = Buffer.from('function cafe() {\r\n  const emoji = "🌱";\r\n}\r\n');
  const changedSource = fixture({ sourceBytes, sourceRevision: `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}` });
  assert.notEqual(buildAtlasAstNodesV2ProposalV1(changedSource).nodes[0].treeNodeId, base.nodes[0].treeNodeId);
});

test('rejects mismatched or missing provenance before producing a proposal', () => {
  assert.throws(() => buildAtlasAstNodesV2ProposalV1(fixture({ sourceRevision: `sha256:${'c'.repeat(64)}` })), { message: 'AST_V2_SOURCE_REVISION_MISMATCH' });
  assert.throws(() => buildAtlasAstNodesV2ProposalV1(fixture({ workspaceRevision: '0' })), { message: 'AST_V2_WORKSPACE_REVISION_INVALID' });
  assert.throws(() => buildAtlasAstNodesV2ProposalV1(fixture({ workspaceId: '' })), { message: 'AST_V2_WORKSPACE_ID_REQUIRED' });
  assert.throws(() => buildAtlasAstNodesV2ProposalV1(fixture({ extractionContractRevision: 'ast-extract-v1' })), { message: 'AST_V2_EXTRACTION_REVISION_INVALID' });
});

test('rejects invalid UTF-8 and byte offsets inside a multibyte character', () => {
  const invalidBytes = Buffer.from([0xc3, 0x28]);
  const invalidInput = fixture();
  invalidInput.sourceBytes = invalidBytes;
  assert.throws(() => buildAtlasAstNodesV2ProposalV1(invalidInput), { message: 'AST_V2_SOURCE_UTF8_INVALID' });

  const input = fixture();
  const accented = input.sourceBytes.indexOf(Buffer.from('é')) + 1;
  input.nodes[1] = { ...input.nodes[1], startByte: accented, endByte: accented };
  assert.throws(() => buildAtlasAstNodesV2ProposalV1(input), { message: 'AST_V2_SPAN_SPLITS_UTF8_CODE_POINT' });
});

test('rejects incorrect UTF-16 and line coordinates for CRLF and non-BMP text', () => {
  const input = fixture();
  input.nodes[1].startUtf16 += 1;
  assert.throws(() => buildAtlasAstNodesV2ProposalV1(input), { message: 'AST_V2_UTF16_SPAN_MISMATCH:1' });
  const wrongLine = fixture();
  wrongLine.nodes[1].lineStart += 1;
  assert.throws(() => buildAtlasAstNodesV2ProposalV1(wrongLine), { message: 'AST_V2_LINE_SPAN_MISMATCH:1' });
});

test('rejects parent scope violations, cycles, and duplicate occurrence keys', () => {
  const outsideParent = fixture();
  const innerEnd = coordinates(outsideParent.sourceBytes, 1);
  outsideParent.nodes.splice(1, 0, { nodeKind: 'method', qualifiedSymbol: 'narrow', occurrence: 0, startByte: 0, endByte: 1, startUtf16: 0, endUtf16: innerEnd.utf16, lineStart: 1, lineEnd: innerEnd.line, parentIndex: 0 });
  outsideParent.nodes[2].parentIndex = 1;
  assert.throws(() => buildAtlasAstNodesV2ProposalV1(outsideParent), { message: 'AST_V2_PARENT_SPAN_NOT_CONTAINING:2' });

  const cycle = fixture();
  cycle.nodes[1] = { ...cycle.nodes[1], startByte: 0, endByte: cycle.sourceBytes.length, startUtf16: 0, endUtf16: cycle.sourceBytes.toString('utf8').length, lineStart: 1, lineEnd: 4 };
  cycle.nodes[0].parentIndex = 1;
  cycle.nodes[1].parentIndex = 0;
  assert.throws(() => buildAtlasAstNodesV2ProposalV1(cycle), /AST_V2_PARENT_CYCLE/);

  const duplicate = fixture();
  duplicate.nodes.push({ ...duplicate.nodes[1], startByte: 1, endByte: 2, startUtf16: 1, endUtf16: 2, lineStart: 1, lineEnd: 1, parentIndex: 0 });
  assert.throws(() => buildAtlasAstNodesV2ProposalV1(duplicate), { message: 'AST_V2_DUPLICATE_SIBLING_OCCURRENCE:2' });
});

test('rejects unsafe paths and unsupported node kinds', () => {
  assert.throws(() => buildAtlasAstNodesV2ProposalV1(fixture({ relativePath: '../outside.ts' })), { message: 'AST_V2_RELATIVE_PATH_INVALID' });
  const badKind = fixture();
  badKind.nodes[1].nodeKind = 'invented';
  assert.throws(() => buildAtlasAstNodesV2ProposalV1(badKind), { message: 'AST_V2_NODE_KIND_INVALID:1' });
  const multipleRoots = fixture();
  multipleRoots.nodes[1].parentIndex = null;
  assert.throws(() => buildAtlasAstNodesV2ProposalV1(multipleRoots), { message: 'AST_V2_FILE_ROOT_REQUIRED' });
});
