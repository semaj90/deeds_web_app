#!/usr/bin/env node
/**
 * patch-qdrant-feature-ids.mjs
 *
 * Joins the 396-cluster NDJSON index (cluster-summary.ndjson) to every
 * Qdrant point in codebase_chunks_768 via somRow/somCol, then writes:
 *   som_cluster  — "row:col" string (canonical join key)
 *   feature_ids  — string[] from the cluster summary
 *   lane_ids     — string[] from the cluster summary
 *
 * Points that already have som_cluster set are skipped unless --force.
 *
 * Usage:
 *   node scripts/atlas/patch-qdrant-feature-ids.mjs
 *   node scripts/atlas/patch-qdrant-feature-ids.mjs --dry-run
 *   node scripts/atlas/patch-qdrant-feature-ids.mjs --force
 *   node scripts/atlas/patch-qdrant-feature-ids.mjs --dry-run --limit=500
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '../..');

const DRY_RUN  = process.argv.includes('--dry-run');
const FORCE    = process.argv.includes('--force');
const LIMIT_A  = process.argv.find(a => a.startsWith('--limit='));
const LIMIT    = LIMIT_A ? parseInt(LIMIT_A.split('=')[1]) : 0;  // 0 = all
const BATCH    = 200;

const QDRANT_URL        = process.env.QDRANT_URL        ?? 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION ?? 'codebase_chunks_768';

const NDJSON_PATH = join(ROOT, '..', '.opencode', 'ndjson', 'cluster-summary.ndjson');

// ── Load cluster → feature_ids map ───────────────────────────────────────────

if (!existsSync(NDJSON_PATH)) {
  console.error(`✗ cluster-summary.ndjson not found at ${NDJSON_PATH}`);
  console.error('  Run: npm run ndjson:mapreduce  (or graphify:full)');
  process.exit(1);
}

/** @type {Map<string, { feature_ids: string[], lane_ids: string[] }>} */
const clusterMap = new Map();

for (const line of readFileSync(NDJSON_PATH, 'utf8').split('\n')) {
  const t = line.trim();
  if (!t) continue;
  try {
    const entry = JSON.parse(t);
    const key = `${entry.som_row}:${entry.som_col}`;
    clusterMap.set(key, {
      feature_ids: Array.isArray(entry.feature_ids) ? entry.feature_ids : [],
      lane_ids: Array.isArray(entry.lane_ids) ? entry.lane_ids : [],
    });
  } catch { /* skip malformed line */ }
}

console.log(`▶ Loaded ${clusterMap.size} cluster entries from cluster-summary.ndjson`);
console.log(`  Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}${FORCE ? ' --force' : ''}${LIMIT ? ` --limit=${LIMIT}` : ' (all points)'}\n`);

// ── Scroll Qdrant and patch ───────────────────────────────────────────────────

async function qdrantSetPayload(points) {
  const res = await fetch(
    `${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/payload`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points }),
      signal: AbortSignal.timeout(30_000),
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Qdrant set_payload failed ${res.status}: ${text.slice(0, 200)}`);
  }
}

let scrollOffset = null;
let totalScanned = 0;
let totalPatched = 0;
let totalSkipped = 0;
let totalNoSom   = 0;

/** @type {Array<{id: string|number, payload: Record<string,unknown>}>} */
let patchBatch = [];

async function flushBatch() {
  if (!patchBatch.length) return;
  if (!DRY_RUN) {
    // Qdrant batch set_payload: one call per point (set_payload supports points[] array)
    for (const { id, payload } of patchBatch) {
      await fetch(
        `${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/payload`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points: [id], payload }),
          signal: AbortSignal.timeout(15_000),
        }
      );
    }
  }
  totalPatched += patchBatch.length;
  patchBatch = [];
}

let guard = 0;
while (guard < 500) {
  guard++;

  const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      limit: BATCH,
      offset: scrollOffset,
      with_payload: true,
      with_vector: false,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) { console.error('Qdrant scroll error', res.status); break; }
  const data = await res.json();
  const points = data?.result?.points ?? [];
  if (!points.length) break;

  for (const point of points) {
    totalScanned++;
    if (LIMIT && totalScanned > LIMIT) break;

    const p = point.payload ?? {};
    const somRow = p.somRow ?? p.som_row;
    const somCol = p.somCol ?? p.som_col;

    if (somRow == null || somCol == null) {
      totalNoSom++;
      continue;
    }

    const clusterKey = `${somRow}:${somCol}`;
    const entry = clusterMap.get(clusterKey);

    if (!entry) {
      totalNoSom++;
      continue;
    }

    // Skip already-patched unless --force
    if (!FORCE && p.som_cluster === clusterKey && Array.isArray(p.feature_ids) && p.feature_ids.length > 0) {
      totalSkipped++;
      continue;
    }

    patchBatch.push({
      id: point.id,
      payload: {
        som_cluster: clusterKey,
        feature_ids: entry.feature_ids,
        lane_ids:    entry.lane_ids,
      },
    });

    if (patchBatch.length >= BATCH) {
      process.stdout.write(`\r  patched ${totalPatched + patchBatch.length} / scanned ${totalScanned}...`);
      await flushBatch();
    }
  }

  if (LIMIT && totalScanned >= LIMIT) break;

  const next = data?.result?.next_page_offset;
  if (next === null || next === undefined || !points.length) break;
  scrollOffset = next;
}

await flushBatch();

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('\n');
console.log(`  Total scanned : ${totalScanned}`);
console.log(`  Patched       : ${totalPatched}${DRY_RUN ? ' (dry run — no writes)' : ''}`);
console.log(`  Skipped       : ${totalSkipped} (already had som_cluster + feature_ids)`);
console.log(`  No SOM coords : ${totalNoSom} (no somRow/somCol in payload)`);
console.log(`  Cluster map   : ${clusterMap.size} entries`);

if (DRY_RUN) {
  console.log('\n  Re-run without --dry-run to apply patches.');
} else {
  console.log('\n  ✓ Done. Re-run smoke:golden-retrieval to verify feature_ids now populate.');
}
