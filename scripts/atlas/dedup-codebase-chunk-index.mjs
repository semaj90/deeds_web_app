#!/usr/bin/env node
/**
 * dedup-codebase-chunk-index.mjs
 *
 * Removes duplicate rows from codebase_chunk_index where the same relative_path
 * appears multiple times (caused by re-index runs without ON CONFLICT handling).
 *
 * Strategy per duplicate group:
 *   KEEP  — row with non-null chunk_id, OR if all null, the one with the most
 *            complete payload (non-null content_hash, non-null semantic_tags).
 *            Tie-break: most recently updated.
 *   DELETE — all other rows for that path.
 *   PRUNE  — delete corresponding Qdrant points for deleted rows (by qdrant_id).
 *
 * Safety:
 *   - Dry-run by default (--commit to write)
 *   - Only touches paths with COUNT(*) > 1
 *   - Never deletes the KEEP row
 *   - Writes audit report: kept / deleted / qdrant_pruned / errors
 *
 * Usage:
 *   node scripts/atlas/dedup-codebase-chunk-index.mjs              # dry-run
 *   node scripts/atlas/dedup-codebase-chunk-index.mjs --commit     # writes
 *   node scripts/atlas/dedup-codebase-chunk-index.mjs --limit 50   # cap files
 *   node scripts/atlas/dedup-codebase-chunk-index.mjs --no-qdrant  # skip Qdrant prune
 */

import pg      from 'pg';
import dotenv  from 'dotenv';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname }         from 'node:path';
import { fileURLToPath }            from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '../..');
dotenv.config({ path: resolve(ROOT, '.env') });

// ── CLI ───────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const DRY_RUN   = !args.includes('--commit');
const NO_QDRANT = args.includes('--no-qdrant');
const VERBOSE   = args.includes('--verbose');
const getFlag   = (n) => {
  const eq = args.find(a => a.startsWith(`--${n}=`))?.split('=')[1];
  if (eq) return eq;
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
};
const LIMIT      = parseInt(getFlag('limit') ?? '0', 10); // 0 = all dupes
const COLLECTION = getFlag('collection') ?? 'codebase_chunks_768';
const QDRANT_URL = (process.env.QDRANT_URL ?? 'http://localhost:6333').replace(/\/$/, '');
const DB_URL     = process.env.DATABASE_URL;
const TODAY      = new Date().toISOString().slice(0, 10);
const TMP_DIR    = resolve(ROOT, '.tmp');
const REPORT_OUT = resolve(TMP_DIR, `dedup-codebase-chunk-index-${TODAY}.json`);

// ── Qdrant delete ─────────────────────────────────────────────────────
async function qdrantDeletePoints(ids) {
  if (!ids.length || DRY_RUN || NO_QDRANT) return;
  const res = await fetch(
    `${QDRANT_URL}/collections/${COLLECTION}/points/delete?wait=true`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points: ids }),
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!res.ok) throw new Error(`Qdrant delete ${res.status}: ${await res.text()}`);
}

