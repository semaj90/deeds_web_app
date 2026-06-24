#!/usr/bin/env node

/**
 * Audit where som_cluster exists across canonical stores
 * - Qdrant codebase_chunks_768 payload
 * - Postgres atlas_packets (if table exists)
 * - Neo4j Packet nodes (current state)
 *
 * Goal: Find the source for backfilling Packet.som_cluster
 */

import neo4j from 'neo4j-driver';
import fetch from 'node-fetch';

const NEO4J_URI = process.env.NEO4J_URI || 'neo4j://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j123';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';

async function main() {
  console.log('\n📊 Audit: SOM Cluster Identity Across Stores\n');
  console.log('='.repeat(60));

  // Audit 1: Neo4j Packet nodes
  console.log('\n📍 Neo4j Packet nodes:');
  try {
    const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
    const session = driver.session({ defaultAccessMode: neo4j.session.READ });

    const result = await session.run(`
      MATCH (p:Packet)
      RETURN
        count(p) AS total_packets,
        sum(CASE WHEN p.som_cluster IS NOT NULL THEN 1 ELSE 0 END) AS with_som_cluster,
        sum(CASE WHEN p.packet_key IS NOT NULL THEN 1 ELSE 0 END) AS with_packet_key,
        sum(CASE WHEN p.source_ref IS NOT NULL THEN 1 ELSE 0 END) AS with_source_ref,
        sum(CASE WHEN p.feature_id IS NOT NULL THEN 1 ELSE 0 END) AS with_feature_id
    `);

    const record = result.records[0];
    const total = record?.get('total_packets')?.toNumber?.() || 0;
    const somCluster = record?.get('with_som_cluster')?.toNumber?.() || 0;
    const pkey = record?.get('with_packet_key')?.toNumber?.() || 0;
    const sref = record?.get('with_source_ref')?.toNumber?.() || 0;
    const fid = record?.get('with_feature_id')?.toNumber?.() || 0;

    console.log(`  Total Packet nodes: ${total}`);
    console.log(`    ✅ with packet_key: ${pkey} (${((pkey / total) * 100).toFixed(1)}%)`);
    console.log(`    ✅ with source_ref: ${sref} (${((sref / total) * 100).toFixed(1)}%)`);
    console.log(`    ✅ with feature_id: ${fid} (${((fid / total) * 100).toFixed(1)}%)`);
    console.log(`    ❌ with som_cluster: ${somCluster} (${((somCluster / total) * 100).toFixed(1)}%) — MISSING!`);

    // Sample a packet with packet_key to see its structure
    const sampleResult = await session.run(`
      MATCH (p:Packet)
      WHERE p.packet_key IS NOT NULL
      RETURN p LIMIT 1
    `);
    if (sampleResult.records.length > 0) {
      const packet = sampleResult.records[0].get('p');
      console.log(`\n  Sample Packet (with packet_key):`);
      console.log(`    packet_key: ${packet.properties.packet_key}`);
      console.log(`    source_ref: ${packet.properties.source_ref}`);
      console.log(`    feature_id: ${packet.properties.feature_id}`);
      console.log(`    community_id: ${packet.properties.community_id}`);
    }

    await session.close();
    await driver.close();
  } catch (e) {
    console.log(`  ❌ Error: ${e.message}`);
  }

  // Audit 2: Qdrant codebase_chunks_768
  console.log('\n📍 Qdrant codebase_chunks_768 collection:');
  try {
    const scrollRes = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points?limit=100`);
    const scrollData = await scrollRes.json();

    if (scrollData.result && scrollData.result.length > 0) {
      let withSomCluster = 0;
      let withPacketKey = 0;
      let withSourceRef = 0;

      for (const point of scrollData.result) {
        const payload = point.payload || {};
        if (payload.som_cluster !== undefined && payload.som_cluster !== null) withSomCluster++;
        if (payload.packet_key !== undefined && payload.packet_key !== null) withPacketKey++;
        if (payload.source_ref !== undefined && payload.source_ref !== null) withSourceRef++;
      }

      console.log(`  Sample of ${scrollData.result.length} points:`);
      console.log(`    ✅ with packet_key: ${withPacketKey}`);
      console.log(`    ✅ with source_ref: ${withSourceRef}`);
      console.log(`    ${withSomCluster > 0 ? '✅' : '❌'} with som_cluster: ${withSomCluster}`);

      // Show sample payload
      if (scrollData.result.length > 0) {
        const samplePayload = scrollData.result[0].payload;
        console.log(`\n  Sample Qdrant payload keys:`);
        console.log(`    ${Object.keys(samplePayload).slice(0, 10).join(', ')}`);
        if (samplePayload.packet_key) {
          console.log(`    packet_key sample: ${samplePayload.packet_key}`);
        }
        if (samplePayload.som_cluster) {
          console.log(`    som_cluster sample: ${samplePayload.som_cluster}`);
        }
      }
    } else {
      console.log(`  ⚠️  No points returned from Qdrant`);
    }
  } catch (e) {
    console.log(`  ❌ Error: ${e.message}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n📋 FINDINGS:\n');
  console.log('  If Qdrant has som_cluster but Neo4j Packet nodes do NOT:');
  console.log('    → Use Qdrant payload.som_cluster as backfill source');
  console.log('    → Join on packet_key or source_ref\n');
  console.log('  If Postgres atlas_packets exists and has som_cluster:');
  console.log('    → Use atlas_packets.som_cluster as authoritative source');
  console.log('    → Join on packet_key\n');
  console.log('  Current status: Neo4j Packet nodes are MISSING som_cluster');
  console.log('                  Need to identify canonical source\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
