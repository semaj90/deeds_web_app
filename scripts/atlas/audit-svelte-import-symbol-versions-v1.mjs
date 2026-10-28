#!/usr/bin/env node
// SVELTE_IMPORT_SYMBOL_VERSION_AUDIT (read-only). Priority-4 join for Svelte components: each <script> import -> admitted module file ->
// followed export -> revision-bound symbol-version row. The :8095 sidecar emits no import edges for Svelte, so statement edges are
// synthesized from the exact script text and fed to the unchanged ImportResolutionV1 resolver. Nothing is backfilled or written.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveImports } from './lib/import-resolution-contract-v1.mjs';
import { extractScriptBlocks } from './lib/svelte-script-scope-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (n, f) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? f;
const out = path.resolve(root, arg('out', '.tmp/atlas/svelte-import-symbol-version-audit-20261028.json'));
if (!out.startsWith(`${path.resolve(root, '.tmp/atlas')}${path.sep}`)) { console.error('OUTPUT_MUST_STAY_UNDER_TMP_ATLAS'); process.exit(2); }
const limit = Number(arg('limit', '0')) || Infinity;
const EXECUTION_ID = '01a1763a-4355-71d7-9b81-2c7a1814a41f';
const FE = 'sveltekit-frontend/';
const sha = (b) => `sha256:${crypto.createHash('sha256').update(b).digest('hex')}`;
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-At', '-F', '\t'], { input: sql, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim();
const manifest = new Map(psql(`select repository_relative_path, code_source_revision from graphify_execution_file_membership_v2 where execution_id='${EXECUTION_ID}' and repository_id='repo:root';`).split('\n').filter(Boolean).map((l) => { const [p, r] = l.split('\t'); return [p, r.startsWith('sha256:') ? r : `sha256:${r}`]; }));
const aliases = [];
const tsconfig = path.join(root, 'sveltekit-frontend/.svelte-kit/tsconfig.json');
for (const [key, targets] of Object.entries(JSON.parse(fs.readFileSync(tsconfig, 'utf8').replace(/^﻿/, '')).compilerOptions?.paths ?? {})) {
  const target = path.posix.normalize(path.posix.join('sveltekit-frontend/.svelte-kit', String(targets[0]).replace(/\/\*$/, '/')));
  aliases.push(key.endsWith('/*') ? { prefix: key.slice(0, -1), target: target.endsWith('/') ? target : `${target}/` } : { prefix: key, target });
}
const prefixRule = (rel) => (rel.startsWith(FE) ? [rel, rel.slice(FE.length)] : [rel]); // explicit, exact; no fuzzy matching
const svCache = new Map();
const symbolVersions = (ref) => {
  if (!svCache.has(ref)) svCache.set(ref, psql(`select qualified_name, stable_symbol_id, symbol_version_id, source_revision, workspace_revision from atlas_symbol_versions where source_ref='${ref.replace(/'/g, "''")}';`).split('\n').filter(Boolean).map((l) => { const [qualified_name, stable_symbol_id, symbol_version_id, source_revision, workspace_revision] = l.split('\t'); return { qualified_name, stable_symbol_id, symbol_version_id, source_revision, workspace_revision }; }));
  return svCache.get(ref);
};
const srcCache = new Map();
const readSource = (rel) => { if (!manifest.has(rel)) return null; if (!srcCache.has(rel)) { try { srcCache.set(rel, fs.readFileSync(path.join(root, rel), 'utf8')); } catch { srcCache.set(rel, null); } } return srcCache.get(rel); };

const requireFromFrontend = createRequire(path.join(root, 'sveltekit-frontend/package.json'));
const { parse, Lang } = requireFromFrontend('@ast-grep/napi');
const LANG = { typescript: 'TypeScript', javascript: 'JavaScript' };

