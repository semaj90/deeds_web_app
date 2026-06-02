#!/usr/bin/env node
/**
 * normalize-sourcerefs.mjs
 *
 * Normalises sourceRef paths across graphify artifacts:
 *   1. Validates input shape before touching anything
 *   2. Normalises path separators to forward-slash
 *   3. Deduplicates codebase-graph.json .files[] by rel
 *      - ONLY drops a duplicate if BOTH copies are byte-for-byte identical
 *      - If copies differ in any field → ABORT with details (never silently keep-last)
 *   4. Strips deeds_labs/ and .svelte-error-fixes-backup/ archive entries
 *      (they are snapshot echoes — not promotion candidates)
 *   5. Writes patched file back in-place (--write) or reports only (default)
 *   6. Always writes .tmp/normalize-sourcerefs-diff.json with full removal log
 *   7. 80% safety floor — refuses to write if output < 80% of input entry count
 *
 * Usage:
 *   node scripts/atlas/normalize-sourcerefs.mjs              # dry-run report
 *   node scripts/atlas/normalize-sourcerefs.mjs --write      # patch in-place
 *   node scripts/atlas/normalize-sourcerefs.mjs --verbose    # show every removed rel
 *   node scripts/atlas/normalize-sourcerefs.mjs --write --verbose
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const WRITE   = process.argv.includes('--write');
const VERBOSE = process.argv.includes('--verbose');

const GRAPH_PATH = path.join(ROOT, 'docs/graph/codebase-graph.json');
const LOG_PATH   = path.join(ROOT, '.tmp/normalize-sourcerefs-diff.json');

// ── helpers ───────────────────────────────────────────────────────────────────

function normalizeRel(rel) {
  return rel.replace(/\\/g, '/');
}

function isArchive(rel) {
  return rel.startsWith('deeds_labs/') || rel.includes('/.svelte-error-fixes-backup/');
}

function abort(msg, detail) {
  console.error('\n🚨 ABORT:', msg);
  if (detail) console.error(detail);
  process.exit(1);
}

// ── validation ────────────────────────────────────────────────────────────────

let raw;
try {
  raw = readFileSync(GRAPH_PATH, 'utf-8');
} catch (e) {
  abort(`Cannot read ${GRAPH_PATH}`, e.message);
}

let graph;
try {
  graph = JSON.parse(raw);
} catch (e) {
  abort(`Invalid JSON in ${GRAPH_PATH}`, e.message);
}

if (!graph || typeof graph !== 'object') {
  abort('Graph root is not an object');
}
if (!Array.isArray(graph.files)) {
  abort('graph.files is missing or not an array', `Got: ${typeof graph.files}`);
}
if (graph.files.length === 0) {
  abort('graph.files is empty — nothing to normalize');
}

const files = graph.files;

// Every entry must have a non-empty string rel
const malformed = files.filter(f => !f || typeof f.rel !== 'string' || !f.rel.trim());
if (malformed.length > 0) {
  abort(
    `${malformed.length} entries have missing or empty rel field`,
    `First bad entry: ${JSON.stringify(files.find(f => !f || typeof f.rel !== 'string' || !f.rel.trim())).slice(0, 200)}`
  );
}

console.log('📐 normalize-sourcerefs.mjs', WRITE ? '[WRITE]' : '[DRY-RUN]', VERBOSE ? '[VERBOSE]' : '');
console.log();

// ── step 1: normalize separators (in-place on copies) ─────────────────────────

const before = files.length;
const withBackslash = files.filter(f => f.rel.includes('\\')).length;

// Work on shallow copies so we don't mutate the originals before the conflict check
const normalized = files.map(f => ({ ...f, rel: normalizeRel(f.rel) }));

// ── step 2: detect duplicates — ABORT if any pair differs in metadata ─────────

const relGroups = new Map(); // rel → [entry, ...]
for (const f of normalized) {
  const group = relGroups.get(f.rel);
  if (group) group.push(f);
  else relGroups.set(f.rel, [f]);
}

const dupGroups  = [...relGroups.entries()].filter(([, g]) => g.length > 1);
const conflicted = [];

for (const [rel, group] of dupGroups) {
  const ref = JSON.stringify(group[0]);
  const hasDivergent = group.slice(1).some(c => JSON.stringify(c) !== ref);
  if (hasDivergent) {
    const diffKeys = Object.keys(group[0]).filter(k =>
      group.some(c => JSON.stringify(c[k]) !== JSON.stringify(group[0][k]))
    );
    conflicted.push({ rel, count: group.length, diffKeys });
  }
}

if (conflicted.length > 0) {
  console.error(`\n🚨 ABORT: ${conflicted.length} duplicated rel(s) have conflicting metadata.`);
  console.error('These cannot be safely deduplicated — manual review required.\n');
  for (const c of conflicted.slice(0, 10)) {
    console.error(`  ${c.rel}  (${c.count} copies, differing keys: ${c.diffKeys.join(', ')})`);
  }
  if (conflicted.length > 10) console.error(`  ... and ${conflicted.length - 10} more`);
  process.exit(1);
}

// All duplicates confirmed byte-identical — safe to deduplicate (keep first)
const dupRels   = dupGroups.map(([rel]) => rel);
const dupExtras = dupGroups.reduce((s, [, g]) => s + g.length - 1, 0);

const deduped = [];
const seenRels = new Set();
for (const f of normalized) {
  if (!seenRels.has(f.rel)) {
    seenRels.add(f.rel);
    deduped.push(f);
  }
}

// ── step 3: split active vs archive ───────────────────────────────────────────

const archiveEntries  = deduped.filter(f => isArchive(f.rel));
const active          = deduped.filter(f => !isArchive(f.rel));

const archiveCount    = normalized.filter(f => isArchive(f.rel)).length;
const dupesRemoved    = dupExtras;
const archivesExcluded = archiveEntries.length;
const after           = active.length;

// ── step 4: report ────────────────────────────────────────────────────────────

console.log('Before:');
console.log(`  total entries        : ${before}`);
console.log(`  backslash paths      : ${withBackslash}`);
console.log(`  archive entries      : ${archiveCount}`);
console.log(`  rels with duplicates : ${dupRels.length}  (${dupExtras} extra copies, all byte-identical ✓)`);
console.log();
console.log('After normalization:');
console.log(`  duplicate extras removed  : ${dupesRemoved}`);
console.log(`  archive entries excluded  : ${archivesExcluded}`);
console.log(`  active unique files       : ${after}`);
console.log();

if (VERBOSE) {
  if (dupRels.length > 0) {
    console.log('Deduplicated rels (byte-identical copies collapsed):');
    for (const rel of dupRels) console.log('  [dup]    ', rel);
    console.log();
  }
  if (archiveEntries.length > 0) {
    console.log('Archive rels excluded:');
    for (const f of archiveEntries) console.log('  [archive]', f.rel);
    console.log();
  }
}

// ── step 5: write diff log (always, even in dry-run) ─────────────────────────

mkdirSync(path.join(ROOT, '.tmp'), { recursive: true });

const diffLog = {
  generatedAt         : new Date().toISOString(),
  mode                : WRITE ? 'write' : 'dry-run',
  graphPath           : GRAPH_PATH,
  before              : { totalEntries: before, backslashPaths: withBackslash, archiveEntries: archiveCount, dupRels: dupRels.length, dupExtras },
  after               : { activeUniqueFiles: after, archivesExcluded, dupesRemoved },
  safetyFloor         : Math.floor(before * 0.8),
  passedSafetyFloor   : after >= Math.floor(before * 0.8),
  conflicts           : [],  // non-empty would have triggered abort above
  deduplicatedRels    : dupRels,
  archiveRelsRemoved  : archiveEntries.map(f => f.rel),
};

writeFileSync(LOG_PATH, JSON.stringify(diffLog, null, 2), 'utf-8');
console.log(`📋 Diff log written: ${LOG_PATH}`);
console.log();

// ── step 6: write or report ───────────────────────────────────────────────────

if (WRITE) {
  // Safety floor: refuse if output is < 80% of input (catches runaway archive filters)
  const safetyFloor = Math.floor(before * 0.8);
  if (after < safetyFloor) {
    abort(
      `Post-normalization file count (${after}) is below 80% of input (${before}). Refusing to write.`,
      'Run --verbose to inspect what would be removed, or check isArchive() logic.'
    );
  }

  const patched = {
    ...graph,
    fileCount     : after,
    files         : active,
    _archiveCount : archivesExcluded,
    _normalizedAt : new Date().toISOString(),
  };

  writeFileSync(GRAPH_PATH, JSON.stringify(patched, null, 2), 'utf-8');
  console.log(`✅ Written: ${GRAPH_PATH}`);
  console.log(`   fileCount: ${before} → ${after}  (−${before - after} entries)`);
  console.log(`   Breakdown: −${dupesRemoved} dup copies, −${archivesExcluded} archive echoes`);
} else {
  console.log('DRY-RUN — pass --write to apply changes.');
  console.log();
  console.log('Downstream impact:');
  console.log(`  Postgres parent_atlas_documents : ${dupesRemoved + archivesExcluded} fewer potential conflict rows`);
  console.log('  Qdrant embed batch              : fewer duplicate vectors');
  console.log('  Redis hot sourceRefs            : no change (uses unique keys)');
  console.log();
  console.log('Next:');
  console.log('  node scripts/atlas/normalize-sourcerefs.mjs --write');
  console.log('  node scripts/atlas/promote-to-postgres.mjs --table parent_atlas_documents --dry-run');
}
