import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveImports, mergeImportEdges } from './import-resolution-contract-v1.mjs';

const SHA = (c) => `sha256:${c.repeat(64)}`;
const files = {
  'src/imp.ts': 'x', 'src/a.ts': 'export const A = 1;\nexport default function D() {}\nexport type T = string;\n',
  'src/barrel.ts': "export { A as Alias } from './a';\nexport * from './s1';\nexport * from './s2';\n", 'src/s1.ts': 'export const Both = 1;', 'src/s2.ts': 'export const Both = 2;',
};
const manifest = new Map([['src/imp.ts', SHA('1')], ['src/a.ts', SHA('2')], ['src/barrel.ts', SHA('3')], ['src/s1.ts', SHA('4')], ['src/s2.ts', SHA('5')]]);
const readSource = (r) => files[r] ?? null;
const edge = (key, line = 1, endCol = 40) => ({ type: 'IMPORTS', to_evidence_key: key, evidence_start_line: line, evidence_start_column: 0, evidence_end_line: line, evidence_end_column: endCol });
const sv = (rows) => (rel) => rows[rel] ?? [];
const run = (statement, clause, extra = {}) => resolveImports({ importerRel: 'src/imp.ts', importerRevision: SHA('1'), edges: [edge(statement), ...(clause ? [edge(clause)] : [])], manifest, readSource, symbolVersions: sv({}), ...extra });

test('statement and clause edges merge into one observation with both evidence refs kept', () => {
  const merged = mergeImportEdges([edge("import { A } from './a';"), edge('{ A }')]);
  assert.equal(merged.observations.length, 1);
  assert.equal(merged.observations[0].clauseEdges.length, 1);
  const out = run("import { A } from './a';", '{ A }');
  assert.equal(out.records.length, 1);
  assert.equal(out.records[0].evidenceRefs.length, 1);
  const two = resolveImports({ importerRel: 'src/imp.ts', importerRevision: SHA('1'), edges: [{ ...edge("import { A } from './a';"), evidence_end_column: 24 }, { ...edge('{ A }'), evidence_end_column: 24 }], manifest, readSource, symbolVersions: sv({}) });
  assert.equal(two.records.length, 1);
});

test('module resolved is kept apart from symbol-version verified', () => {
  const noRows = run("import { A } from './a';", '{ A }').records[0];
  assert.equal(noRows.resolution, 'MODULE_RESOLVED');
  assert.equal(noRows.reason, 'SYMBOL_VERSION_MISSING_AT_ADMITTED_REVISION');
  assert.equal(noRows.targetSourceRef, 'src/a.ts');
  assert.equal(noRows.targetSymbolId, null);
  const verified = run("import { A } from './a';", '{ A }', { symbolVersions: sv({ 'src/a.ts': [{ qualified_name: 'A', stable_symbol_id: 'sym:A', symbol_version_id: 'ver:A', source_revision: SHA('2'), workspace_revision: SHA('9') }] }) }).records[0];
  assert.equal(verified.resolution, 'SYMBOL_VERSION_VERIFIED');
  assert.equal(verified.targetSymbolId, 'sym:A');
  assert.equal(verified.symbolVersionWorkspaceRevision, SHA('9'));
  assert.equal(verified.canonicalAuthority, false);
});

test('a symbol-version row at a different source revision is never accepted (stale)', () => {
  const stale = run("import { A } from './a';", '{ A }', { symbolVersions: sv({ 'src/a.ts': [{ qualified_name: 'A', stable_symbol_id: 'sym:A', source_revision: SHA('f'), workspace_revision: SHA('9') }] }) }).records[0];
  assert.equal(stale.resolution, 'MODULE_RESOLVED');
});

test('prefix rule maps manifest paths to symbol-version namespaces explicitly; two stable ids are ambiguous', () => {
  const rows = { 'a.ts': [{ qualified_name: 'A', stable_symbol_id: 'sym:A', source_revision: SHA('2'), workspace_revision: SHA('9') }] };
  const out = run("import { A } from './a';", '{ A }', { symbolVersions: sv(rows), pathPrefixRule: (rel) => [rel, rel.replace(/^src\//, '')] });
  assert.equal(out.records[0].resolution, 'SYMBOL_VERSION_VERIFIED');
  const dup = run("import { A } from './a';", '{ A }', { symbolVersions: sv({ 'src/a.ts': [{ qualified_name: 'A', stable_symbol_id: 's1', source_revision: SHA('2'), workspace_revision: SHA('9') }, { qualified_name: 'm.A', stable_symbol_id: 's2', source_revision: SHA('2'), workspace_revision: SHA('9') }] }) });
  assert.equal(dup.records[0].resolution, 'AMBIGUOUS');
});

test('aliased, default, namespace, side-effect and type-only imports', () => {
  assert.equal(run("import { A as Z } from './a';", '{ A as Z }').records[0].localName, 'Z');
  assert.equal(run("import { A as Z } from './a';", '{ A as Z }').records[0].importedName, 'A');
  assert.equal(run("import D from './a';", 'D').records[0].importKind, 'DEFAULT');
  const ns = run("import * as ns from './a';", '* as ns').records[0];
  assert.equal(ns.reason, 'NAMESPACE_HAS_NO_SINGLE_SYMBOL');
  assert.equal(run("import './a';", null).records[0].importKind, 'SIDE_EFFECT');
  assert.equal(run("import type { T } from './a';", '{ T }').records[0].typeOnly, true);
});

test('re-export chains and star ambiguity', () => {
  const alias = run("import { Alias } from './barrel';", '{ Alias }').records[0];
  assert.equal(alias.targetSourceRef, 'src/a.ts');
  const both = run("import { Both } from './barrel';", '{ Both }').records[0];
  assert.equal(both.resolution, 'AMBIGUOUS');
  assert.equal(both.reason, 'STAR_AMBIGUOUS');
});

test('external, missing and absent-export imports are typed', () => {
  assert.equal(run("import { z } from 'zod';", '{ z }').records[0].resolution, 'EXTERNAL_MODULE');
  assert.equal(run("import { A } from './nope';", '{ A }').records[0].resolution, 'UNRESOLVED');
  assert.equal(run("import { Missing } from './a';", '{ Missing }').records[0].reason, 'EXPORT_NOT_EXPORTED');
});

test('stale or unadmitted importer revisions and conflicting clause evidence are rejected, not resolved', () => {
  assert.equal(resolveImports({ importerRel: 'src/imp.ts', importerRevision: SHA('e'), edges: [edge("import { A } from './a';")], manifest, readSource, symbolVersions: sv({}) }).rejected[0].reason, 'IMPORTER_REVISION_NOT_ADMITTED');
  assert.equal(resolveImports({ importerRel: 'src/imp.ts', importerRevision: 'nope', edges: [], manifest, readSource, symbolVersions: sv({}) }).rejected[0].reason, 'IMPORTER_REVISION_NOT_SHA256');
  assert.equal(run("import { A } from './a';", '{ Q }').rejected[0].reason, 'CLAUSE_EVIDENCE_CONFLICTS_WITH_STATEMENT');
});

test('deterministic replay', () => {
  const a = JSON.stringify(run("import { A, Alias } from './barrel';", '{ A, Alias }'));
  assert.equal(a, JSON.stringify(run("import { A, Alias } from './barrel';", '{ A, Alias }')));
});
