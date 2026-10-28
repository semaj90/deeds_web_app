#!/usr/bin/env node
// SVELTE_STRUCTURAL_FUSION_AUDIT v2 (read-only). Fuses rune calls, script imports and script function declarations across every Svelte
// component under sveltekit-frontend/src from independent parser families (tree-sitter: ast-grep CLI + napi; svelte/compiler estree).
// Facts carry sourceRef + source digest + semantic kind + exact UTF-8 span. Agreement needs two independence groups. No writes.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fuseObservations } from './lib/structural-evidence-fusion-v1.mjs';
import { GROUP, cliRuneFacts, compilerFacts, napiFacts } from './lib/svelte-fusion-producers-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (n, f) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? f;
const out = path.resolve(root, arg('out', '.tmp/atlas/svelte-structural-fusion-20261028.json'));
if (!out.startsWith(`${path.resolve(root, '.tmp/atlas')}${path.sep}`)) { console.error('OUTPUT_MUST_STAY_UNDER_TMP_ATLAS'); process.exit(2); }
const sha = (b) => `sha256:${crypto.createHash('sha256').update(b).digest('hex')}`;
const groupOf = (s) => GROUP[s];

const files = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!/node_modules|_archive|\.svelte-kit/.test(p)) walk(p); } else if (p.endsWith('.svelte')) files.push(path.relative(root, p).replaceAll('\\', '/')); } })(path.join(root, 'sveltekit-frontend/src'));
files.sort();
const fileSet = new Set(files);
const buffers = new Map(files.map((f) => [f, fs.readFileSync(path.join(root, f))]));
const digestOf = (rel) => sha(buffers.get(rel));

function run() {
  const cli = cliRuneFacts(fileSet, digestOf);
  const totals = {}; const byKind = {}; const samples = { SINGLE_GROUP: [], CONFLICT: [] }; let compilerErrors = 0; let scriptParseErrors = 0;
  for (const rel of files) {
    const buf = buffers.get(rel); const source = buf.toString('utf8'); const digest = digestOf(rel);
    let compiler;
    try { compiler = compilerFacts(source, rel, digest); } catch { compilerErrors += 1; continue; }
    const napi = napiFacts(source, rel, digest);
    if (napi.scriptParseError) { scriptParseErrors += 1; continue; }
    const fused = fuseObservations([...(cli.get(rel) ?? []), ...napi.observations, ...compiler], { groupOf });
    for (const f of fused.facts) {
      totals[f.status] = (totals[f.status] ?? 0) + 1;
      byKind[f.kind] ??= {}; byKind[f.kind][f.status] = (byKind[f.kind][f.status] ?? 0) + 1;
      if (f.status !== 'AGREED_INDEPENDENT' && samples[f.status].length < 8) samples[f.status].push({ file: rel, kind: f.kind, name: f.name, startByte: f.startByte, sources: f.sources, conflictingEnds: f.conflictingEnds, readback: buf.subarray(f.startByte, f.startByte + 60).toString('utf8').replace(/\s+/g, ' ') });
    }
  }
  return { filesScanned: files.length, compilerErrors, scriptParseErrorsInTreeSitter: scriptParseErrors, totals, byKind, samples };
}

const a = run(); const b = run();
const body = { schema: 'atlas.svelte-structural-fusion-audit.v2', mode: 'READ_ONLY', groups: GROUP, ...a, determinism: { runs: 2, equal: sha(JSON.stringify(a)) === sha(JSON.stringify(b)), digest: sha(JSON.stringify(a)) }, canonicalAuthority: false, writesPerformed: false };
const receiptSha256 = sha(JSON.stringify(body));
fs.writeFileSync(out, `${JSON.stringify({ ...body, receiptSha256 }, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ ...body, receiptSha256, output: path.relative(root, out) }, null, 1));
