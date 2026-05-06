#!/usr/bin/env node
import { readFileSync } from 'node:fs';
const r = JSON.parse(readFileSync('docs/graph/deep-audit-ast.json', 'utf8'));

function rollupByFile(findings) {
  const m = new Map();
  for (const f of findings) m.set(f.file, (m.get(f.file) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
function rollupByDir(findings, depth = 4) {
  const m = new Map();
  for (const f of findings) {
    const d = f.file.replace(/\\/g, '/').split('/').slice(0, depth).join('/');
    m.set(d, (m.get(d) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

console.log('═══ D6 — Hardcoded localhost (88 findings) ═══');
console.log('Top files:');
for (const [f, c] of rollupByFile(r.gates.D6.findings).slice(0, 12)) console.log(`  ${c}x ${f}`);
console.log('\nTop directories:');
for (const [d, c] of rollupByDir(r.gates.D6.findings).slice(0, 8)) console.log(`  ${c}x ${d}`);

console.log('\n═══ D7 — Browser globals in SSR .svelte (85 findings) ═══');
console.log('Top directories:');
for (const [d, c] of rollupByDir(r.gates.D7.findings, 5).slice(0, 10)) console.log(`  ${c}x ${d}`);

console.log('\n═══ D9 — Likely orphans (840 findings) ═══');
console.log('Top directories (orphan density):');
for (const [d, c] of rollupByDir(r.gates.D9.findings, 4).slice(0, 12)) console.log(`  ${c}x ${d}`);
console.log('\nTags rollup:');
const tagCount = new Map();
for (const f of r.gates.D9.findings) {
  const m = f.snippet.match(/tags=\[([^\]]+)\]/);
  if (!m) continue;
  for (const t of m[1].split(',').filter(Boolean)) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
}
for (const [t, c] of [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`  ${c}x ${t}`);
}

console.log('\n═══ D10 — ACE synthesis missing recordLlmOutputHit (1 finding) ═══');
for (const f of r.gates.D10.findings) console.log(`  ${f.file}:${f.line} — ${f.snippet}`);