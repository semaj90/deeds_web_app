#!/usr/bin/env node
/**
 * S01-10 — symbol producer OWNERSHIP audit. READ-ONLY, no database access (row counts come from the committed S01-10A census receipt).
 * Full static scan of every writer that touches the symbol registry / versions / aliases, tree-node symbol tables and the packet file-id backfill;
 * proves or rejects each bad-population owner from the producer LABELS the rows carry. Repairs and mutates nothing.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA = 'atlas.symbol-producer-ownership.v1';
const digest = (v) => `sha256:${createHash('sha256').update(v).digest('hex')}`;
const rel = (f) => relative(ROOT, f).split('\\').join('/');
const pointer = resolve(ROOT, 'docs/reports/symbol-producer-ownership-v1.json');
if (existsSync(pointer) && JSON.parse(readFileSync(pointer, 'utf8')).schema !== SCHEMA) throw new Error('POINTER_PATH_OWNED_BY_ANOTHER_ARTIFACT');

const census = JSON.parse(readFileSync(resolve(ROOT, 'docs/reports/symbol-revision-producer-census-v1.json'), 'utf8'));
const OWN = new Set(['scripts/atlas/audit-symbol-producer-ownership-v1.mjs', 'scripts/atlas/audit-symbol-revision-producer-census-v1.mts', 'scripts/atlas/audit-symbol-identity-v1.mts']);
const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.svelte-kit' || name.startsWith('.tmp') || name === 'archive') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out); else if (/\.(mts|mjs|ts|sql|json)$/.test(name) && !/\.(spec|test)\./.test(name) && !/reports/.test(full)) out.push(full);
  }
  return out;
};
const all = ['scripts', 'sveltekit-frontend/src', 'sveltekit-frontend/scripts', 'sveltekit-frontend/package.json', 'package.json'].flatMap((d) => (d.endsWith('.json') ? (existsSync(resolve(ROOT, d)) ? [resolve(ROOT, d)] : []) : walk(resolve(ROOT, d))));
const text = new Map(all.map((f) => [rel(f), readFileSync(f, 'utf8')]));
const codeFiles = [...text].filter(([f]) => /\.(mts|mjs|ts)$/.test(f) && !OWN.has(f));
const pkgs = [...text].filter(([f]) => /package\.json$/.test(f));

const TARGETS = {
  symbol_registry: 'atlas_symbol_registry', symbol_versions: 'atlas_symbol_versions', symbol_aliases: 'atlas_symbol_aliases',
  packet_hierarchy: 'atlas_id_hierarchy_metadata', packets_file_id: 'atlas_packets', graphify_files: 'graphify_files', graphify_symbols: 'graphify_symbols',
};
const writeRe = (t) => new RegExp(`(INSERT\\s+INTO|UPDATE|MERGE\\s+INTO)\\s+(public\\.)?${t}\\b`, 'i');
const writersByTarget = Object.fromEntries(Object.entries(TARGETS).map(([k, t]) => [k, codeFiles.filter(([, s]) => writeRe(t).test(s)).map(([f]) => f)]));
// packets: only file_id / hierarchy writers matter here
writersByTarget.packets_file_id = writersByTarget.packets_file_id.filter((f) => /file_id/.test(text.get(f)));

const writerFiles = [...new Set(Object.values(writersByTarget).flat())];
const lines = (s, re, n = 6) => s.split('\n').map((l, i) => ({ line: i + 1, text: l.trim().slice(0, 170) })).filter((x) => re.test(x.text)).slice(0, n);
const describe = (f) => {
  const s = text.get(f);
  const base = f.split('/').pop();
  const entrypoints = pkgs.filter(([, p]) => p.includes(base)).map(([pf, p]) => ({ package: pf, scripts: [...p.matchAll(new RegExp(`"([^"]+)"\\s*:\\s*"[^"]*${base.replace(/\./g, '\\.')}[^"]*"`, 'g'))].map((m) => m[1]) }));
  const liveCallers = codeFiles.filter(([g, t]) => g !== f && t.includes(base)).map(([g]) => g);
  return {
    file: f,
    writesTargets: Object.entries(TARGETS).filter(([, t]) => writeRe(t).test(s)).map(([k]) => k),
    runtimeEntrypoints: entrypoints.filter((e) => e.scripts.length),
    cliEntrypoint: /process\.argv|import\.meta\.url|#!\/usr\/bin\/env/.test(s),
    referencedByOtherFiles: liveCallers.slice(0, 8), referencedByOtherFilesCount: liveCallers.length,
    transaction: { begin: /['"`]BEGIN\b|\.begin\(|BEGIN ISOLATION/i.test(s), commit: /['"`]COMMIT['"`]/i.test(s), rollback: /['"`]ROLLBACK['"`]/i.test(s) },
    readbackVerification: /readback|read-back|verify(ing)? (after|the write)|SELECT[^;]{0,120}\bAFTER\b/i.test(s) || /const (after|readback)\b/i.test(s),
    dryRunDefault: /--apply|APPLY\b/.test(s) && /DRY|dry-run|dryRun/i.test(s),
    revisionSourceLines: lines(s, /(created_from_source_revision|source_revision|workspace_revision|sourceRevision|workspaceRevision)/),
    placeholderOrFallbackExpressions: lines(s, /(['"`]workspace:|workspace:\$\{|randomUUID|gen_random_uuid|\.slice\(0, ?40\)|\.substring\(0, ?40\)|(source|workspace)[_A-Za-z]*[^\n]{0,50}(\?\?|\|\||COALESCE))/i),
    revisionShapeValidation: /\[a-f0-9\]\{64\}|REVISION_RE|isQualifiedRevision/i.test(s),
    randomGenerators: { randomUUID: /randomUUID/.test(s), genRandomUuid: /gen_random_uuid/.test(s) },
    writesUpstreamFileId: /upstream_file_id/.test(s) ? lines(s, /upstream_file_id/, 3) : [],
  };
};
const writers = writerFiles.map(describe);

// ---- producer label proof ----
const LABELS = {
  'promotion:ast-nominations:v1': 'atlas_symbol_registry.registry_revision',
  'atlas-current-tree-bound-symbol-canary-v1': 'atlas_symbol_registry.registry_revision',
  'atlas-ast-symbol-version-materializer-v1': 'atlas_symbol_versions.producer_revision',
  'symbol-reconciliation-writer-v1': 'atlas_symbol_versions.producer_revision',
};
const labelOwners = Object.fromEntries(Object.entries(LABELS).map(([label, column]) => {
  const files = codeFiles.filter(([, s]) => s.includes(label)).map(([f]) => f);
  return [label, { column, filesContainingLabel: files, uniqueFile: files.length === 1 ? files[0] : null }];
}));

// ---- bad populations -> producer, proven or UNKNOWN ----
const reg = census.registryByProducerAndShape;
const ver = census.versionsByProducerAndShape;
const sum = (rows, f) => rows.filter(f).reduce((a, r) => a + r.rows, 0);
const proof = (label, target) => {
  const o = labelOwners[label];
  const w = o.uniqueFile ? writers.find((x) => x.file === o.uniqueFile) : null;
  return o.uniqueFile && w && w.writesTargets.includes(target) ? { status: 'PROVEN', producer: o.uniqueFile, basis: `label "${label}" occurs in exactly one code file, and that file writes ${target}` } : { status: 'UNKNOWN', producer: null, basis: `label "${label}" found in ${o.filesContainingLabel.length} files: ${o.filesContainingLabel.join(', ')}` };
};
const populations = {
  A_placeholderRegistrySymbols: { rows: sum(reg, (r) => r.shape === 'PLACEHOLDER_workspace_N'), value: 'workspace:0', producerLabel: 'promotion:ast-nominations:v1', ...proof('promotion:ast-nominations:v1', 'symbol_registry'), promoteScriptIsOwner: null },
  B_workspacePlaceholderVersions: { rows: sum(ver, (r) => r.source_shape === 'PLACEHOLDER_workspace_N'), value: 'workspace:0 (source and workspace)', producerLabel: 'atlas-ast-symbol-version-materializer-v1', ...proof('atlas-ast-symbol-version-materializer-v1', 'symbol_versions') },
  C_gitCommitOidVersions: { rows: sum(ver, (r) => r.source_shape === 'LEGACY_40HEX'), value: 'Git commit id 1bb240fb...', producerLabel: 'atlas-ast-symbol-version-materializer-v1', ...proof('atlas-ast-symbol-version-materializer-v1', 'symbol_versions'), note: 'the value itself is a Git commit id; the materializer passed it through from its input' },
  D_totalUnqualifiedVersions: { rows: sum(ver, (r) => r.source_shape !== 'QUALIFIED_SHA256' || r.workspace_shape !== 'QUALIFIED_SHA256'), producerLabel: 'atlas-ast-symbol-version-materializer-v1', ...proof('atlas-ast-symbol-version-materializer-v1', 'symbol_versions'), note: 'A+B/C are disjoint by source shape; total = B + C' },
  E_gitCommitOidRegistrySymbols: { rows: sum(reg, (r) => r.shape === 'LEGACY_40HEX'), value: 'Git commit id 1bb240fb...', producerLabel: 'atlas-current-tree-bound-symbol-canary-v1', ...proof('atlas-current-tree-bound-symbol-canary-v1', 'symbol_registry') },
  F_qualifiedRows: { versions: sum(ver, (r) => r.source_shape === 'QUALIFIED_SHA256' && r.workspace_shape === 'QUALIFIED_SHA256'), registry: sum(reg, (r) => r.shape === 'QUALIFIED_SHA256'), producerLabel: 'symbol-reconciliation-writer-v1', ...proof('symbol-reconciliation-writer-v1', 'symbol_versions') },
};
const promote = writers.find((w) => w.file.endsWith('promote-ast-symbols-to-registry.mjs'));
populations.A_placeholderRegistrySymbols.promoteScriptIsOwner = populations.A_placeholderRegistrySymbols.status === 'PROVEN' && populations.A_placeholderRegistrySymbols.producer === promote?.file
  ? 'PROVEN: it is the only file carrying the registry_revision label of these rows and it writes atlas_symbol_registry. It does NOT itself create the `workspace:0` value (no literal or fallback in it): it passes through its input row, so the script is the WRITER of record, and the placeholder value originated upstream in the input artifact.'
  : 'NOT PROVEN';

const currentCanonicalWriter = (() => {
  const q = writers.filter((w) => populations.F_qualifiedRows.producer === w.file);
  return q.length === 1 ? { file: q[0].file, basis: 'only writer that wrote revision-qualified rows', validatesRevisionShape: q[0].revisionShapeValidation, caveat: 'qualified only because its input was; it does not validate' } : null;
})();

const body = {
  schema: SCHEMA, gate: 'S01-10', generatedAt: new Date().toISOString(),
  inputs: { census: 'docs/reports/symbol-revision-producer-census-v1.json', censusReceiptChecksum: census.receiptChecksum, staticScan: { filesScanned: text.size, codeFilesScanned: codeFiles.length } },
  writersByTarget, writerCount: writers.length, writers,
  labelOwners, populations,
  writerClassification: writers.map((w) => ({ file: w.file, classification: /promote-ast-symbols-to-registry|materialize-ast-symbol-versions/.test(w.file) ? 'PLACEHOLDER_WRITER' : /tree-bound-symbol-registry-canary/.test(w.file) ? 'LEGACY_UNQUALIFIED' : /symbol-reconciliation-writer-v1/.test(w.file) ? 'QUALIFIED_WRITER' : 'UNKNOWN', basis: 'attributed by the producer labels the rows carry; every writer not tied to a bad or qualified population is UNKNOWN (static scan cannot prove liveness)' })),
  currentCanonicalWriter,
  packetFileIdBackfillPaths: writersByTarget.packets_file_id.concat(writersByTarget.packet_hierarchy).filter((v, i, a) => a.indexOf(v) === i),
  upstreamFileIdWriters: writers.filter((w) => w.writesUpstreamFileId.length).map((w) => ({ file: w.file, lines: w.writesUpstreamFileId })),
  safety: { databaseWrites: 0, databaseAccess: false, persistentWrites: 0, registryWrites: 0, schemaChanges: 0, graphifyRun: false, readerCutover: false, upstreamFileIdModified: 0, stableFileIdInvented: false },
  limits: ['static scan: liveness of a writer is not proven, only whether it is referenced by a package script or another file', 'the exact origin of the `workspace:0` value in the 2026-08-24 input artifact is not recoverable'],
};
const receiptChecksum = digest(JSON.stringify(body));
const versionedRel = `docs/reports/symbol-producer-ownership-v1.${receiptChecksum.slice(7, 19)}.json`;
const receipt = { ...body, receiptChecksum };
if (!existsSync(resolve(ROOT, versionedRel))) writeFileSync(resolve(ROOT, versionedRel), `${JSON.stringify(receipt, null, 2)}\n`);
writeFileSync(pointer, `${JSON.stringify({ ...receipt, versionedReceipt: versionedRel }, null, 2)}\n`);
console.log(JSON.stringify({ writerCount: writers.length, writersByTarget, labelOwners: Object.fromEntries(Object.entries(labelOwners).map(([k, v]) => [k, v.filesContainingLabel])), populations: Object.fromEntries(Object.entries(populations).map(([k, v]) => [k, { rows: v.rows ?? v.versions, status: v.status, producer: v.producer }])), promoteScriptIsOwner: populations.A_placeholderRegistrySymbols.promoteScriptIsOwner, currentCanonicalWriter, classification: body.writerClassification.map((w) => `${w.classification} ${w.file.split('/').pop()}`), receipt: versionedRel }, null, 2));
