#!/usr/bin/env node
// STRUCTURAL_REFERENCE_PRODUCER_SMOKE (read-only). Admitted bytes -> :8095 /ast/chunk -> file-level import resolution against the
// admitted manifest -> StructuralReferenceFactV1-shaped facts -> structural-reference-relation-mapping-v1 -> immutable receipt.
// No database writes, no registry mutation. Symbol-level kinds (CALLS/REFERENCES/EXTENDS/IMPLEMENTS) stay unresolved here on purpose.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mapReferenceFacts } from './lib/structural-reference-relation-mapping-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const prefixes = arg('prefixes', 'sveltekit-frontend/src/lib/server/atlas/identity/,sveltekit-frontend/src/lib/components/ui/').split(',');
const perPrefix = Math.min(Number(arg('per-prefix', '10')), 25);
const runDir = path.resolve(root, arg('run-dir', `.tmp/atlas/structural-reference-smoke-${new Date().toISOString().replaceAll(':', '-')}`));
if (!runDir.startsWith(`${path.resolve(root, '.tmp/atlas')}${path.sep}`)) { console.error('RUN_DIR_MUST_STAY_UNDER_TMP_ATLAS'); process.exit(2); }
const sidecar = arg('sidecar', 'http://127.0.0.1:8095');
const EXECUTION_ID = '01a1763a-4355-71d7-9b81-2c7a1814a41f';
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-At', '-F', '\t', '-c', sql], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim();
const sha = (b) => `sha256:${crypto.createHash('sha256').update(b).digest('hex')}`;
const admission = JSON.parse(fs.readFileSync(path.join(root, 'docs/reports/workspace-revision-tournament-admission-v1.json'), 'utf8'));
const LANG = { '.ts': 'typescript', '.mts': 'typescript', '.js': 'javascript', '.mjs': 'javascript', '.svelte': 'svelte' };

// Admitted manifest (root scope only): path -> revision.
const manifest = new Map(psql(`select repository_relative_path, code_source_revision from graphify_execution_file_membership_v2 where execution_id='${EXECUTION_ID}' and repository_id='repo:root'`).split('\n').filter(Boolean).map((l) => l.split('\t')));
const normRev = (r) => (r?.startsWith('sha256:') ? r : `sha256:${r}`);
const persistedRoot = psql("select repository_id from atlas_repository_identity where repository_kind='ROOT' and parent_repository_id is null").split('\n').filter(Boolean);

// P1: deterministic selection = first N by path per prefix (seed: lexicographic order; no randomness).
const selection = [];
for (const prefix of prefixes) {
  const rels = [...manifest.keys()].filter((r) => r.startsWith(prefix) && LANG[path.extname(r)] && !/\.(test|spec)\./.test(r)).sort().slice(0, perPrefix);
  for (const rel of rels) selection.push(rel);
}

const EXT = ['', '.ts', '.mts', '.js', '.mjs', '.svelte', '/index.ts', '/index.js'];
function resolveSpecifier(fromRel, spec) {
  let base;
  if (spec.startsWith('.')) base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec));
  else if (spec.startsWith('$lib/')) base = `sveltekit-frontend/src/lib/${spec.slice(5)}`;
  else return { status: 'EXTERNAL_OR_UNMAPPED_SPECIFIER' };
  const stem = base.replace(/\.(js|mjs)$/, '');
  const hits = [...new Set([...EXT.map((e) => base + e), ...EXT.map((e) => stem + e)])].filter((c) => manifest.has(c));
  if (hits.length === 1) return { status: 'RESOLVED', target: hits[0] };
  return hits.length === 0 ? { status: 'TARGET_NOT_IN_ADMITTED_MANIFEST' } : { status: 'AMBIGUOUS', candidates: hits };
}

