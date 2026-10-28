import test from 'node:test';
import assert from 'node:assert/strict';
import { importResolutionsToFacts } from './import-resolution-to-reference-facts-v1.mjs';
import { mapReferenceFacts } from './structural-reference-relation-mapping-v1.mjs';

const SHA = (c) => `sha256:${c.repeat(64)}`;
const SCOPE = { repositoryId: '11111111-1111-7111-8111-111111111111', snapshotId: '22222222-2222-7222-8222-222222222222' };
const rec = (over = {}) => ({ importerSourceRef: 'src/a.ts', importerSourceRevision: SHA('1'), moduleSpecifier: './b', importKind: 'NAMED', importedName: 'B', localName: 'B', targetSourceRef: 'src/b.ts', targetSourceRevision: SHA('2'), targetSymbolId: null, resolution: 'MODULE_RESOLVED', reason: 'SYMBOL_VERSION_MISSING_AT_ADMITTED_REVISION', evidenceRefs: ['src/a.ts#L1C0-L1C20'], canonicalAuthority: false, ...over });
const facts = (records) => importResolutionsToFacts({ records, workspaceRevision: SHA('a'), extractorRevision: 'ts@1' });

test('module-resolved binding yields only a file-level fact; symbol level is skipped with its reason', () => {
  const out = facts([rec()]);
  assert.equal(out.facts.length, 1);
  assert.equal(out.facts[0].reference_kind, 'import');
  assert.equal(out.skipped[0].level, 'symbol');
});

test('verified symbol version adds a symbol-level fact; several bindings to one file stay one file-level fact', () => {
  const out = facts([rec({ resolution: 'SYMBOL_VERSION_VERIFIED', targetSymbolId: 'sym:B' }), rec({ importedName: 'C', localName: 'C', resolution: 'SYMBOL_VERSION_VERIFIED', targetSymbolId: 'sym:C' })]);
  assert.deepEqual(out.facts.map((f) => f.reference_kind).sort(), ['import', 'import_binding', 'import_binding']);
});

test('external, ambiguous, unrevisioned and authority-claiming records produce no fact', () => {
  assert.equal(facts([rec({ resolution: 'EXTERNAL_MODULE' })]).facts.length, 0);
  assert.equal(facts([rec({ resolution: 'AMBIGUOUS' })]).facts.length, 0);
  assert.equal(facts([rec({ targetSourceRevision: 'x' })]).facts.length, 0);
  assert.equal(facts([rec({ canonicalAuthority: true })]).skipped[0].reason, 'RECORD_CLAIMS_AUTHORITY');
  assert.equal(importResolutionsToFacts({ records: [rec()], workspaceRevision: 'nope', extractorRevision: 'x' }).skipped[0].reason, 'WORKSPACE_REVISION_NOT_SHA256');
});

test('end to end through the mapper: file-level IMPORTS and symbol-level IMPORTS_SYMBOL stay separate relation types', () => {
  const out = facts([rec({ resolution: 'SYMBOL_VERSION_VERIFIED', targetSymbolId: 'sym:B' })]);
  const mapped = mapReferenceFacts({ facts: out.facts, scope: SCOPE });
  assert.deepEqual(mapped.candidates.map((c) => c.type).sort(), ['IMPORTS', 'IMPORTS_SYMBOL']);
  assert.equal(mapped.candidates.find((c) => c.type === 'IMPORTS_SYMBOL').target.class, 'Symbol');
  assert.equal(mapped.counts.rejected, 0);
  assert.equal(mapReferenceFacts({ facts: out.facts, scope: null }).counts.candidates, 0);
});

test('deterministic output', () => {
  const r = [rec({ resolution: 'SYMBOL_VERSION_VERIFIED', targetSymbolId: 'sym:B' }), rec({ moduleSpecifier: './c', targetSourceRef: 'src/c.ts' })];
  assert.deepEqual(facts(r), facts([...r].reverse()));
});
