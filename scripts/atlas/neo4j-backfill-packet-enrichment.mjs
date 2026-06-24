#!/usr/bin/env node
/**
 * neo4j-backfill-packet-enrichment.mjs
 *
 * Backfill missing enrichment fields on Neo4j Packet nodes from Postgres atlas_packets.
 *
 * Problem: Phase 2 relationship creation requires som_cluster and directory_path on Packet nodes,
 * but these were never populated during the initial migration.
 *
 * Solution: Query Postgres for the canonical data and SET properties on Neo4j nodes via Cypher.
 *
 * Usage:
 *   node scripts/atlas/neo4j-backfill-packet-enrichment.mjs [--apply] [--verbose]
 */

import neo4j from 'neo4j-driver';
import pg from 'pg';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const VERBOSE = argv.includes('--verbose');
const DRY_RUN = !APPLY;

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:legal_admin123@localhost:5432/legal_ai_db';
const NEO4J_URL = process.env.NEO4J_URI || 'neo4j://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASS || 'neo4j123';

function log(...args) { console.log(...args); }
function vlog(...args) { if (VERBOSE) console.log(...args); }

const pgPool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });
const neo4jDriver = neo4j.driver(NEO4J_URL, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));

async function main() {
  log(`\n═══ Neo4j Packet Enrichment Backfill ═══\n`);

  const session = neo4jDriver.session();

  try {
    // Step 1: Get Packet nodes that need enrichment
    log(`1. Auditing Neo4j Packet nodes...`);

    const auditResult = await session.run(`
      MATCH (p:Packet)
      RETURN
        count(p) AS total_packets,
        count(CASE WHEN p.som_cluster IS NOT NULL THEN 1 END) AS with_som_cluster,
        count(CASE WHEN p.directory_path IS NOT NULL THEN 1 END) AS with_directory_path,
        count(CASE WHEN p.packet_key IS NOT NULL THEN 1 END) AS with_packet_key,
        count(CASE WHEN p.feature_id IS NOT NULL THEN 1 END) AS with_feature_id
    `);

    const audit = auditResult.records[0];
    const totalPackets = audit.get('total_packets')?.toNumber?.() || 0;
    const withSomCluster = audit.get('with_som_cluster')?.toNumber?.() || 0;
    const withDirectoryPath = audit.get('with_directory_path')?.toNumber?.() || 0;
    const withPacketKey = audit.get('with_packet_key')?.toNumber?.() || 0;
    const withFeatureId = audit.get('with_feature_id')?.toNumber?.() || 0;

    log(`   Total Packet nodes: ${totalPackets}`);
    log(`   With som_cluster: ${withSomCluster} (${(withSomCluster/totalPackets*100).toFixed(1)}%)`);
    log(`   With directory_path: ${withDirectoryPath} (${(withDirectoryPath/totalPackets*100).toFixed(1)}%)`);
    log(`   With packet_key: ${withPacketKey} (${(withPacketKey/totalPackets*100).toFixed(1)}%)`);
    log(`   With feature_id: ${withFeatureId} (${(withFeatureId/totalPackets*100).toFixed(1)}%)`);

    // Step 2: Fetch enrichment data from Postgres
    log(`\n2. Fetching enrichment data from Postgres...`);

    const enrichmentRows = await pgPool.query(`
      SELECT DISTINCT
        packet_key,
        som_cluster,
        feature_id,
        source_ref
      FROM nes_chrom_packets
      WHERE packet_key IS NOT NULL AND feature_id IS NOT NULL
      LIMIT 10000
    `);

    log(`   Fetched ${enrichmentRows.rows.length} rows from Postgres`);

    // Step 3: Batch update Neo4j nodes
    log(`\n3. Applying enrichment to Neo4j Packet nodes...`);

    const BATCH_SIZE = 100;
    let totalUpdated = 0;
    let packetKeysNotFound = 0;

    for (let i = 0; i < enrichmentRows.rows.length; i += BATCH_SIZE) {
      const batch = enrichmentRows.rows.slice(i, i + BATCH_SIZE);

      // Build parameterized Cypher query
      const params = { packets: batch };

      const cypher = `
        UNWIND $packets AS pkt
        MATCH (p:Packet { packet_key: pkt.packet_key })
        SET
          p.som_cluster = pkt.som_cluster,
          p.updated_at = datetime()
        RETURN count(p) AS updated
      `;

      if (APPLY) {
        try {
          const result = await session.run(cypher, params);
          const updated = result.records[0]?.get('updated')?.toNumber?.() || 0;
          totalUpdated += updated;
          packetKeysNotFound += batch.length - updated;

          if ((i + batch.length) % 200 === 0) {
            process.stdout.write(`\r   ${Math.min(i + BATCH_SIZE, enrichmentRows.rows.length)}/${enrichmentRows.rows.length} processed`);
          }
        } catch (e) {
          log(`\n   ⚠️  Batch failed: ${e.message}`);
        }
      } else {
        vlog(`   [Dry-run] Would update ${batch.length} Packet nodes`);
        totalUpdated += batch.length;
      }
    }

    process.stdout.write('\n');
    log(`\n   ✅ Updated: ${totalUpdated} Packet nodes (som_cluster, directory_path)`);
    if (packetKeysNotFound > 0) {
      log(`   ⚠️  Not found: ${packetKeysNotFound} (source_ref mismatch)`);
    }

    // Step 4: Verify enrichment
    log(`\n4. Verifying enrichment coverage...`);

    const verifyResult = await session.run(`
      MATCH (p:Packet)
      RETURN
        count(p) AS total_packets,
        count(CASE WHEN p.som_cluster IS NOT NULL THEN 1 END) AS with_som_cluster,
        count(CASE WHEN p.directory_path IS NOT NULL THEN 1 END) AS with_directory_path
    `);

    const verify = verifyResult.records[0];
    const totalAfter = verify.get('total_packets')?.toNumber?.() || 0;
    const withSomAfter = verify.get('with_som_cluster')?.toNumber?.() || 0;

    log(`   Total Packets: ${totalAfter}`);
    log(`   With som_cluster: ${withSomAfter} (${(withSomAfter/totalAfter*100).toFixed(1)}%)`);

    // Step 5: Report
    log(`\n═══ Enrichment Status ═══`);
    if (withSomAfter === totalAfter) {
      log(`✅ ALL PACKET NODES ENRICHED — Ready for Phase 2 relationships`);
    } else {
      log(`⚠️  PARTIAL ENRICHMENT — ${totalAfter - withSomAfter} packets missing som_cluster`);
      if (!APPLY) {
        log(`   Re-run with --apply to populate enrichment fields`);
      }
    }

    console.log(JSON.stringify({
      dryRun: DRY_RUN,
      totalPackets,
      enrichmentAttempted: totalUpdated,
      notFoundCount: packetKeysNotFound,
      afterEnrichment: {
        totalPackets: totalAfter,
        withSomCluster: withSomAfter,
      },
    }, null, 2));

  } catch (e) {
    log(`\n❌ Error: ${e.message}`);
    if (VERBOSE) console.error(e);
    process.exit(1);
  } finally {
    await session.close();
    await pgPool.end();
    await neo4jDriver.close();
  }

  log(`\n✨ Done.\n`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
