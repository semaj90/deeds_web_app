#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = resolve(__dirname, '../..');
const FRONTEND_ROOT = join(REPO_ROOT, 'sveltekit-frontend');
const ENV_PATH = join(FRONTEND_ROOT, '.env');
const NES_GLYPH_PATH = join(FRONTEND_ROOT, 'docs', 'graph', 'nes-glyph-architecture.json');

function loadEnv() {
  if (!existsSync(ENV_PATH)) return {};
  const content = readFileSync(ENV_PATH, 'utf8');
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const env = loadEnv();
const DATABASE_URL = env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';

async function main() {
  if (!existsSync(NES_GLYPH_PATH)) {
    console.error(`[ERROR] nes-glyph-architecture.json not found at ${NES_GLYPH_PATH}`);
    process.exit(1);
  }

  console.log(`📖 Reading nes-glyph-architecture.json from ${NES_GLYPH_PATH}...`);
  const nes = JSON.parse(readFileSync(NES_GLYPH_PATH, 'utf8'));
  const nodes = nes.nodes || [];
  
  // Build a lookup map of file/rel paths (normalized) to cluster/som info
  const fileLookup = new Map();
  for (const node of nodes) {
    if (!node.stableKey || !node.stableKey.startsWith('file:')) continue;
    const rel = node.stableKey.replace(/^file:/, '').replace(/\\/g, '/');
    const relWithoutFrontend = rel.replace(/^sveltekit-frontend\//, '').toLowerCase();
    const relWithFrontend = rel.startsWith('sveltekit-frontend/') ? rel.toLowerCase() : `sveltekit-frontend/${rel}`.toLowerCase();
    
    const clusterKey = node.clusterKey || null;
    let clusterId = null;
    if (clusterKey && clusterKey.startsWith('cluster:gpu:')) {
      clusterId = parseInt(clusterKey.split(':').pop(), 10);
    }
    
    const somBmuRow = node.manifold4 ? node.manifold4[0] : null;
    const somBmuCol = node.manifold4 ? node.manifold4[1] : null;
    const clusterSource = node.clusterSource || null;
    const clusterConfidence = node.clusterConfidence || null;

    const info = { clusterId, somBmuRow, somBmuCol, clusterSource, clusterConfidence };
    fileLookup.set(relWithoutFrontend, info);
    fileLookup.set(relWithFrontend, info);
  }
  console.log(`  ✓ Created lookup table with ${fileLookup.size} path variations.`);

  console.log('📡 Connecting to PostgreSQL database...');
  const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 5000
  });

  const client = await pool.connect();
  try {
    console.log('📥 Fetching all records from parent_atlas_records...');
    const recordsRes = await client.query('SELECT id, source_ref, payload FROM parent_atlas_records');
    console.log(`  ✓ Retrieved ${recordsRes.rows.length} records.`);

    await client.query('BEGIN');
    let updatedCount = 0;
    
    // Batch updates of 500
    const BATCH_SIZE = 500;
    let currentBatch = [];
    
    for (const row of recordsRes.rows) {
      if (!row.source_ref) continue;
      
      // Normalize source_ref: strip #chunk-... suffix and standardize slashes
      const cleanSourceRef = row.source_ref.split('#')[0].replace(/\\/g, '/').replace(/^\.\//, '').trim().toLowerCase();
      
      const info = fileLookup.get(cleanSourceRef);
      if (info) {
        currentBatch.push({
          id: row.id,
          payload: {
            ...row.payload,
            clusterId: info.clusterId,
            somBmuRow: info.somBmuRow,
            somBmuCol: info.somBmuCol,
            clusterSource: info.clusterSource,
            clusterConfidence: info.clusterConfidence
          }
        });

        if (currentBatch.length >= BATCH_SIZE) {
          await flushBatch(client, currentBatch);
          updatedCount += currentBatch.length;
          currentBatch = [];
        }
      }
    }

    if (currentBatch.length > 0) {
      await flushBatch(client, currentBatch);
      updatedCount += currentBatch.length;
    }

    await client.query('COMMIT');
    console.log(`🎉 Direct DB update complete. Successfully updated ${updatedCount} JSONB records.`);

  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[ERROR] Direct DB cluster update failed:', e);
  } finally {
    client.release();
    await pool.end();
  }
}

async function flushBatch(client, batch) {
  const values = [];
  const placeholders = [];
  let idx = 1;
  
  for (const item of batch) {
    values.push(item.id, JSON.stringify(item.payload));
    placeholders.push(`($${idx++}, $${idx++}::jsonb)`);
  }

  const sql = `
    UPDATE parent_atlas_records AS r
    SET payload = u.payload
    FROM (VALUES ${placeholders.join(',')}) AS u(id, payload)
    WHERE r.id = u.id
  `;

  await client.query(sql, values);
}

main().catch(e => {
  console.error('[FATAL]', e);
  process.exit(1);
});
