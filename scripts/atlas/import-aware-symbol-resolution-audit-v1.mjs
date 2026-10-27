#!/usr/bin/env node
// IMPORT_AWARE_SYMBOL_RESOLUTION_AUDIT (read-only). Per import observation: module path -> admitted file -> lexical export ->
// revision-bound symbol-version row. A resolved module path is never counted as a verified symbol.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseImportStatement, resolveSpecifier, listExports } from './lib/import-specifier-resolution-v1.mjs';
import { buildLineIndex, rangeToVerifiedByteSpan } from './lib/lsp-position-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const samplePath = path.resolve(root, arg('sample', '.tmp/atlas/structural-reference-sample-20261027-v2.json'));
const out = path.resolve(root, arg('out', '.tmp/atlas/import-aware-audit-20261027.json'));
if (!out.startsWith(`${path.resolve(root, '.tmp/atlas')}${path.sep}`)) { console.error('OUTPUT_MUST_STAY_UNDER_TMP_ATLAS'); process.exit(2); }
const EXECUTION_ID = '01a1763a-4355-71d7-9b81-2c7a1814a41f';
const FRONTEND_PREFIX = 'sveltekit-frontend/';
const sha = (b) => `sha256:${crypto.createHash('sha256').update(b).digest('hex')}`;
const normRev = (r) => (r?.startsWith('sha256:') ? r : `sha256:${r}`);
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-At', '-F', '\t'], { input: sql, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim();
const admission = JSON.parse(fs.readFileSync(path.join(root, 'docs/reports/workspace-revision-tournament-admission-v1.json'), 'utf8'));
const manifest = new Map(psql(`select repository_relative_path, code_source_revision from graphify_execution_file_membership_v2 where execution_id='${EXECUTION_ID}' and repository_id='repo:root';`).split('\n').filter(Boolean).map((l) => l.split('\t')));

// Aliases from the generated SvelteKit tsconfig (paths are relative to .svelte-kit/).
const tsconfigPath = path.join(root, 'sveltekit-frontend/.svelte-kit/tsconfig.json');
const aliases = [];
let aliasSource = 'ABSENT';
if (fs.existsSync(tsconfigPath)) {
  aliasSource = 'sveltekit-frontend/.svelte-kit/tsconfig.json';
  const paths = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8').replace(/^﻿/, '')).compilerOptions?.paths ?? {};
  for (const [key, targets] of Object.entries(paths)) {
    const target = path.posix.normalize(path.posix.join('sveltekit-frontend/.svelte-kit', String(targets[0]).replace(/\/\*$/, '/')));
    aliases.push(key.endsWith('/*') ? { prefix: key.slice(0, -1), target: target.endsWith('/') ? target : `${target}/` } : { prefix: key, target });
  }
}

async function chunk(rel, bytes) {
  const lang = { '.ts': 'typescript', '.mts': 'typescript', '.js': 'javascript', '.mjs': 'javascript', '.svelte': 'svelte' }[path.extname(rel)];
  const res = await fetch('http://127.0.0.1:8095/ast/chunk', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(30000), body: JSON.stringify({ source: bytes.toString('utf8'), language: lang, filePath: rel, sourceRef: rel, sourceRevision: sha(bytes), workspaceRevision: admission.workspaceRevision }) });
  return res.json();
}

const versionCache = new Map();
function symbolVersions(destRel, destRev) {
  const key = `${destRel}|${destRev}`;
  if (versionCache.has(key)) return versionCache.get(key);
  const frontendRel = destRel.startsWith(FRONTEND_PREFIX) ? destRel.slice(FRONTEND_PREFIX.length) : null;
  const refs = [destRel, frontendRel].filter(Boolean).map((r) => `'${r.replace(/'/g, "''")}'`).join(',');
  const rows = psql(`select source_ref, qualified_name, stable_symbol_id, workspace_revision, source_revision from atlas_symbol_versions where source_ref in (${refs});`).split('\n').filter(Boolean).map((l) => { const [source_ref, qualified_name, stable_symbol_id, workspace_revision, source_revision] = l.split('\t'); return { source_ref, qualified_name, stable_symbol_id, workspace_revision, source_revision }; });
  const result = { frontendRel, anyRowsForPath: rows.length, rowsAtAdmittedRevision: rows.filter((r) => r.source_revision === destRev), rowsAtOtherRevision: rows.filter((r) => r.source_revision !== destRev).length };
  versionCache.set(key, result);
  return result;
}

