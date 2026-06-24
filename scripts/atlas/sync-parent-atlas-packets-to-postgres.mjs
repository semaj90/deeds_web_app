#!/usr/bin/env node
/**
 * Sync Parent Atlas Packets from .tmp/parent-atlas-packets.ndjson to Postgres
 *
 * Purpose:
 *   Ingests enriched packets from Rust parser output (.tmp/parent_atlas_packets/parent-atlas-packets.ndjson)
 *   into Postgres atlas_packets table. Performs UPSERT to avoid duplicates.
 *
 * Input:
 *   .tmp/parent_atlas_packets/parent-atlas-packets.ndjson (239 packets with som + embeddings)
 *
 * Output:
 *   Synced packets in atlas_packets table
 *   Report: sync-parent-atlas-packets-{timestamp}.json
 *
 * Usage:
 *   node scripts/atlas/sync-parent-atlas-packets-to-postgres.mjs [--apply] [--verbose]
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const VERBOSE = argv.includes('--verbose');
const DRY_RUN = !APPLY;

const DB_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const NDJSON_PATH = path.join(ROOT, '.tmp/parent_atlas_packets/parent-atlas-packets.ndjson');

const db = new pg.Pool({ connectionString: DB_URL, max: 5 });

function log(...args) { console.log(...args); }
function vlog(...args) { if (VERBOSE) console.log(...args); }

/**
 * Map parent-atlas packet to atlas_packets row
 */
function mapPacketToAtlasRow(packet) {
  const embedding = packet.payload?.embedding_768 || packet.embedding_768;
  return {
    packet_key: packet.packet_id || packet.packet_hash,
    source_ref: packet.source_path || packet.packet_id,
    directory_path: path.dirname(packet.source_path || ''),
    file_path: packet.source_path,
    feature_id: 'parent-atlas:packet', // Default, may be overridden by payload
    feature_label: packet.title || packet.summary?.substring(0, 100) || 'Parent Atlas Packet',
    packet_id: packet.packet_id, // Store original ID
    embedding: embedding ? JSON.stringify(embedding) : null, // Will be converted to vector type
    summary: packet.summary,
    tags: ['parent-atlas', 'rust-parsed'],
    payload: JSON.stringify({
      som_bmu_index: packet.som_bmu_index,
      som_bmu_row: packet.som_bmu_row,
      som_bmu_col: packet.som_bmu_col,
      cluster_id: packet.cluster_id,
      exported_at: packet.exported_at || new Date().toISOString(),
      ...packet.payload
    }),
    som_index: Math.round(packet.som_bmu_index) || null,
    som_row: Math.round(packet.som_bmu_row) || null,
    som_col: Math.round(packet.som_bmu_col) || null,
    cluster_id: packet.cluster_id,
    source_kind: 'parent-atlas',
    canonical: true
  };
}

