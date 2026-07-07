#!/usr/bin/env node

/**
 * Phase 3b.1: Resolve Ontology Edges
 * Deterministic edge population from packet relationships
 *
 * Strategy: Build edges from packet metadata without AST analysis
 * - belongsTo edges: file → directory/feature
 * - imports edges: source_ref → imported_ref
 * - similarity edges: packets with related keywords
 */

import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from '../atlas/connection-config.mjs';

const VERBOSE = process.argv.includes('--verbose');
const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = process.argv.includes('--limit')
  ? parseInt(process.argv[process.argv.indexOf('--limit') + 1] || '58365')
  : 58365;

async function main() {
  const env = loadRepoEnv();
  const databaseUrl = resolveDatabaseUrl(env);
  const pool = new pg.Pool({ connectionString: databaseUrl });

  try {
    const client = await pool.connect();

    console.log(`📊 Phase 3b.1: Resolving Ontology Edges\n`);

    // Step 1: Fetch all packets with feature_id for symbol resolution
    const packetsResult = await client.query(`
      SELECT
        packet_key,
        feature_id,
        source_ref,
        directory_path,
        ontology->'keywords' as keywords
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
      LIMIT ${LIMIT}
    `);

    const packets = packetsResult.rows;
    console.log(`✅ Loaded ${packets.length} packets\n`);

    // Step 2: Build symbol→packet_key map for rapid resolution
    const symbolMap = new Map();
    const featureMap = new Map();

    for (const packet of packets) {
      if (packet.feature_id) {
        symbolMap.set(packet.feature_id, packet.packet_key);
      }
      if (packet.directory_path) {
        if (!featureMap.has(packet.directory_path)) {
          featureMap.set(packet.directory_path, []);
        }
        featureMap.get(packet.directory_path).push(packet.packet_key);
      }
    }

    console.log(`📍 Symbol map: ${symbolMap.size} entries`);
    console.log(`📍 Feature map: ${featureMap.size} entries\n`);

    // Step 3: Extract deterministic edges
    const edges = [];
    let belongsToCount = 0;
    let similarityCount = 0;

    for (const packet of packets) {
      // Edge 1: belongsTo — file belongs to its directory (one edge per packet-directory pair)
      // For now, skip belongsTo as it creates redundant edges
      // Future enhancement: create a directory summary packet for proper hierarchy
      // if (packet.directory_path) {
      //   edges.push({
      //     source_packet_key: packet.packet_key,
      //     target_packet_key: `dir:${packet.directory_path}`,
      //     edge_type: 'belongs_to',
      //     confidence: 0.95,
      //   });
      //   belongsToCount++;
      // }

      // Edge 2: similarity — packets with overlapping keywords (high-confidence only)
      if (packet.keywords && Array.isArray(packet.keywords) && packet.keywords.length > 0) {
        for (const otherPacket of packets) {
          if (otherPacket.packet_key !== packet.packet_key &&
              otherPacket.keywords && Array.isArray(otherPacket.keywords) &&
              otherPacket.keywords.length > 0) {
            const intersection = packet.keywords.filter(k =>
              otherPacket.keywords.includes(k)
            );
            // Only create edge if 2+ keywords overlap (higher confidence threshold)
            if (intersection.length >= 2) {
              const confidence = Math.min(0.95, 0.7 + (intersection.length * 0.05));
              edges.push({
                source_packet_key: packet.packet_key,
                target_packet_key: otherPacket.packet_key,
                edge_type: 'similar_to',
                confidence,
              });
              similarityCount++;
            }
          }
        }
      }
    }

    console.log(`📊 Edges discovered:`);
    console.log(`   belongsTo: ${belongsToCount}`);
    console.log(`   similar_to: ${similarityCount}`);
    console.log(`   Total: ${edges.length}\n`);

    if (DRY_RUN) {
      console.log(`🏃 DRY-RUN mode: Sample edges:`);
      edges.slice(0, 5).forEach(e => {
        console.log(`  ${e.source_packet_key.slice(0, 12)} -[${e.edge_type}]-> ${e.target_packet_key.slice(0, 12)} (${e.confidence})`);
      });
      client.release();
      return;
    }

    // Step 4: Persist edges to Postgres (batch insert with conflict handling)
    console.log(`💾 Persisting edges to Postgres...`);

    const batchSize = 1000;
    let inserted = 0;

    for (let i = 0; i < edges.length; i += batchSize) {
      const batch = edges.slice(i, Math.min(i + batchSize, edges.length));

      for (const edge of batch) {
        try {
          await client.query(
            `INSERT INTO ontology_edges
              (source_packet_key, target_packet_key, edge_type, confidence)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (source_packet_key, target_packet_key, edge_type) DO UPDATE
            SET confidence = GREATEST(ontology_edges.confidence, $4)`,
            [edge.source_packet_key, edge.target_packet_key, edge.edge_type, edge.confidence]
          );
          inserted++;
        } catch (err) {
          if (err.message.includes('violates foreign key constraint')) {
            // Expected if target packet doesn't exist; skip silently
          } else {
            console.error(`❌ Error inserting edge: ${err.message}`);
          }
        }
      }

      if (VERBOSE && inserted % 1000 === 0) {
        console.log(`   Inserted ${inserted} edges...`);
      }
    }

    console.log(`\n✅ Edge population complete: ${inserted} edges persisted\n`);

    // Step 5: Verify edge coverage
    const coverageResult = await client.query(`
      SELECT
        edge_type,
        COUNT(*) as edge_count,
        COUNT(DISTINCT source_packet_key) as source_packets,
        COUNT(DISTINCT target_packet_key) as target_packets,
        ROUND(AVG(confidence)::numeric, 3) as avg_confidence
      FROM ontology_edges
      GROUP BY edge_type
      ORDER BY edge_count DESC
    `);

    console.log(`📊 Edge Coverage by Type:`);
    for (const row of coverageResult.rows) {
      console.log(`   ${row.edge_type}: ${row.edge_count} edges (${row.source_packets} sources, ${row.target_packets} targets, avg_confidence: ${row.avg_confidence})`);
    }

    const totalEdgesResult = await client.query(`SELECT COUNT(*) as total FROM ontology_edges`);
    const totalEdges = totalEdgesResult.rows[0].total;
    console.log(`\n   TOTAL: ${totalEdges} edges`);

    client.release();
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