async function audit() {
  const imports = []; const files = [];
  for (const f of sample.files) {
    const bytes = fs.readFileSync(path.join(root, f.rel));
    const digest = sha(bytes);
    const verified = digest === normRev(manifest.get(f.rel));
    const j = await chunk(f.rel, bytes);
    const lineIndex = buildLineIndex(bytes);
    const stmtEdges = j.edges.filter((e) => e.type === 'IMPORTS' && /\bimport\b/.test(e.to_evidence_key));
    files.push({ rel: f.rel, sourceRevision: digest, sourceRevisionVerified: verified, importStatements: stmtEdges.length });
    for (const e of stmtEdges) {
      const parsed = parseImportStatement(e.to_evidence_key);
      // Exact byte-span readback through the position adapter; line endings folded only when the producer folded them (reported, never silent).
      let spanReadback = false; let spanLineEndingNormalized = false; let spanError = null;
      try {
        const verifiedSpan = rangeToVerifiedByteSpan(lineIndex, { start: { line: e.evidence_start_line - 1, character: e.evidence_start_column }, end: { line: e.evidence_end_line - 1, character: e.evidence_end_column } }, { encoding: 'utf-8', expectedText: e.to_evidence_key, normalizeLineEndings: true });
        spanReadback = verifiedSpan.readbackVerified; spanLineEndingNormalized = verifiedSpan.lineEndingNormalized;
      } catch (error) { spanError = error.code ?? String(error.message); }
      const record = { importer: f.rel, importerRevision: digest, importerRevisionVerified: verified, line: e.evidence_start_line, statement: e.to_evidence_key, spanReadback, spanLineEndingNormalized, spanError, form: parsed?.form ?? 'UNPARSED', specifier: parsed?.specifier ?? null, typeOnly: parsed?.typeOnly ?? false, bindings: [] };
      if (!parsed) { record.moduleStatus = 'IMPORT_SPECIFIER_UNRESOLVED'; imports.push(record); continue; }
      const mod = resolveSpecifier({ fromRel: f.rel, specifier: parsed.specifier, manifest, aliases });
      record.moduleStatus = mod.status; record.destination = mod.target ?? null; if (mod.reason) record.reason = mod.reason;
      if (mod.status !== 'MODULE_RESOLVED') {
        record.bindings = parsed.bindings.map((b) => ({ ...b, outcome: mod.status === 'EXTERNAL_MODULE' ? 'EXTERNAL_MODULE' : mod.status === 'MODULE_AMBIGUOUS' ? 'MODULE_AMBIGUOUS' : 'IMPORT_SPECIFIER_UNRESOLVED' }));
        imports.push(record); continue;
      }
      const destRev = normRev(manifest.get(mod.target));
      const destBytes = fs.readFileSync(path.join(root, mod.target));
      record.destinationAdmittedRevision = destRev; record.destinationRevisionVerified = sha(destBytes) === destRev;
      const exportsInfo = listExports(destBytes.toString('utf8'));
      const versions = symbolVersions(mod.target, destRev);
      record.symbolVersionCoverage = { frontendRelativeRef: versions.frontendRel, anyRowsForPath: versions.anyRowsForPath, rowsAtAdmittedRevision: versions.rowsAtAdmittedRevision.length, rowsAtOtherRevision: versions.rowsAtOtherRevision };
      if (parsed.bindings.length === 0) record.bindings = [{ kind: 'side-effect', outcome: 'MODULE_RESOLVED_NO_BINDING' }];
      for (const b of parsed.bindings) {
        let outcome;
        if (!record.destinationRevisionVerified) outcome = 'SOURCE_REVISION_UNVERIFIED';
        else if (b.kind === 'namespace') outcome = 'MODULE_RESOLVED_NAMESPACE_NO_SINGLE_SYMBOL';
        else if (b.kind === 'default' && !exportsInfo.hasDefault) outcome = 'MODULE_RESOLVED_EXPORT_MISSING';
        else if (b.kind === 'named' && !exportsInfo.names.includes(b.imported)) outcome = exportsInfo.starReExport || exportsInfo.reExports.length ? 'MODULE_RESOLVED_REEXPORT_NOT_FOLLOWED' : 'MODULE_RESOLVED_EXPORT_MISSING';
        else {
          const wanted = b.kind === 'default' ? 'default' : b.imported;
          const matches = versions.rowsAtAdmittedRevision.filter((r) => r.qualified_name === wanted || r.qualified_name.endsWith(`.${wanted}`));
          const stable = [...new Set(matches.map((m) => m.stable_symbol_id))];
          outcome = stable.length === 1 ? 'MODULE_RESOLVED_SYMBOL_VERSION_VERIFIED' : stable.length > 1 ? 'MODULE_AMBIGUOUS' : 'MODULE_RESOLVED_SYMBOL_VERSION_MISSING';
        }
        record.bindings.push({ ...b, outcome });
      }
      imports.push(record);
    }
  }
  return { files, imports };
}

