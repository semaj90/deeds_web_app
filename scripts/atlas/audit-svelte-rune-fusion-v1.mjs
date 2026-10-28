#!/usr/bin/env node
// SVELTE_RUNE_FUSION_AUDIT (read-only). Fuses three sources for Svelte 5 rune calls in every component under sveltekit-frontend/src:
//   ast-grep CLI (tree-sitter, built-in HTML script injection), ast-grep napi via svelte-script-scope-v1 (same tree-sitter grammar), and the
//   official svelte/compiler estree. The first two are ONE independence group; the compiler is the other. Agreement requires both groups.
// Facts are byte-addressed (UTF-8). Nothing is written to any datastore. Output goes to .tmp/atlas.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fuseObservations } from './lib/structural-evidence-fusion-v1.mjs';
import { analyzeSvelteScripts } from './lib/svelte-script-scope-v1.mjs';
import { utf8Prefix } from './lib/svelte-template-chunks-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (n, f) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? f;
const out = path.resolve(root, arg('out', '.tmp/atlas/svelte-rune-fusion-20261028.json'));
if (!out.startsWith(`${path.resolve(root, '.tmp/atlas')}${path.sep}`)) { console.error('OUTPUT_MUST_STAY_UNDER_TMP_ATLAS'); process.exit(2); }
const sha = (b) => `sha256:${crypto.createHash('sha256').update(b).digest('hex')}`;
const ROOTS = new Set(['$state', '$derived', '$effect', '$props', '$bindable', '$inspect', '$host']);
const PATTERNS = ['$state($$$A)', '$state.raw($$$A)', '$state.snapshot($$$A)', '$derived($$$A)', '$derived.by($$$A)', '$effect($$$A)', '$effect.pre($$$A)', '$effect.root($$$A)', '$props($$$A)', '$bindable($$$A)', '$inspect($$$A)', '$host($$$A)'];
const GROUP = { 'ast-grep-cli': 'tree-sitter', 'ast-grep-napi': 'tree-sitter', 'svelte-compiler': 'svelte-compiler' };
const groupOf = (s) => GROUP[s];
// Resolved binary, no shell: patterns contain $ and parentheses that cmd.exe would interpret.
const AST_GREP = path.join(root, 'sveltekit-frontend/node_modules/@ast-grep/cli-win32-x64-msvc/ast-grep.exe');
const { parse } = createRequire(path.join(root, 'sveltekit-frontend/package.json'))('svelte/compiler');

const files = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!/node_modules|_archive|\.svelte-kit/.test(p)) walk(p); } else if (p.endsWith('.svelte')) files.push(path.relative(root, p).replaceAll('\\', '/')); } })(path.join(root, 'sveltekit-frontend/src'));
files.sort();
const fileSet = new Set(files);

function cliObservations() {
  const byFile = new Map();
  for (const pattern of PATTERNS) {
    // ast-grep exits 1 when a pattern has no match; that is an empty result, anything else is a failure.
    const res = spawnSync(AST_GREP, ['run', '-p', pattern, '--globs', '**/*.svelte', '--json=compact', 'sveltekit-frontend/src'], { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 });
    if (res.error || (res.status !== 0 && res.status !== 1) || (res.status === 1 && res.stderr.trim())) throw new Error(`ast-grep failed for ${pattern}: ${res.error ?? res.stderr.slice(0, 200)}`);
    const raw = res.stdout;
    for (const m of JSON.parse(raw || '[]')) {
      const rel = m.file.replaceAll('\\', '/');
      if (!fileSet.has(rel)) continue;
      if (!byFile.has(rel)) byFile.set(rel, []);
      byFile.get(rel).push({ source: 'ast-grep-cli', kind: 'RUNE_CALL', name: pattern.slice(0, pattern.search(/[.(]/)), startByte: m.range.byteOffset.start, endByte: m.range.byteOffset.end });
    }
  }
  return byFile;
}

function compilerObservations(source) {
  const prefix = utf8Prefix(source);
  const ast = parse(source, { modern: true });
  const obs = [];
  const visit = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(visit); return; }
    if (n.type === 'CallExpression') {
      const c = n.callee;
      const name = c?.type === 'Identifier' ? c.name : c?.type === 'MemberExpression' && c.object?.type === 'Identifier' ? c.object.name : null;
      if (name && ROOTS.has(name)) obs.push({ source: 'svelte-compiler', kind: 'RUNE_CALL', name, startByte: prefix[c.type === 'Identifier' ? c.start : c.object.start], endByte: prefix[n.end] });
    }
    for (const k of Object.keys(n)) if (k !== 'parent' && k !== 'metadata') visit(n[k]);
  };
  for (const script of [ast.instance, ast.module]) if (script?.content) visit(script.content);
  return obs;
}

function run() {
  const cli = cliObservations();
  const perFile = []; const totals = {}; const byRune = {}; const samples = []; let parseErrors = 0;
  for (const rel of files) {
    const source = fs.readFileSync(path.join(root, rel), 'utf8');
    const buf = Buffer.from(source, 'utf8');
    let compiler;
    try { compiler = compilerObservations(source); } catch { parseErrors += 1; continue; }
    const napiScripts = analyzeSvelteScripts(source);
    const napi = napiScripts.occurrences.filter((o) => o.note === 'svelte-rune').map((o) => ({ source: 'ast-grep-napi', kind: 'RUNE_CALL', name: o.name, startByte: o.startByte }));
    const fused = fuseObservations([...(cli.get(rel) ?? []), ...napi, ...compiler], { groupOf });
    for (const f of fused.facts) {
      totals[f.status] = (totals[f.status] ?? 0) + 1;
      byRune[f.name] ??= {}; byRune[f.name][f.status] = (byRune[f.name][f.status] ?? 0) + 1;
      if (f.status !== 'AGREED_INDEPENDENT' && samples.length < 10) samples.push({ file: rel, name: f.name, status: f.status, sources: f.sources, readback: buf.subarray(f.startByte, f.startByte + 40).toString('utf8').replace(/\s+/g, ' '), conflictingEnds: f.conflictingEnds });
    }
    if (fused.facts.length) perFile.push({ rel, facts: fused.facts.length });
  }
  return { filesScanned: files.length, filesWithRunes: perFile.length, compilerParseErrors: parseErrors, totals, byRune, samples };
}

const a = run(); const b = run();
const body = { schema: 'atlas.svelte-rune-fusion-audit.v1', mode: 'READ_ONLY', sources: GROUP, ...a, determinism: { runs: 2, equal: sha(JSON.stringify(a)) === sha(JSON.stringify(b)), digest: sha(JSON.stringify(a)) }, canonicalAuthority: false, writesPerformed: false };
const receiptSha256 = sha(JSON.stringify(body));
fs.writeFileSync(out, `${JSON.stringify({ ...body, receiptSha256 }, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ ...body, receiptSha256, output: path.relative(root, out) }, null, 1));
