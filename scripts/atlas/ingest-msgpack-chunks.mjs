#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { decode } from '../../sveltekit-frontend/node_modules/@msgpack/msgpack/dist.esm/index.mjs';
import { parseLargeJsonToMsgpack } from '../../crates/atlas_packet_parser/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

// Environment Loader
function loadEnv() {
  const env = { ...process.env };
  for (const p of [
    path.join(ROOT, 'sveltekit-frontend', '.env.local'),
    path.join(ROOT, 'sveltekit-frontend', '.env'),
    path.join(ROOT, '.env.local'),
    path.join(ROOT, '.env'),
  ]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

const env = loadEnv();
const DATABASE_URL = env.DATABASE_URL
  ?? `postgresql://${env.DB_USER ?? 'legal_admin'}:${env.DB_PASSWORD ?? '123456'}@${env.DB_HOST ?? '127.0.0.1'}:${env.DB_PORT ?? '5434'}/${env.DB_NAME ?? 'legal_ai_db'}`;

// Argument Parsing
const argv = new Set(process.argv.slice(2));
const APPLY = argv.has('--apply');
const DRY_RUN = !APPLY;

async function main() {
  const ndjsonPath = path.resolve(ROOT, '.tmp/parent_atlas_packets/parent-atlas-packets.ndjson');
  const outputDir = path.resolve(ROOT, 'memory/packets');
  const chunkSize = 1000;

  console.log('=== Phase 3I: Metadata Index Ingestion ===');
  console.log(`Source NDJSON: ${ndjsonPath}`);
  console.log(`Output Chunks Dir: ${outputDir}`);
  console.log(`Running mode: ${DRY_RUN ? 'DRY-RUN (Pass --apply to execute DB writes)' : 'APPLY (Writing to DB)'}`);

  if (!fs.existsSync(ndjsonPath)) {
    console.error(`Error: Source NDJSON file not found at ${ndjsonPath}`);
    process.exit(1);
  }

  // 1. Run Rust N-API Parser to generate MessagePack chunks
  console.log('\n[Parser] Running Rust N-API Parser...');
  const startParser = performance.now();
  const manifestJsonStr = parseLargeJsonToMsgpack(ndjsonPath, outputDir, chunkSize);
  const durationParser = performance.now() - startParser;
  console.log(`[Parser] Rust parser finished in ${durationParser.toFixed(2)}ms`);

  const manifest = JSON.parse(manifestJsonStr);
  console.log(`[Parser] Total rows discovered: ${manifest.total_rows}`);
  console.log(`[Parser] Generated chunks count: ${manifest.chunks.length}`);

  // 2. Database Ingestion
  console.log(`\n[Database] Connecting to ${DATABASE_URL.replace(/:[^:@/]+@/, ':****@')}...`);
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    // Quick validation
    const checkTable = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'atlas_packets'
      );
    `);
    if (!checkTable.rows[0].exists) {
      console.error("Error: 'atlas_packets' table does not exist. Please apply the schema first.");
      process.exit(1);
    }

    let insertedCount = 0;

    for (const chunk of manifest.chunks) {
      console.log(`\n[Ingest] Processing chunk: ${path.basename(chunk.chunk_path)} (${chunk.row_count} rows)...`);
      const chunkBytes = fs.readFileSync(chunk.chunk_path);
      const decodedRows = decode(chunkBytes);

      if (DRY_RUN) {
        console.log(`  [Dry-Run] Decoded ${decodedRows.length} rows successfully.`);
        insertedCount += decodedRows.length;
        continue;
      }

      // Execute ingestion in batches
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        for (const row of decodedRows) {
          const packet_id = row.packet_id;
          const artifact_id = row.packet_id;
          const source_ref = row.source_path || null;
          const feature_id = row.payload?.feature_id || null;
          const community_id = row.som_bmu_index !== undefined ? Number(row.som_bmu_index) : null;
          const concept_ids = null; // Staged for Phase 4
          const cluster_id = row.cluster_id !== undefined && row.cluster_id !== null ? Number(row.cluster_id) : null;
          
          const embedding_arr = row.payload?.embedding_768;
          const embedding = embedding_arr ? `[${embedding_arr.join(',')}]` : null;
          
          const payload = row.payload ? JSON.stringify(row.payload) : null;
          const summary = row.summary || null;
          const byte_start = row.payload?.byte_start !== undefined ? Number(row.payload.byte_start) : null;
          const byte_end = row.payload?.byte_end !== undefined ? Number(row.payload.byte_end) : null;
          const sha256 = row.packet_hash || row.source_hash || null;

          const queryText = `
            INSERT INTO atlas_packets (
              packet_id, artifact_id, source_ref, feature_id, community_id, 
              concept_ids, cluster_id, embedding, payload, summary, 
              byte_start, byte_end, sha256
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
            )
            ON CONFLICT (packet_id) DO UPDATE SET
              artifact_id = EXCLUDED.artifact_id,
              source_ref = EXCLUDED.source_ref,
              feature_id = EXCLUDED.feature_id,
              community_id = EXCLUDED.community_id,
              concept_ids = EXCLUDED.concept_ids,
              cluster_id = EXCLUDED.cluster_id,
              embedding = EXCLUDED.embedding,
              payload = EXCLUDED.payload,
              summary = EXCLUDED.summary,
              byte_start = EXCLUDED.byte_start,
              byte_end = EXCLUDED.byte_end,
              sha256 = EXCLUDED.sha256
          `;

          await client.query(queryText, [
            packet_id, artifact_id, source_ref, feature_id, community_id,
            concept_ids, cluster_id, embedding, payload, summary,
            byte_start, byte_end, sha256
          ]);
        }

        await client.query('COMMIT');
        insertedCount += decodedRows.length;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Error during batch query inside chunk ${chunk.chunk_path}:`, err);
        throw err;
      } finally {
        client.release();
      }
    }

    console.log(`\n=== Ingestion Summary ===`);
    console.log(`Total packets processed: ${insertedCount}`);
    if (DRY_RUN) {
      console.log('Status: Dry-run complete. No database changes were made.');
    } else {
      console.log('Status: Ingested successfully into public.atlas_packets table.');
    }
  } catch (err) {
    console.error('\nDatabase failure:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