async function runOnce() {
  const facts = []; const files = []; const skipped = []; const spanChecks = { checked: 0, matched: 0, mismatched: [] };
  const accounting = { edges: 0, byType: {}, importOutcome: {}, symbolLevelLeftUnresolved: 0 };
  for (const rel of selection) {
    const bytes = fs.readFileSync(path.join(root, rel));
    const digest = sha(bytes);
    if (digest !== normRev(manifest.get(rel))) { skipped.push({ rel, reason: 'WORKTREE_ONLY_NONCANONICAL', detail: 'bytes differ from admitted revision' }); continue; }
    let j;
    try {
      const res = await fetch(`${sidecar}/ast/chunk`, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(30000), body: JSON.stringify({ source: bytes.toString('utf8'), language: LANG[path.extname(rel)], filePath: rel, sourceRef: rel, sourceRevision: digest, workspaceRevision: admission.workspaceRevision }) });
      if (res.status !== 200) { skipped.push({ rel, reason: `HTTP_${res.status}` }); continue; }
      j = await res.json();
    } catch (error) { skipped.push({ rel, reason: `REQUEST_FAILED:${error.name}` }); continue; }
    if (j.error_tag) { skipped.push({ rel, reason: `SIDECAR_${j.error_tag}` }); continue; }
    const lines = bytes.toString('utf8').split('\n');
    files.push({ rel, sourceRevision: digest, edges: j.edges.length, engine: `${j.engine}@${j.engine_version}` });
    for (const [index, e] of j.edges.entries()) {
      accounting.edges++; accounting.byType[e.type] = (accounting.byType[e.type] ?? 0) + 1;
      if (e.type !== 'IMPORTS') { if (['CALLS', 'REFERENCES', 'EXPORTS'].includes(e.type)) accounting.symbolLevelLeftUnresolved++; continue; }
      // P4 span readback: the evidence span must reproduce the import statement text exactly.
      const startLine = e.evidence_start_line - 1;
      const slice = lines.slice(startLine, e.evidence_end_line).join('\n');
      const spanText = e.evidence_start_line === e.evidence_end_line ? slice.slice(e.evidence_start_column, e.evidence_end_column) : slice.slice(e.evidence_start_column);
      spanChecks.checked++;
      const key = String(e.to_evidence_key).trim();
      if (spanText.trim() === key || spanText.includes(key)) spanChecks.matched++; else spanChecks.mismatched.push({ rel, line: e.evidence_start_line });
      const m = /from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/.exec(e.to_evidence_key);
      const spec = m?.[1] ?? m?.[2];
      if (!spec) { accounting.importOutcome.IMPORT_CLAUSE_EDGE_NO_SPECIFIER = (accounting.importOutcome.IMPORT_CLAUSE_EDGE_NO_SPECIFIER ?? 0) + 1; continue; }
      const r = resolveSpecifier(rel, spec);
      accounting.importOutcome[r.status] = (accounting.importOutcome[r.status] ?? 0) + 1;
      facts.push({
        schema: 'atlas.structural-reference-fact.v1', reference_id: `smoke:${rel}:${e.evidence_start_line}:${index}`, reference_kind: 'import', source_ref: rel, source_revision: digest,
        workspace_revision: admission.workspaceRevision, upstream_source_node_id: e.from_evidence_key, upstream_chunk_id: e.from_evidence_key, containing_stable_symbol_id: null,
        target_text: spec, target_stable_symbol_id: null, resolution_status: r.status === 'RESOLVED' ? 'canonical' : r.status === 'AMBIGUOUS' ? 'ambiguous' : 'unresolved', captures: {},
        evidence_refs: [`${rel}#L${e.evidence_start_line}C${e.evidence_start_column}-L${e.evidence_end_line}C${e.evidence_end_column}`], extractor: 'treesitter_chunker', extractor_revision: `${j.engine}@${j.engine_version}`,
        ...(r.status === 'RESOLVED' ? { target_source_ref: r.target, target_source_revision: normRev(manifest.get(r.target)) } : {}),
      });
    }
  }
  facts.sort((a, b) => (a.reference_id < b.reference_id ? -1 : 1));
  return { facts, files, skipped, spanChecks, accounting };
}

const first = await runOnce();
const second = await runOnce();
const canon = (r) => sha(JSON.stringify({ facts: r.facts, files: r.files.map((f) => [f.rel, f.sourceRevision, f.edges]), accounting: r.accounting }));
const deterministic = canon(first) === canon(second);

// P3: mapping, twice. (a) honest: no snapshot UUID is independently established -> every candidate rejected SCOPE_MISSING.
const honest = mapReferenceFacts({ facts: first.facts, scope: null });
// (b) labelled fixture scope to exercise the rest of the mapper; repository id comes from the persisted ROOT row, snapshot id is a FIXTURE value.
const fixtureScope = persistedRoot.length === 1 ? { repositoryId: persistedRoot[0], snapshotId: '00000000-0000-7000-8000-000000000001' } : null;
const withFixtureScope = mapReferenceFacts({ facts: first.facts, scope: fixtureScope });

const body = {
  schema: 'atlas.structural-reference-producer-smoke.v1', mode: 'READ_ONLY', workspaceRevision: admission.workspaceRevision, executionId: EXECUTION_ID,
  selection: { rule: 'first N by path per prefix, manifest-backed, tests/specs excluded, no randomness', prefixes, perPrefix, files: selection.length },
  inputs: { languages: first.files.reduce((m, f) => ((m[path.extname(f.rel)] = (m[path.extname(f.rel)] ?? 0) + 1), m), {}), filesSent: first.files.length, skipped: first.skipped, parser: [...new Set(first.files.map((f) => f.engine))] },
  extraction: first.accounting,
  facts: { total: first.facts.length, byStatus: first.facts.reduce((m, f) => ((m[f.resolution_status] = (m[f.resolution_status] ?? 0) + 1), m), {}) },
  evidenceVerification: { importSpans: first.spanChecks },
  determinism: { runs: 2, digestsEqual: deterministic, digest: canon(first) },
  mapping: { honestScopeMissing: { counts: honest.counts, rejectedReasons: [...new Set(honest.rejected.flatMap((r) => r.reasons))] }, fixtureScope: { label: 'FIXTURE_SCOPE_NOT_CANONICAL', counts: withFixtureScope.counts, candidateTypes: [...new Set(withFixtureScope.candidates.map((c) => c.type))], unresolvedReasons: withFixtureScope.unresolved.reduce((m, u) => ((m[u.reason] = (m[u.reason] ?? 0) + 1), m), {}) } },
  canonicalEligible: false, canonicalAuthority: false, writesPerformed: false, snapshotUuidEstablished: false,
};
const receiptSha256 = sha(JSON.stringify(body));
fs.mkdirSync(runDir, { recursive: true });
fs.writeFileSync(path.join(runDir, 'facts.jsonl'), first.facts.map((f) => JSON.stringify(f)).join('\n') + '\n', { flag: 'wx' });
fs.writeFileSync(path.join(runDir, 'receipt.json'), `${JSON.stringify({ ...body, receiptSha256 }, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ ...body, receiptSha256, runDir: path.relative(root, runDir) }, null, 1));
