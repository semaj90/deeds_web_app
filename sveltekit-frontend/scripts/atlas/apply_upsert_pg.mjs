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
      } catch (e) {
        console.error('JSON parse error, skipping line:', e.message);
      }
      if (batch.length >= BATCH_SIZE) {
        await flush(batch);
        batch = [];
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
  // Deduplicate rows in the batch by ID, keeping the last occurrence
  const uniqueRows = [];
  const seenIds = new Set();
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    const id = r.id || r.node_id || r.record_id || (r.payload && r.payload.id) || null;
    if (id) {
      if (seenIds.has(id)) continue;
      seenIds.add(id);
    }
    uniqueRows.unshift(r);
  }

  const text = `INSERT INTO parent_atlas_records (id, lane, node_id, title, source_ref, payload, index_version, created_at)
  VALUES ${uniqueRows.map((_,i)=>`($${i*8+1},$${i*8+2},$${i*8+3},$${i*8+4},$${i*8+5},$${i*8+6},$${i*8+7},$${i*8+8})`).join(',')}
  ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, title = EXCLUDED.title, source_ref = EXCLUDED.source_ref, index_version = EXCLUDED.index_version;`;
  const values = [];
  for (const r of uniqueRows) {
    const id = r.id || r.node_id || r.record_id || (r.payload && r.payload.id) || null;
    const nodeId = r.node_id || (r.payload && r.payload.id) || id || null;
    const lane = r.lane || r.lane_id || 'features';
    values.push(
      id === undefined ? null : id,
      lane,
      nodeId === undefined ? null : nodeId,
      r.title === undefined ? null : r.title,
      r.source_ref === undefined ? null : r.source_ref,
      JSON.stringify(r.payload || r),
      r.index_version === undefined ? 0 : r.index_version,
      r.created_at === undefined ? new Date().toISOString() : r.created_at
    );
  }
  const sanitizedValues = values.map(v => v === undefined ? null : v);
  try {
    await client.query('BEGIN');
    await client.query(text, sanitizedValues);
    await client.query('COMMIT');
    console.log('Flushed', rows.length, 'rows');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('DB upsert error:', e.message);
    throw e;
  }
}

run().catch(e=>{ console.error(e); process.exit(1); });
