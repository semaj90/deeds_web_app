import test from 'node:test';
import assert from 'node:assert/strict';

import { lspRangeToUtf8ByteRange, synthesizeLspStructuralReference } from '../dist/core/lsp-semantic-observation.js';

const fact = {
  schema: 'atlas.structural-reference-fact.v1', reference_id: 'ref:call-1', reference_kind: 'call',
  source_ref: 'src/a.ts', source_revision: 'sha256:source-a', workspace_revision: 'sha256:workspace-a',
  upstream_source_node_id: 'node:source', upstream_target_node_id: 'node:target', upstream_chunk_id: 'chunk:source',
  target_text: 'authorizeCase', resolution_status: 'unresolved', captures: {}, evidence_refs: ['evidence:xref'],
  extractor: 'treesitter_chunker', extractor_revision: 'treesitter-chunker:test',
};

const observation = {
  observation_id: 'lsp:definition:1', reference_id: 'ref:call-1', source_ref: 'src/a.ts', source_tree_node_id: null, source_revision: 'sha256:source-a',
  workspace_revision: 'sha256:workspace-a', server_id: 'typescript-language-server', server_revision: 'tsls:test',
  project_revision: 'tsconfig:test', project_config_checksum: `sha256:${'a'.repeat(64)}`, capability_checksum: `sha256:${'b'.repeat(64)}`, position_encoding: 'utf-16',
  operation: 'DEFINITION', source_range: { start: { line: 3, character: 10 }, end: { line: 3, character: 23 } },
  target_uri: 'file:///workspace/src/auth.ts', target_source_ref: 'src/auth.ts', target_range: { start: { line: 8, character: 16 }, end: { line: 8, character: 29 } },
  target_text: 'authorizeCase', target_upstream_node_id: null, result_status: 'resolved', evidence_refs: ['evidence:lsp'], canonical_authority: false,
  checksum: `sha256:${'c'.repeat(64)}`,
};

test('LSP enriches an unresolved structural fact without canonical authority', () => {
  const result = synthesizeLspStructuralReference(fact, observation, 'lsp-adapter:test');
  assert.equal(result.resolution_status, 'resolved');
  assert.equal(result.resolution_basis, 'lsp_definition');
  assert.equal(result.canonical_authority, false);
  assert.deepEqual(result.evidence_refs, ['evidence:lsp', 'evidence:xref']);
});

test('LSP results cannot cross source or workspace revisions', () => {
  assert.throws(() => synthesizeLspStructuralReference(fact, { ...observation, source_revision: 'sha256:other' }, 'lsp:test'), /LSP_SOURCE_REVISION_MISMATCH/);
  assert.throws(() => synthesizeLspStructuralReference(fact, { ...observation, workspace_revision: 'sha256:other' }, 'lsp:test'), /LSP_WORKSPACE_REVISION_MISMATCH/);
});

test('LSP position encoding maps Unicode ranges to UTF-8 bytes', () => {
  const source = 'alpha\nλ😀target';
  const range = { start: { line: 1, character: 3 }, end: { line: 1, character: 9 } };
  assert.deepEqual(lspRangeToUtf8ByteRange(source, range, 'utf-16'), { byte_start: 12, byte_end: 18 });
  assert.deepEqual(lspRangeToUtf8ByteRange(source, { start: { line: 1, character: 6 }, end: { line: 1, character: 12 } }, 'utf-8'), { byte_start: 12, byte_end: 18 });
  assert.throws(() => lspRangeToUtf8ByteRange(source, { start: { line: 1, character: 3 }, end: { line: 1, character: 3 } }, 'utf-8'), /LSP_POSITION_SPLITS_CODE_POINT/);
});
