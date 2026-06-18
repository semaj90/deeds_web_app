#!/usr/bin/env node
/**
 * scripts/atlas/backfill-packet-metadata-to-postgres.mjs
 *
 * Backfills validated packet metadata, permissions, topology, vectors envelopes
 * and promoted scalar columns from .tmp/addressable-packets.validated.ndjson back to Postgres.
 *
 * Usage:
 *   npx tsx scripts/atlas/backfill-packet-metadata-to-postgres.mjs [--verbose] [--dry-run] [--apply] [--limit=N]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const INPUT_NDJSON = path.join(REPO_ROOT, '.tmp', 'addressable-packets.validated.ndjson');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'packet-metadata-topology-schema-pass.json');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const VERBOSE = process.argv.includes('--verbose');
const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

const limitArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

function floatArrayToBuffer(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const buffer = Buffer.alloc(arr.length * 4); // Float32 is 4 bytes
  for (let i = 0; i < arr.length; i++) {
    buffer.writeFloatLE(arr[i], i * 4);
  }
  return buffer;
}

async function main() {
  if (!fs.existsSync(INPUT_NDJSON)) {
    console.error(`Validated packet file not found: ${INPUT_NDJSON}. Run validate-addressable-packets.mjs --apply first.`);
    process.exit(1);
  }

  const pool = new Pool({ connectionString: DATABASE_URL });

  // Read validated packets
  const fileContent = fs.readFileSync(INPUT_NDJSON, 'utf8');
  const lines = fileContent.split('\n').filter(line => line.trim().length > 0);

  console.log(`Loaded ${lines.length} validated packets.`);
  const limitCount = Math.min(lines.length, LIMIT);
  if (LIMIT !== Infinity) {
    console.log(`Processing limit applied: ${limitCount} packets.`);
  }

  let successCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const errorsList = [];

  for (let i = 0; i < limitCount; i++) {
    let packet;
    try {
      packet = JSON.parse(lines[i]);
    } catch (err) {
      console.error(`Line ${i + 1} parse error:`, err.message);
      errorCount++;
      continue;
    }

    const {
      packet_key,
      permissions,
      metadata,
      topology,
      vectors,
      source_table,
    } = packet;

    if (!packet_key) {
      errorCount++;
      errorsList.push({ index: i, error: 'MISSING_PACKET_KEY' });
      continue;
    }

    // Determine target table - always backfill to canonical atlas_packets
    const table = 'atlas_packets';

    // Promoted scalars
    const pagerank = topology?.pagerank !== undefined ? topology.pagerank : null;
    const betweenness = topology?.betweenness !== undefined ? topology.betweenness : null;
    const eigenvector = topology?.eigenvector !== undefined ? topology.eigenvector : null;
    const neo4j_node_id = topology?.neo4j_node_id !== undefined ? topology.neo4j_node_id : null;
    const redis_centroid_key = topology?.centroid_id !== undefined ? topology.centroid_id : null;

    if (DRY_RUN) {
      if (VERBOSE && i < 5) {
        console.log(`[DRY-RUN] Would update ${table} packet_key=${packet_key}:`);
        console.log(`  permissions:`, JSON.stringify(permissions));
        console.log(`  metadata:`, JSON.stringify(metadata));
        console.log(`  topology:`, JSON.stringify(topology));
        console.log(`  vectors:`, JSON.stringify(vectors));
        console.log(`  pagerank=${pagerank}, neo4j_node_id=${neo4j_node_id}, redis_centroid_key=${redis_centroid_key}`);
      }
      successCount++;
      continue;
    }

    // APPLY updates
    try {
      if (table === 'atlas_packets') {
        const latent_64 = vectors?.latent_64 ? floatArrayToBuffer(vectors.latent_64) : null;
        const query = `
          UPDATE atlas_packets
          SET
            permissions = $1,
            metadata = $2,
            topology = $3,
            vectors = $4,
            pagerank = $5,
            betweenness = $6,
            eigenvector = $7,
            neo4j_node_id = $8,
            redis_centroid_key = $9,
            latent_64 = $10,
            updated_at = now()
          WHERE packet_key = $11
        `;
        const res = await pool.query(query, [
          JSON.stringify(permissions),
          JSON.stringify(metadata),
          JSON.stringify(topology),
          JSON.stringify(vectors),
          pagerank,
          betweenness,
          eigenvector,
          neo4j_node_id,
          redis_centroid_key,
          latent_64,
          packet_key,
        ]);
        if (res.rowCount > 0) {
          successCount++;
        } else {
          skippedCount++;
          if (VERBOSE) {
            console.log(`Packet key ${packet_key} not found in atlas_packets table.`);
          }
        }
      } else {
        // Feature packets or NES packets
        const query = `
          UPDATE ${table}
          SET
            permissions = $1,
            metadata = $2,
            topology = $3,
            vectors = $4,
            pagerank = $5,
            betweenness = $6,
            eigenvector = $7,
            neo4j_node_id = $8,
            redis_centroid_key = $9,
            updated_at = now()
          WHERE packet_key = $10
        `;
        const res = await pool.query(query, [
          JSON.stringify(permissions),
          JSON.stringify(metadata),
          JSON.stringify(topology),
          JSON.stringify(vectors),
          pagerank,
          betweenness,
          eigenvector,
          neo4j_node_id,
          redis_centroid_key,
          packet_key,
        ]);
        if (res.rowCount > 0) {
          successCount++;
        } else {
          skippedCount++;
          if (VERBOSE) {
            console.log(`Packet key ${packet_key} not found in ${table} table.`);
          }
        }
      }
    } catch (err) {
      console.error(`DB Update Error for packet_key=${packet_key}:`, err.message);
      errorCount++;
      errorsList.push({ packet_key, error: err.message });
    }
  }

  await pool.end();

  const report = {
    generated_at: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    total_processed: limitCount,
    success_count: successCount,
    skipped_count: skippedCount,
    error_count: errorCount,
    errors: errorsList,
  };

  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');

  console.log(`\n═══ Backfill Packet Metadata to Postgres ════════════════════`);
  console.log(`Mode:           ${report.mode}`);
  console.log(`Processed:      ${report.total_processed}`);
  console.log(`Success updates: ${report.success_count}`);
  console.log(`Skipped (not found): ${report.skipped_count}`);
  console.log(`Errors:         ${report.error_count}`);
  console.log(`Report written to: docs/reports/packet-metadata-topology-schema-pass.json`);

  process.exitCode = errorCount === 0 ? 0 : 1;
}

main().catch(err => {
  console.error('Backfill script crash:', err);
  process.exit(1);
});
