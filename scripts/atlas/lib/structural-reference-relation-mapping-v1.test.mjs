import test from 'node:test';
import assert from 'node:assert/strict';
import { mapReferenceFacts } from './structural-reference-relation-mapping-v1.mjs';
import { relationIdentity } from './canonical-relation-contract-v1.mjs';

const SCOPE = { repositoryId: '11111111-1111-7111-8111-111111111111', snapshotId: '22222222-2222-7222-8222-222222222222' };
const SHA = (c) => `sha256:${c.repeat(64)}`;
const fact = (over = {}) => ({
  schema: 'atlas.structural-reference-fact.v1', reference_id: 'r1', reference_kind: 'call', source_ref: 'src/a.ts', source_revision: SHA('a'),
  workspace_revision: SHA('w'), upstream_source_node_id: 'n1', upstream_chunk_id: 'c1', containing_stable_symbol_id: 'sym:a', target_text: 'b',
  target_stable_symbol_id: 'sym:b', resolution_status: 'canonical', captures: {}, evidence_refs: ['span-1'], extractor: 'treesitter_chunker', extractor_revision: 'ts@1', ...over,
});
const run = (facts, extra = {}) => mapReferenceFacts({ facts, scope: SCOPE, ...extra });

test('a canonical call becomes an AST_STRUCTURAL CALLS candidate with independent source-bytes evidence', () => {
  const out = run([fact()]);
  assert.equal(out.counts.candidates, 1);
  const c = out.candidates[0];
  assert.equal(c.type, 'CALLS');
  assert.equal(c.origin, 'AST_STRUCTURAL');
  assert.deepEqual(c.evidence.map((e) => e.kind), ['SOURCE_BYTES', 'PARSER_SPAN']);
  assert.equal(out.writesPerformed, false);
  assert.equal(out.canonicalAuthority, false);
});

test('imports map file to file and need target source ref; exports map file to symbol', () => {
  const imp = run([fact({ reference_id: 'i', reference_kind: 'import', containing_stable_symbol_id: null, target_stable_symbol_id: null, target_source_ref: 'src/b.ts', target_source_revision: SHA('b') })]);
  assert.equal(imp.candidates[0].type, 'IMPORTS');
  assert.deepEqual(imp.candidates[0].target, { class: 'SourceFile', key: 'src/b.ts' });
  const noTarget = run([fact({ reference_id: 'i2', reference_kind: 'import', target_stable_symbol_id: null })]);
  assert.equal(noTarget.unresolved[0].reason, 'TARGET_ENDPOINT_MISSING');
  const exp = run([fact({ reference_id: 'e', reference_kind: 'export' })]);
  assert.equal(exp.candidates[0].type, 'EXPORTS');
});

test('degraded, ambiguous and unresolved facts never become candidates', () => {
  for (const status of ['degraded', 'ambiguous', 'unresolved']) {
    const out = run([fact({ resolution_status: status })]);
    assert.equal(out.counts.candidates, 0);
    assert.equal(out.unresolved[0].reason, `RESOLUTION_${status.toUpperCase()}`);
  }
});

test('missing endpoints, unsupported kinds and non-sha revisions are reported with typed reasons', () => {
  assert.equal(run([fact({ containing_stable_symbol_id: null })]).unresolved[0].reason, 'SOURCE_ENDPOINT_MISSING');
  assert.equal(run([fact({ target_stable_symbol_id: null })]).unresolved[0].reason, 'TARGET_ENDPOINT_MISSING');
  assert.equal(run([fact({ reference_kind: 'export_default' })]).unsupportedKind.length, 1);
  assert.deepEqual(run([fact({ source_revision: 'source-r1' })]).rejected[0].reasons, ['SOURCE_REVISION_NOT_SHA256']);
  assert.deepEqual(run([fact({ target_source_ref: 'x', target_source_revision: 'bad' })]).rejected[0].reasons, ['TARGET_SOURCE_REVISION_NOT_SHA256']);
});

test('missing scope rejects every candidate instead of defaulting a repository', () => {
  const out = mapReferenceFacts({ facts: [fact()], scope: null });
  assert.equal(out.counts.candidates, 0);
  assert.ok(out.rejected[0].reasons.includes('SCOPE_MISSING'));
});

test('duplicate facts merge evidence; differing revisions are conflicts, not silent overwrites', () => {
  const merged = run([fact(), fact({ reference_id: 'r2', evidence_refs: ['span-2'] })]);
  assert.equal(merged.counts.candidates, 1);
  assert.equal(merged.duplicates, 1);
  assert.equal(merged.candidates[0].evidence.length, 3);
  const conflict = run([fact(), fact({ reference_id: 'r3', source_revision: SHA('c') })]);
  assert.equal(conflict.counts.conflicts, 1);
});

test('existing rows: identical is counted as already present, drift is a conflict', () => {
  const first = run([fact()]).candidates[0];
  const id = relationIdentity(first);
  const same = run([fact()], { existing: new Map([[id, { relationRevision: first.relationRevision, extractionRecipe: first.extractionRecipe }]]) });
  assert.equal(same.counts.alreadyPresent, 1);
  assert.equal(same.counts.conflicts, 0);
  const drift = run([fact()], { existing: new Map([[id, { relationRevision: SHA('9'), extractionRecipe: first.extractionRecipe }]]) });
  assert.equal(drift.counts.conflicts, 1);
});

test('output is deterministic regardless of fact order', () => {
  const facts = [fact({ reference_id: 'a', target_stable_symbol_id: 'sym:z' }), fact({ reference_id: 'b', target_stable_symbol_id: 'sym:c' })];
  assert.deepEqual(run(facts).candidates, run([...facts].reverse()).candidates);
});
