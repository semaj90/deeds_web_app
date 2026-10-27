#!/usr/bin/env node
// LEXICAL_REFERENCE_AUDIT (read-only). For each unresolved CALLS/REFERENCES occurrence in the 20-file sample: member access, imported
// binding (followed through re-exports to the declaring file and checked against revision-bound symbol versions), local top-level
// declaration, possible shadowing, global, or free name. Heuristic text analysis: nothing here is canonical and no relation is created.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseImportStatement, resolveSpecifier } from './lib/import-specifier-resolution-v1.mjs';
import { followExport } from './lib/export-follower-v1.mjs';
import { classifyOccurrence } from './lib/lexical-reference-classifier-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const samplePath = path.resolve(root, arg('sample', '.tmp/atlas/structural-reference-sample-20261027-v2.json'));
const out = path.resolve(root, arg('out', '.tmp/atlas/lexical-reference-audit-20261027.json'));
if (!out.startsWith(`${path.resolve(root, '.tmp/atlas')}${path.sep}`)) { console.error('OUTPUT_MUST_STAY_UNDER_TMP_ATLAS'); process.exit(2); }
const EXECUTION_ID = '01a1763a-4355-71d7-9b81-2c7a1814a41f';
const sha = (b) => `sha256:${crypto.createHash('sha256').update(b).digest('hex')}`;
const normRev = (r) => (r?.startsWith('sha256:') ? r : `sha256:${r}`);
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-At', '-F', '\t'], { input: sql, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim();
const manifest = new Map(psql(`select repository_relative_path, code_source_revision from graphify_execution_file_membership_v2 where execution_id='${EXECUTION_ID}' and repository_id='repo:root';`).split('\n').filter(Boolean).map((l) => l.split('\t')));
const aliases = [];
const tsconfig = path.join(root, 'sveltekit-frontend/.svelte-kit/tsconfig.json');
if (fs.existsSync(tsconfig)) {
  for (const [key, targets] of Object.entries(JSON.parse(fs.readFileSync(tsconfig, 'utf8').replace(/^﻿/, '')).compilerOptions?.paths ?? {})) {
    const target = path.posix.normalize(path.posix.join('sveltekit-frontend/.svelte-kit', String(targets[0]).replace(/\/\*$/, '/')));
    aliases.push(key.endsWith('/*') ? { prefix: key.slice(0, -1), target: target.endsWith('/') ? target : `${target}/` } : { prefix: key, target });
  }
}
const sourceCache = new Map();
const readSource = (rel) => { if (!manifest.has(rel)) return null; if (!sourceCache.has(rel)) { try { sourceCache.set(rel, fs.readFileSync(path.join(root, rel), 'utf8')); } catch { sourceCache.set(rel, null); } } return sourceCache.get(rel); };
const FRONTEND = 'sveltekit-frontend/';
const versionCache = new Map();
function versionsFor(rel) {
  if (versionCache.has(rel)) return versionCache.get(rel);
  const refs = [rel, rel.startsWith(FRONTEND) ? rel.slice(FRONTEND.length) : null].filter(Boolean).map((r) => `'${r.replace(/'/g, "''")}'`).join(',');
  const rows = psql(`select qualified_name, stable_symbol_id, source_revision from atlas_symbol_versions where source_ref in (${refs});`).split('\n').filter(Boolean).map((l) => { const [qualified_name, stable_symbol_id, source_revision] = l.split('\t'); return { qualified_name, stable_symbol_id, source_revision }; });
  versionCache.set(rel, rows); return rows;
}