function importEdges(source) {
  const edges = [];
  for (const block of extractScriptBlocks(source)) {
    const rootNode = parse(Lang[LANG[block.language]], block.text).root();
    if (rootNode.find({ rule: { kind: 'ERROR' } })) return { edges: [], scriptParseError: true };
    for (const node of rootNode.findAll({ rule: { kind: 'import_statement' } })) {
      const r = node.range();
      const line = (source.slice(0, block.utf16Start + r.start.index).match(/\n/g) ?? []).length + 1;
      const endLine = (source.slice(0, block.utf16Start + r.end.index).match(/\n/g) ?? []).length + 1;
      edges.push({ type: 'IMPORTS', to_evidence_key: node.text(), evidence_start_line: line, evidence_start_column: r.start.column, evidence_end_line: endLine, evidence_end_column: r.end.column });
    }
  }
  return { edges, scriptParseError: false };
}

function run() {
  const files = [...manifest.keys()].filter((p) => p.endsWith('.svelte') && fs.existsSync(path.join(root, p))).sort().slice(0, limit);
  const all = { files: files.length, scriptParseErrors: 0, noImports: 0, records: [], rejected: [] };
  for (const rel of files) {
    const bytes = fs.readFileSync(path.join(root, rel));
    const { edges, scriptParseError } = importEdges(bytes.toString('utf8'));
    if (scriptParseError) { all.scriptParseErrors += 1; continue; }
    if (!edges.length) { all.noImports += 1; continue; }
    const r = resolveImports({ importerRel: rel, importerRevision: sha(bytes), edges, manifest, aliases, readSource, symbolVersions, pathPrefixRule: prefixRule });
    all.records.push(...r.records); all.rejected.push(...r.rejected.map((x) => ({ ...x, importer: rel })));
  }
  return all;
}

const tally = (items, f) => items.reduce((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {});
const a = run(); const b = run();
const body = {
  schema: 'atlas.svelte-import-symbol-version-audit.v1', mode: 'READ_ONLY', executionId: EXECUTION_ID,
  equivalenceRule: 'exact source_ref (explicit prefix rule) + exact source_revision == admitted code_source_revision; workspace_revision reported, never coerced',
  svelteFilesInManifestOnDisk: a.files, scriptParseErrors: a.scriptParseErrors, filesWithoutImports: a.noImports, bindings: a.records.length,
  byResolution: tally(a.records, (r) => r.resolution), byKind: tally(a.records, (r) => r.importKind), typeOnlyBindings: a.records.filter((r) => r.typeOnly).length,
  reasons: tally(a.records.filter((r) => r.reason), (r) => r.reason), rejected: tally(a.rejected, (r) => r.reason),
  exportNotExportedByTarget: tally(a.records.filter((r) => r.reason === 'EXPORT_NOT_EXPORTED'), (r) => `${r.importKind}:${path.extname(r.targetSourceRef ?? '') || 'none'}`),
  sampleNamedNotExported: a.records.filter((r) => r.reason === 'EXPORT_NOT_EXPORTED' && r.importKind === 'NAMED').slice(0, 12).map((r) => ({ importer: r.importerSourceRef, name: r.importedName, target: r.targetSourceRef, typeOnly: r.typeOnly })),
  distinctSymbolVersionWorkspaceRevisions: [...new Set(a.records.map((r) => r.symbolVersionWorkspaceRevision).filter(Boolean))],
  determinism: { runs: 2, equal: sha(JSON.stringify(a)) === sha(JSON.stringify(b)), digest: sha(JSON.stringify(a)) },
  sampleVerified: a.records.filter((r) => r.resolution === 'SYMBOL_VERSION_VERIFIED').slice(0, 5).map((r) => ({ importer: r.importerSourceRef, name: r.importedName, target: r.targetSourceRef, symbolId: r.targetSymbolId })),
  canonicalAuthority: false, writesPerformed: false,
};
const receiptSha256 = sha(JSON.stringify(body));
fs.writeFileSync(out, `${JSON.stringify({ ...body, receiptSha256 }, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ ...body, receiptSha256, output: path.relative(root, out) }, null, 1));
