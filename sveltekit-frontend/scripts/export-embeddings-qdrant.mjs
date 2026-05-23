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
    // For named-vector collections (e.g. codebase_chunks_768 has {signature, content})
    // pick which vector to export. Default tries 'content' then first available key.
    else if (a === '--vector-name') out.vectorName = args[++i];
    else if (a === '--help') out.help = true;
  }
  return out;
}

// Resolve a flat Float[] from either a flat array or a named-vector dict.
function resolveVector(raw, preferredName) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    if (preferredName && Array.isArray(raw[preferredName])) return raw[preferredName];
    // Fallbacks: 'content', 'embedding', 'default', then first array-valued key
    for (const k of ['content', 'embedding', 'default']) {
      if (Array.isArray(raw[k])) return raw[k];
    }
    for (const k of Object.keys(raw)) {
      if (Array.isArray(raw[k])) return raw[k];
    }
  }
  return null;
}

async function main() {
  const cfg = parseArgs();
  if (cfg.help) {
    console.log(
      'Usage: node export-embeddings-qdrant.mjs --collection <name> --output <file> [--qdrant-url http://localhost:6333] [--batch 500]'
    );
    process.exit(0);
  }
  const qdrant = cfg.qdrant || 'http://127.0.0.1:6333';
  const coll = cfg.collection || process.env.QDRANT_EXPORT_COLLECTION || 'codebase_chunks_768';
  const out = cfg.output || process.env.QDRANT_EXPORT_OUTPUT || `tmp/${coll}-embeddings.ndjson`;
  const batch = cfg.batch || 500;

  fs.mkdirSync(path.dirname(out), { recursive: true });
  const ws = fs.createWriteStream(out, { flags: 'w' });

  // Qdrant scroll API uses cursor-based pagination via next_page_offset.
  // Response shape: { result: { points: [...], next_page_offset: <id|null> } }
  let cursor = null;
  let totalExported = 0;
  while (true) {
    const url = `${qdrant}/collections/${encodeURIComponent(coll)}/points/scroll`;
    const body = { limit: batch, with_vector: true, with_payload: true };
    if (cursor !== null) body.offset = cursor;
    const headers = { 'Content-Type': 'application/json' };
    if (cfg.apiKey) headers['api-key'] = cfg.apiKey;
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Qdrant request failed: ${res.status} ${res.statusText}`);
    const j = await res.json();
    // Handle both { result: { points, next_page_offset } } and legacy { points }
    const result = j.result ?? {};
    const points = Array.isArray(result.points)
      ? result.points
      : Array.isArray(result)
        ? result
        : Array.isArray(j.points)
          ? j.points
          : [];
    if (points.length === 0) break;
    for (const p of points) {
      const id = p.id ?? p.point_id ?? null;
      const rawVec = p.vector ?? p.payload?.vector ?? p.payload?.embedding ?? null;
      const flat = resolveVector(rawVec, cfg.vectorName);
      const stable_key = p.payload?.stable_key ?? p.payload?.stableKey ?? null;
      const source_ref = p.payload?.source_ref ?? p.payload?.sourceRef ?? null;
      const protocols = p.payload?.protocols ?? p.payload?.protocolDetected ?? [];

      if (Array.isArray(flat) && flat.length > 0) {
        ws.write(JSON.stringify({ id, stable_key, source_ref, protocols, embedding: flat }) + '\n');
        totalExported++;
      }
    }
    cursor = result.next_page_offset ?? null;
    console.log(`Exported ${totalExported} points...`);
    if (cursor === null || cursor === undefined) break;
  }
  ws.end();
  console.log('Finished export to', out);
}

main().catch(err => { console.error(err); process.exit(1); });
