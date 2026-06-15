#!/usr/bin/env node
/**
 * Sync Neo4j GDS centrality scores → atlas_topology_index
 *
 * Reads pagerank, betweenness, eigenvector from Packet nodes (written
 * by gds.pageRank.write / gds.betweenness.write / gds.eigenvector.write)
 * and upserts them into atlas_topology_index by packet_key.
 *
 * Run after phase-16-neo4j-gds-knn-build or any GDS .write call.
 */

import pg from 'pg';
import neo4j from 'neo4j-driver';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const driver = neo4j.driver(
  process.env.NEO4J_URI || 'bolt://127.0.0.1:7687',
  neo4j.auth.basic(
    process.env.NEO4J_USER || 'neo4j',
    process.env.NEO4J_PASSWORD || 'neo4j123'
  )
);

function toFloat(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object' && typeof val.toNumber === 'function') return val.toNumber();
  return Number(val);
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  GDS Centrality Sync: Neo4j → atlas_topology_index            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const session = driver.session();
  const client = await pool.connect();

  try {
    // 1. Fetch GDS scores from Neo4j Packet nodes
    console.log('📊 Step 1: Fetching Packet nodes with GDS scores from Neo4j...');
    const result = await session.run(`
      MATCH (p:Packet)
      WHERE p.pagerank IS NOT NULL
      RETURN p.packet_key   AS packet_key,
             p.pagerank     AS pagerank,
             p.betweenness  AS betweenness,
             p.eigenvector  AS eigenvector
    `);

    const rows = result.records.map(r => ({
      packet_key:  r.get('packet_key'),
      pagerank:    toFloat(r.get('pagerank')),
      betweenness: toFloat(r.get('betweenness')),
      eigenvector: toFloat(r.get('eigenvector')),
    })).filter(r => r.packet_key);

    console.log(`   ✅ Fetched ${rows.length} Packet nodes with GDS scores\n`);

    // 2. Batch update atlas_topology_index
    console.log('🔄 Step 2: Syncing to atlas_topology_index...');
    let updated = 0;
    let notFound = 0;

    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      for (const row of batch) {
        const res = await client.query(
          `UPDATE atlas_topology_index
           SET pagerank            = $1,
               betweenness         = $2,
               eigenvector         = $3,
               topology_version    = COALESCE(topology_version, 1) + 1,
               topology_updated_at = NOW(),
               updated_at          = NOW()
           WHERE packet_key = $4`,
          [row.pagerank, row.betweenness, row.eigenvector, row.packet_key]
        );
        if (res.rowCount > 0) updated++; else notFound++;
      }
      const pct = Math.min(100, Math.round((i + batch.length) / rows.length * 100));
      process.stdout.write(`\r   Progress: ${updated} updated  ${notFound} not-in-table  (${pct}%)`);
    }
    console.log('');
    console.log(`   ✅ Updated: ${updated}   Not in atlas_topology_index: ${notFound}\n`);

    // 3. Also backfill atlas_higher_hop_index columns where they exist
    console.log('🔄 Step 3: Cross-checking atlas_higher_hop_index...');
    const hhiColCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'atlas_higher_hop_index'
        AND column_name IN ('pagerank_score', 'pagerank', 'neo4j_pagerank')
    `);

    if (hhiColCheck.rows.length > 0) {
      const col = hhiColCheck.rows[0].column_name;
      const hhRes = await client.query(`
        UPDATE atlas_higher_hop_index h
        SET ${col} = t.pagerank
        FROM atlas_topology_index t
        WHERE h.packet_key = t.packet_key
          AND t.pagerank IS NOT NULL
          AND (h.${col} IS NULL OR h.${col} != t.pagerank)
      `);
      console.log(`   ✅ Cross-updated atlas_higher_hop_index.${col} for ${hhRes.rowCount} rows\n`);
    } else {
      console.log('   ℹ️  No pagerank column found in atlas_higher_hop_index (skipped)\n');
    }

    // 4. Verify
    console.log('🔍 Step 4: Verification...');
    const audit = await client.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(pagerank)    AS with_pagerank,
        COUNT(betweenness) AS with_betweenness,
        COUNT(eigenvector) AS with_eigenvector,
        ROUND(AVG(pagerank)::numeric, 4)    AS avg_pagerank,
        ROUND(MAX(pagerank)::numeric, 4)    AS max_pagerank
      FROM atlas_topology_index
    `);
    const a = audit.rows[0];
    const pct = (100 * a.with_pagerank / a.total).toFixed(1);

    console.log(`   pagerank    : ${a.with_pagerank}/${a.total} (${pct}%)  avg=${a.avg_pagerank}  max=${a.max_pagerank}`);
    console.log(`   betweenness : ${a.with_betweenness}/${a.total}`);
    console.log(`   eigenvector : ${a.with_eigenvector}/${a.total}`);
    console.log('');

    if (parseFloat(pct) >= 95) {
      console.log('✅ GDS centrality sync COMPLETE — ≥95% coverage');
    } else {
      console.log(`⚠️  Coverage ${pct}% < 95% — some packets may lack Neo4j nodes`);
    }

  } catch (err) {
    console.error('\n❌ Fatal:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    await session.close();
    await driver.close();
    await client.release();
    await pool.end();
  }
}

main();
