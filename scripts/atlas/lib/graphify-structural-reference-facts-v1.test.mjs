import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGraphifyStructuralReferenceFactsV1 } from './graphify-structural-reference-facts-v1.mjs';

const workspaceRevision = `sha256:${'b'.repeat(64)}`;

function edge(overrides = {}) {
  const sourceRevision = `sha256:${'a'.repeat(64)}`;
  return {
    edge_id: 'edge-1',
    predicate: 'CALLS',
    evidence_kind: 'tree_sitter_call',
    evidence_span: { start_byte: 17, end_byte: 31 },
    confidence: 1,
    source_symbol_id: 'symbol-source',
    target_symbol_id: 'symbol-target',
    target_qualified_name: 'Auth.authorize',
    source_ref: 'src/routes/auth.ts',
    source_revision: sourceRevision,
    source_binding_revision: sourceRevision,
    source_binding_workspace_revision: workspaceRevision,
    target_source_ref: 'src/lib/server/auth.ts',
    target_source_revision: `sha256:${'c'.repeat(64)}`,
    target_binding_revision: `sha256:${'c'.repeat(64)}`,
    target_binding_workspace_revision: workspaceRevision,
    ...overrides,
  };
}

test('builds proposal facts with independent source and target lineage', () => {
  const result = buildGraphifyStructuralReferenceFactsV1([edge()], workspaceRevision);
  assert.equal(result.facts.length, 1);
  assert.equal(result.rejections.length, 0);
  assert.equal(result.facts[0].reference_kind, 'call');
  assert.equal(result.facts[0].source_ref, 'src/routes/auth.ts');
  assert.equal(result.facts[0].target_source_ref, 'src/lib/server/auth.ts');
  assert.equal(result.facts[0].target_source_revision, `sha256:${'c'.repeat(64)}`);
  assert.equal(result.facts[0].resolution_status, 'unresolved');
  assert.equal(result.canonical_authority, false);
  assert.equal(result.writes_performed, false);
});

test('rejects source and target bindings from another workspace revision', () => {
  const result = buildGraphifyStructuralReferenceFactsV1([
    edge({ source_binding_workspace_revision: `sha256:${'d'.repeat(64)}` }),
    edge({ edge_id: 'edge-2', target_binding_workspace_revision: `sha256:${'d'.repeat(64)}` }),
  ], workspaceRevision);
  assert.equal(result.facts.length, 0);
  assert.deepEqual(result.rejections.map((item) => item.code), [
    'SOURCE_BINDING_MISMATCH_OR_INCOMPLETE',
    'TARGET_BINDING_MISMATCH_OR_INCOMPLETE',
  ]);
});

test('keeps unsupported predicates and unresolved blank targets out of the fact set', () => {
  const result = buildGraphifyStructuralReferenceFactsV1([
    edge({ edge_id: 'edge-unknown', predicate: 'USES_DB' }),
    edge({ edge_id: 'edge-no-target', target_symbol_id: null, target_qualified_name: null, unresolved_target: '  ' }),
  ], workspaceRevision);
  assert.equal(result.facts.length, 0);
  assert.deepEqual(result.rejections.map((item) => item.code), ['UNSUPPORTED_PREDICATE', 'TARGET_TEXT_MISSING']);
});
