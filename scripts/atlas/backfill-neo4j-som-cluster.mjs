#!/usr/bin/env node
/**
 * backfill-neo4j-som-cluster.mjs
 *
 * Backfills missing som_cluster field on Neo4j Packet nodes from atlas_packets.
 *
 * The som_cluster should be som_index from atlas_packets, which represents
 * which SOM cell the packet belongs to.
 *
 * Usage:
 *   node scripts/atlas/backfill-neo4j-som-cluster.mjs
 *   node scripts/atlas/backfill-neo4j-som-cluster.mjs --apply
 */

import pg from 'pg';
import neo4j from 'neo4j-driver';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// ── Arg Parsing ──────────────────────────────────────────────────────────────
const argv = new Set(process.argv.slice(2));
const APPLY = argv.has('--apply');
const DRY_RUN = !APPLY;

// ── Environment Loading ──────────────────────────────────────────────────────
function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = {
  ...loadEnv(path.join(ROOT, '.env')),
  ...loadEnv(path.join(ROOT, 'sveltekit-frontend', '.env')),
  ...process.env,
};

const DATABASE_URL = env.DATABASE_URL || env.ADMIN_DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const NEO4J_URI = env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = env.NEO4J_USER || env.NEO4J_USERNAME || 'neo4j';
const NEO4J_PASS = env.NEO4J_PASSWORD || env.NEO4J_PASS || 'neo4j123';

async function main() {
  console.log(`\n📊 backfill-neo4j-som-cluster.mjs [${APPLY ? 'APPLY' : 'DRY-RUN'}]`);
  console.log(`   PostgreSQL   : ${DATABASE_URL.replace(/:[^:@/]+@/, ':***@')}`);
  console.log(`   Neo4j URI    : ${NEO4J_URI}`);
  console.log();

  const pgPool = new pg.Pool({ connectionString: DATABASE_URL });
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));

  try {
    // Query PostgreSQL for packets with som_index
    console.log('⏳ Querying atlas_packets for som_index...');
    const pgRes = await pgPool.query(`
      SELECT packet_key, som_index, som_row, som_col
      FROM atlas_packets
      WHERE packet_key IS NOT NULL AND som_index IS NOT NULL
      ORDER BY packet_key
    `);
    console.log(`✅ Found ${pgRes.rows.length} packets with som_index`);

    // Check current state in Neo4j
    const session = driver.session({ database: 'neo4j' });
    const currentRes = await session.run(`
      MATCH (p:Packet)
      RETURN
        count(p) as total,
        sum(CASE WHEN p.som_cluster IS NOT NULL THEN 1 ELSE 0 END) as with_som
    `);
    const [record] = currentRes.records;
    let total = record.get('total');
    let withSom = record.get('with_som');
    if (typeof total === 'bigint') total = Number(total);
    if (typeof withSom === 'bigint') withSom = Number(withSom);
    if (withSom === null) withSom = 0;
    console.log(`📊 Neo4j Packet state: ${total} total, ${withSom} with som_cluster, ${total - withSom} missing`);

    // Batch update Neo4j
    if (pgRes.rows.length === 0) {
      console.log('✅ All packets already have som_cluster');
      await session.close();
      return;
    }

    console.log(`\n⏳ Batching ${pgRes.rows.length} Cypher updates...`);

    if (DRY_RUN) {
      console.log(`\n📋 Sample (first 5 rows that would be updated):`);
      pgRes.rows.slice(0, 5).forEach((row) => {
        console.log(`   ${row.packet_key} → som_cluster: ${row.som_index} (row=${row.som_row}, col=${row.som_col})`);
      });
      console.log(`\n✅ DRY-RUN: Would update ${pgRes.rows.length} packets`);
      await session.close();
    } else {
      const batchSize = 500;
      let updated = 0;

      for (let i = 0; i < pgRes.rows.length; i += batchSize) {
        const batch = pgRes.rows.slice(i, i + batchSize);
        try {
          // Only pass the fields we need, sanitized
          const packets = batch.map(row => ({
            packet_key: row.packet_key,
            som_index: Number(row.som_index)
          }));

          const txn = session.beginTransaction();
          const cypher = `
            UNWIND $packets AS pkt
            MATCH (p:Packet { packet_key: pkt.packet_key })
            SET p.som_cluster = pkt.som_index
            RETURN count(p) as updated
          `;
          const result = await txn.run(cypher, { packets });
          await txn.commit();

          if (result.records.length === 0) {
            console.log(`   Batch ${Math.ceil((i + 1) / batchSize)}: 0/${batch.length} updated (no records returned)`);
            continue;
          }
          const [rec] = result.records;
          let batchUpdated = rec.get('updated');
          if (typeof batchUpdated === 'bigint') batchUpdated = Number(batchUpdated);
          updated += batchUpdated;
          console.log(`   Batch ${Math.ceil((i + 1) / batchSize)}: ${batchUpdated}/${batch.length} updated`);
        } catch (batchErr) {
          console.error(`   Batch ${Math.ceil((i + 1) / batchSize)} error:`, batchErr.message);
          throw batchErr;
        }
      }

      console.log(`\n✅ APPLIED: Updated ${updated}/${pgRes.rows.length} Packet nodes with som_cluster`);
      await session.close();
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pgPool.end();
    await driver.close();
  }
}

main();
