#!/usr/bin/env node
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import crypto from 'crypto';
import { fileURLToPath } from 'node:url';

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || 'scenarios';
const BATCH = Number(process.env.BATCH) || 64;

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function pseudoEmbed(text, dim = 768) {
  // Deterministic pseudo-embedding for smoke: derive floats from sha256
  const h = sha256Hex(text);
  const buf = Buffer.from(h, 'hex');
  const out = new Float32Array(dim);
  for (let i = 0; i < dim; i++) {
    out[i] = (buf[i % buf.length] / 255) * 2 - 1; // [-1,1]
  }
  return Array.from(out);
}

async function realEmbedIfConfigured(texts) {
  const EMBED_URL = process.env.EMBED_URL;
  if (!EMBED_URL) return null;
  try {
    const res = await fetch(EMBED_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts })
    });
    if (!res.ok) throw new Error(`embed service ${res.status}`);
    const data = await res.json();
    // Expect data.embeddings: [ [..], ... ]
    return data.embeddings || null;
  } catch (e) {
    console.error('Embed service call failed, falling back to pseudo-embed', e.message);
    return null;
  }
}

async function upsertBatchToQdrant(points) {
  const url = `${QDRANT_URL.replace(/\/$/, '')}/collections/${encodeURIComponent(QDRANT_COLLECTION)}/points/updates`;
  // Qdrant accepts upsert via /points?wait=true in older APIs; use /points/updates for modern preview
  const payload = { points };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Qdrant upsert failed ${res.status}: ${txt}`);
  }
  return res.json();
}

async function ensureCollection() {
  const url = `${QDRANT_URL.replace(/\/$/, '')}/collections/${encodeURIComponent(QDRANT_COLLECTION)}`;
  const res = await fetch(url);
  if (res.status === 200) return;
  // create minimal collection
  const createUrl = `${QDRANT_URL.replace(/\/$/, '')}/collections`;
  const body = {
    name: QDRANT_COLLECTION,
    vectors: { size: 768, distance: 'Cosine' }
  };
  const r = await fetch(createUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('Failed to create qdrant collection: ' + await r.text());
}

async function readScenariosFromFile(file) {
  const stat = await fs.stat(file);
  if (!stat.isFile()) throw new Error('Input not a file');
  const out = [];
  const lines = (await fs.readFile(file, 'utf8')).split(/\r?\n/).filter(Boolean);
  for (const ln of lines) {
    try {
      const obj = JSON.parse(ln);
      out.push(obj);
    } catch (e) {
      console.warn('Skipping invalid JSONL line');
    }
  }
  return out;
}

async function fetchScenariosFromApi() {
  const api = process.env.SCENARIO_API || 'http://localhost:5173/api/ai/scenario?all=1';
  const res = await fetch(api);
  if (!res.ok) throw new Error('Failed to fetch scenarios from API: ' + res.status);
  return await res.json();
}

async function main() {
  const input = process.argv[2];
  let scenarios = [];
  if (input && fsSync.existsSync(input)) {
    scenarios = await readScenariosFromFile(input);
  } else {
    console.log('No input file; fetching scenarios from API...');
    scenarios = await fetchScenariosFromApi();
  }
  if (!Array.isArray(scenarios)) throw new Error('Scenarios must be an array');
  console.log(`Loaded ${scenarios.length} scenarios`);

  await ensureCollection();

  const embedsConfigured = !!process.env.EMBED_URL;

  let i = 0;
  while (i < scenarios.length) {
    const batch = scenarios.slice(i, i + BATCH);
    const texts = batch.map(s => s.text || s.prompt || s.name || '');
    let embeddings = null;
    if (embedsConfigured) embeddings = await realEmbedIfConfigured(texts);
    if (!embeddings) embeddings = texts.map(t => pseudoEmbed(t));

    const points = batch.map((s, idx) => {
      const id = s.content_hash || sha256Hex(String(s.source_ref || s.name || s.text || idx));
      return {
        id,
        vector: embeddings[idx],
        payload: {
          source_ref: s.source_ref || null,
          content_hash: s.content_hash || id,
          name: s.name || null,
          text: (s.text || s.prompt || '').slice(0, 2000)
        }
      };
    });

    await upsertBatchToQdrant(points).catch(e => { console.error('Qdrant upsert error', e); process.exit(1); });
    console.log(`Upserted batch ${i}-${i + batch.length}`);
    i += BATCH;
  }
  console.log('Done indexing scenarios to Qdrant.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
