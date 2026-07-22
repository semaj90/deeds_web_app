#!/usr/bin/env node
/**
 * Gate 1: PageRank Split — pagerank_raw + authority_score
 *
 * Adds pagerank_raw (copy of current pagerank) and authority_score
 * (min-max normalized [0,1]) to graph_projection_nodes.
 *
 * Usage:
 *   npx tsx scripts/atlas/gate-1-pagerank-split.mts --dry-run
 *   npx tsx scripts/atlas/gate-1-pagerank-split.mts --apply
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load env from .env.local first, then sveltekit-frontend/.env
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), 'sveltekit-frontend/.env') });

const { Pool } = pg;

// Support both DATABASE_URL and individual PG* vars
const connectionString = process.env.DATABASE_URL
  || `postgresql://${process.env.PGUSER || 'legal_admin'}:${process.env.PGPASSWORD || ''}@${process.env.PGHOST || '127.0.0.1'}:${process.env.PGPORT || '5434'}/${process.env.PGDATABASE || 'legal_ai_db'}`;

const pool = new Pool({ connectionString, max: 3 });

const args = process.argv.slice(2);
const dryRun = !args.includes('--apply');

async function main() {
  console.log('═'.repeat(80));
  console.log('GATE 1: PAGERANK SPLIT (pagerank_raw + authority_score)');
  console.log(dryRun ? '[DRY-RUN]' : '[APPLY]');
  console.log('═'.repeat(80));
  console.log();

  const client = await pool.connect();

  try {
    // Step 1: Check if graph_projection_nodes exists
    console.log('▶ Step 1: Checking table...');
    const tableCheck = await client.query(`
      SELECT COUNT(*) AS cnt FROM information_schema.tables
      WHERE table_name = 'graph_projection_nodes'
    `);
    const tableExists = parseInt(tableCheck.rows[0].cnt) > 0;

    if (!tableExists) {
      // Use atlas_packets fallback
      console.log('  ⚠️  graph_projection_nodes not found; checking atlas_packets...');
      const fallback = await client.query(`
        SELECT COUNT(*) AS cnt FROM information_schema.columns
        WHERE table_name = 'atlas_packets' AND column_name = 'pagerank'
      `);
      if (parseInt(fallback.rows[0].cnt) === 0) {
        console.log('  ❌ Neither table has pagerank column. Skipping — not yet computed.');
        console.log();
        console.log('GATE_1_STATUS: SKIP (pagerank not yet computed)');
        process.exit(0);
      }
      console.log('  Using atlas_packets.pagerank');
    }

    const table = tableExists ? 'graph_projection_nodes' : 'atlas_packets';
    console.log(`  ✅ Using table: ${table}`);
    console.log();

    // Step 2: Add columns
    console.log('▶ Step 2: Adding pagerank_raw and authority_score columns...');
    if (!dryRun) {
      await client.query(`
        ALTER TABLE ${table}
        ADD COLUMN IF NOT EXISTS pagerank_raw REAL,
        ADD COLUMN IF NOT EXISTS authority_score REAL
      `);
    }
    console.log(`  ✅ ${dryRun ? '[DRY-RUN] Would add' : 'Added'} columns`);
    console.log();

    // Step 3: Compute bounds
    console.log('▶ Step 3: Computing min/max bounds...');
    const boundsResult = await client.query(`
      SELECT
        MIN(pagerank)::real AS min_pr,
        MAX(pagerank)::real AS max_pr,
        COUNT(*) AS total_count
      FROM ${table}
      WHERE pagerank IS NOT NULL
    `);

    const { min_pr, max_pr, total_count } = boundsResult.rows[0];
    console.log(`  Min: ${min_pr}, Max: ${max_pr}, Total with pagerank: ${total_count}`);
    console.log();

    if (total_count === 0) {
      console.log('  ⚠️  No pagerank values found. SKIP.');
      process.exit(0);
    }

    const range = max_pr - min_pr;

    // Step 4: Populate pagerank_raw
    console.log('▶ Step 4: Copying pagerank → pagerank_raw...');
    if (!dryRun) {
      const res = await client.query(`
        UPDATE ${table}
        SET pagerank_raw = pagerank
        WHERE pagerank IS NOT NULL AND pagerank_raw IS NULL
      `);
      console.log(`  ✅ Updated ${res.rowCount} rows`);
    } else {
      console.log(`  [DRY-RUN] Would update ${total_count} rows`);
    }
    console.log();

    // Step 5: Populate authority_score
    console.log('▶ Step 5: Computing authority_score = (pr - min) / range...');
    if (!dryRun) {
      let res;
      if (range < 1e-9) {
        res = await client.query(`
          UPDATE ${table}
          SET authority_score = 0.5
          WHERE pagerank IS NOT NULL AND authority_score IS NULL
        `);
      } else {
        res = await client.query(`
          UPDATE ${table}
          SET authority_score = (pagerank - $1::real) / $2::real
          WHERE pagerank IS NOT NULL AND authority_score IS NULL
        `, [min_pr, range]);
      }
      console.log(`  ✅ Updated ${res.rowCount} rows`);
    } else {
      console.log(`  [DRY-RUN] Would normalize with range=${range}`);
    }
    console.log();

    // Step 6: Validate
    console.log('▶ Step 6: Validating...');
    let pass = true;

    if (dryRun) {
      console.log(`  [DRY-RUN] Would validate ${total_count} rows for pagerank_raw and authority_score`);
      console.log(`  [DRY-RUN] Expected: all authority_score in [0,1], no nulls`);
    } else {
      const valResult = await client.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(pagerank_raw) AS raw_count,
          COUNT(authority_score) AS auth_count,
          COUNT(CASE WHEN authority_score < 0 OR authority_score > 1 THEN 1 END) AS out_of_range
        FROM ${table}
      `);

      const v = valResult.rows[0];
      console.log(`  Total rows:              ${v.total}`);
      console.log(`  pagerank_raw populated:  ${v.raw_count}`);
      console.log(`  authority_score [0,1]:   ${v.auth_count}`);
      console.log(`  Out of range:            ${v.out_of_range}`);
      pass = parseInt(v.out_of_range) === 0;
    }
    console.log();
    console.log('═'.repeat(80));
    console.log(pass ? '✅ GATE 1 PASS' : '❌ GATE 1 FAIL');
    console.log('═'.repeat(80));
    process.exit(pass ? 0 : 1);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('❌ Fatal:', err.message);
  process.exit(1);
});
