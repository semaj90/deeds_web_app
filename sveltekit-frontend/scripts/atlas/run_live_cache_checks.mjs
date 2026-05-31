#!/usr/bin/env node
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

async function run() {
  const out = { timestamp: new Date().toISOString(), results: {} };

  // Redis DBSIZE
  try {
    const r = spawnSync('redis-cli', ['DBSIZE'], { encoding: 'utf8' });
    if (r.status === 0) {
      out.results.redis_dbsize = Number(r.stdout.trim()) || 0;
    } else {
      out.results.redis_dbsize_error = r.stderr || r.stdout;
    }
  } catch (e) {
    out.results.redis_dbsize_error = String(e);
  }

  // Postgres counts via DB client
  try {
    const clientModule = await import('../../src/lib/server/db/client.js');
    const pool = clientModule.pool;
    const client = await pool.connect();
    try {
      const res1 = await client.query('SELECT to_regclass(\'parent_atlas_records\') IS NOT NULL AS exists');
      const exists = res1.rows[0].exists;
      out.results.parent_atlas_records_exists = exists;
      if (exists) {
        const c = await client.query('SELECT count(*)::int as cnt FROM parent_atlas_records');
        out.results.parent_atlas_records_count = c.rows[0].cnt;
      }
      const res2 = await client.query("SELECT to_regclass('parent_atlas_vectors') IS NOT NULL AS exists");
      out.results.parent_atlas_vectors_exists = res2.rows[0].exists;
      if (res2.rows[0].exists) {
        const c2 = await client.query('SELECT count(*)::int as cnt FROM parent_atlas_vectors');
        out.results.parent_atlas_vectors_count = c2.rows[0].cnt;
      }
    } finally {
      client.release();
    }
  } catch (e) {
    out.results.postgres_error = String(e.message || e);
  }

  // Qdrant collections
  try {
    const curl = spawnSync('curl', ['-s', 'http://localhost:6333/collections'], { encoding: 'utf8' });
    if (curl.status === 0) {
      out.results.qdrant_collections_raw = curl.stdout.trim().slice(0, 2000);
    } else {
      out.results.qdrant_error = curl.stderr || curl.stdout;
    }
  } catch (e) {
    out.results.qdrant_error = String(e);
  }

  // Neo4j simple probe (HTTP)
  try {
    const curl = spawnSync('curl', ['-s', 'http://localhost:7474/db/data/'], { encoding: 'utf8' });
    if (curl.status === 0) {
      out.results.neo4j_http = curl.stdout.trim().slice(0, 2000);
    } else {
      out.results.neo4j_error = curl.stderr || curl.stdout;
    }
  } catch (e) {
    out.results.neo4j_error = String(e);
  }

  // Persist output to .tmp
  const outPath = path.join(ROOT, '.tmp', 'atlas-gate4-live-checks.json');
  try {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write live checks output:', e);
  }

  console.log('Live checks saved to', outPath);
  console.log(JSON.stringify(out, null, 2));
}

run().catch(e=>{ console.error(e); process.exit(1); });
