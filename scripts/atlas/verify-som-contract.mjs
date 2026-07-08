#!/usr/bin/env node
/**
 * Smoke test 3: SOM / topology readiness
 *
 * Checks that atlas_packets rows with SOM coordinates are valid:
 *   - som_row in [0, 19]
 *   - som_col in [0, 19]
 *   - som_index in [0, 399]
 *   - no ghost cells > 399 (the "799/400" bug)
 *
 * Usage:
 *   node scripts/atlas/verify-som-contract.mjs
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve('.', '.env') });
config({ path: resolve('.', 'sveltekit-frontend/.env.local'), override: false });

const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
});

const SOM_SIZE = 20; // 20×20 grid
const MAX_INDEX = SOM_SIZE * SOM_SIZE - 1; // 399

let exitCode = 0;

function check(label, ok, value, warn = false) {
  const icon = ok ? '✅' : (warn ? '⚠️ ' : '❌');
  console.log(`  ${icon} ${label}: ${value}`);
  if (!ok && !warn) exitCode = 1;
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  Smoke Test 3: SOM / Topology Contract           ║');
  console.log(`║  Grid: ${SOM_SIZE}×${SOM_SIZE} = ${MAX_INDEX + 1} cells`.padEnd(51) + '║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  let client;
  try {
    client = await pgPool.connect();

    const res = await client.query(`
      SELECT
        COUNT(*)                                                              AS total,
        COUNT(som_row)                                                        AS with_som_row,
        COUNT(som_col)                                                        AS with_som_col,
        COUNT(som_index)                                                      AS with_som_index,
        COUNT(CASE WHEN som_row < 0 OR som_row >= ${SOM_SIZE} THEN 1 END)    AS bad_row,
        COUNT(CASE WHEN som_col < 0 OR som_col >= ${SOM_SIZE} THEN 1 END)    AS bad_col,
        COUNT(CASE WHEN som_index < 0 OR som_index > ${MAX_INDEX} THEN 1 END) AS bad_index,
        MIN(som_row) AS min_row, MAX(som_row) AS max_row,
        MIN(som_col) AS min_col, MAX(som_col) AS max_col,
        MIN(som_index) AS min_idx, MAX(som_index) AS max_idx,
        COUNT(DISTINCT som_index) AS distinct_cells
      FROM atlas_packets
    `);

    const r = res.rows[0];
    const total = Number(r.total);
    const withRow = Number(r.with_som_row);
    const coverage = total > 0 ? ((withRow / total) * 100).toFixed(1) : '0.0';

    console.log(`  Total packets: ${total}`);
    console.log(`  SOM populated: ${withRow} (${coverage}%)\n`);

    check('som_row populated', withRow > 0, `${withRow}/${total} (${coverage}%)`, withRow < total);
    check('som_col populated', Number(r.with_som_col) === withRow,
      `${r.with_som_col}/${withRow}`);
    check('som_index populated', Number(r.with_som_index) === withRow,
      `${r.with_som_index}/${withRow}`);

    if (withRow > 0) {
      console.log(`\n  Range check (populated rows only):`);
      check(`som_row in [0, ${SOM_SIZE - 1}]`,
        Number(r.bad_row) === 0,
        `bad: ${r.bad_row}, range [${r.min_row}–${r.max_row}]`);
      check(`som_col in [0, ${SOM_SIZE - 1}]`,
        Number(r.bad_col) === 0,
        `bad: ${r.bad_col}, range [${r.min_col}–${r.max_col}]`);
      check(`som_index in [0, ${MAX_INDEX}] (no ghost cells)`,
        Number(r.bad_index) === 0,
        `bad: ${r.bad_index}, range [${r.min_idx}–${r.max_idx}]`);
      check('distinct cells used',
        Number(r.distinct_cells) > 0,
        `${r.distinct_cells} / ${MAX_INDEX + 1} cells occupied`);
    }

    // coords_4d check (optional column — only if it exists)
    try {
      const c4d = await client.query(`
        SELECT COUNT(*) AS with_coords
        FROM atlas_packets
        WHERE coords_4d IS NOT NULL
      `);
      check('coords_4d present (advisory)',
        Number(c4d.rows[0].with_coords) > 0,
        `${c4d.rows[0].with_coords} rows`,
        true);
    } catch {
      check('coords_4d column', false, 'column not found — run phase 3b topology backfill', true);
    }

    // Sample
    if (withRow > 0) {
      const sample = await client.query(`
        SELECT packet_key, source_ref, som_row, som_col, som_index, som_cluster
        FROM atlas_packets
        WHERE som_row IS NOT NULL
        LIMIT 3
      `);
      console.log('\n  Sample SOM rows:');
      for (const row of sample.rows) {
        console.log(`    [${row.som_row},${row.som_col}] idx=${row.som_index} cluster=${row.som_cluster ?? 'null'} — ${row.source_ref}`);
      }
    }

  } catch (err) {
    console.error(`\n❌ DB error: ${err.message}`);
    exitCode = 1;
  } finally {
    client?.release();
    await pgPool.end();
  }

  console.log(`\n  Result: ${exitCode === 0 ? '✅ PASS' : '❌ FAIL'}\n`);
  process.exit(exitCode);
}

main();
