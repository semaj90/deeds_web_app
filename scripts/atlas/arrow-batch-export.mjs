#!/usr/bin/env node

/**
 * Arrow Batch Export
 *
 * Serialize atlas_packets to Apache Arrow IPC format for mmap registry
 *
 * Format: Arrow IPC streaming (RecordBatch) with:
 *   - packet_key (string)
 *   - title_id (string)
 *   - feature_id (string)
 *   - feature_label (string)
 *   - source_ref (string)
 *   - directory_path (string)
 *   - packet_ulid (uint64)
 *   - page_rank_score (float32)
 *   - community_id (int32)
 *   - k_core (int32)
 *
 * Output: Arrow IPC file + offset index for O(1) lookup by packet_key
 *
 * Usage:
 *   node scripts/atlas/arrow-batch-export.mjs --dry-run
 *   node scripts/atlas/arrow-batch-export.mjs --apply
 */

import pg from 'pg';
import { Table, Field, Schema, DataType, Int32, Float32, Utf8, Uint64, RecordBatchWriter, RecordBatchFileWriter } from 'apache-arrow';
import { config } from 'dotenv';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

config({ path: resolve('.', '.env') });

const env = loadRepoEnv(process.env);
const POSTGRES_URL = resolveDatabaseUrl(env);
const pgPool = new pg.Pool({ connectionString: POSTGRES_URL });

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

// Output paths
const ARROW_OUTPUT_DIR = resolve('.', 'scripts', 'atlas', 'export');
const ARROW_PACKETS_FILE = resolve(ARROW_OUTPUT_DIR, 'packets.arrow');
const ARROW_INDEX_FILE = resolve(ARROW_OUTPUT_DIR, 'packets-index.json');

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Arrow Batch Export                                            ║');
console.log('║  Serialize packets to Arrow IPC format for mmap registry       ║');
console.log(`║  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'.padEnd(54)}║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

async function arrowBatchExport() {
  try {
    console.log('📊 Step 1: Fetch packets from Postgres\n');

    const packetsRes = await pgPool.query(`
      SELECT
        packet_key,
        title_id,
        feature_id,
        feature_label,
        source_ref,
        directory_path,
        packet_ulid,
        page_rank_score,
        community_id,
        k_core
      FROM atlas_packets
      ORDER BY packet_key
    `);

    const packets = packetsRes.rows;
    console.log(`Fetched ${packets.length} packets\n`);

    if (DRY_RUN) {
      console.log('📋 DRY-RUN: Would export Arrow batch\n');
      console.log(`Schema (10 columns):`);
      console.log(`  packet_key (string) - primary key`);
      console.log(`  title_id (string) - derived from summary`);
      console.log(`  feature_id (string) - feature identifier`);
      console.log(`  feature_label (string) - human label`);
      console.log(`  source_ref (string) - file reference`);
      console.log(`  directory_path (string) - directory grouping`);
      console.log(`  packet_ulid (uint64) - ULID timestamp`);
      console.log(`  page_rank_score (float32) - GDS PageRank`);
      console.log(`  community_id (int32) - Louvain community`);
      console.log(`  k_core (int32) - K-Core centrality`);
      console.log();

      console.log(`Output files:`);
      console.log(`  ${ARROW_PACKETS_FILE}`);
      console.log(`  ${ARROW_INDEX_FILE}`);
      console.log();

      console.log(`Sample rows:`);
      packets.slice(0, 3).forEach((row, idx) => {
        console.log(`  ${idx + 1}. ${row.packet_key} / ${row.feature_id}`);
        console.log(`     PR=${row.page_rank_score?.toFixed(3) || 'null'} | K=${row.k_core || 'null'} | Community=${row.community_id || 'null'}`);
      });
      console.log();

    } else {
      console.log('💾 Step 2: Build Arrow schema and data\n');

      // Define Arrow schema
      const schema = new Schema([
        new Field('packet_key', new Utf8()),
        new Field('title_id', new Utf8()),
        new Field('feature_id', new Utf8()),
        new Field('feature_label', new Utf8()),
        new Field('source_ref', new Utf8()),
        new Field('directory_path', new Utf8()),
        new Field('packet_ulid', new Uint64()),
        new Field('page_rank_score', new Float32()),
        new Field('community_id', new Int32()),
        new Field('k_core', new Int32()),
      ]);

      console.log(`Arrow schema created (10 columns)`);

      // Extract columns
      const columns = {
        packet_key: [],
        title_id: [],
        feature_id: [],
        feature_label: [],
        source_ref: [],
        directory_path: [],
        packet_ulid: [],
        page_rank_score: [],
        community_id: [],
        k_core: [],
      };

      for (const row of packets) {
        columns.packet_key.push(row.packet_key);
        columns.title_id.push(row.title_id || null);
        columns.feature_id.push(row.feature_id);
        columns.feature_label.push(row.feature_label || null);
        columns.source_ref.push(row.source_ref || null);
        columns.directory_path.push(row.directory_path || null);

        // ULID: derive from packet_key if possible, or use timestamp
        let ulid = 0n;
        if (row.packet_ulid) {
          ulid = BigInt(row.packet_ulid);
        } else {
          const now = Math.floor(Date.now() / 1000);
          ulid = BigInt(now);
        }
        columns.packet_ulid.push(ulid);

        columns.page_rank_score.push(row.page_rank_score || null);
        columns.community_id.push(row.community_id || null);
        columns.k_core.push(row.k_core || null);
      }

      // Create Arrow table
      const table = new Table({
        schema,
        columns: [
          columns.packet_key,
          columns.title_id,
          columns.feature_id,
          columns.feature_label,
          columns.source_ref,
          columns.directory_path,
          columns.packet_ulid,
          columns.page_rank_score,
          columns.community_id,
          columns.k_core,
        ],
      });

      console.log(`Arrow table created (${packets.length} rows)\n`);

      // Write Arrow IPC file
      mkdirSync(ARROW_OUTPUT_DIR, { recursive: true });

      const writer = new RecordBatchFileWriter(schema);
      writer.writeAll(table);
      const buffer = writer.finish();

      writeFileSync(ARROW_PACKETS_FILE, Buffer.from(buffer));
      console.log(`✅ Wrote Arrow file: ${ARROW_PACKETS_FILE}`);
      console.log(`   Size: ${(Buffer.from(buffer).length / 1024 / 1024).toFixed(2)} MB`);
      console.log();

      // Build offset index for O(1) lookup
      console.log('📑 Step 3: Build offset index\n');

      const offsets = {};
      let offset = 0;

      for (const [idx, row] of packets.entries()) {
        offsets[row.packet_key] = {
          row_index: idx,
          feature_id: row.feature_id,
          directory_path: row.directory_path,
        };
      }

      const indexContent = {
        version: 1,
        total_rows: packets.length,
        schema_version: 1,
        created_at: new Date().toISOString(),
        offsets,
      };

      writeFileSync(ARROW_INDEX_FILE, JSON.stringify(indexContent, null, 2));
      console.log(`✅ Wrote index file: ${ARROW_INDEX_FILE}`);
      console.log(`   Entries: ${Object.keys(offsets).length}`);
      console.log();
    }

    console.log('✅ Arrow batch export complete!');

  } catch (err) {
    console.error('❌ Error:', err.message);
    if (process.argv.includes('--verbose')) console.error(err.stack);
    process.exit(1);
  } finally {
    await pgPool.end();
  }
}

arrowBatchExport();
