import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAstMiniRecordV1 } from '../dist/core/ast-mini-record-v1.js';

const sha = (letter) => `sha256:${letter.repeat(64)}`;
const base = {
  sourceRef: 'repo:root:src/search.ts', sourceRevision: sha('a'), workspaceRevision: sha('b'),
  sourceContentDigest: sha('c'), treeNodeId: 'tree-locator-1', parentTreeNodeId: null,
  nodeKind: 'function_declaration', qualifiedSymbol: 'search', startByte: 10, endByte: 90,
  startLine: 2, endLine: 5, producerName: 'tree-sitter', producerVersion: '0.25.0',
};

test('builds a compact AST feature record without promoting the tree locator to authority', () => {
  const record = buildAstMiniRecordV1(base);
  assert.equal(record.schema, 'atlas.ast-mini-record.v1');
  assert.deepEqual(record.flags, { declaration: true, callable: true, import: false, export: false, type: false, literal: false });
  assert.equal(record.identity.sourceRevision, sha('a'));
  assert.equal(record.canonicalAuthority, false);
  assert.equal(record.node.treeNodeId, 'tree-locator-1');
});

test('classifies import/export/type/literal node kinds deterministically', () => {
  const flag = (nodeKind) => buildAstMiniRecordV1({ ...base, nodeKind }).flags;
  assert.equal(flag('import declaration').import, true);
  assert.equal(flag('export_declaration').export, true);
  assert.equal(flag('interface_declaration').type, true);
  assert.equal(flag('string_literal').literal, true);
});

test('rejects missing or malformed revisions and invalid spans', () => {
  assert.throws(() => buildAstMiniRecordV1({ ...base, sourceRevision: 'latest' }));
  assert.throws(() => buildAstMiniRecordV1({ ...base, workspaceRevision: '' }));
  assert.throws(() => buildAstMiniRecordV1({ ...base, endByte: 10 }));
  assert.throws(() => buildAstMiniRecordV1({ ...base, startLine: 6, endLine: 5 }));
});
