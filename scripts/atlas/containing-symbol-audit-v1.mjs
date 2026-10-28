#!/usr/bin/env node
// Read-only: attribute lexically verified import-binding uses to containing symbol-version rows, and map verified call uses to CALLS candidates.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { analyzeLexicalScopes } from './lib/ast-lexical-scope-v1.mjs';
import { attributeContainingSymbol } from './lib/containing-symbol-attribution-v1.mjs';
import { mapReferenceFacts } from './lib/structural-reference-relation-mapping-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (n, f) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? f;
const resPath = path.resolve(root, arg('resolutions', '.tmp/atlas/import-resolution-contract-smoke-20261027.json'));
const out = path.resolve(root, arg('out', '.tmp/atlas/containing-symbol-audit-20261027.json'));
if (!out.startsWith(`${path.resolve(root, '.tmp/atlas')}${path.sep}`)) { console.error('OUTPUT_MUST_STAY_UNDER_TMP_ATLAS'); process.exit(2); }
const sha = (b) => `sha256:${crypto.createHash('sha256').update(b).digest('hex')}`;
const normRev = (r) => (r?.startsWith('sha256:') ? r : `sha256:${r}`);
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-At', '-F', '\t'], { input: sql, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const manifest = new Map(psql("select repository_relative_path, code_source_revision from graphify_execution_file_membership_v2 where execution_id='01a1763a-4355-71d7-9b81-2c7a1814a41f' and repository_id='repo:root';").split('\n').filter(Boolean).map((l) => l.split('\t')));
const admission = JSON.parse(fs.readFileSync(path.join(root, 'docs/reports/workspace-revision-tournament-admission-v1.json'), 'utf8'));
const resolutions = JSON.parse(fs.readFileSync(resPath, 'utf8'));
const FE = 'sveltekit-frontend/';
const rowCache = new Map();
const rowsFor = (rel) => {
  if (rowCache.has(rel)) return rowCache.get(rel);
  const refs = [rel, rel.startsWith(FE) ? rel.slice(FE.length) : null].filter(Boolean).map((r) => `'${r.replace(/'/g, "''")}'`).join(',');
  const rows = psql(`select stable_symbol_id, symbol_version_id, qualified_name, byte_start, byte_end, source_revision from atlas_symbol_versions where source_ref in (${refs});`).split('\n').filter(Boolean).map((l) => { const [stable_symbol_id, symbol_version_id, qualified_name, byte_start, byte_end, source_revision] = l.split('\t'); return { stable_symbol_id, symbol_version_id, qualified_name, byte_start, byte_end, source_revision }; });
  rowCache.set(rel, rows); return rows;
};

const importers = [...new Set(resolutions.records.map((r) => r.importerSourceRef))].sort();
const verifiedByLocal = new Map(resolutions.records.filter((r) => r.resolution === 'SYMBOL_VERSION_VERIFIED').map((r) => [`${r.importerSourceRef}|${r.localName}`, r]));
const stats = { importBindingOccurrences: 0, byAttribution: {}, spanUnitChecks: { checked: 0, nameFoundInSpan: 0 } };
const verifiedUses = []; const facts = [];
for (const rel of importers) {
  const bytes = fs.readFileSync(path.join(root, rel));
  const revision = sha(bytes);
  if (revision !== normRev(manifest.get(rel))) continue;
  const rows = rowsFor(rel);
  const scope = analyzeLexicalScopes({ source: bytes.toString('utf8') });
  for (const o of scope.occurrences.filter((x) => x.outcome === 'IMPORT_BINDING_VERIFIED')) {
    stats.importBindingOccurrences++;
    const attr = attributeContainingSymbol(rows, o, { admittedRevision: revision });
    stats.byAttribution[attr.status] = (stats.byAttribution[attr.status] ?? 0) + 1;
    if (attr.status === 'ATTRIBUTED') {
      stats.spanUnitChecks.checked++;
      const simple = attr.qualifiedName.split('.').pop();
      if (bytes.subarray(attr.span[0], attr.span[1]).toString('utf8').includes(simple)) stats.spanUnitChecks.nameFoundInSpan++;
    }
    const target = verifiedByLocal.get(`${rel}|${o.name}`);
    if (target && o.parentKind === 'call_expression') {
      verifiedUses.push({ file: rel, name: o.name, line: o.line, attribution: attr.status, containing: attr.stableSymbolId ?? null, target: target.targetSymbolId });
      if (attr.status === 'ATTRIBUTED') facts.push({ schema: 'atlas.structural-reference-fact.v1', reference_id: `call:${rel}:${o.startByte}`, reference_kind: 'call', source_ref: rel, source_revision: revision, workspace_revision: admission.workspaceRevision, upstream_source_node_id: `${rel}#b${o.startByte}`, upstream_chunk_id: `${rel}#b${o.startByte}`, containing_stable_symbol_id: attr.stableSymbolId, target_text: o.name, target_stable_symbol_id: target.targetSymbolId, resolution_status: 'canonical', captures: {}, evidence_refs: [`${rel}#bytes${o.startByte}-${o.endByte}`], extractor: 'treesitter_chunker', extractor_revision: 'ast-grep-napi-lexical-scope-v1' });
    }
  }
}
const honest = mapReferenceFacts({ facts, scope: null });
const fixture = mapReferenceFacts({ facts, scope: { repositoryId: '01a13137-1378-7df9-9968-53738dbf0e48', snapshotId: '00000000-0000-7000-8000-000000000001' } });
const body = {
  schema: 'atlas.containing-symbol-audit.v1', mode: 'READ_ONLY', importers: importers.length, importBindingOccurrences: stats.importBindingOccurrences, attribution: stats.byAttribution, spanUnitChecks: stats.spanUnitChecks,
  verifiedCallUses: verifiedUses, callFacts: facts.length, mapping: { honestNoScope: honest.counts, fixtureScopeNotCanonical: { counts: fixture.counts, types: [...new Set(fixture.candidates.map((c) => c.type))] } },
  canonicalAuthority: false, writesPerformed: false,
};
const receiptSha256 = sha(JSON.stringify(body));
fs.writeFileSync(out, `${JSON.stringify({ ...body, receiptSha256 }, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ ...body, receiptSha256, output: path.relative(root, out) }, null, 1));
