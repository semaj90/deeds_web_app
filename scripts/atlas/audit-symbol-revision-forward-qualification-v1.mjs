#!/usr/bin/env node
/**
 * S01-10B proof: forward qualification of revision-bearing symbol writes. READ-ONLY (no DB, no writes except the receipt files).
 * Checks (a) the shared validator behaves through the plain-node shim on the real bad values, (b) each proven bad-population writer
 * imports the shim and calls the validator BEFORE its INSERT. Static wiring evidence, not runtime proof of live rows.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadSymbolRevisionQualificationV1 } from './lib/load-symbol-revision-qualification-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA = 'atlas.symbol-revision-forward-qualification-receipt.v1';
const WRITERS = [
  { file: 'scripts/atlas/promote-ast-symbols-to-registry.mjs', insert: 'INSERT INTO atlas_symbol_registry', population: 'A_placeholderRegistrySymbols' },
  { file: 'scripts/atlas/materialize-ast-symbol-versions.mjs', insert: 'INSERT INTO atlas_symbol_versions', population: 'B/C/D_unqualifiedVersions' },
  { file: 'scripts/atlas/apply-current-tree-bound-symbol-registry-canary-v1.mjs', insert: 'INSERT INTO public.atlas_symbol_registry', population: 'E_gitCommitOidRegistrySymbols' },
];

const { qualifySymbolRevisionsV1 } = await loadSymbolRevisionQualificationV1();
const Q = 'sha256:' + 'a'.repeat(64);
const OID = '1bb240fb20f1d4ba5651d8a4da9a10c9d6337aaf';
const cases = [
  ['qualified', Q, true], ['workspace:0', 'workspace:0', false], ['git-commit-oid', OID, false],
  ['sha256-prefixed-oid', `sha256:${OID}`, false], ['null', null, false], ['empty', '', false],
].map(([name, value, expectOk]) => {
  const v = qualifySymbolRevisionsV1('atlas_symbol_versions', [{ field: 'source_revision', value }]);
  return { name, expectOk, ok: v.ok, matches: v.ok === expectOk, codes: v.violations.map((x) => x.code) };
});

const writers = WRITERS.map((w) => {
  const src = fs.readFileSync(path.join(root, w.file), 'utf8');
  const shimAt = src.indexOf('load-symbol-revision-qualification-v1.mjs');
  const callAt = src.indexOf('qualifySymbolRevisionsV1(');
  const insertAt = src.indexOf(w.insert);
  return { ...w, importsShim: shimAt >= 0, callsValidator: callAt >= 0, validatesBeforeInsert: callAt >= 0 && insertAt >= 0 && callAt < insertAt, rejectsAndContinues: /continue;/.test(src.slice(callAt, insertAt)) };
});

const allCases = cases.every((c) => c.matches);
const allWriters = writers.every((w) => w.importsShim && w.callsValidator && w.validatesBeforeInsert && w.rejectsAndContinues);
const receipt = {
  schema: SCHEMA, generatedAt: new Date().toISOString(),
  status: allCases && allWriters ? 'FORWARD_QUALIFICATION_WIRED' : 'BLOCKED',
  evidenceClass: 'STATIC_WIRING_PLUS_FIXTURE',
  scope: 'revision-bearing writes only; revision-less registry skeletons remain a schema-contract gate (NOT NULL columns)',
  historicalRowsTouched: 0, dbWrites: 0,
  notWired: [{ file: 'scripts/atlas/symbol-reconciliation-writer-v1.mts', reason: 'delegates inserts to packages/parent-atlas/src/core (patch source, never dist); classified QUALIFIED_WRITER in S01-10; separate follow-up' }],
  validatorCases: cases, writers,
};
const body = JSON.stringify(receipt, null, 2);
const sha12 = crypto.createHash('sha256').update(body).digest('hex').slice(0, 12);
const immutable = path.join(root, 'docs/reports', `symbol-revision-forward-qualification-v1.${sha12}.json`);
const pointer = path.join(root, 'docs/reports/symbol-revision-forward-qualification-v1.json');
if (fs.existsSync(pointer) && JSON.parse(fs.readFileSync(pointer, 'utf8')).schema !== SCHEMA) throw new Error('POINTER_SCHEMA_MISMATCH refusing to overwrite');
fs.writeFileSync(immutable, body + '\n', { flag: 'wx' });
fs.writeFileSync(pointer, body + '\n');
console.log(receipt.status, immutable);
if (receipt.status !== 'FORWARD_QUALIFICATION_WIRED') process.exit(1);
