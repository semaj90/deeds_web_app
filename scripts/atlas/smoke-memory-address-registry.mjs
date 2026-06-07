#!/usr/bin/env node
/**
 * smoke-memory-address-registry.mjs
 *
 * READ-ONLY smoke test for atlas_memory_address_registry.
 * Checks:
 *   1. Table exists and has rows
 *   2. Both storage_lane values present (postgres, qdrant)
 *   3. Both retrieval_lane values present (atlas, karpathy)
 *   4. source_ref_id FK integrity — all source_ref_ids resolve in parent_atlas_documents
 *   5. Feature-id coverage — % of rows with non-null feature_id
 *   6. Qdrant coverage — % of rows with embedding_id (qdrant lane)
 *   7. No duplicate (source_ref, storage_lane) pairs
 *
 * Exits 0 on all PASS, 1 on any FAIL.
 */

import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(ROOT, 'sveltekit-frontend', '.env') });

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new pg.Pool({ connectionString: DB_URL });

function pass(label, detail) { return { ok: true,  label, detail }; }
function fail(label, detail) { return { ok: false, label, detail }; }

async function main() {
  const client = await pool.connect();
  const checks = [];

  try {
    // 1. Row count
    const { rows: [{ total }] } = await client.query(
      `SELECT COUNT(*)::int AS total FROM atlas_memory_address_registry`
    );
    checks.push(total > 0
      ? pass('table has rows', `${total} rows`)
      : fail('table has rows', 'table is empty — run npm run atlas:memory-address:seed'));

    // 2. storage_lane coverage
    const { rows: lanes } = await client.query(
      `SELECT DISTINCT storage_lane FROM atlas_memory_address_registry ORDER BY storage_lane`
    );
    const laneSet = new Set(lanes.map(r => r.storage_lane));
    checks.push(laneSet.has('postgres')
      ? pass('postgres storage_lane present', `lanes: ${[...laneSet].join(', ')}`)
      : fail('postgres storage_lane present', `only: ${[...laneSet].join(', ')}`));
    checks.push(laneSet.has('qdrant')
      ? pass('qdrant storage_lane present', `lanes: ${[...laneSet].join(', ')}`)
      : fail('qdrant storage_lane present', 'no qdrant rows — check Qdrant point id backfill'));

    // 3. retrieval_lane coverage
    const { rows: rlanes } = await client.query(
      `SELECT DISTINCT retrieval_lane FROM atlas_memory_address_registry ORDER BY retrieval_lane`
    );
    const rlaneSet = new Set(rlanes.map(r => r.retrieval_lane));
    checks.push(rlaneSet.has('atlas') && rlaneSet.has('karpathy')
      ? pass('retrieval lanes atlas + karpathy present', `${[...rlaneSet].join(', ')}`)
      : fail('retrieval lanes atlas + karpathy present', `only: ${[...rlaneSet].join(', ')}`));

    // 4. FK integrity
    const { rows: [{ orphans }] } = await client.query(`
      SELECT COUNT(*)::int AS orphans
      FROM atlas_memory_address_registry r
      WHERE r.source_ref_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM parent_atlas_documents p WHERE p.id = r.source_ref_id
        )
    `);
    checks.push(orphans === 0
      ? pass('FK integrity — all source_ref_ids resolve', 'no orphaned FKs')
      : fail('FK integrity', `${orphans} rows have broken source_ref_id FKs`));

    // 5. feature_id coverage
    const { rows: [{ with_fid, pct_fid }] } = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE feature_id IS NOT NULL)::int AS with_fid,
        ROUND(100.0 * COUNT(*) FILTER (WHERE feature_id IS NOT NULL) / NULLIF(COUNT(*),0), 1) AS pct_fid
      FROM atlas_memory_address_registry
    `);
    checks.push(parseFloat(pct_fid) >= 50
      ? pass(`feature_id coverage ${pct_fid}%`, `${with_fid}/${total} rows have feature_id`)
      : fail(`feature_id coverage ${pct_fid}%`, `only ${with_fid}/${total} — backfill feature_id from atlas_feature_map`));

    // 6. Qdrant / embedding coverage
    const { rows: [{ qdrant_rows, pct_qdrant }] } = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE storage_lane = 'qdrant')::int AS qdrant_rows,
        ROUND(100.0 * COUNT(*) FILTER (WHERE storage_lane = 'qdrant') / NULLIF(COUNT(*),0), 1) AS pct_qdrant
      FROM atlas_memory_address_registry
    `);
    checks.push(parseFloat(pct_qdrant) >= 20
      ? pass(`Qdrant row coverage ${pct_qdrant}%`, `${qdrant_rows} qdrant-lane rows`)
      : fail(`Qdrant row coverage ${pct_qdrant}%`, 'less than 20% — check Qdrant point id population'));

    // 7. Duplicate (source_ref, storage_lane) check
    const { rows: [{ dupes }] } = await client.query(`
      SELECT COUNT(*)::int AS dupes FROM (
        SELECT source_ref, storage_lane, COUNT(*) AS n
        FROM atlas_memory_address_registry
        GROUP BY source_ref, storage_lane
        HAVING COUNT(*) > 1
      ) sub
    `);
    checks.push(dupes === 0
      ? pass('no duplicate (source_ref, storage_lane) pairs', 'clean')
      : fail('no duplicate (source_ref, storage_lane) pairs', `${dupes} duplicate pairs`));

  } finally {
    client.release();
    await pool.end();
  }

  const passed = checks.filter(c => c.ok).length;
  const failed = checks.filter(c => !c.ok).length;

  // stderr = human diagnostics
  process.stderr.write(`\natlas_memory_address_registry smoke\n`);
  for (const c of checks) {
    process.stderr.write(`  ${c.ok ? 'PASS' : 'FAIL'} ${c.label}: ${c.detail}\n`);
  }
  process.stderr.write(`\n${passed} PASS / ${failed} FAIL\n`);

  // stdout = machine JSON
  console.log(JSON.stringify({ ok: failed === 0, passed, failed, checks }));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  process.stderr.write(`[smoke-memory-address-registry] fatal: ${err.message}\n`);
  process.exit(1);
});
