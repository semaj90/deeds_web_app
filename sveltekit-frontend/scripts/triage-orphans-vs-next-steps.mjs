#!/usr/bin/env node
/**
 * Cross-reference D9 orphan candidates × next_steps planning corpus.
 *
 * For each remaining unwired feature + true-orphan, search the entire
 * next_steps/ tree for mentions of the file path or its stem. Categorise:
 *
 *   - PLANNED   — file appears in next_steps; the planner intends to use it
 *   - DRIFT     — file is unrelated to anything in next_steps; safe to archive
 *   - INVERTED  — feature mentioned in next_steps but NO matching file exists
 *                 (the file the planner expected hasn't been written yet)
 *
 * Output:
 *   reports/deep-audit/d9-vs-next-steps.{json,md}
 */
import { readFileSync, readdirSync, writeFileSync, statSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT       = process.cwd();
const NEXT_STEPS = path.join(ROOT, 'next_steps');
const TRIAGE     = path.join(ROOT, 'reports/deep-audit/d9-shallow-dynamic-triage.json');
const OUT_DIR    = path.join(ROOT, 'reports/deep-audit');
const OUT_JSON   = path.join(OUT_DIR, 'd9-vs-next-steps.json');
const OUT_MD     = path.join(OUT_DIR, 'd9-vs-next-steps.md');

mkdirSync(OUT_DIR, { recursive: true });

// ── Build next_steps haystack ────────────────────────────────────────────────
function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(md|txt)$/.test(e.name)) out.push(full);
  }
  return out;
}

const nextStepsFiles = walk(NEXT_STEPS);
const nsHaystack = nextStepsFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
console.log(`Loaded ${nextStepsFiles.length} next_steps files (${Math.round(nsHaystack.length / 1024)} KB)`);

// ── Load orphan + unwired candidates ─────────────────────────────────────────
const triage = JSON.parse(readFileSync(TRIAGE, 'utf8'));
const candidates = [
  ...triage.buckets['has-fanOut-no-fanIn'].map((t) => ({ ...t, sourceBucket: 'unwired' })),
  ...triage.buckets['true-orphan'].map((t) => ({ ...t, sourceBucket: 'orphan' })),
];
console.log(`Cross-referencing ${candidates.length} candidates against next_steps`);

