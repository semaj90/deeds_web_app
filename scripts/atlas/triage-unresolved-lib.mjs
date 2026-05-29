#!/usr/bin/env node
/**
 * triage-unresolved-lib.mjs
 *
 * Scan `.tmp/ast-unresolved-imports.jsonl` for imports that reference `$lib` or `@/lib` and
 * attempt to resolve them against likely candidate locations:
 *   - sveltekit-frontend/src/lib/<rest>
 *   - src/lib/<rest>
 *
 * For each candidate, try common extensions and index files. Output CSV to
 * `.tmp/unresolved-lib-triage.csv` with columns: from,spec,candidate,status,matched_path
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const INPUT = path.join(ROOT, '.tmp', 'ast-unresolved-imports.jsonl');
const OUTCSV = path.join(ROOT, '.tmp', 'unresolved-lib-triage.csv');

if (!fs.existsSync(INPUT)) {
  console.error('[triage-lib] Missing input', INPUT);
  process.exit(1);
}

const lines = fs.readFileSync(INPUT, 'utf8').trim().split('\n').filter(Boolean);
const records = lines.map(l => JSON.parse(l));

const candidatesRoots = [
  'sveltekit-frontend/src/lib',
  'src/lib'
];
const exts = ['.ts', '.js', '.mjs', '.svelte', '.tsx', '.jsx'];

function tryPaths(base, rel) {
  const tries = [];
  // direct
  tries.push(path.join(base, rel));
  // with extensions
  for (const e of exts) tries.push(path.join(base, rel + e));
  // index variants
  tries.push(path.join(base, rel, 'index.js'));
  tries.push(path.join(base, rel, 'index.ts'));
  tries.push(path.join(base, rel, 'index.mjs'));
  return tries;
}

function existsAny(tries) {
  for (const t of tries) {
    if (fs.existsSync(t)) return t;
  }
  return null;
}

const outRows = [];
let fixed = 0;
let total = 0;

for (const r of records) {
  const spec = r.spec || '';
  if (!spec.startsWith('$lib') && !spec.startsWith('@/lib') && !spec.includes("$lib/")) continue;
  total++;
  // normalize spec path after $lib or @/lib
  let rel = spec.replace(/^\$lib\/?/, '').replace(/^@\/lib\/?/, '');
  rel = rel.replace(/^(\.\/|\/)*/,'');

  let matched = null;
  let matchedCandidate = '';
  for (const root of candidatesRoots) {
    const tries = tryPaths(path.join(ROOT, root), rel);
    const m = existsAny(tries);
    if (m) { matched = m; matchedCandidate = path.relative(ROOT, m); break; }
  }

  const proposed = matchedCandidate || `sveltekit-frontend/src/lib/${rel}`;
  const status = matched ? 'found' : 'missing';
  if (matched) fixed++;

  outRows.push({ from: r.from, spec, proposed, status, matched_path: matched ? matchedCandidate : '' });
}

// write CSV
const header = 'from,spec,proposed,status,matched_path\n';
const csv = outRows.map(o => {
  return [o.from, o.spec, o.proposed, o.status, o.matched_path].map(v => '"' + String(v).replace(/"/g,'""') + '"').join(',');
}).join('\n');
fs.mkdirSync(path.dirname(OUTCSV), { recursive: true });
fs.writeFileSync(OUTCSV, header + csv + '\n', 'utf8');

console.log(`[triage-lib] Scanned ${records.length} unresolved imports; matched ${fixed} candidates; wrote ${outRows.length} rows → ${OUTCSV}`);
