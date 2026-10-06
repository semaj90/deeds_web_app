#!/usr/bin/env node
/**
 * GPH-EDGE-ELIGIBILITY-01: AST edge eligibility gate (READ ONLY, diagnostic). Takes raw tree-sitter chunker edges from the FastAPI sidecar
 * (:8095 /ast/chunk) and classifies how far each edge gets toward being a graph/incidence input. Writes only docs/reports/ast-edge-eligibility-v1.json.
 * No database, Neo4j, Qdrant, Valkey, IncidenceProjectionV1 or cuGraph writes; nothing is promoted.
 *
 * Predicate order per edge (first failure is the reason):
 *   1 SOURCE_AUTHORITY_UNPROVEN   the sidecar run has no proven source revision (the git/source-authority owner is NOT consulted here), so
 *                                 every edge is reported with this as the OVERALL blocker; the remaining predicates are still evaluated and
 *                                 reported separately as "structural" so the next blocker is visible.
 *   2 SUBJECT_*                   edge from-keys use three id namespaces: FILE id (IMPORTS/DEFINES/EXPORTS), SYMBOL id and CHUNK id
 *                                 (CALLS/REFERENCES). FILE subjects are module identities (legitimately not symbols).
 *   3 TARGET_*                    the sidecar target is raw source text. It is only bound when a declared chunk name or an import binding backs it.
 *   4 NODE_*                      node class for any PageRank input: FILE, MODULE, EXPORTED_SYMBOL, LOCAL_SYMBOL, IMPORTED_INTERNAL, EXTERNAL_PACKAGE,
 *                                 BUILTIN, LOCAL_OR_PARAMETER (cannot be told apart from chunker data), UNRESOLVED.
 * A bare identifier is never treated as a symbol without backing evidence. "structuralEligible" is NOT admission.
 *   node scripts/atlas/audit-ast-edge-eligibility-v1.mjs [--files a.ts,b.ts]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argIdx = process.argv.indexOf('--files');
const FILES = argIdx > 0 ? process.argv[argIdx + 1].split(',') : [
  'sveltekit-frontend/src/lib/server/retrieval/unified-orchestrator.ts',
  'sveltekit-frontend/src/lib/server/retrieval/parent-atlas-bridge.ts',
  'sveltekit-frontend/src/lib/server/atlas/operations/atlas-operation-runtime-v1.ts',
  'sveltekit-frontend/src/lib/server/atlas/indexing/graphify-structural-intelligence-adapter.ts',
  'sveltekit-frontend/src/lib/server/atlas/indexing/graphify-symbol-projection-v1.ts',
  'packages/parent-atlas/src/core/ast-relation-graph-v1.ts',
];
const REPORT = path.join(ROOT, 'docs/reports/ast-edge-eligibility-v1.json');
const BUILTINS = new Set(['Array', 'Object', 'Map', 'Set', 'WeakMap', 'Promise', 'Error', 'JSON', 'Math', 'Date', 'Number', 'String', 'Boolean', 'Symbol', 'RegExp', 'URL', 'Buffer',
  'console', 'process', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'setTimeout', 'clearTimeout', 'fetch', 'AbortSignal', 'TextDecoder', 'TextEncoder', 'Uint8Array', 'Float32Array',
  'NodeJS', 'ProcessEnv', 'Record', 'Partial', 'Required', 'Readonly', 'Pick', 'Omit', 'ReturnType', 'Awaited', 'Parameters', 'globalThis', 'undefined', 'NaN', 'Infinity']);
const bump = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n; };
// Real per-file source authority from audit-ast-source-authority-v1.mjs (never assumed). Missing report or file => UNPROVEN.
const AUTH_REPORT = path.join(ROOT, 'docs/reports/ast-source-authority-v1.json');
const authorityByFile = new Map(fs.existsSync(AUTH_REPORT) ? JSON.parse(fs.readFileSync(AUTH_REPORT, 'utf8')).results.map((r) => [r.sourceRef, r.status]) : []);

async function sidecar(file) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const r = await fetch('http://127.0.0.1:8095/ast/chunk', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(90000),
    body: JSON.stringify({ source, language: file.endsWith('.tsx') ? 'tsx' : 'typescript', filePath: file, sourceRevision: 'ast-edge-eligibility-v1' }) });
  if (!r.ok) throw new Error(`SIDECAR_HTTP_${r.status}`);
  return r.json();
}

function importBindings(edges) {
  const names = new Map(); // local name -> module specifier | null
  const stmtBySubject = new Map();
  for (const e of edges) if (e.type === 'IMPORTS' && /^import\b/.test(e.to_evidence_key)) stmtBySubject.set(e.from_evidence_key, e.to_evidence_key);
  for (const e of edges) {
    if (e.type !== 'IMPORTS' || /^import\b/.test(e.to_evidence_key)) continue;
    const spec = /from\s+['"]([^'"]+)['"]/.exec(stmtBySubject.get(e.from_evidence_key) ?? '')?.[1] ?? null;
    const t = e.to_evidence_key.trim();
    const named = /^\{([^}]*)\}$/.exec(t);
    if (named) for (const part of named[1].split(',')) { const n = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop(); if (n) names.set(n, spec); }
    else if (/^\*\s+as\s+(\w+)$/.test(t)) names.set(/^\*\s+as\s+(\w+)$/.exec(t)[1], spec);
    else if (/^\w+$/.test(t)) names.set(t, spec);
  }
  return names;
}

const kinds = ['DEFINES', 'CALLS', 'REFERENCES', 'IMPORTS', 'EXPORTS'];
const blank = () => ({ total: 0, resolvedBySidecar: 0, structuralEligible: 0, eligible: 0, structuralReasons: {} });
const out = { schema: 'atlas.ast-edge-eligibility.v1', generatedAt: new Date().toISOString(), canonicalAuthority: false, writesPerformed: false,
  sidecar: 'http://127.0.0.1:8095/ast/chunk',
  note: 'Diagnostic only. eligible counts only edges from files whose source authority is PROVEN (see ast-source-authority-v1.json); structuralEligible shows what the remaining predicates would allow. Not admission: imports still need a module resolver, and PacketKeyV2 / workspace / graph revisions are required.',
  sourceAuthority: {}, totals: { files: 0, edges: 0, ...blank() }, byKind: Object.fromEntries(kinds.map((k) => [k, blank()])), subjectClasses: {}, nodeClasses: {}, perFile: [] };

for (const file of FILES) {
  const j = await sidecar(file);
  const { chunks, edges } = j;
  const subjectIndex = new Map();
  for (const c of chunks) {
    subjectIndex.set(c.upstream_chunk_id, { cls: 'CHUNK', c }); subjectIndex.set(c.upstream_node_id, { cls: 'CHUNK', c });
    if (c.upstream_symbol_id) subjectIndex.set(c.upstream_symbol_id, { cls: 'SYMBOL', c });
    if (c.upstream_file_id) subjectIndex.set(c.upstream_file_id, { cls: 'FILE', c });
  }
  const chunkIds = new Set(chunks.map((c) => c.upstream_chunk_id));
  const declared = new Set(chunks.filter((c) => c.name).map((c) => c.name));
  const exported = new Set(edges.filter((e) => e.type === 'EXPORTS').map((e) => e.to_evidence_key));
  const imports = importBindings(edges);
  const authority = authorityByFile.get(file) ?? 'UNPROVEN';
  bump(out.sourceAuthority, authority);
  const per = { file, sourceAuthority: authority, chunks: chunks.length, edges: edges.length, structuralEligible: 0 };
  out.totals.files++;
  for (const e of edges) {
    const K = out.byKind[e.type] ?? (out.byKind[e.type] = blank());
    for (const bucket of [K, out.totals]) bucket.total++;
    out.totals.edges++;
    if (e.resolved) { K.resolvedBySidecar++; out.totals.resolvedBySidecar++; }
    // subject
    const s = subjectIndex.get(e.from_evidence_key);
    let subjectReason = null, subjectClass;
    if (!s) { subjectClass = 'UNMAPPED'; subjectReason = 'SUBJECT_KEY_UNMAPPED'; }
    else if (s.cls === 'FILE') subjectClass = 'FILE_MODULE';
    else if (s.cls === 'SYMBOL' || s.c.upstream_symbol_id || s.c.name) subjectClass = 'SYMBOL';
    else if ((s.c.parent_route ?? []).some((p) => declared.has(p))) subjectClass = 'ENCLOSED_BY_SYMBOL';
    else { subjectClass = 'CHUNK_NO_SYMBOL'; subjectReason = 'SUBJECT_SYMBOL_UNMAPPED'; }
    bump(out.subjectClasses, subjectClass);
    // span
    const spanOk = [e.evidence_start_line, e.evidence_start_column, e.evidence_end_line, e.evidence_end_column].every((v) => Number.isInteger(v));
    // target / node class
    let nodeClass, targetReason = null;
    if (e.type === 'DEFINES') nodeClass = subjectIndex.has(e.to_evidence_key) || chunkIds.has(e.to_evidence_key) ? 'LOCAL_SYMBOL' : 'UNRESOLVED';
    else if (e.type === 'IMPORTS') { nodeClass = 'MODULE'; targetReason = 'TARGET_SYMBOL_UNRESOLVED_NEEDS_MODULE_RESOLVER'; }
    else {
      const root = e.to_evidence_key.replace(/^new\s+/, '').split(/[.(\[]/)[0].trim();
      if (declared.has(root)) nodeClass = exported.has(root) ? 'EXPORTED_SYMBOL' : 'LOCAL_SYMBOL';
      else if (imports.has(root)) { const spec = imports.get(root); nodeClass = spec && /^[./]/.test(spec) ? 'IMPORTED_INTERNAL' : 'EXTERNAL_PACKAGE'; if (nodeClass === 'EXTERNAL_PACKAGE') targetReason = 'NODE_UNQUALIFIED_EXTERNAL_PACKAGE'; }
      else if (BUILTINS.has(root)) { nodeClass = 'BUILTIN'; targetReason = 'NODE_UNQUALIFIED_BUILTIN'; }
      else { nodeClass = 'LOCAL_OR_PARAMETER'; targetReason = 'NODE_UNQUALIFIED_LOCAL_OR_PARAMETER'; }
    }
    if (e.type === 'DEFINES' && nodeClass === 'UNRESOLVED') targetReason = 'TARGET_SYMBOL_UNRESOLVED';
    bump(out.nodeClasses, nodeClass);
    const reason = subjectReason ?? (spanOk ? null : 'EDGE_SPAN_MISSING') ?? null;
    const structuralReason = subjectReason ?? (!spanOk ? 'EDGE_SPAN_MISSING' : targetReason);
    if (!structuralReason) { K.structuralEligible++; out.totals.structuralEligible++; per.structuralEligible++; if (authority === 'PROVEN') { K.eligible++; out.totals.eligible++; } }
    else { bump(K.structuralReasons, structuralReason); bump(out.totals.structuralReasons, structuralReason); }
    void reason;
  }
  out.perFile.push(per);
}
out.totals.structuralReasons = Object.fromEntries(Object.entries(out.totals.structuralReasons).sort((a, b) => b[1] - a[1]));
fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(REPORT, JSON.stringify(out, null, 2) + '\n');
const T = out.totals;
console.log(`files=${T.files} edges=${T.edges} resolvedBySidecar=${T.resolvedBySidecar} structuralEligible=${T.structuralEligible} eligible=${T.eligible} sourceAuthority=${JSON.stringify(out.sourceAuthority)}`);
for (const [k, v] of Object.entries(out.byKind)) if (v.total) console.log(`${k.padEnd(10)} total=${String(v.total).padStart(4)} sidecarResolved=${String(v.resolvedBySidecar).padStart(4)} structuralEligible=${String(v.structuralEligible).padStart(4)} reasons=${JSON.stringify(v.structuralReasons)}`);
console.log('subject classes:', JSON.stringify(out.subjectClasses));
console.log('node classes   :', JSON.stringify(out.nodeClasses));
console.log(`report=${path.relative(ROOT, REPORT)}`);