// ── Score a row — higher = better candidate to KEEP ───────────────────
function scoreRow(row) {
  let s = 0;
  if (row.chunk_id)      s += 10;
  if (row.content_hash)  s += 5;
  if (row.semantic_tags?.length) s += 3;
  if (row.gpu_cluster !== null)  s += 2;
  if (row.som_cluster !== null)  s += 1;
  if (row.qdrant_id)     s += 4; // has a Qdrant pointer = was indexed
  return s;
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n[dedup-codebase-chunk-index] ${DRY_RUN ? 'DRY RUN' : 'COMMIT MODE'}`);
  console.log(`  Qdrant prune: ${NO_QDRANT ? 'disabled' : 'enabled'}`);
  if (LIMIT) console.log(`  Limit: ${LIMIT} files`);

  if (!DB_URL) { console.error('DATABASE_URL not set'); process.exit(1); }
  mkdirSync(TMP_DIR, { recursive: true });

  const pool = new pg.Pool({ connectionString: DB_URL });
  const client = await pool.connect();

  const stats = {
    duplicateFiles: 0,
    rowsKept: 0,
    rowsDeleted: 0,
    qdrantPruned: 0,
    errors: [],
    kept: [],
    deleted: [],
  };

  try {
    // Find paths where the SAME content_hash appears more than once (true dupes).
    // Files with all-distinct content_hashes are legitimate multi-chunk splits —
    // those must NOT be touched.
    //
    // We also catch the edge case where content_hash IS NULL for all rows:
    // those are indexing-run artefacts with no content identity at all.
    const limitClause = LIMIT > 0 ? `LIMIT ${LIMIT}` : '';
    const { rows: dupePaths } = await client.query(`
      SELECT relative_path,
             COUNT(*) AS n,
             COUNT(DISTINCT content_hash) AS distinct_hashes,
             SUM(CASE WHEN content_hash IS NULL THEN 1 ELSE 0 END) AS null_hash_count
      FROM codebase_chunk_index
      WHERE relative_path IS NOT NULL
      GROUP BY relative_path
      HAVING COUNT(*) > 1
        AND (
          -- All content_hashes are NULL (bad indexing run) → entire group is dupes
          SUM(CASE WHEN content_hash IS NULL THEN 1 ELSE 0 END) = COUNT(*)
          OR
          -- Some content_hashes repeat within the group → intra-file dupes
          COUNT(*) > COUNT(DISTINCT content_hash)
        )
      ORDER BY COUNT(*) DESC
      ${limitClause}
    `);

    console.log(`\n  Duplicate paths found: ${dupePaths.length}`);
    if (dupePaths.length === 0) {
      console.log('  Nothing to dedup.');
      await pool.end();
      return;
    }

    stats.duplicateFiles = dupePaths.length;

    for (const { relative_path, n } of dupePaths) {
      // Fetch all rows for this path
      const { rows } = await client.query(`
        SELECT id, qdrant_id, chunk_id, content_hash, semantic_tags,
               neo4j_gpu_cluster AS gpu_cluster, som_cluster, updated_at
        FROM codebase_chunk_index
        WHERE relative_path = $1
        ORDER BY updated_at DESC NULLS LAST
      `, [relative_path]);

      // Partition rows into groups by content_hash.
      //   - NULL hashes: all are dupes of each other — keep best-scored one
      //   - Same hash repeated: keep best-scored, delete rest
      //   - Unique hash: legitimate chunk — always keep
      const byHash = new Map(); // hash → rows[]
      const nullHashRows = [];
      for (const r of rows) {
        if (!r.content_hash) { nullHashRows.push(r); continue; }
        if (!byHash.has(r.content_hash)) byHash.set(r.content_hash, []);
        byHash.get(r.content_hash).push(r);
      }

      const toDelete = [];

      // Handle NULL-hash rows: keep best-scored one, delete rest
      if (nullHashRows.length > 0) {
        const scored = nullHashRows.map(r => ({ ...r, score: scoreRow(r) }));
        scored.sort((a, b) => b.score - a.score);
        toDelete.push(...scored.slice(1)); // delete all but best
      }

      // Handle hash groups: keep best, delete duplicates; skip singletons
      for (const [, group] of byHash) {
        if (group.length === 1) continue; // unique chunk — always keep
        const scored = group.map(r => ({ ...r, score: scoreRow(r) }));
        scored.sort((a, b) => b.score - a.score);
        toDelete.push(...scored.slice(1));
      }

      const keep = rows[0]; // for logging only

      if (VERBOSE) {
        console.log(`\n  ${relative_path} (${n} rows)`);
        console.log(`    KEEP  id=${keep.id} score=${keep.score} qdrant=${keep.qdrant_id ?? 'null'}`);
        toDelete.forEach(r => console.log(`    DEL   id=${r.id} score=${r.score} qdrant=${r.qdrant_id ?? 'null'}`));
      }

      // Delete IDs to remove from Postgres
      const deleteIds = toDelete.map(r => r.id);
      // Qdrant IDs to prune (only rows that have a qdrant_id)
      const qdrantIds = toDelete.filter(r => r.qdrant_id).map(r => r.qdrant_id);

      stats.rowsKept++;

      try {
        if (!DRY_RUN) {
          // Delete from Postgres
          await client.query(
            `DELETE FROM codebase_chunk_index WHERE id = ANY($1::uuid[])`,
            [deleteIds],
          );

          // Prune from Qdrant
          if (qdrantIds.length && !NO_QDRANT) {
            await qdrantDeletePoints(qdrantIds);
            stats.qdrantPruned += qdrantIds.length;
          }
        }

        stats.rowsDeleted += deleteIds.length;
        stats.kept.push({ path: relative_path, keepId: keep.id, score: keep.score });
        stats.deleted.push(...deleteIds.map(id => ({ id, path: relative_path })));

      } catch (err) {
        console.error(`  ERR ${relative_path}: ${err.message}`);
        stats.errors.push({ path: relative_path, error: err.message });
      }
    }

  } finally {
    client.release();
    await pool.end();
  }

  // Report
  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: DRY_RUN,
    collection: COLLECTION,
    summary: {
      duplicateFiles: stats.duplicateFiles,
      rowsKept: stats.rowsKept,
      rowsDeleted: stats.rowsDeleted,
      qdrantPruned: stats.qdrantPruned,
      errors: stats.errors.length,
    },
    errors: stats.errors,
    kept: stats.kept.slice(0, 50),
    deletedSample: stats.deleted.slice(0, 50),
  };

  writeFileSync(REPORT_OUT, JSON.stringify(report, null, 2));

  console.log(`\n[dedup-codebase-chunk-index] Done`);
  console.log(`  Duplicate files:  ${stats.duplicateFiles}`);
  console.log(`  Rows kept:        ${stats.rowsKept}`);
  console.log(`  Rows deleted:     ${stats.rowsDeleted}${DRY_RUN ? ' (dry)' : ''}`);
  console.log(`  Qdrant pruned:    ${stats.qdrantPruned}${DRY_RUN ? ' (dry)' : ''}`);
  console.log(`  Errors:           ${stats.errors.length}`);
  console.log(`  Report:           ${REPORT_OUT}`);
  if (DRY_RUN) console.log('\n  Re-run with --commit to apply.');
}

main().catch(e => { console.error(e); process.exit(1); });
