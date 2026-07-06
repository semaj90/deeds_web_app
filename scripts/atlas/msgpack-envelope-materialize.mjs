#!/usr/bin/env node

/**
 * MsgPack Envelope Materialization
 *
 * Serialize validated atlas_packets to MsgPack binary format for hot cache layer
 *
 * Schema per packet:
 * {
 *   packet_key: string,
 *   title_id: string,
 *   feature_id: string,
 *   feature_label: string,
 *   source_ref: string,
 *   directory_path: string,
 *   som_row: uint8 | null,
 *   som_col: uint8 | null,
 *   som_index: uint16 | null (row * 20 + col),
 *   page_rank_score: float32 | null,
 *   community_id: int32 | null,
 *   k_core: int32 | null,
 *   domain_class: string,
 *   tree_node_id: string,
 *   concept_ids: string[], (array of concept IDs)
 *   embedding_dim: uint16 (384),
 *   has_embedding: boolean,
 *   canonical: boolean (true if all required fields present)
 * }
 *
 * Output: MsgPack files per 1000-packet batch for streaming ingest
 * Storage: scripts/atlas/export/packets-batch-*.msgpack
 *
 * Usage:
 *   node scripts/atlas/msgpack-envelope-materialize.mjs --dry-run --limit=100
 *   node scripts/atlas/msgpack-envelope-materialize.mjs --apply --limit=1000 --batch-size=100
 */

import pg from 'pg';
import msgpack from 'msgpack5';
import { config } from 'dotenv';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

config({ path: resolve('.', '.env') });

const env = loadRepoEnv(process.env);
const POSTGRES_URL = resolveDatabaseUrl(env);
const pgPool = new pg.Pool({ connectionString: POSTGRES_URL });

const mp = msgpack();

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const LIMIT = parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '58365');
const BATCH_SIZE = parseInt(process.argv.find(arg => arg.startsWith('--batch-size='))?.split('=')[1] || '1000');

