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
  const EMBED_DIM = Number(process.env.EMBED_DIM ?? '768');

  // create collection if missing
  try {
    await client.getCollection(collection);
  } catch (e) {
    await client.recreateCollection(collection, {
      vectors: { size: EMBED_DIM, distance: 'Cosine' },
    });
  }

  // Helper: validate vectors and perform upsert in safe batches
  async function upsertValidated(client, collectionName, pts, batchSize = 100) {
    if (!Array.isArray(pts) || pts.length === 0) return;
    // Validate dimensions
    for (const p of pts) {
      const v = p?.vector;
      if (!Array.isArray(v) && !(v instanceof Float32Array)) {
        throw new Error(`Invalid vector for id=${String(p?.id)}: not an array`);
      }
      if (v.length !== EMBED_DIM) {
        throw new Error(
          `Invalid vector dimension for id=${String(p?.id)}: expected ${EMBED_DIM}, got ${v.length}`
        );
      }
    }
    // Batch upsert
    for (let i = 0; i < pts.length; i += batchSize) {
      const slice = pts.slice(i, i + batchSize);
      await client.upsert(collectionName, { points: slice });
    }
  }
  const files = await fs.readdir(EMB_DIR).catch(() => []);
  const points = [];
  for (const f of files) {
    if (!/\.json$/.test(f)) continue;
    const j = JSON.parse(await fs.readFile(path.join(EMB_DIR, f), 'utf8'));
    points.push({ id: j.id, vector: j.vector, payload: j.metadata });
    if (points.length >= 100) {
      await upsertValidated(client, collection, points);
      points.length = 0;
    }
  }
  if (points.length) await upsertValidated(client, collection, points);
  console.log('Upserted embeddings to Qdrant collection', collection);
}

main().catch(e => { console.error(e); process.exit(1); });
