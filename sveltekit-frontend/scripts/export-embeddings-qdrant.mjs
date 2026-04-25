#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--qdrant-url') out.qdrant = args[++i];
    else if (a === '--collection') out.collection = args[++i];
    else if (a === '--output') out.output = args[++i];
    else if (a === '--batch') out.batch = Number(args[++i]);
    else if (a === '--api-key') out.apiKey = args[++i];
    else if (a === '--help') out.help = true;
  }
  return out;
}

async function main() {
  const cfg = parseArgs();
  if (cfg.help || !cfg.collection) {
    console.log('Usage: node export-embeddings-qdrant.mjs --collection <name> --output <file> [--qdrant-url http://localhost:6333] [--batch 500]');
    process.exit(cfg.help ? 0 : 1);
  }
  const qdrant = cfg.qdrant || 'http://127.0.0.1:6333';
  const coll = cfg.collection;
  const out = cfg.output || `sveltekit-frontend/tmp/${coll}-embeddings.ndjson`;
  const batch = cfg.batch || 500;

  fs.mkdirSync(path.dirname(out), { recursive: true });
  const ws = fs.createWriteStream(out, { flags: 'w' });

  let offset = 0;
  while (true) {
    const url = `${qdrant}/collections/${encodeURIComponent(coll)}/points/scroll`;
    const body = { limit: batch, offset, with_vector: true, with_payload: false };
    const headers = { 'Content-Type': 'application/json' };
    if (cfg.apiKey) headers['api-key'] = cfg.apiKey;
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Qdrant request failed: ${res.status} ${res.statusText}`);
    const j = await res.json();
    const points = j.result || j.points || [];
    if (!points.length) break;
    for (const p of points) {
      const id = p.id ?? p.point_id ?? null;
      const vector = p.vector ?? p.payload?.vector ?? p.payload?.embedding ?? null;
      const payload = p.payload ?? null;
      if (!vector) {
        // try payload fields
        if (payload && Array.isArray(payload.embedding)) {
          ws.write(JSON.stringify({ id, embedding: payload.embedding }) + '\n');
        } else {
          // skip
          continue;
        }
      } else {
        ws.write(JSON.stringify({ id, embedding: vector }) + '\n');
      }
    }
    offset += points.length;
    console.log(`Exported ${offset} points...`);
    if (points.length < batch) break;
  }
  ws.end();
  console.log('Finished export to', out);
}

main().catch(err => { console.error(err); process.exit(1); });
