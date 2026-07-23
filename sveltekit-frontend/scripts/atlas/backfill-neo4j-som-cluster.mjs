#!/usr/bin/env node
/**
 * backfill-neo4j-som-cluster.mjs
 *
 * Backfills som_row, som_col, som_cluster (20×20 SOM grid) onto Neo4j Packet nodes.
 *
 * Join key: Packet.path (Neo4j) = atlas_packets.source_ref (Postgres)
 *
 * Sets three properties on matching Packet nodes:
 *   - som_row   (integer 0–19)
 *   - som_col   (integer 0–19)
 *   - som_cluster_20x20 (integer 0–399 = row * 20 + col)
 *
 * Note: som_cluster already on nodes is from K-means (different system).
 *       som_cluster_20x20 is the SOM grid cluster. Both coexist.
 *
 * Usage:
 *   node scripts/atlas/backfill-neo4j-som-cluster.mjs --dry-run
 *   node scripts/atlas/backfill-neo4j-som-cluster.mjs --apply
 *   node scripts/atlas/backfill-neo4j-som-cluster.mjs --apply --batch-size 500
 */

import pg from 'pg';
import neo4j from 'neo4j-driver';

const DRY_RUN     = !process.argv.includes('--apply');
const BATCH_SIZE  = parseInt(
  process.argv.find(a => a.startsWith('--batch-size='))?.split('=')[1] ?? '500'
);

const NEO4J_URL      = process.env.NEO4J_URL      || 'bolt://127.0.0.1:7687';
const NEO4J_USER     = process.env.NEO4J_USER     || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j123';

const pool = new pg.Pool({
  host:     process.env.DB_HOST     || '127.0.0.1',
  port:     parseInt(process.env.DB_PORT || '5434'),
  user:     process.env.DB_USER     || 'legal_admin',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME     || 'legal_ai_db',
});

const driver = neo4j.driver(
  NEO4J_URL,
  neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
  { disableLosslessIntegers: true }
);

async function main() {
  console.log(`\n🔄 Neo4j SOM Cluster Backfill — ${DRY_RUN ? 'DRY RUN' : 'APPLY'}\n`);
  console.log(`  Neo4j:      ${NEO4J_URL}`);
  console.log(`  Batch size: ${BATCH_SIZE}\n`);

  // Step 1: Load SOM coordinates from Postgres
  console.log('[1/3] Loading SOM coordinates from atlas_packets...');
  const pgResult = await pool.query(`
    SELECT source_ref, som_row, som_col,
           (som_row * 20 + som_col) AS som_cluster_20x20
    FROM atlas_packets
    WHERE som_row IS NOT NULL AND som_col IS NOT NULL
  `);

  const bySourceRef = new Map();
  for (const row of pgResult.rows) {
    if (row.source_ref) bySourceRef.set(row.source_ref, row);
  }
  console.log(`  ✓ Loaded ${pgResult.rows.length} packets with SOM coords`);
  console.log(`    unique source_refs: ${bySourceRef.size}\n`);

  // Step 2: Get all Packet nodes from Neo4j
  console.log('[2/3] Loading Packet nodes from Neo4j...');
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });

  let neo4jNodes = [];
  try {
    const result = await session.run(
      'MATCH (n:Packet) WHERE n.path IS NOT NULL RETURN n.path AS path, elementId(n) AS eid, n.som_row AS existing_row'
    );
    neo4jNodes = result.records.map(r => ({
      path: r.get('path'),
      eid:  r.get('eid'),
      hasRow: r.get('existing_row') != null,
    }));
  } finally {
    await session.close();
  }

  console.log(`  ✓ Loaded ${neo4jNodes.length} Packet nodes (${neo4jNodes.filter(n => !n.hasRow).length} need SOM coords)\n`);

  // Step 3: Match and batch update
  console.log('[3/3] Matching and updating Neo4j nodes...');

  let totalMatched   = 0;
  let totalNoMatch   = 0;
  let totalAlreadySet = 0;
  let totalUpdated   = 0;

  // Build update batches
  const updates = [];
  for (const node of neo4jNodes) {
    if (node.hasRow) {
      totalAlreadySet++;
      continue;
    }
    const pg = bySourceRef.get(node.path);
    if (!pg) {
      totalNoMatch++;
      continue;
    }
    totalMatched++;
    updates.push({
      eid:              node.eid,
      som_row:          pg.som_row,
      som_col:          pg.som_col,
      som_cluster_20x20: pg.som_cluster_20x20,
    });
  }

  console.log(`  Matched: ${totalMatched}, No match: ${totalNoMatch}, Already set: ${totalAlreadySet}`);

  if (!DRY_RUN && updates.length > 0) {
    const writeSession = driver.session({ defaultAccessMode: neo4j.session.WRITE });
    try {
      for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const batch = updates.slice(i, i + BATCH_SIZE);

        await writeSession.run(
          `UNWIND $batch AS upd
           MATCH (n) WHERE elementId(n) = upd.eid
           SET n.som_row          = upd.som_row,
               n.som_col          = upd.som_col,
               n.som_cluster_20x20 = upd.som_cluster_20x20`,
          { batch }
        );

        totalUpdated += batch.length;
        process.stdout.write(`\r  Updated ${totalUpdated}/${updates.length}`);
      }
      console.log('');
    } finally {
      await writeSession.close();
    }
  } else {
    totalUpdated = updates.length; // dry-run count
  }

  console.log(`\n✅ Summary:`);
  console.log(`  Total Packet nodes:  ${neo4jNodes.length}`);
  console.log(`  Already had SOM:     ${totalAlreadySet}`);
  console.log(`  Matched & updated:   ${totalUpdated}`);
  console.log(`  No match:            ${totalNoMatch}`);
  console.log(`  Match rate:          ${neo4jNodes.length > 0 ? ((totalMatched / neo4jNodes.length) * 100).toFixed(1) : 0}%`);

  if (DRY_RUN) {
    console.log('\n  ℹ️  DRY RUN — no writes made. Re-run with --apply to apply.\n');
  } else {
    console.log('\n  ✅ Done — Neo4j SOM coordinates backfill complete.\n');
  }

  await pool.end();
  await driver.close();
}

main().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