// ── Match each candidate against next_steps ──────────────────────────────────
function findMentions(rel, stem) {
  const mentions = [];
  // 1. Match full relative path (most precise)
  if (nsHaystack.includes(rel)) mentions.push({ kind: 'full-path', term: rel });
  // 2. Match stem in word boundaries
  const stemRe = new RegExp(`\\b${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  if (stemRe.test(nsHaystack)) mentions.push({ kind: 'stem', term: stem });
  return mentions;
}

const planned = [];
const drift   = [];

for (const c of candidates) {
  const mentions = findMentions(c.rel, c.stem);
  if (mentions.length) planned.push({ ...c, mentions });
  else                 drift.push(c);
}

// ── Inverted check: features named in next_steps with no matching file ──────
//    Pull `code-block file paths` from the next_steps corpus and check
//    whether they exist on disk.
const PATH_LINE_RE = /\b(?:src|scripts|tests|docs|reports|drizzle|deeds_labs)\/[\w./-]+\.(?:ts|svelte|svelte\.ts|js|mjs|cjs|md|sql)\b/g;
const referencedPaths = new Set();
for (const m of nsHaystack.matchAll(PATH_LINE_RE)) referencedPaths.add(m[0]);

const inverted = [];
const invertedNoise = []; // intentionally archived paths — separate to avoid drowning the signal
// Helper: does THIS basename live under any deeds_labs/ subdirectory?
// True ⇒ the missing path was archived (intentional), not a real INVERTED gap.
function hasDeedsLabsSibling(p) {
  const base = path.basename(p);
  // Search top-level of deeds_labs/ subdirs (1-2 levels deep is enough for the
  // current archive layout: deeds_labs/<bucket>/<file>).
  try {
    const dirs = readdirSync(path.join(ROOT, '..', 'deeds_labs'), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    for (const d of dirs) {
      try {
        const subdirItems = readdirSync(path.join(ROOT, '..', 'deeds_labs', d), { withFileTypes: true });
        for (const item of subdirItems) {
          if (item.isFile() && item.name === base) return true;
          if (item.isDirectory()) {
            try {
              const inner = readdirSync(path.join(ROOT, '..', 'deeds_labs', d, item.name));
              if (inner.includes(base)) return true;
            } catch { /* skip unreadable */ }
          }
        }
      } catch { /* skip unreadable */ }
    }
  } catch { /* deeds_labs absent — no archive */ }
  return false;
}

for (const p of referencedPaths) {
  try { statSync(path.join(ROOT, p)); }
  catch {
    // deeds_labs/ paths are intentional archive references, not missing features
    if (p.startsWith('deeds_labs/'))                invertedNoise.push(p);
    else if (p.includes('/archived/') || p.endsWith('.bak.ts') || p.endsWith('.backup.ts')) invertedNoise.push(p);
    // The file's basename now lives under deeds_labs/ — planner reference is
    // stale because the file was archived. Move to noise so the signal stays
    // clean for genuinely missing features.
    else if (hasDeedsLabsSibling(p))                invertedNoise.push(p);
    else                                            inverted.push(p);
  }
}

// ── Outputs ──────────────────────────────────────────────────────────────────
const json = {
  generatedAt:        new Date().toISOString(),
  candidatesScanned:  candidates.length,
  nextStepsFilesRead: nextStepsFiles.length,
  planned:            planned.map((p) => ({ rel: p.rel, bucket: p.sourceBucket, loc: p.lineCount, mentions: p.mentions })),
  drift:              drift.map((d) => ({ rel: d.rel, bucket: d.sourceBucket, loc: d.lineCount })),
  inverted:           [...inverted].sort(),
  invertedNoise:      [...invertedNoise].sort(),
  summary: {
    planned:        planned.length,
    drift:          drift.length,
    inverted:       inverted.length,
    invertedNoise:  invertedNoise.length,
  },
};
writeFileSync(OUT_JSON, JSON.stringify(json, null, 2), 'utf8');

// Durable encoded snapshot — date + git SHA stamped so future audits can diff
// against this baseline. Lives under reports/deep-audit/encoded/ and is
// intentionally not gitignored (small, indexable, queryable from later runs).
import { execSync } from 'node:child_process';
let gitSha = 'unknown';
try { gitSha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); } catch {}
const encodedDir = path.join(OUT_DIR, 'encoded');
mkdirSync(encodedDir, { recursive: true });
const isoDate = new Date().toISOString().slice(0, 10);
const encodedPath = path.join(encodedDir, `d9-vs-next-steps_${isoDate}_${gitSha}.json`);
writeFileSync(encodedPath, JSON.stringify({
  schemaVersion: 'v1',
  ...json,
  gitSha,
  isoDate,
  // Compact bucket counts for quick diff between snapshots
  delta: {
    plannedCount:       planned.length,
    driftCount:         drift.length,
    invertedRealCount:  inverted.length,
    invertedNoiseCount: invertedNoise.length,
  },
}, null, 2), 'utf8');

// Markdown
const md = [
  '# D9 Orphans × next_steps Cross-Reference',
  '',
  `Generated: ${json.generatedAt}`,
  `Inputs: ${candidates.length} candidates · ${nextStepsFiles.length} next_steps files (${Math.round(nsHaystack.length / 1024)} KB)`,
  '',
  '## Summary',
  '',
  '| Bucket | Count | Action |',
  '|--------|------:|--------|',
  `| **PLANNED** (orphan ∈ next_steps) | ${planned.length} | WIRE — planner already intends to use this |`,
  `| **DRIFT** (orphan ∉ next_steps) | ${drift.length} | ARCHIVE — no plan references it |`,
  `| **INVERTED** (next_steps ∋ missing file) | ${inverted.length} | IMPLEMENT — planner expects file that doesn't exist |`,
  '',
  '---',
  '',
  '## PLANNED — wire these (planner expects them)',
  '',
];
for (const p of planned) {
  md.push(`### \`${p.rel}\` (${p.lineCount} LOC, ${p.sourceBucket})`);
  for (const m of p.mentions) md.push(`- matched ${m.kind}: \`${m.term}\``);
  md.push('');
}

md.push('---');
md.push('');
md.push('## DRIFT — archive candidates (no plan references)');
md.push('');
md.push('| File | LOC | Bucket |');
md.push('|------|----:|--------|');
for (const d of drift) md.push(`| \`${d.rel}\` | ${d.lineCount} | ${d.sourceBucket} |`);
md.push('');

md.push('---');
md.push('');
md.push('## INVERTED — files the planner expects but don\'t exist');
md.push('');
md.push('Live, actionable (filter excludes intentionally-archived `deeds_labs/` paths):');
md.push('');
if (inverted.length === 0) md.push('_(none — every actively-referenced path in next_steps exists)_');
else for (const p of inverted) md.push(`- \`${p}\``);
md.push('');
if (invertedNoise.length > 0) {
  md.push(`<details><summary>Stale archive references (${invertedNoise.length}) — intentional, no action needed</summary>`);
  md.push('');
  for (const p of invertedNoise) md.push(`- \`${p}\``);
  md.push('');
  md.push('</details>');
  md.push('');
}

writeFileSync(OUT_MD, md.join('\n'), 'utf8');

// ── Console summary ──────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(54)}`);
console.log('  Orphans × next_steps Cross-Reference');
console.log('═'.repeat(54));
console.log(`  ${String(planned.length).padStart(4)}  PLANNED  (wire — orphan in next_steps)`);
console.log(`  ${String(drift.length).padStart(4)}  DRIFT    (archive — no plan)`);
console.log(`  ${String(inverted.length).padStart(4)}  INVERTED (planner expects missing file)`);
console.log('');
console.log(`  📄 ${path.relative(ROOT, OUT_JSON)}`);
console.log(`  📄 ${path.relative(ROOT, OUT_MD)}`);
