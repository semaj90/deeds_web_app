#!/usr/bin/env node
/**
 * resolve-lib-heuristics.mjs
 *
 * Apply additional heuristics to `.tmp/ast-unresolved-imports.jsonl` to try
 * resolving more `$lib` imports by searching the workspace for likely targets.
 * Writes results to `.tmp/unresolved-lib-heuristics.csv` and updates
 * `.tmp/unresolved-lib-triage.csv` with any new matches.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');
const INPUT = path.join(ROOT, '.tmp', 'ast-unresolved-imports.jsonl');
const TRIAGE = path.join(ROOT, '.tmp', 'unresolved-lib-triage.csv');
const OUT = path.join(ROOT, '.tmp', 'unresolved-lib-heuristics.csv');

if (!fs.existsSync(INPUT)) { console.error('[heuristics] missing input', INPUT); process.exit(1); }

const lines = fs.readFileSync(INPUT, 'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l));

// Build file index (restrict to likely roots to keep it fast)
const scanRoots = [path.join(ROOT, 'sveltekit-frontend'), path.join(ROOT, 'src')];
const fileIndex = [];

function walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '.svelte-kit') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else fileIndex.push(path.relative(ROOT, full).replace(/\\/g, '/'));
  }
}

for (const r of scanRoots) walk(r);

function normalizeSpec(spec) {
  return spec.replace(/^\$lib\/?/, '').replace(/^@\/lib\/?/, '').replace(/^\.\/?/, '').replace(/\\/g, '/');
}

const exts = ['.ts', '.js', '.mjs', '.svelte', '.tsx', '.jsx'];

function generateCandidates(rel) {
  const candidates = [];
  // direct
  candidates.push(`sveltekit-frontend/src/lib/${rel}`);
  candidates.push(`src/lib/${rel}`);
  // swap extensions
  const base = rel.replace(/\.[^/.]+$/, '');
  for (const e of exts) candidates.push(`sveltekit-frontend/src/lib/${base}${e}`), candidates.push(`src/lib/${base}${e}`);
  // index
  candidates.push(`sveltekit-frontend/src/lib/${rel}/index.js`);
  candidates.push(`sveltekit-frontend/src/lib/${rel}/index.ts`);
  candidates.push(`src/lib/${rel}/index.js`);
  candidates.push(`src/lib/${rel}/index.ts`);
  return candidates;
}

const out = [];
let matched = 0;

for (const u of lines) {
  const spec = u.spec || '';
  if (!spec.startsWith('$lib') && !spec.startsWith('@/lib') && !spec.includes('$lib/')) continue;
  const rel = normalizeSpec(spec);
  const candidates = generateCandidates(rel);
  let found = '';
  for (const c of candidates) {
    if (fileIndex.includes(c)) { found = c; break; }
  }
  // fallback: search for any file that endsWith the rel (basename or path)
  if (!found) {
    const tail = rel;
    const tailBase = path.basename(rel);
    const byTail = fileIndex.find(f => f.endsWith('/' + tail) || f.endsWith('/' + tailBase));
    if (byTail) found = byTail;
  }
  if (found) matched++;
  out.push({ from: u.from, spec, found: found || '', status: found ? 'matched' : 'missing' });
}

// write CSV
const hdr = 'from,spec,status,found\n';
const body = out.map(r => `"${r.from.replace(/"/g,'""')}","${r.spec.replace(/"/g,'""')}","${r.status}","${r.found.replace(/"/g,'""')}"`).join('\n');
fs.writeFileSync(OUT, hdr + body + '\n', 'utf8');
console.log(`[heuristics] scanned=${lines.length} matched=${matched} wrote=${OUT}`);

// Merge matches into triage CSV by appending any new matches
if (fs.existsSync(TRIAGE)) {
  const tri = fs.readFileSync(TRIAGE, 'utf8').trim().split('\n').slice(1).filter(Boolean).map(l=>l);
  const extra = out.filter(o => o.found).map(o => `"${o.from.replace(/"/g,'""')}","${o.spec.replace(/"/g,'""')}","${o.found.replace(/"/g,'""')}","heuristic"`);
  const merged = tri.concat(extra).join('\n') + '\n';
  fs.writeFileSync(TRIAGE, 'from,spec,proposed,status,matched_path\n' + merged, 'utf8');
  console.log('[heuristics] appended heuristic matches to', TRIAGE);
}
