#!/usr/bin/env node
/**
 * prune-junk-qdrant-chunks.mjs
 *
 * Removes Qdrant points whose file_path matches known junk prefixes:
 *   .venv/          — Python virtualenv packages (12,132 points)
 *   granite-docling/ — model artefacts (17 points)
 *   node_modules/   — JS packages (0 currently, guard for future)
 *   deeds_labs/     — archived/parked routes
 *
 * These were indexed by an early run that lacked path filtering.
 * They pollute codebase search results with numpy/pip internals.
 *
 * Safe: Postgres codebase_chunk_index has 0 rows for these paths
 * (verified 2026-06-02), so there is no Postgres record to update.
 * Qdrant delete is the only action needed.
 *
 * Usage:
 *   node scripts/atlas/prune-junk-qdrant-chunks.mjs              # dry-run
 *   node scripts/atlas/prune-junk-qdrant-chunks.mjs --commit     # deletes
 *   node scripts/atlas/prune-junk-qdrant-chunks.mjs --prefix .venv  # one prefix
 *
 * Env:
 *   QDRANT_URL  default http://localhost:6333
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname }         from 'node:path';
import { fileURLToPath }            from 'node:url';
import dotenv                       from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '../..');
dotenv.config({ path: resolve(ROOT, '.env') });

// ── CLI ───────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const DRY_RUN   = !args.includes('--commit');
const VERBOSE   = args.includes('--verbose');
const getFlag   = (n) => {
  const eq = args.find(a => a.startsWith(`--${n}=`))?.split('=')[1];
  if (eq) return eq;
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
};
const PREFIX_FILTER = getFlag('prefix') ?? null;
const COLLECTION    = getFlag('collection') ?? 'codebase_chunks_768';
const QDRANT_URL    = (process.env.QDRANT_URL ?? 'http://localhost:6333').replace(/\/$/, '');
const TODAY         = new Date().toISOString().slice(0, 10);
const TMP_DIR       = resolve(ROOT, '.tmp');
const REPORT_OUT    = resolve(TMP_DIR, `prune-junk-qdrant-chunks-${TODAY}.json`);
const SCROLL_LIMIT  = 500; // points per scroll page
const DELETE_BATCH  = 500; // Qdrant delete batch size

// Junk prefixes — paths under these should never appear in codebase search
const JUNK_PREFIXES = [
  '.venv/',
  '.venv\\',
  'node_modules/',
  'deeds_labs/',
  'granite-docling/',
  'models/embeddinggemma',   // raw model weights, not source
  'scripts/api-cleanup/',    // archived report artifacts from old cleanup pass
  '../scripts/api-cleanup/', // same with leading ../ from old indexer working dir
];

// ── Qdrant helpers ────────────────────────────────────────────────────
async function qdrantPost(path, body) {
  const res = await fetch(`${QDRANT_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Qdrant ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// Count matching points in Qdrant for a given file_path substring
async function countJunkPoints(prefix) {
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/count`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: { must: [{ key: 'file_path', match: { text: prefix.replace(/\/$/, '') } }] },
        exact: true,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const d = await res.json();
    return d.result?.count ?? 0;
  } catch { return -1; }
}

// Scroll all point IDs matching a file_path substring
async function* scrollJunkIds(prefix) {
  let offset = null;
  const searchPrefix = prefix.replace(/\/$/, '').replace(/\\/g, '/');
  while (true) {
    const body = {
      limit: SCROLL_LIMIT,
      with_payload: ['file_path'],
      with_vector: false,
      filter: {
        must: [{ key: 'file_path', match: { text: searchPrefix } }],
      },
    };
    if (offset) body.offset = offset;

    const res = await qdrantPost(`/collections/${COLLECTION}/points/scroll`, body);
    const pts = res.result?.points ?? [];
    if (pts.length === 0) break;

    for (const pt of pts) {
      // Double-check: substring match may be too broad — verify actual prefix
      const fp = pt.payload?.file_path ?? '';
      const normalized = fp.replace(/\\/g, '/');
      if (JUNK_PREFIXES.some(p => normalized.startsWith(p.replace(/\\/g, '/')))) {
        yield pt.id;
      }
    }

    offset = res.result?.next_page_offset ?? null;
    if (!offset) break;
  }
}

// Delete a batch of point IDs from Qdrant
async function deletePoints(ids) {
  if (!ids.length || DRY_RUN) return;
  await qdrantPost(`/collections/${COLLECTION}/points/delete?wait=true`, {
    points: ids,
  });
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n[prune-junk-qdrant-chunks] ${DRY_RUN ? 'DRY RUN' : 'COMMIT MODE'}`);
  console.log(`  Collection: ${COLLECTION}`);
  console.log(`  Qdrant:     ${QDRANT_URL}`);
  if (PREFIX_FILTER) console.log(`  Prefix filter: ${PREFIX_FILTER}`);

  mkdirSync(TMP_DIR, { recursive: true });

  // Verify Qdrant reachable
  try {
    const hc = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, { signal: AbortSignal.timeout(5000) });
    if (!hc.ok) throw new Error(`HTTP ${hc.status}`);
    const info = await hc.json();
    console.log(`  Collection: ${info.result?.points_count ?? '?'} total points`);
  } catch (err) {
    console.error(`  Qdrant not reachable: ${err.message}`);
    if (!DRY_RUN) process.exit(1);
    console.log('  (dry-run: continuing)\n');
  }

  // Count junk per prefix
  const prefixes = PREFIX_FILTER ? [PREFIX_FILTER] : JUNK_PREFIXES;
  console.log('\n  Counting junk points per prefix...');
  for (const p of prefixes) {
    const n = await countJunkPoints(p);
    console.log(`  ${p.padEnd(35)} ${n >= 0 ? n : 'error'} points`);
  }

  // Scroll and collect all IDs to delete
  console.log('\n  Collecting point IDs to delete...');
  const allIds = [];
  const byPrefix = {};

  for (const prefix of prefixes) {
    const ids = [];
    for await (const id of scrollJunkIds(prefix)) {
      ids.push(id);
    }
    byPrefix[prefix] = ids.length;
    allIds.push(...ids);
    console.log(`  ${prefix.padEnd(35)} collected ${ids.length} IDs`);
  }

  // Deduplicate (a point could match multiple prefix patterns)
  const uniqueIds = [...new Set(allIds)];
  console.log(`\n  Total to delete: ${uniqueIds.length} points (${allIds.length - uniqueIds.length} cross-prefix dupes removed)`);

  if (uniqueIds.length === 0) {
    console.log('  Nothing to prune.');
    const report = { generatedAt: new Date().toISOString(), dryRun: DRY_RUN, deleted: 0, byPrefix };
    writeFileSync(REPORT_OUT, JSON.stringify(report, null, 2));
    console.log(`  Report: ${REPORT_OUT}`);
    return;
  }

  // Delete in batches
  let deleted = 0;
  let errors = 0;
  for (let i = 0; i < uniqueIds.length; i += DELETE_BATCH) {
    const batch = uniqueIds.slice(i, i + DELETE_BATCH);
    try {
      if (!DRY_RUN) {
        await deletePoints(batch);
      }
      deleted += batch.length;
      if (VERBOSE || DRY_RUN) {
        console.log(`  ${DRY_RUN ? '[dry]' : '✓'} batch ${Math.floor(i / DELETE_BATCH) + 1}: ${batch.length} points`);
      } else {
        process.stdout.write(`  deleted ${deleted}/${uniqueIds.length}\r`);
      }
    } catch (err) {
      console.error(`\n  ERR batch ${i}: ${err.message}`);
      errors++;
    }
  }
  if (!VERBOSE && !DRY_RUN) process.stdout.write('\n');

  // Final collection count
  let finalCount = null;
  try {
    const hc = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, { signal: AbortSignal.timeout(5000) });
    const d = await hc.json();
    finalCount = d.result?.points_count ?? null;
    if (finalCount !== null) console.log(`  Remaining points: ${finalCount}`);
  } catch { /* ignore */ }

  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: DRY_RUN,
    collection: COLLECTION,
    summary: {
      totalDeleted: deleted,
      errors,
      finalCollectionSize: finalCount,
    },
    byPrefix,
    junkPrefixes: JUNK_PREFIXES,
  };

  writeFileSync(REPORT_OUT, JSON.stringify(report, null, 2));

  console.log(`\n[prune-junk-qdrant-chunks] Done`);
  console.log(`  Deleted: ${deleted}${DRY_RUN ? ' (dry)' : ''}`);
  console.log(`  Errors:  ${errors}`);
  console.log(`  Report:  ${REPORT_OUT}`);
  if (DRY_RUN) console.log('\n  Re-run with --commit to delete from Qdrant.');
}

main().catch(e => { console.error(e); process.exit(1); });