const OUTPUT_DIR = resolve('.', 'scripts', 'atlas', 'export');

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  MsgPack Envelope Materialization                              ║');
console.log('║  Serialize packets to binary cache format for hot layer        ║');
console.log(`║  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'.padEnd(54)}║`);
console.log(`║  Limit: ${LIMIT.toString().padEnd(58)}║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

async function msgpackMaterialize() {
  try {
    console.log('📊 Step 1: Fetch validated packets from Postgres\n');

    const query = `
      SELECT
        ap.packet_key,
        ap.title_id,
        ap.feature_id,
        ap.feature_label,
        ap.source_ref,
        ap.directory_path,
        ap.som_row,
        ap.som_col,
        ap.page_rank_score,
        ap.community_id,
        ap.k_core,
        ap.domain_class,
        ap.tree_node_id,
        ap.concept_ids,
        CASE WHEN cci.content_embedding IS NOT NULL THEN 384 ELSE 0 END as embedding_dim,
        CASE WHEN cci.content_embedding IS NOT NULL THEN true ELSE false END as has_embedding,
        (ap.packet_key IS NOT NULL
          AND ap.feature_id IS NOT NULL
          AND ap.domain_class IS NOT NULL) as canonical
      FROM atlas_packets ap
      LEFT JOIN codebase_chunk_index cci ON ap.source_ref = cci.source_ref
      ORDER BY ap.packet_key
      LIMIT $1
    `;

    const packetsRes = await pgPool.query(query, [LIMIT]);
    const packets = packetsRes.rows;

    console.log(`Fetched ${packets.length} packets\n`);

    if (DRY_RUN) {
      console.log('📋 DRY-RUN: Envelope Schema\n');
      console.log('Envelope structure per packet:');
      console.log('  ├─ packet_key (string) — primary identity');
      console.log('  ├─ title_id (string) — semantic label');
      console.log('  ├─ feature_id (string) — feature grouping');
      console.log('  ├─ feature_label (string) — human-readable label');
      console.log('  ├─ source_ref (string) — file or semantic reference');
      console.log('  ├─ directory_path (string) — directory grouping');
      console.log('  ├─ som_row (uint8|null) — SOM grid row (0-19)');
      console.log('  ├─ som_col (uint8|null) — SOM grid col (0-19)');
      console.log('  ├─ som_index (uint16|null) — SOM cell ID (row*20+col)');
      console.log('  ├─ page_rank_score (float32|null) — graph authority');
      console.log('  ├─ community_id (int32|null) — Louvain community');
      console.log('  ├─ k_core (int32|null) — K-Core centrality');
      console.log('  ├─ domain_class (string) — error/semantic class');
      console.log('  ├─ tree_node_id (string) — AST node identity');
      console.log('  ├─ concept_ids (string[]) — semantic concepts');
      console.log('  ├─ embedding_dim (uint16) — 384 if has_embedding else 0');
      console.log('  ├─ has_embedding (bool) — indexed in Qdrant');
      console.log('  └─ canonical (bool) — all required fields present');
      console.log();

      console.log(`Sample envelopes (first 3 of ${packets.length}):\n`);
      packets.slice(0, 3).forEach((row, idx) => {
        const somIndex = row.som_row !== null && row.som_col !== null ? row.som_row * 20 + row.som_col : null;
        console.log(`${idx + 1}. ${row.packet_key}`);
        console.log(`   Title: ${row.title_id || '(null)'}`);
        console.log(`   Feature: ${row.feature_id} / ${row.feature_label}`);
        console.log(`   Domain: ${row.domain_class}`);
        console.log(`   SOM: ${row.som_row !== null ? `(${row.som_row}, ${row.som_col})` : 'null'} → index=${somIndex}`);
        console.log(`   PageRank: ${row.page_rank_score?.toFixed(3) || 'null'}`);
        console.log(`   Canonical: ${row.canonical ? '✓' : '✗'}`);
        console.log();
      });

      console.log(`📦 Batch Plan (batch_size=${BATCH_SIZE}, total_packets=${packets.length}):\n`);
      const numBatches = Math.ceil(packets.length / BATCH_SIZE);
      console.log(`  Total batches: ${numBatches}`);
      console.log(`  Output: scripts/atlas/export/packets-batch-NNNN.msgpack`);
      console.log(`  Each file contains ~${BATCH_SIZE} MsgPack objects`);
      console.log();

      // Estimate binary size
      const sampleSize = mp.encode({
        packet_key: 'ace:packet:example',
        title_id: 'Example Title',
        feature_id: 'auth.sessions',
        feature_label: 'Authentication Sessions',
        source_ref: 'src/lib/server/auth.ts',
        directory_path: 'src/lib/server',
        som_row: 5,
        som_col: 10,
        som_index: 110,
        page_rank_score: 3.14159,
        community_id: 42,
        k_core: 5,
        domain_class: 'Valid',
        tree_node_id: 'node:auth:001',
        concept_ids: ['auth', 'session', 'validation'],
        embedding_dim: 384,
        has_embedding: true,
        canonical: true,
      }).length;

      console.log(`📏 Size Estimation:\n`);
      console.log(`  Sample envelope: ~${sampleSize} bytes`);
      console.log(`  Expected per batch (${BATCH_SIZE} packets): ~${(sampleSize * BATCH_SIZE / 1024).toFixed(2)} KB`);
      console.log(`  Total estimated: ~${(sampleSize * packets.length / 1024 / 1024).toFixed(2)} MB`);
      console.log();

      console.log('✅ DRY-RUN complete. Use --apply to materialize.\n');

    } else {
      console.log('💾 Step 1: Create output directory\n');
      mkdirSync(OUTPUT_DIR, { recursive: true });
      console.log(`Output: ${OUTPUT_DIR}\n`);

      console.log('💾 Step 2: Materialize MsgPack batches\n');

      let batchNum = 0;
      let batchIndex = [];
      let materialized = 0;

      for (let i = 0; i < packets.length; i += BATCH_SIZE) {
        const batch = packets.slice(i, i + BATCH_SIZE);
        const batchId = String(batchNum).padStart(4, '0');
        const batchFile = resolve(OUTPUT_DIR, `packets-batch-${batchId}.msgpack`);

        const batchEnvelopes = batch.map(row => {
          const somIndex = row.som_row !== null && row.som_col !== null ? row.som_row * 20 + row.som_col : null;
          return {
            packet_key: row.packet_key,
            title_id: row.title_id || null,
            feature_id: row.feature_id,
            feature_label: row.feature_label || null,
            source_ref: row.source_ref || null,
            directory_path: row.directory_path || null,
            som_row: row.som_row || null,
            som_col: row.som_col || null,
            som_index: somIndex,
            page_rank_score: row.page_rank_score || null,
            community_id: row.community_id || null,
            k_core: row.k_core || null,
            domain_class: row.domain_class,
            tree_node_id: row.tree_node_id,
            concept_ids: row.concept_ids || [],
            embedding_dim: row.embedding_dim || 0,
            has_embedding: row.has_embedding || false,
            canonical: row.canonical,
          };
        });

        // Encode to MsgPack
        const encoded = Buffer.concat(batchEnvelopes.map(env => mp.encode(env)));

        writeFileSync(batchFile, encoded);
        console.log(`  ✅ Batch ${batchId}: ${batch.length} packets, ${(encoded.length / 1024).toFixed(2)} KB`);

        batchIndex.push({
          batch_id: batchId,
          file: `packets-batch-${batchId}.msgpack`,
          row_start: i,
          row_end: i + batch.length,
          count: batch.length,
          size_bytes: encoded.length,
        });

        materialized += batch.length;
        batchNum++;
      }

      console.log();

      // Write index file
      console.log('📑 Step 3: Write batch index\n');
      const indexFile = resolve(OUTPUT_DIR, 'packets-batch-index.json');
      const indexContent = {
        version: 1,
        total_packets: materialized,
        total_batches: batchNum,
        batch_size: BATCH_SIZE,
        created_at: new Date().toISOString(),
        envelope_schema: {
          packet_key: 'string',
          title_id: 'string|null',
          feature_id: 'string',
          som_row: 'uint8|null',
          som_col: 'uint8|null',
          som_index: 'uint16|null',
          page_rank_score: 'float32|null',
          community_id: 'int32|null',
          canonical: 'boolean',
        },
        batches: batchIndex,
      };

      writeFileSync(indexFile, JSON.stringify(indexContent, null, 2));
      console.log(`✅ Index: ${indexFile}`);
      console.log(`   Total size: ${(batchIndex.reduce((sum, b) => sum + b.size_bytes, 0) / 1024 / 1024).toFixed(2)} MB`);
      console.log();

      console.log('✅ MsgPack materialization complete!');
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    if (process.argv.includes('--verbose')) console.error(err.stack);
    process.exit(1);
  } finally {
    await pgPool.end();
  }
}

msgpackMaterialize();
