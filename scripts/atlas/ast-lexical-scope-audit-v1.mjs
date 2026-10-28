#!/usr/bin/env node
// AST_LEXICAL_SCOPE audit (read-only): tree-sitter lexical scopes over the frozen 20-file sample, compared with the regex baseline receipt.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { analyzeLexicalScopes, verifySpans } from './lib/ast-lexical-scope-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (n, f) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? f;
const sample = JSON.parse(fs.readFileSync(path.resolve(root, arg('sample', '.tmp/atlas/structural-reference-sample-20261027-v2.json')), 'utf8'));
const baselinePath = path.resolve(root, arg('baseline', '.tmp/atlas/lexical-reference-audit-20261027.json'));
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const out = path.resolve(root, arg('out', '.tmp/atlas/ast-lexical-scope-audit-20261027.json'));
if (!out.startsWith(`${path.resolve(root, '.tmp/atlas')}${path.sep}`)) { console.error('OUTPUT_MUST_STAY_UNDER_TMP_ATLAS'); process.exit(2); }
const sha = (b) => `sha256:${crypto.createHash('sha256').update(b).digest('hex')}`;
const normRev = (r) => (r?.startsWith('sha256:') ? r : `sha256:${r}`);
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-At', '-F', '\t'], { input: sql, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const manifest = new Map(psql("select repository_relative_path, code_source_revision from graphify_execution_file_membership_v2 where execution_id='01a1763a-4355-71d7-9b81-2c7a1814a41f' and repository_id='repo:root';").split('\n').filter(Boolean).map((l) => l.split('\t')));

const baselineIndex = new Map();
for (const r of baseline.records) if (r.line) baselineIndex.set(`${r.file}|${r.name}|${r.line}`, r.kind);

function runOnce() {
  const files = []; const all = [];
  for (const f of sample.files) {
    const bytes = fs.readFileSync(path.join(root, f.rel));
    const verified = sha(bytes) === normRev(manifest.get(f.rel));
    const result = analyzeLexicalScopes({ source: bytes.toString('utf8'), language: 'typescript' });
    const spans = verifySpans(bytes, [...result.occurrences, ...result.bindings]);
    files.push({ rel: f.rel, sourceRevisionVerified: verified, parseErrors: result.parseErrors === true, scopes: result.scopeCount ?? 0, occurrences: result.occurrences.length, bindings: result.bindings.length, spansChecked: spans.checked, spansOk: spans.ok });
    for (const o of result.occurrences) all.push({ file: f.rel, ...o });
  }
  return { files, all };
}
const a = runOnce(); const b = runOnce();
const tally = (items, fn) => items.reduce((m, x) => ((m[fn(x)] = (m[fn(x)] ?? 0) + 1), m), {});
const matrix = {}; let matched = 0;
for (const o of a.all) {
  const base = baselineIndex.get(`${o.file}|${o.name}|${o.line}`);
  if (!base) continue;
  matched++;
  matrix[base] ??= {}; matrix[base][o.outcome] = (matrix[base][o.outcome] ?? 0) + 1;
}
const body = {
  schema: 'atlas.ast-lexical-scope-audit.v1', mode: 'READ_ONLY', method: 'TREE_SITTER_LEXICAL_BINDING_VIA_AST_GREP_NAPI', levelOfProof: 'LEXICAL_BINDING_ONLY_NOT_COMPILER_RESOLUTION',
  inputs: { files: a.files.length, sourceRevisionVerified: a.files.filter((f) => f.sourceRevisionVerified).length, filesWithParseErrors: a.files.filter((f) => f.parseErrors).length, baseline: path.relative(root, baselinePath), baselineReceiptSha256: baseline.receiptSha256 },
  scopes: { total: a.files.reduce((n, f) => n + f.scopes, 0) },
  occurrences: { total: a.all.length, byOutcome: tally(a.all, (o) => o.outcome), byParentKind: Object.entries(tally(a.all.filter((o) => o.outcome === 'FREE_IDENTIFIER'), (o) => o.parentKind)).sort((x, y) => y[1] - x[1]).slice(0, 8) },
  bindings: { total: a.files.reduce((n, f) => n + f.bindings, 0) },
  spanVerification: { checked: a.files.reduce((n, f) => n + f.spansChecked, 0), ok: a.files.reduce((n, f) => n + f.spansOk, 0) },
  comparison: { baselineOccurrencesIndexed: baselineIndex.size, matchedByFileNameLine: matched, transitionMatrixRegexToAst: matrix },
  topFreeIdentifiers: Object.entries(tally(a.all.filter((o) => o.outcome === 'FREE_IDENTIFIER'), (o) => o.name)).sort((x, y) => y[1] - x[1]).slice(0, 10),
  determinism: { runs: 2, equal: sha(JSON.stringify(a)) === sha(JSON.stringify(b)), digest: sha(JSON.stringify(a)) },
  canonicalAuthority: false, writesPerformed: false,
};
const receiptSha256 = sha(JSON.stringify(body));
fs.writeFileSync(out, `${JSON.stringify({ ...body, receiptSha256 }, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ ...body, receiptSha256, output: path.relative(root, out) }, null, 1));
