#!/usr/bin/env node
/**
 * P0 SCRIPT V2: Focus on packets that actually have embeddings
 */

import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const { Pool } = pg;
const env = loadRepoEnv(process.env);
const pool = new Pool({ connectionString: resolveDatabaseUrl(env) });

async function main() {
  const client = await pool.connect();
  try {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('P0 V2: Bridge Viability (Packets WITH Qdrant matches)');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Strategy: Get packets that ARE indexed in Qdrant
    // We can tell by checking codebase_chunk_index.qdrant_id
    
    console.log('Step 1: Find codebase_chunk_index → qdrant bridge...');
    const bridgeResult = await client.query(`
      SELECT
        COUNT(DISTINCT cci.id) as chunk_count,
        COUNT(DISTINCT cci.qdrant_id) FILTER (WHERE cci.qdrant_id IS NOT NULL) as chunks_with_qdrant_id
      FROM codebase_chunk_index cci
    `);
    
    const { chunk_count, chunks_with_qdrant_id } = bridgeResult.rows[0];
    console.log(`  Chunks: ${chunk_count}`);
    console.log(`  With Qdrant IDs: ${chunks_with_qdrant_id}`);
    
    console.log('\nStep 2: Check packet → chunk mapping...');
    const packetChunkResult = await client.query(`
      SELECT
        COUNT(DISTINCT ap.packet_key) as packets_with_chunk_id,
        COUNT(DISTINCT ap.chunk_id) FILTER (
          WHERE ap.chunk_id IN (SELECT id FROM codebase_chunk_index WHERE qdrant_id IS NOT NULL)
        ) as packets_mapping_to_indexed_chunks
      FROM atlas_packets ap
    `);
    
    const { packets_with_chunk_id, packets_mapping_to_indexed_chunks } = packetChunkResult.rows[0];
    console.log(`  Packets with chunk_id: ${packets_with_chunk_id}`);
    console.log(`  Mapping to indexed chunks: ${packets_mapping_to_indexed_chunks}`);
    
    if (packets_mapping_to_indexed_chunks === 0) {
      console.log('\n  ❌ CRITICAL FINDING: Zero packets map to indexed chunks!');
      console.log('  This explains 0% bridge coverage.');
      console.log('\n  Diagnosis: atlas_packets.chunk_id ≠ codebase_chunk_index.id');
      console.log('  Recommendation: Use source_ref as the join key directly with Qdrant payloads.');
      return;
    }

    console.log('\nStep 3: Sample packets that DO map to indexed chunks...');
    const sampleResult = await client.query(`
      SELECT DISTINCT
        ap.packet_key,
        ap.source_ref,
        ap.chunk_id,
        cci.qdrant_id,
        cci.source_ref as chunk_source_ref
      FROM atlas_packets ap
      JOIN codebase_chunk_index cci ON ap.chunk_id = cci.id
      WHERE cci.qdrant_id IS NOT NULL
        AND (ap.qdrant_point_id IS NULL OR ap.qdrant_point_id = '')
      LIMIT 20
    `);

    const samples = sampleResult.rows;
    console.log(`  Found: ${samples.length} packets with indexed chunks but no qdrant_point_id\n`);

    if (samples.length > 0) {
      console.log('Sample packets:');
      for (const s of samples.slice(0, 5)) {
        console.log(`  packet: ${s.packet_key}`);
        console.log(`  source: ${s.source_ref}`);
        console.log(`  ↓ maps to chunk: ${s.chunk_id}`);
        console.log(`  ↓ chunk has Qdrant ID: ${s.qdrant_id}`);
        console.log(`  chunk_source_ref: ${s.chunk_source_ref}\n`);
      }

      console.log('✅ FINDING: Deterministic bridge EXISTS via chunk_id!');
      console.log('   All packets above can be backfilled directly from codebase_chunk_index.qdrant_id');
      console.log(`\n   Scale: ${samples.length} packets available to backfill in this sample`);
    } else {
      console.log('  No packets with indexed chunks found (data skew)');
    }

    // Step 4: Calculate recovery potential
    console.log('\nStep 4: Recovery Potential');
    const potentialResult = await client.query(`
      SELECT
        COUNT(*) FILTER (
          WHERE qdrant_point_id IS NULL OR qdrant_point_id = ''
        ) as without_qdrant_id,
        COUNT(*) FILTER (
          WHERE chunk_id IN (SELECT id FROM codebase_chunk_index WHERE qdrant_id IS NOT NULL)
          AND (qdrant_point_id IS NULL OR qdrant_point_id = '')
        ) as recoverable_via_chunk_id,
        COUNT(*) FILTER (
          WHERE chunk_id NOT IN (SELECT id FROM codebase_chunk_index WHERE qdrant_id IS NOT NULL)
          AND (qdrant_point_id IS NULL OR qdrant_point_id = '')
        ) as unrecoverable_missing_chunk
      FROM atlas_packets
    `);

    const { without_qdrant_id, recoverable_via_chunk_id, unrecoverable_missing_chunk } = potentialResult.rows[0];
    console.log(`  Packets without qdrant_point_id: ${without_qdrant_id}`);
    console.log(`  Recoverable via chunk_id join: ${recoverable_via_chunk_id} (${((recoverable_via_chunk_id/without_qdrant_id)*100).toFixed(1)}%)`);
    console.log(`  Unrecoverable (no chunk): ${unrecoverable_missing_chunk} (${((unrecoverable_missing_chunk/without_qdrant_id)*100).toFixed(1)}%)`);

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('Recommendation: Use Option A — Rebuild via chunk_id join');
    console.log(`Expected final coverage: ~${((recoverable_via_chunk_id + 4725) / 58365 * 100).toFixed(1)}%`);
    console.log('═══════════════════════════════════════════════════════════\n');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