async function audit() {
  const occurrences = [];
  for (const f of sample.files) {
    const bytes = fs.readFileSync(path.join(root, f.rel));
    const source = bytes.toString('utf8');
    const res = await fetch('http://127.0.0.1:8095/ast/chunk', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(30000), body: JSON.stringify({ source, language: 'typescript', filePath: f.rel, sourceRef: f.rel, sourceRevision: sha(bytes) }) });
    const j = await res.json();
    const importBindings = new Map();
    for (const e of j.edges.filter((x) => x.type === 'IMPORTS' && /\bimport\b/.test(x.to_evidence_key))) {
      const parsed = parseImportStatement(e.to_evidence_key);
      if (!parsed) continue;
      for (const b of parsed.bindings) importBindings.set(b.local, { specifier: parsed.specifier, imported: b.imported, kind: b.kind });
    }
    for (const e of j.edges.filter((x) => ['CALLS', 'REFERENCES'].includes(x.type) && !x.resolved)) {
      const name = String(e.to_evidence_key);
      if (!/^[A-Za-z_$][\w$]*$/.test(name)) { occurrences.push({ file: f.rel, type: e.type, name, kind: 'NON_IDENTIFIER_TARGET' }); continue; }
      for (const [line, column] of e.occurrence_positions ?? [[e.evidence_start_line, e.evidence_start_column]]) {
        const c = classifyOccurrence({ source, line, column, name, importBindings, enclosing: { startLine: e.evidence_start_line, endLine: e.evidence_end_line } });
        const rec = { file: f.rel, type: e.type, name, line, kind: c.kind };
        if (c.kind === 'IMPORTED') {
          const mod = resolveSpecifier({ fromRel: f.rel, specifier: c.binding.specifier, manifest, aliases });
          rec.module = mod.status;
          if (mod.status === 'MODULE_RESOLVED' && c.binding.kind !== 'namespace') {
            const followed = followExport({ file: mod.target, name: c.binding.kind === 'default' ? 'default' : c.binding.imported, manifest, aliases, readSource });
            rec.follow = followed.status;
            if (followed.definingFile) {
              rec.definingFile = followed.definingFile;
              const rev = normRev(manifest.get(followed.definingFile));
              const wanted = followed.definingName;
              const matches = versionsFor(followed.definingFile).filter((r) => r.source_revision === rev && (r.qualified_name === wanted || r.qualified_name.endsWith(`.${wanted}`)));
              const stable = [...new Set(matches.map((m) => m.stable_symbol_id))];
              rec.symbolVersion = stable.length === 1 ? 'VERIFIED' : stable.length > 1 ? 'AMBIGUOUS' : 'MISSING';
            }
          }
        }
        occurrences.push(rec);
      }
    }
  }
  return occurrences;
}

const sample = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
const run1 = await audit(); const run2 = await audit();
const tally = (items, f) => items.reduce((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {});
const imported = run1.filter((o) => o.kind === 'IMPORTED');
const body = {
  schema: 'atlas.lexical-reference-audit.v1', mode: 'READ_ONLY', method: 'LEXICAL_HEURISTIC_NOT_A_COMPILER_SCOPE_ANALYSIS', executionId: EXECUTION_ID,
  inputs: { samplePath: path.relative(root, samplePath), files: sample.files.length },
  occurrences: { total: run1.length, byKind: tally(run1, (o) => o.kind), byType: tally(run1, (o) => o.type) },
  imported: { total: imported.length, byModule: tally(imported, (o) => o.module ?? 'n/a'), byFollow: tally(imported, (o) => o.follow ?? 'n/a'), bySymbolVersion: tally(imported, (o) => o.symbolVersion ?? 'n/a') },
  determinism: { runs: 2, equal: sha(JSON.stringify(run1)) === sha(JSON.stringify(run2)), digest: sha(JSON.stringify(run1)) },
  topFreeNames: Object.entries(tally(run1.filter((o) => o.kind === 'FREE_NAME_UNRESOLVED'), (o) => o.name)).sort((a, b) => b[1] - a[1]).slice(0, 12),
  records: run1, canonicalAuthority: false, writesPerformed: false,
};
const receiptSha256 = sha(JSON.stringify(body));
fs.writeFileSync(out, `${JSON.stringify({ ...body, receiptSha256 }, null, 2)}\n`, { flag: 'wx' });
const { records, ...summary } = body;
console.log(JSON.stringify({ ...summary, receiptSha256, output: path.relative(root, out) }, null, 1));
