#!/usr/bin/env node
/**
 * D9 Shallow + Dynamic Triage — second-pass classifier on the 148 candidates
 * the verifier flagged as `true-orphan-candidate`.
 *
 * Splits each orphan into one of:
 *   - dynamic-import-target  appears as a value in another file's dynImports array
 *   - sibling-replaced       another file with the same stem exists elsewhere (likely the live one)
 *   - mentioned-in-agents    referenced in a per-directory AGENTS.md / Redis wiki:note
 *   - has-fanOut-no-fanIn    the file imports things but nothing imports it — likely an unwired
 *                            "feature-not-yet-implemented" producer (worth WIRING, not deleting)
 *   - no-tags-no-imports     small, no semantic tags, no dependencies → genuinely dead
 *   - true-orphan            confirmed by all signals — safe to archive
 *
 * Inputs:
 *   reports/deep-audit/d9-orphan-verification.json  (148 candidates)
 *   docs/graph/codebase-graph.json                  (dynImports + metadata)
 *   Redis wiki:note:dir:*                           (AGENTS.md mirror)
 *
 * Output:
 *   reports/deep-audit/d9-shallow-dynamic-triage.{json,md}
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import Redis from 'ioredis';

const ROOT       = process.cwd();
const VERIFY     = path.join(ROOT, 'reports/deep-audit/d9-orphan-verification.json');
const GRAPH      = path.join(ROOT, 'docs/graph/codebase-graph.json');
const OUT_DIR    = path.join(ROOT, 'reports/deep-audit');
const OUT_JSON   = path.join(OUT_DIR, 'd9-shallow-dynamic-triage.json');
const OUT_MD     = path.join(OUT_DIR, 'd9-shallow-dynamic-triage.md');
const REDIS_URL  = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

mkdirSync(OUT_DIR, { recursive: true });

// ── Load inputs ─────────────────────────────────────────────────────────────
const verify = JSON.parse(readFileSync(VERIFY, 'utf8'));
const graph  = JSON.parse(readFileSync(GRAPH,  'utf8'));
const orphans = verify.trueOrphans ?? [];
const files   = graph.files ?? [];

console.log(`Loaded ${orphans.length} orphan candidates · ${files.length} graph files`);

// Build lookup tables ONCE (O(N) preprocessing)
const dynImportTargets = new Set();
for (const f of files) {
  for (const d of f.dynImports ?? []) dynImportTargets.add(d);
}

const stemMap = new Map(); // stem → [paths]
for (const f of files) {
  const base = path.basename(f.rel).replace(/\.(d\.ts|ts|tsx|svelte|svelte\.ts|js|mjs|cjs)$/, '');
  if (!stemMap.has(base)) stemMap.set(base, []);
  stemMap.get(base).push(f.rel);
}

const fileByRel = new Map();
for (const f of files) fileByRel.set(f.rel, f);

// ── Redis: agents + wiki notes ──────────────────────────────────────────────
const redis = new Redis(REDIS_URL, { lazyConnect: true, connectTimeout: 3000 });
let agentsNotes = '';
try {
  await redis.ping();
  const wikiKeys = await redis.keys('wiki:note:dir:*');
  const agentsKeys = await redis.keys('agents:dir:*');
  const sample = [];
  for (const k of [...wikiKeys, ...agentsKeys].slice(0, 2000)) {
    const v = await redis.get(k);
    if (v) sample.push(v);
  }
  agentsNotes = sample.join('\n');
  console.log(`Indexed ${wikiKeys.length} wiki:note + ${agentsKeys.length} agents:dir keys`);
} catch (err) {
  console.warn(`Redis lookup skipped: ${err.message}`);
}

// ── Triage each orphan ──────────────────────────────────────────────────────
const buckets = {
  'dynamic-import-target': [],
  'sibling-replaced':       [],
  'mentioned-in-agents':    [],
  'has-fanOut-no-fanIn':    [],
  'no-tags-no-imports':     [],
  'true-orphan':            [],
};

const triage = orphans.map((rel) => {
  const f = fileByRel.get(rel);
  const stem = path.basename(rel).replace(/\.(d\.ts|ts|tsx|svelte|svelte\.ts|js|mjs|cjs)$/, '');

  // Signal 1: appears in dynImports
  const dynMatch = [...dynImportTargets].filter((d) => d.includes(stem) || rel.includes(d));
  if (dynMatch.length) {
    return { rel, stem, classification: 'dynamic-import-target', dynMatch: dynMatch.slice(0, 3), keepReason: 'Loaded via await import() at runtime' };
  }

  // Signal 2: sibling with same stem exists elsewhere (likely the live one)
  const siblings = (stemMap.get(stem) ?? []).filter((p) => p !== rel);
  if (siblings.length) {
    return { rel, stem, classification: 'sibling-replaced', siblings: siblings.slice(0, 3), keepReason: 'Another file with same stem exists — this is likely a stale duplicate' };
  }

  // Signal 3: mentioned in AGENTS.md / Redis wiki notes
  if (agentsNotes && (agentsNotes.includes(rel) || agentsNotes.includes(stem))) {
    return { rel, stem, classification: 'mentioned-in-agents', keepReason: 'Referenced in AGENTS.md or wiki note — possibly a feature module' };
  }

  // Signal 4: file has fanOut (imports things) but no fanIn (nothing imports it)
  // → producer that hasn't been wired up yet, NOT dead code
  const fanOut = (f?.imports ?? []).length;
  const lineCount = f?.lineCount ?? 0;
  const tags = f?.tags ?? [];
  if (fanOut > 0 && lineCount > 30) {
    return {
      rel, stem,
      classification: 'has-fanOut-no-fanIn',
      fanOut,
      lineCount,
      tags: tags.slice(0, 5),
      keepReason: `Imports ${fanOut} modules · ${lineCount} LOC · likely an unwired feature producer`,
    };
  }

  // Signal 5: no tags, few lines, no imports → genuinely dead
  if (tags.length === 0 && fanOut === 0 && lineCount < 50) {
    return { rel, stem, classification: 'no-tags-no-imports', lineCount, keepReason: '' };
  }

  // Default: nothing rescued it → true orphan
  return { rel, stem, classification: 'true-orphan', lineCount, fanOut, keepReason: '' };
});

for (const t of triage) {
  buckets[t.classification].push(t);
}

// ── Write JSON report ───────────────────────────────────────────────────────
const json = {
  generatedAt:    new Date().toISOString(),
  inputCount:     orphans.length,
  classifications: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])),
  buckets,
  guidance: {
    'dynamic-import-target': 'KEEP — `await import("...filename")` consumer exists',
    'sibling-replaced':       'INVESTIGATE — duplicate stem; check which file is wired',
    'mentioned-in-agents':    'KEEP — feature module documented in directory wiki',
    'has-fanOut-no-fanIn':    'WIRE — feature-not-yet-implemented; needs an importer',
    'no-tags-no-imports':     'ARCHIVE — small dead file with no signals',
    'true-orphan':            'ARCHIVE — manual peek, then move to deeds_labs/',
  },
};

writeFileSync(OUT_JSON, JSON.stringify(json, null, 2), 'utf8');

// ── Markdown digest ─────────────────────────────────────────────────────────
const md = [
  '# D9 Shallow + Dynamic Triage',
  '',
  `Generated: ${json.generatedAt}`,
  `Input: ${json.inputCount} D9 true-orphan-candidates`,
  '',
  '## Classification breakdown',
  '',
  '| Bucket | Count | Action |',
  '|--------|------:|--------|',
  ...Object.entries(json.classifications).map(([k, n]) => `| ${k} | ${n} | ${json.guidance[k] ?? ''} |`),
  '',
  '---',
  '',
];
for (const [bucket, items] of Object.entries(buckets)) {
  if (!items.length) continue;
  md.push(`## ${bucket} (${items.length})`);
  md.push('');
  md.push(`> ${json.guidance[bucket]}`);
  md.push('');
  for (const t of items.slice(0, 30)) {
    md.push(`- \`${t.rel}\`${t.keepReason ? ` — ${t.keepReason}` : ''}`);
    if (t.dynMatch?.length) md.push(`  - matches dynImport: ${t.dynMatch.map((d) => '`' + d + '`').join(', ')}`);
    if (t.siblings?.length) md.push(`  - siblings: ${t.siblings.map((s) => '`' + s + '`').join(', ')}`);
    if (t.tags?.length)     md.push(`  - tags: \`${t.tags.join(', ')}\``);
  }
  if (items.length > 30) md.push(`  ... ${items.length - 30} more`);
  md.push('');
}
writeFileSync(OUT_MD, md.join('\n'), 'utf8');

// ── Console summary ─────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(54)}`);
console.log('  D9 Shallow + Dynamic Triage Complete');
console.log('═'.repeat(54));
for (const [k, items] of Object.entries(buckets)) {
  console.log(`  ${String(items.length).padStart(4)} ${k}`);
}
console.log('');
console.log(`  📄 ${path.relative(ROOT, OUT_JSON)}`);
console.log(`  📄 ${path.relative(ROOT, OUT_MD)}`);

await redis.quit().catch(() => null);
