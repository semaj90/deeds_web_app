#!/usr/bin/env node
/**
 * Triage D9 orphan findings from deep-audit-ast.json.
 * Buckets findings into framework-loaded (false positives) vs real candidates.
 */
import { readFileSync } from 'node:fs';
const j = JSON.parse(readFileSync('docs/graph/deep-audit-ast.json', 'utf8'));
const d9 = j.gates.D9.findings;

const buckets = {
  'd.ts (ambient)':       0,
  'hooks/layout/page':    0,
  'service worker':       0,
  '.svelte.ts stores':    0,
  'API routes (+server)': 0,
  'machines (XState)':    0,
  'shims/types':          0,
  'index.ts barrels':     0,
  'real candidates':      0,
};
const realCandidates = [];

for (const f of d9) {
  const p = (f.file || f.path).split('\\').join('/');
  if (p.endsWith('.d.ts'))                                              buckets['d.ts (ambient)']++;
  else if (/hooks\.(server|client)\.ts$|\+layout|\+page\.svelte$/.test(p)) buckets['hooks/layout/page']++;
  else if (p.includes('service-worker') || p.endsWith('sw.ts'))         buckets['service worker']++;
  else if (p.endsWith('.svelte.ts'))                                    buckets['.svelte.ts stores']++;
  else if (p.includes('+server.ts'))                                    buckets['API routes (+server)']++;
  else if (p.includes('/machines/') || p.endsWith('Machine.ts'))        buckets['machines (XState)']++;
  else if (p.includes('/shims/') || p.includes('/types/'))              buckets['shims/types']++;
  else if (p.endsWith('/index.ts'))                                     buckets['index.ts barrels']++;
  else { buckets['real candidates']++; realCandidates.push(p); }
}

console.log('D9 bucketing:');
for (const [k, v] of Object.entries(buckets)) console.log(`  ${String(v).padStart(4)} ${k}`);

console.log(`\n${realCandidates.length} real orphan candidates (sample of 30):`);
realCandidates.slice(0, 30).forEach(p => console.log('  ' + p));

// Group real candidates by directory
const byDir = {};
for (const p of realCandidates) {
  const top = p.split('/').slice(0, 4).join('/');
  byDir[top] = (byDir[top] ?? 0) + 1;
}
console.log('\nReal candidates by directory (top 12):');
Object.entries(byDir).sort((a, b) => b[1] - a[1]).slice(0, 12)
  .forEach(([d, n]) => console.log(`  ${String(n).padStart(4)} ${d}`));
