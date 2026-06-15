#!/usr/bin/env node

/**
 * Phase 16-H.7: Neo4j Node Bridge
 *
 * Queries all Neo4j :Packet nodes with their pagerank, betweenness, eigenvector
 * Matches packet_key to atlas_higher_hop_index
 * Populates neo4j_node_id, neo4j_labels, and centrality metrics
 *
 * This enables: Qdrant hit → Neo4j centrality metrics → HyperRAG reranking
 *
 * Time: ~30 min
 * Blocker: Phase 16-H.1 (schema must exist), Neo4j GDS metrics (pagerank/betweenness/eigenvector)
 */

import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import neo4j from 'neo4j-driver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: `${__dirname}/../../.env` });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Neo4j connection
const NEO4J_URI = process.env.NEO4J_URI || 'neo4j://127.0.0.1:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

const log = {
  info: (msg) => console.log(`[phase-16-h-7] ${msg}`),
  ok: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
  progress: (msg) => console.log(`⏳ ${msg}`),
};

/**
 * Fetch all Packet nodes from Neo4j with metrics
 */
async function fetchNeo4jPackets() {
  log.progress('Connecting to Neo4j...');

  let driver;
  try {
    driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
    const session = driver.session();

    log.progress('Fetching all Packet nodes with metrics...');

    const result = await session.run(`
      MATCH (p:Packet)
      RETURN
        id(p) AS neo4j_id,
        labels(p) AS labels,
        p.packet_key AS packet_key,
        p.pagerank AS pagerank,
        p.betweenness AS betweenness,
        p.eigenvector AS eigenvector
      LIMIT 100000
    `);

    const packets = [];
    for (const record of result.records) {
      packets.push({
        neo4j_id: record.get('neo4j_id'),
        labels: record.get('labels'),
        packet_key: record.get('packet_key'),
        pagerank: record.get('pagerank'),
        betweenness: record.get('betweenness'),
        eigenvector: record.get('eigenvector'),
      });
    }

    await session.close();

    log.ok(`Fetched ${packets.length} Packet nodes from Neo4j`);
    return { driver, packets };

  } catch (err) {
    log.error(`Failed to fetch Neo4j packets: ${err.message}`);
    if (driver) await driver.close();
    process.exit(1);
  }
}

/**
 * Link Neo4j node data to atlas_higher_hop_index
 */
async function linkNeo4jNodes(packets) {
  log.progress('Linking Neo4j nodes to atlas_higher_hop_index...');

  const client = await pool.connect();

  try {
    let linked = 0;
    let noPacketKey = 0;
    let notFound = 0;

    for (let i = 0; i < packets.length; i++) {
      const packet = packets[i];
      const { neo4j_id, labels, packet_key, pagerank, betweenness, eigenvector } = packet;

      if (!packet_key) {
        noPacketKey++;
        continue;
      }

      // Check if packet_key exists in atlas_higher_hop_index
      const checkResult = await client.query(
        'SELECT id FROM atlas_higher_hop_index WHERE packet_key = $1 LIMIT 1',
        [packet_key]
      );

      if (checkResult.rows.length === 0) {
        notFound++;
        continue;
      }

      // Update with Neo4j bridge
      const updateResult = await client.query(
        `UPDATE atlas_higher_hop_index
         SET
           neo4j_node_id = $1,
           neo4j_labels = $2::jsonb,
           neo4j_pagerank = $3,
           neo4j_betweenness = $4,
           neo4j_eigenvector = $5,
           metadata = jsonb_set(metadata, '{neo4j_synced_at}', to_jsonb(NOW()))
         WHERE packet_key = $6 AND neo4j_node_id IS NULL`,
        [
          String(neo4j_id),
          JSON.stringify(labels || []),
          pagerank || null,
          betweenness || null,
          eigenvector || null,
          packet_key,
        ]
      );

      if (updateResult.rowCount > 0) {
        linked++;
      }

      // Progress log
      if ((i + 1) % 500 === 0) {
        log.progress(`  Processed ${i + 1}/${packets.length} nodes (linked: ${linked})`);
      }
    }

    log.ok(`Neo4j node link complete:`);
    log.ok(`  Linked: ${linked}`);
    log.ok(`  Missing packet_key in Neo4j: ${noPacketKey}`);
    log.ok(`  Not found in atlas_higher_hop_index: ${notFound}`);

    return { linked, noPacketKey, notFound };

  } finally {
    await client.release();
  }
}

/**
 * Audit Neo4j bridge results
 */
async function auditBridge() {
  log.progress('Auditing Neo4j bridge...');

  const client = await pool.connect();

  try {
    const auditResult = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN neo4j_node_id IS NOT NULL THEN 1 END) as with_neo4j,
        COUNT(CASE WHEN neo4j_pagerank IS NOT NULL THEN 1 END) as with_pagerank,
        COUNT(CASE WHEN neo4j_betweenness IS NOT NULL THEN 1 END) as with_betweenness,
        COUNT(CASE WHEN neo4j_eigenvector IS NOT NULL THEN 1 END) as with_eigenvector,
        AVG(neo4j_pagerank) as avg_pagerank,
        MAX(neo4j_pagerank) as max_pagerank,
        MIN(neo4j_pagerank) as min_pagerank
      FROM atlas_higher_hop_index
    `);

    const audit = auditResult.rows[0];
    const neo4jCoverage = (100 * audit.with_neo4j / audit.total).toFixed(1);

    log.ok(`Audit Results:`);
    log.ok(`  Total rows: ${audit.total}`);
    log.ok(`  With neo4j_node_id: ${audit.with_neo4j} (${neo4jCoverage}%)`);
    log.ok(`  With pagerank: ${audit.with_pagerank}`);
    log.ok(`  With betweenness: ${audit.with_betweenness}`);
    log.ok(`  With eigenvector: ${audit.with_eigenvector}`);
    log.ok(`  PageRank stats: avg=${(audit.avg_pagerank || 0).toFixed(4)}, max=${(audit.max_pagerank || 0).toFixed(4)}, min=${(audit.min_pagerank || 0).toFixed(4)}`);

    // Gate: should have ≥80% coverage
    if (audit.with_neo4j < audit.total * 0.80) {
      log.error(`⚠️  GATE WARNING: neo4j_node_id coverage ${neo4jCoverage}% < 80%`);
      log.error(`   ${audit.total - audit.with_neo4j} rows still missing Neo4j linkage`);
      // Don't fail — some rows may not have Neo4j nodes
    } else {
      log.ok('✅ Neo4j bridge gate PASSED (≥80% coverage)');
    }

    return audit;

  } finally {
    await client.release();
  }
}

/**
 * Main execution
 */
async function main() {
  const startTime = Date.now();

  try {
    log.info('========== Phase 16-H.7: Neo4j Node Bridge ==========');
    log.info('');

    // Step 1: Fetch Neo4j packets
    const { driver, packets } = await fetchNeo4jPackets();
    log.info('');

    // Step 2: Link to atlas_higher_hop_index
    const linkResult = await linkNeo4jNodes(packets);
    log.info('');

    // Step 3: Audit
    const audit = await auditBridge();
    log.info('');

    // Summary
    log.ok('========== Phase 16-H.7 COMPLETE ==========');
    log.info(`Total time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    log.info(`Nodes fetched: ${packets.length}`);
    log.info(`Linked to packets: ${linkResult.linked}`);
    log.info('');
    log.info('Next step: Run phase-16-h-verify-bridges.mjs (final verification)');

    // Close Neo4j driver
    if (driver) await driver.close();

  } catch (err) {
    log.error(`Execution failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
