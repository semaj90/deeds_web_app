#!/usr/bin/env node
// Quick script to audit PG AIO settings via Node.js pg client
import pg from 'pg';
import { loadAtlasEnv } from './atlas/load-atlas-env.mjs';
const { Pool } = pg;

loadAtlasEnv();
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL_REQUIRED');
}

const pool = new Pool({
  connectionString: databaseUrl,
  connectionTimeoutMillis: 5000,
});

const ver = await pool.query('SELECT version()');
console.log('Version:', ver.rows[0].version);

// PG18 AIO settings (io_method, io_workers, io_max_concurrency)
const aio = await pool.query(`
  SELECT name, setting, unit, context, source
  FROM pg_settings
  WHERE name IN ('io_method','io_workers','io_max_concurrency','effective_io_concurrency','maintenance_io_concurrency')
  ORDER BY name
`);

if (aio.rows.length === 0) {
  console.log('\nNo PG18 AIO-specific settings found (io_method/io_workers) — this is PG17 or earlier.');
} else {
  console.log('\nAIO Settings:');
  aio.rows.forEach(r => console.log(` ${r.name} = ${r.setting} (${r.source})`));
}

// Settings available in all PG versions
const io = await pool.query(`
  SELECT name, setting, unit, context
  FROM pg_settings
  WHERE name IN ('effective_io_concurrency','maintenance_io_concurrency','random_page_cost','seq_page_cost')
  ORDER BY name
`);
console.log('\nI/O tuning settings (all versions):');
io.rows.forEach(r => console.log(` ${r.name} = ${r.setting}`));

// Atlas workload quick stats
const stats = await pool.query(`
  SELECT
    (SELECT COUNT(*) FROM atlas_packets) AS atlas_packets,
    (SELECT COUNT(*) FROM codebase_chunk_index) AS chunks,
    (SELECT COUNT(*) FROM codebase_chunk_index WHERE content_embedding IS NOT NULL) AS chunks_with_embedding
`);
console.log('\nAtlas workload:');
console.log(' atlas_packets:', stats.rows[0].atlas_packets);
console.log(' codebase_chunk_index:', stats.rows[0].chunks);
console.log(' with embeddings:', stats.rows[0].chunks_with_embedding);

await pool.end();
