#!/usr/bin/env node
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { Client } from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const filePath = args[0] || resolve(__dirname, '../../.tmp/ingest/parent-atlas-hypergraph.with-clusters.jsonl');
if (!fs.existsSync(filePath)) { console.error('File not found:', filePath); process.exit(2); }

const DATABASE_URL = process.env.DATABASE_URL || process.env.PGDATABASE || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';
const client = new Client({ connectionString: DATABASE_URL });

async function run() {
  await client.connect();
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  let buffer = '';
  let batch = [];
  const BATCH_SIZE = 500;

  for await (const chunk of stream) {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const obj = JSON.parse(line);
        batch.push(obj);
        if (batch.length >= BATCH_SIZE) {
          await flush(batch);
          batch = [];
        }
      } catch (e) {
        console.error('JSON parse error, skipping line:', e.message);
      }
    }
  }
  if (buffer.trim()) {
    try { batch.push(JSON.parse(buffer.trim())); } catch(e){ console.error('Final JSON parse error', e.message); }
  }
  if (batch.length) await flush(batch);
  await client.end();
  console.log('Done upsert.');
}

async function flush(rows) {
  const text = `INSERT INTO parent_atlas_records (id, lane, node_id, title, source_ref, payload, index_version, created_at)
  VALUES ${rows.map((_,i)=>`($${i*8+1},$${i*8+2},$${i*8+3},$${i*8+4},$${i*8+5},$${i*8+6},$${i*8+7},$${i*8+8})`).join(',')}
  ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, title = EXCLUDED.title, source_ref = EXCLUDED.source_ref, index_version = EXCLUDED.index_version;`;
  const values = [];
  for (const r of rows) {
    // tolerate multiple id sources: top-level id, node_id, record_id, or payload.id
    const id = r.id || r.node_id || r.record_id || (r.payload && r.payload.id) || null;
    // prefer node_id but fall back to payload.id for node_id as well
    const nodeId = r.node_id || (r.payload && r.payload.id) || null;
    values.push(id, r.lane || null, nodeId, r.title || null, r.source_ref || null, JSON.stringify(r.payload || r), r.index_version || 0, r.created_at || new Date().toISOString());
  }
  try {
    await client.query('BEGIN');
    await client.query(text, values);
    await client.query('COMMIT');
    console.log('Flushed', rows.length, 'rows');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('DB upsert error:', e.message);
    throw e;
  }
}

run().catch(e=>{ console.error(e); process.exit(1); });