async function syncPackets() {
  log(`\n═══ Parent Atlas Packets → Postgres Sync ═══\n`);

  if (!fs.existsSync(NDJSON_PATH)) {
    log(`❌ NDJSON file not found: ${NDJSON_PATH}`);
    process.exit(1);
  }

  let totalRead = 0;
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalFailed = 0;
  const failedPackets = [];

  try {
    // Step 1: Count total lines
    log(`1. Reading NDJSON file: ${NDJSON_PATH}`);

    const fileStream = fs.createReadStream(NDJSON_PATH);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    const packets = [];
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        packets.push(JSON.parse(line));
        totalRead++;
      } catch (e) {
        vlog(`   ⚠️ Parse error on line ${totalRead + 1}: ${e.message}`);
        totalFailed++;
      }
    }

    log(`   ✅ Loaded ${packets.length} packets`);

    // Step 2: UPSERT into atlas_packets
    log(`\n2. Syncing to atlas_packets table...`);

    if (APPLY && packets.length > 0) {
      const BATCH_SIZE = 50;

      for (let i = 0; i < packets.length; i += BATCH_SIZE) {
        const batch = packets.slice(i, i + BATCH_SIZE);

        try {
          for (const packet of batch) {
            const row = mapPacketToAtlasRow(packet);

            // Verify packet_key is unique and not null
            if (!row.packet_key) {
              vlog(`   ⚠️ Skipping packet with missing packet_key`);
              totalFailed++;
              continue;
            }

            try {
              // UPSERT: insert or update on conflict
              const result = await db.query(
                `INSERT INTO atlas_packets (
                  packet_id, packet_key, source_ref, directory_path, file_path,
                  feature_id, feature_label, embedding, summary, tags, payload,
                  som_index, som_row, som_col, cluster_id, source_kind, canonical,
                  updated_at
                ) VALUES (
                  gen_random_uuid(), $1, $2, $3, $4,
                  $5, $6, CASE WHEN $7::text IS NOT NULL THEN ($7::text)::vector(768) ELSE NULL END,
                  $8, $9, $10, $11, $12, $13, $14, $15, $16, now()
                )
                ON CONFLICT (packet_key) DO UPDATE SET
                  feature_id = EXCLUDED.feature_id,
                  feature_label = EXCLUDED.feature_label,
                  embedding = EXCLUDED.embedding,
                  summary = EXCLUDED.summary,
                  payload = EXCLUDED.payload,
                  som_index = EXCLUDED.som_index,
                  som_row = EXCLUDED.som_row,
                  som_col = EXCLUDED.som_col,
                  cluster_id = EXCLUDED.cluster_id,
                  source_kind = EXCLUDED.source_kind,
                  canonical = EXCLUDED.canonical,
                  updated_at = now()
                RETURNING packet_key`,
                [
                  row.packet_key,
                  row.source_ref,
                  row.directory_path,
                  row.file_path,
                  row.feature_id,
                  row.feature_label,
                  row.embedding,
                  row.summary,
                  row.tags,
                  row.payload,
                  row.som_index,
                  row.som_row,
                  row.som_col,
                  row.cluster_id,
                  row.source_kind,
                  row.canonical
                ]
              );

              if (result.rows[0]) {
                totalInserted++;
                vlog(`   ✓ ${row.packet_key}`);
              }
            } catch (e) {
              vlog(`   ❌ Packet ${row.packet_key}: ${e.message}`);
              totalFailed++;
              failedPackets.push({ packet_key: row.packet_key, error: e.message });
            }
          }

          if ((i + batch.length) % 100 === 0) {
            process.stdout.write(`\r   Synced ${Math.min(i + BATCH_SIZE, packets.length)}/${packets.length}`);
          }
        } catch (e) {
          log(`\n   ⚠️ Batch error: ${e.message}`);
        }
      }

      process.stdout.write('\n');
      log(`   ✅ Synced: ${totalInserted} packets`);
    } else if (packets.length > 0) {
      log(`   [Dry-run] Would sync ${packets.length} packets`);
    }

    // Step 3: Verify
    log(`\n3. Verifying sync...`);

    const verifyResult = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN source_kind = 'parent-atlas' THEN 1 END) as parent_atlas_packets,
        COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as with_embedding,
        COUNT(CASE WHEN som_index IS NOT NULL THEN 1 END) as with_som_index
      FROM atlas_packets
    `);

    const stats = verifyResult.rows[0];
    log(`   Total packets: ${stats.total}`);
    log(`   Parent Atlas packets: ${stats.parent_atlas_packets}`);
    log(`   With embeddings: ${stats.with_embedding} (${(100 * stats.with_embedding / stats.total).toFixed(1)}%)`);
    log(`   With SOM index: ${stats.with_som_index} (${(100 * stats.with_som_index / stats.total).toFixed(1)}%)`);

    // Step 4: Report
    const report = {
      timestamp: new Date().toISOString(),
      file: NDJSON_PATH,
      dryRun: DRY_RUN,
      summary: {
        totalRead,
        totalInserted,
        totalUpdated,
        totalFailed,
        failedPackets: failedPackets.slice(0, 10)
      },
      dbStats: {
        total_packets: parseInt(stats.total),
        parent_atlas_packets: parseInt(stats.parent_atlas_packets),
        with_embedding: parseInt(stats.with_embedding),
        with_som_index: parseInt(stats.with_som_index)
      }
    };

    console.log(JSON.stringify(report, null, 2));

    log(`\n✨ Done.`);
    process.exit(0);
  } catch (e) {
    log(`❌ Fatal error: ${e.message}`);
    console.error(e);
    process.exit(1);
  } finally {
    await db.end();
  }
}

syncPackets();
