#!/usr/bin/env node
// Read-only end-to-end run of ImportResolutionV1 over the frozen 20-file sample. Applies the PROPOSED exact (path, source_revision) equivalence rule.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveImports } from './lib/import-resolution-contract-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (n, f) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? f;
const sample = JSON.parse(fs.readFileSync(path.resolve(root, arg('sample', '.tmp/atlas/structural-reference-sample-20261027-v2.json')), 'utf8'));
const out = path.resolve(root, arg('out', '.tmp/atlas/import-resolution-contract-smoke-20261027.json'));
if (!out.startsWith(`${path.resolve(root, '.tmp/atlas')}${path.sep}`)) { console.error('OUTPUT_MUST_STAY_UNDER_TMP_ATLAS'); process.exit(2); }
const EXECUTION_ID = '01a1763a-4355-71d7-9b81-2c7a1814a41f';
const sha = (b) => `sha256:${crypto.createHash('sha256').update(b).digest('hex')}`;
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-At', '-F', '\t'], { input: sql, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim();
const manifest = new Map(psql(`select repository_relative_path, code_source_revision from graphify_execution_file_membership_v2 where execution_id='${EXECUTION_ID}' and repository_id='repo:root';`).split('\n').filter(Boolean).map((l) => { const [p, r] = l.split('\t'); return [p, r.startsWith('sha256:') ? r : `sha256:${r}`]; }));
const aliases = [];
const tsconfig = path.join(root, 'sveltekit-frontend/.svelte-kit/tsconfig.json');
for (const [key, targets] of Object.entries(JSON.parse(fs.readFileSync(tsconfig, 'utf8').replace(/^﻿/, '')).compilerOptions?.paths ?? {})) {
  const target = path.posix.normalize(path.posix.join('sveltekit-frontend/.svelte-kit', String(targets[0]).replace(/\/\*$/, '/')));
  aliases.push(key.endsWith('/*') ? { prefix: key.slice(0, -1), target: target.endsWith('/') ? target : `${target}/` } : { prefix: key, target });
}
const FE = 'sveltekit-frontend/';
const prefixRule = (rel) => (rel.startsWith(FE) ? [rel, rel.slice(FE.length)] : [rel]); // explicit, exact; no fuzzy matching
const cache = new Map();
const symbolVersions = (ref) => {
  if (!cache.has(ref)) cache.set(ref, psql(`select qualified_name, stable_symbol_id, symbol_version_id, source_revision, workspace_revision from atlas_symbol_versions where source_ref='${ref.replace(/'/g, "''")}';`).split('\n').filter(Boolean).map((l) => { const [qualified_name, stable_symbol_id, symbol_version_id, source_revision, workspace_revision] = l.split('\t'); return { qualified_name, stable_symbol_id, symbol_version_id, source_revision, workspace_revision }; }));
  return cache.get(ref);
};
const srcCache = new Map();
const readSource = (rel) => { if (!manifest.has(rel)) return null; if (!srcCache.has(rel)) { try { srcCache.set(rel, fs.readFileSync(path.join(root, rel), 'utf8')); } catch { srcCache.set(rel, null); } } return srcCache.get(rel); };

async function run() {
  const all = { records: [], rejected: [], orphanClauses: 0 };
  for (const f of sample.files) {
    const bytes = fs.readFileSync(path.join(root, f.rel));
    const res = await fetch('http://127.0.0.1:8095/ast/chunk', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(30000), body: JSON.stringify({ source: bytes.toString('utf8'), language: 'typescript', filePath: f.rel, sourceRef: f.rel, sourceRevision: sha(bytes) }) });
    const j = await res.json();
    const r = resolveImports({ importerRel: f.rel, importerRevision: sha(bytes), edges: j.edges, manifest, aliases, readSource, symbolVersions, pathPrefixRule: prefixRule });
    all.records.push(...r.records); all.rejected.push(...r.rejected.map((x) => ({ ...x, importer: f.rel }))); all.orphanClauses += r.orphanClauses;
  }
  return all;
}
const a = await run(); const b = await run();
const tally = (items, f) => items.reduce((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {});
const body = {
  schema: 'atlas.import-resolution-contract-smoke.v1', mode: 'READ_ONLY', executionId: EXECUTION_ID, equivalenceRule: 'PROPOSED: exact source_ref (explicit prefix rule) + exact source_revision == admitted code_source_revision; workspace_revision carried, not reinterpreted',
  files: sample.files.length, bindings: a.records.length, byResolution: tally(a.records, (r) => r.resolution), byKind: tally(a.records, (r) => r.importKind),
  reasons: tally(a.records.filter((r) => r.reason), (r) => r.reason), rejected: a.rejected, orphanClauseEdges: a.orphanClauses,
  distinctSymbolVersionWorkspaceRevisions: [...new Set(a.records.map((r) => r.symbolVersionWorkspaceRevision).filter(Boolean))],
  determinism: { runs: 2, equal: sha(JSON.stringify(a)) === sha(JSON.stringify(b)), digest: sha(JSON.stringify(a)) },
  records: a.records, canonicalAuthority: false, writesPerformed: false,
};
const receiptSha256 = sha(JSON.stringify(body));
fs.writeFileSync(out, `${JSON.stringify({ ...body, receiptSha256 }, null, 2)}\n`, { flag: 'wx' });
const { records, ...summary } = body;
console.log(JSON.stringify({ ...summary, receiptSha256, output: path.relative(root, out) }, null, 1));
