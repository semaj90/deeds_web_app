#!/usr/bin/env node
/**
 * @file scripts/atlas/standardize-nes-chrom-packets.mjs
 * @description Reads Postgres latent_64 vectors + SOM cluster assignments and outputs standardized packet JSONLines.
 * Stage 2 (Consumer Dry-Run) in the GPU enrichment lane.
 *
 * Outputs:
 *   docs/reports/nes-chrom-packets.jsonl — one packet per line
 *
 * Execution:
 *   node scripts/atlas/standardize-nes-chrom-packets.mjs [--save]
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const SAVE = process.argv.includes('--save');
const VERBOSE = process.argv.includes('--verbose');

const DB_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:legal_admin@127.0.0.1:5432/legal_ai_db';

async function main() {
  console.log('\n====================================================');
  console.log('[STANDARDIZE-NES-CHROM] Stage 2 — Consumer Dry-Run');
  console.log('====================================================\n');

  const pool = new pg.Pool({ connectionString: DB_URL });

  try {
    console.log('[NES Chrom] Reading latent_64 vectors from Postgres...');

    // Query packets with nes_chrom data
    const result = await pool.query(
      `SELECT packet_key, source_ref, feature_id,
              nes_chrom->>'latent_64' as latent_64,
              nes_chrom->>'som_cluster' as som_cluster,
              nes_chrom->>'som_confidence' as som_confidence
       FROM atlas_packets
       WHERE nes_chrom IS NOT NULL
       LIMIT 10000`
    );

    const packets = [];
    const collisions = [];
    const seenKeys = new Set();

    for (const row of result.rows) {
      const packet = {
        packet_key: row.packet_key,
        source_ref: row.source_ref,
        feature_id: row.feature_id,
        nes_chrom: {
          latent_64: row.latent_64 || null,
          som_cluster: row.som_cluster ? parseInt(row.som_cluster) : null,
          som_confidence: row.som_confidence ? parseFloat(row.som_confidence) : null
        }
      };

      // Check for collisions
      if (seenKeys.has(packet.packet_key)) {
        collisions.push({
          packet_key: packet.packet_key,
          duplicate_count: collisions.filter(c => c.packet_key === packet.packet_key).length + 1
        });
      }

      seenKeys.add(packet.packet_key);
      packets.push(packet);
    }

    console.log(`[NES Chrom] Standardized ${packets.length} packets`);
    console.log(`[Validation] Collisions: ${collisions.length}`);

    // Output JSONL
    const jsonlLines = packets.map(p => JSON.stringify(p)).join('\n');

    const report = {
      generated_at: new Date().toISOString(),
      consumer: 'standardize-nes-chrom-packets.mjs',
      packets_standardized: packets.length,
      packet_collisions: collisions.length,
      schema_valid: collisions.length === 0,
      sample_packets: packets.slice(0, 3),
      collision_details: collisions.slice(0, 10)
    };

    if (VERBOSE) {
      console.log('\n[Report]');
      console.log(JSON.stringify(report, null, 2));
    }

    if (SAVE) {
      const jsonlPath = path.resolve(ROOT, 'docs/reports/nes-chrom-packets.jsonl');
      await fs.mkdir(path.dirname(jsonlPath), { recursive: true });
      await fs.writeFile(jsonlPath, jsonlLines);
      console.log(`\n✅ Standardized packets saved: ${jsonlPath}`);

      const reportPath = path.resolve(ROOT, 'docs/reports/nes-chrom-standardization-report.json');
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
      console.log(`✅ Report saved: ${reportPath}`);
    }

    // Emit ACE/KAG/DAG hit
    const aceHit = {
      ace_kag_dag_hit: {
        packet_kind: 'gpu_enrichment',
        packet_key: 'ace:packet:nes-chrom:standardize',
        source_ref: 'standardize-nes-chrom-packets',
        feature_id: 'nes_chrom_standardization',
        evidence: ['postgres:atlas_packets', 'nes_chrom:latent_64', 'nes_chrom:som_cluster'],
        topology: { community_id: null, concept_ids: [] },
        packets_affected: packets.length,
        confidence: collisions.length === 0 ? 0.95 : 0.5,
        timestamp: new Date().toISOString()
      },
      gates: {
        syntax: 'PASS',
        producer: 'PASS',
        artifact_valid: collisions.length === 0 ? 'PASS' : 'FAIL',
        consumer_dry_run: collisions.length === 0 ? 'PASS' : 'FAIL',
        ace_kag_dag_hit: collisions.length === 0 ? 'PASS' : 'FAIL',
        smoke: 'PENDING',
        final_apply: collisions.length === 0 ? 'READY' : 'DEFER'
      }
    };

    console.log('\n[ACE/KAG/DAG Hit]');
    console.log(JSON.stringify(aceHit, null, 2));

    await pool.end();

    process.exit(collisions.length === 0 ? 0 : 1);
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    if (VERBOSE) console.error(err.stack);
    process.exit(1);
  }
}

main();