const sample = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
const run1 = await audit(); const run2 = await audit();
const digest = (r) => sha(JSON.stringify(r));
const bindings = run1.imports.flatMap((i) => i.bindings.map((b) => ({ ...b, importer: i.importer })));
const tally = (items, f) => items.reduce((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {});
const symbolVersionRows = psql("select count(*), count(*) filter (where workspace_revision = source_revision), count(distinct source_ref), count(*) filter (where source_ref like 'sveltekit-frontend/%') from atlas_symbol_versions;").split('\t');
const body = {
  schema: 'atlas.import-aware-symbol-resolution-audit.v1', mode: 'READ_ONLY', workspaceRevision: admission.workspaceRevision, executionId: EXECUTION_ID,
  inputs: { samplePath: path.relative(root, samplePath), files: run1.files.length, sourceRevisionVerified: run1.files.filter((f) => f.sourceRevisionVerified).length, aliasSource, aliasCount: aliases.length },
  imports: { statements: run1.imports.length, spanReadbackMatched: run1.imports.filter((i) => i.spanReadback).length, spanLineEndingNormalized: run1.imports.filter((i) => i.spanLineEndingNormalized).length, spanFailures: run1.imports.filter((i) => i.spanError).map((i) => ({ importer: i.importer, line: i.line, error: i.spanError })), byForm: tally(run1.imports, (i) => i.form), byModuleStatus: tally(run1.imports, (i) => i.moduleStatus) },
  bindings: { total: bindings.length, byOutcome: tally(bindings, (b) => b.outcome) },
  stages: {
    importsObserved: run1.imports.length,
    destinationFilesResolved: run1.imports.filter((i) => i.moduleStatus === 'MODULE_RESOLVED').length,
    exportedDeclarationsIdentified: bindings.filter((b) => ['MODULE_RESOLVED_SYMBOL_VERSION_VERIFIED', 'MODULE_RESOLVED_SYMBOL_VERSION_MISSING'].includes(b.outcome)).length,
    symbolVersionsVerified: bindings.filter((b) => b.outcome === 'MODULE_RESOLVED_SYMBOL_VERSION_VERIFIED').length,
  },
  symbolVersionTable: { rows: Number(symbolVersionRows[0]), rowsWhereWorkspaceRevisionEqualsSourceRevision: Number(symbolVersionRows[1]), distinctSourceRefs: Number(symbolVersionRows[2]), rowsWithRepoRelativeFrontendPrefix: Number(symbolVersionRows[3]), admittedWorkspaceRevision: admission.workspaceRevision, rowsWithAdmittedWorkspaceRevision: Number(psql(`select count(*) from atlas_symbol_versions where workspace_revision='${admission.workspaceRevision}';`)) },
  determinism: { runs: 2, equal: digest(run1) === digest(run2), digest: digest(run1) },
  records: run1.imports,
  canonicalAuthority: false, writesPerformed: false,
};
const receiptSha256 = sha(JSON.stringify(body));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify({ ...body, receiptSha256 }, null, 2)}\n`, { flag: 'wx' });
const { records, ...summary } = body;
console.log(JSON.stringify({ ...summary, receiptSha256, output: path.relative(root, out) }, null, 1));
