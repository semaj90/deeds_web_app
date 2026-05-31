#!/usr/bin/env node
// backfill_embeddings_768.mjs
// Dry-run by default. Backfills `embedding_768` vector column by calling an embedding API
// and optionally upserting into Qdrant. Requires env: DATABASE_URL, EMBEDDING_API (or pass --embed-url).

import { Client } from 'pg';
import fs from 'fs';

const argv = process.argv.slice(2);
const params = Object.fromEntries(argv.map((a, i) => {
  if (!a.startsWith('--')) return [];
  const key = a.replace(/^--/, '');
  const val = argv[i+1] && !argv[i+1].startsWith('--') ? argv[i+1] : 'true';
  return [key, val];
}).filter(Boolean));

const TABLE = params.table || 'agent_memory_observations';
const ID_COL = params['id-col'] || 'id';
const LIMIT = Number(params.limit || 50);
const DRY = params.dry !== 'false' && params.dry !== false && !params.apply;
const EMBED_URL = params['embed-url'] || process.env.EMBEDDING_API || process.env.OLLAMA_BASE_URL;
const QDRANT_URL = params['qdrant-url'] || process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_COLLECTION = params['qdrant-collection'] || TABLE;

if (!process.env.DATABASE_URL) {
  console.error('Please set DATABASE_URL environment variable.');
  process.exit(1);
}

if (!EMBED_URL) {
  console.error('Please set EMBEDDING_API (or pass --embed-url).');
  process.exit(1);
}

async function fetchEmbedding(text) {
  // Caller must ensure EMBED_URL expects POST with {text} and returns {embedding: number[]}
  const resp = await fetch(EMBED_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: text })
  });
  if (!resp.ok) throw new Error(`embed request failed: ${resp.status} ${await resp.text()}`);
  const j = await resp.json();
  // Try common shapes
  if (Array.isArray(j)) return j[0]?.embedding || j[0];
  if (j.embedding) return j.embedding;
  if (j.data && j.data[0] && j.data[0].embedding) return j.data[0].embedding;
  throw new Error('Unknown embedding response shape: ' + JSON.stringify(j).slice(0,200));
}

async function upsertQdrant(id, vector, payload={}){
  const url = `${QDRANT_URL.replace(/\/$/, '')}/collections/${encodeURIComponent(QDRANT_COLLECTION)}/points?wait=true`;
  const body = { points: [ { id: id.toString(), vector, payload } ] };
  const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Qdrant upsert failed: ${res.status} ${text}`);
  }
  return await res.json();
}

async function main(){
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log(`Connected to Postgres. Table=${TABLE} id_col=${ID_COL} limit=${LIMIT} dry=${DRY}`);

  const selectSql = `SELECT ${ID_COL}, coalesce(content, summary, '' ) as text_content FROM ${TABLE} WHERE embedding_768 IS NULL LIMIT $1 FOR UPDATE SKIP LOCKED`;
  const res = await client.query(selectSql, [LIMIT]);
  console.log(`Found ${res.rows.length} rows to process.`);

  for (const row of res.rows) {
    const id = row[ID_COL];
    const text = row.text_content || row.content || row.chunk_text || '';
    if (!text) {
      console.log(id, 'no text to embed; skipping');
      continue;
    }
    console.log('Embedding id=', id);
    let emb;
    try {
      if (DRY) {
        emb = new Array(768).fill(0).map((_,i)=>0);
      } else {
        emb = await fetchEmbedding(text);
      }
    } catch (err) {
      console.error('Embedding failed for', id, err.message);
      continue;
    }

    if (!Array.isArray(emb)) {
      console.error('Embedding not array for id', id, typeof emb, emb?.length);
      continue;
    }
    if (emb.length !== 768) {
      console.warn(`Embedding dim ${emb.length} != 768 for id ${id}`);
    }

    if (DRY) {
      console.log(`DRY: would update ${TABLE}.${ID_COL}=${id} embedding_768 (dim=${emb.length})`);
      continue;
    }

    try {
      const updateSql = `UPDATE ${TABLE} SET embedding_768 = $1 WHERE ${ID_COL} = $2`;
      await client.query(updateSql, [emb, id]);
      console.log('Wrote embedding_768 for', id);
    } catch (err) {
      console.error('Postgres update failed for', id, err.message);
      continue;
    }

    if (params['qdrant'] === 'true' || params['qdrant']) {
      try {
        await upsertQdrant(id, emb);
        console.log('Upserted to Qdrant for', id);
      } catch (err) {
        console.error('Qdrant upsert failed for', id, err.message);
      }
    }
  }

  await client.end();
  console.log('Done.');
}

main().catch(err=>{ console.error(err); process.exit(1); });

/*
Usage examples:
  # dry-run default: shows what would be done
  node backfill_embeddings_768.mjs --table agent_memory_observations --limit 20

  # real run (set EMBEDDING_API env to an endpoint that accepts {input} and returns embeddings)
  EMBEDDING_API=https://api.example.com/embeddings node backfill_embeddings_768.mjs --table agent_memory_observations --limit 50 --apply --qdrant true

Notes:
 - This script is a safe template. Validate EMBEDDING_API payload/response shapes before running with --apply.
 - For production, run the migration first (drizzle/manual/9999_add_embedding_768_columns.sql), then run this script in small batches.
*/
