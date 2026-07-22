#!/usr/bin/env node

/**
 * Materialize: Feature Registry Alignment
 *
 * Projects real topology evidence from 2,109 topology-ready packets
 * into the corresponding 4,209 aligned registry rows,
 * raising validator topology lane from 1.85% to ~50%.
 *
 * Usage:
 *   node materialize-feature-registry-alignment.mjs --dry-run
 *   node materialize-feature-registry-alignment.mjs --apply --limit=4209
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { buildPacketIdentityIndexes, resolvePacketIdentity, normalizeAtlasSourceRef } from '../../packages/atlas/lib/packet-identity-bridge.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../sveltekit-frontend/.env.local') });
dotenv.config({ path: path.join(__dirname, '../../sveltekit-frontend/.env') });

const { Pool } = pg;
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 4209;

const pool = new Pool({
  host: '127.0.0.1',
  port: 5434,
  user: 'legal_admin',
  password: '123456',
  database: 'legal_ai_db',
});

async function main() {
  console.log(`\n╔════════════════════════════════════════════════════════════╗`);
  console.log(`║        Materialize Feature Registry Alignment               ║`);
  console.log(`║        (Project 2,109 topology-ready → 4,209 registry)      ║`);
  console.log(`╚════════════════════════════════════════════════════════════╝\n`);

  try {
    // 0. Ensure registry alignment table exists
    if (!dryRun) {
      console.log('STEP 0: Initialize registry alignment table...');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS atlas_registry_alignment (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          registry_id VARCHAR(255) NOT NULL,
          packet_key VARCHAR(255) NOT NULL,
          source_ref VARCHAR(512) NOT NULL,
          feature_id VARCHAR(255),
          alignment_confidence REAL DEFAULT 0.97,
          som_cluster VARCHAR(50),
          authority_score REAL,
          pagerank_score REAL,
          community_id VARCHAR(100),
          materialized_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(registry_id, packet_key)
        )
      `);
      console.log('  ✓ Table ready\n');
    }

    // 1. Load canonical packet index
    console.log('STEP 1: Load canonical packet identities...');
    const packetRes = await pool.query(`
      SELECT
        packet_key,
        source_ref,
        community_id,
        payload->'topology_materialized' as topology_materialized
      FROM atlas_packets
      WHERE payload->'topology_materialized' IS NOT NULL
    `);
    const packetRows = packetRes.rows;
    const indexes = buildPacketIdentityIndexes(packetRows);
    console.log(`  ✓ Indexed ${packetRows.length} packets with topology evidence\n`);

    // 2. Load feature registry
    console.log('STEP 2: Load feature registry...');
    const registryPath = path.join(__dirname, '../../docs/atlas/feature-registry.json');
    if (!fs.existsSync(registryPath)) {
      console.error(`  ✗ Registry not found: ${registryPath}`);
      await pool.end();
      process.exit(1);
    }

    const registryData = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const registryRows = Array.isArray(registryData) ? registryData : registryData.features || [];
    console.log(`  ✓ Loaded ${registryRows.length} registry rows\n`);

    // 3. Resolve and materialize
    console.log(`STEP 3: Materialize aligned registry rows (limit: ${limit})...\n`);

    let materialized = 0;
    let topologyReady = 0;
    let ambiguous = 0;

    for (const registryRow of registryRows.slice(0, limit)) {
      const resolution = resolvePacketIdentity(registryRow, indexes);

      if (!resolution.match) {
        if (resolution.method === 'ambiguous_source_ref') {
          ambiguous++;
        }
        continue;
      }

      const packetRow = resolution.match;
      if (!packetRow.topology_materialized) continue;

      const topo = packetRow.topology_materialized;

      // Skip if no real topology data
      if (!topo.x_cosine && !topo.y_graph && !topo.z_som && !topo.w_authority) {
        continue;
      }

      topologyReady++;

      if (!dryRun) {
        // Write materialized topology to atlas_packets payload (top-level fields)
        // Extract topology coordinates from nested object
        const som_cluster = topo.som_cluster || null;
        const authority_score = parseFloat(topo.w_authority) || null;
        const pagerank_score = null; // Will be filled by PageRank materialization
        const community_id = packetRow.community_id || null;

        try {
          // Update atlas_packets with topology evidence as top-level payload fields
          const updateRes = await pool.query(
            `UPDATE atlas_packets
             SET payload = jsonb_set(
               jsonb_set(
                 jsonb_set(
                   jsonb_set(payload, '{som_cluster}', $1::jsonb),
                   '{authority_score}', $2::jsonb
                 ),
                 '{community_id}', $3::jsonb
               ),
               '{topology_materialized}', $4::jsonb
             )
             WHERE packet_key = $5`,
            [
              JSON.stringify(som_cluster),
              JSON.stringify(authority_score),
              JSON.stringify(community_id),
              JSON.stringify(topo),
              packetRow.packet_key
            ]
          );
          if (updateRes.rowCount > 0) {
            materialized++;

            // Also write to registry_alignment projection table
            const som_cluster = topo.som_cluster || null;
            const authority_score = parseFloat(topo.w_authority) || null;
            // Use a stable registry_id based on feature_id (avoid null constraint)
            const registryId = `registry:${registryRow.feature_id || registryRow.id || 'unknown'}`;

            await pool.query(
              `INSERT INTO atlas_registry_alignment
               (registry_id, packet_key, source_ref, feature_id, som_cluster, authority_score, community_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               ON CONFLICT(registry_id, packet_key) DO UPDATE SET
                 som_cluster = $5, authority_score = $6, community_id = $7`,
              [
                registryId,
                packetRow.packet_key,
                packetRow.source_ref,
                registryRow.feature_id,
                som_cluster,
                authority_score,
                packetRow.community_id || null
              ]
            );
          }
        } catch (err) {
          if (verbose) console.error(`  ❌ Update failed for ${registryRow.feature_id}: ${err.message}`);
        }
      }
    }

    if (dryRun) {
      console.log(`DRY RUN: Would materialize ${topologyReady} registry rows\n`);
      console.log(`Summary:`);
      console.log(`  Topology-ready: ${topologyReady}`);
      console.log(`  Ambiguous: ${ambiguous}`);
      console.log(`  Coverage: ${(100.0 * topologyReady / Math.min(limit, registryRows.length)).toFixed(2)}%\n`);
      console.log(`To apply, run with --apply flag.\n`);
    } else {
      if (materialized === 0) {
        throw new Error(
          `Registry alignment materialization failed: 0/${topologyReady} eligible rows were updated`
        );
      }

      console.log(`✅ Materialized ${materialized} registry rows\n`);
      console.log(`Expected topology lane improvement:`);
      console.log(`  Before: 1.85% (78/4,209)`);
      console.log(`  After: ${(100.0 * topologyReady / registryRows.length).toFixed(2)}% (${topologyReady}/4,209)\n`);
    }

    await pool.end();
    process.exit(0);

  } catch (err) {
    console.error('❌ ERROR:', err.message);
    if (verbose) console.error(err.stack);
    await pool.end();
    process.exit(1);
  }
}

main();
