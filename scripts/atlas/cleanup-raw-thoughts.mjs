#!/usr/bin/env node
/**
 * scripts/atlas/cleanup-raw-thoughts.mjs
 *
 * Purges raw LLM thoughts/tags from database metadata and payloads.
 */

import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function loadEnv() {
  const env = { ...process.env };
  const envPaths = [
    path.join(ROOT, 'sveltekit-frontend', '.env'),
    path.join(ROOT, '.env'),
  ];
  for (const p of envPaths) {
    if (fs.existsSync(p)) {
      for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
      break;
    }
  }
  return env;
}

const ENV = loadEnv();
const DATABASE_URL = ENV.DATABASE_URL ||
  `postgresql://${ENV.DB_USER ?? 'legal_admin'}:${ENV.DB_PASSWORD ?? '123456'}@${ENV.DB_HOST ?? '127.0.0.1'}:${ENV.DB_PORT ?? '5434'}/${ENV.DB_NAME ?? 'legal_ai_db'}`;

async function main() {
  console.log(`[cleanup:thoughts] Connecting to database...`);
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    // 1. Clean parent_atlas_documents.payload
    console.log('[cleanup:thoughts] Cleaning parent_atlas_documents...');
    const res1 = await pool.query(`
      UPDATE parent_atlas_documents
      SET payload = payload - 'derived_enrichment'
      WHERE payload->'derived_enrichment'->>'summary' LIKE '%<|channel>thought%'
    `);
    console.log(`  -> Cleared ${res1.rowCount} records`);

    // 2. Clean atlas_packets.metadata
    console.log('[cleanup:thoughts] Cleaning atlas_packets...');
    const res2 = await pool.query(`
      UPDATE atlas_packets
      SET metadata = metadata - 'derived_enrichment'
      WHERE metadata->'derived_enrichment'->>'summary' LIKE '%<|channel>thought%'
    `);
    console.log(`  -> Cleared ${res2.rowCount} records`);

    // 3. Clean nes_chrom_packets.metadata
    console.log('[cleanup:thoughts] Cleaning nes_chrom_packets...');
    const res3 = await pool.query(`
      UPDATE nes_chrom_packets
      SET metadata = metadata - 'derived_enrichment'
      WHERE metadata->'derived_enrichment'->>'summary' LIKE '%<|channel>thought%'
    `);
    console.log(`  -> Cleared ${res3.rowCount} records`);

    console.log('[cleanup:thoughts] Done.');
  } catch (err) {
    console.error(`[cleanup:thoughts] Error:`, err);
  } finally {
    await pool.end();
  }
}

main();
