#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { QdrantClient } from '@qdrant/js-client-rest';

const ROOT = process.cwd();
const EMB_DIR = path.join(ROOT, '.opencode', 'embeddings');

async function main() {
  const url = process.env.QDRANT_URL || process.env.QDRANT_HOST;
  if (!url) {
    console.log('No Qdrant URL set (QDRANT_URL) — writing ndjson for later import.');
    const files = await fs.readdir(EMB_DIR).catch(() => []);
    const out = path.join(ROOT, '.opencode', 'qdrant-upload.ndjson');
    const stream = (await fs.open(out, 'w'));
    for (const f of files) {
      if (!/\.json$/.test(f)) continue;
      const j = JSON.parse(await fs.readFile(path.join(EMB_DIR, f), 'utf8'));
      const rec = { id: j.id, vector: j.vector, payload: j.metadata };
      await stream.write(JSON.stringify(rec) + '\n');
    }
    await stream.close();
    console.log('Wrote', out);
    return;
  }
  const client = new QdrantClient({ url });
  const collection = process.env.QDRANT_COLLECTION || 'rag_cards';
  // create collection if missing (assume 768 dims)
  try {
    await client.getCollection(collection);
  } catch (e) {
    await client.recreateCollection(collection, { vectors: { size: 768, distance: 'Cosine' } });
  }
  const files = await fs.readdir(EMB_DIR).catch(() => []);
  const points = [];
  for (const f of files) {
    if (!/\.json$/.test(f)) continue;
    const j = JSON.parse(await fs.readFile(path.join(EMB_DIR, f), 'utf8'));
    points.push({ id: j.id, vector: j.vector, payload: j.metadata });
    if (points.length >= 100) {
      await client.upsert(collection, { points });
      points.length = 0;
    }
  }
  if (points.length) await client.upsert(collection, { points });
  console.log('Upserted embeddings to Qdrant collection', collection);
}

main().catch(e => { console.error(e); process.exit(1); });
