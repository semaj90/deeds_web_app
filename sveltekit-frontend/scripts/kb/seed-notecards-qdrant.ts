import { QdrantClient } from '@qdrant/js-client-rest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateEmbedding } from '../../src/lib/server/grpc/embedding-client.js';
import { ENV } from '../../src/lib/server/env.server.js';

/**
 * seed-notecards-qdrant.ts
 * 
 * Syncs the N8 lexical notecards (from codesbase-graph.json or Redis)
 * to Qdrant collection 'kb_notecards' for Lane 1 hybrid search.
 */

const COLLECTION = 'kb_notecards';
const qdrant = new QdrantClient({ url: ENV.QDRANT_URL });

async function main() {
  console.log(`[kb-seed] Syncing to Qdrant collection: ${COLLECTION}...`);

  // 1. Ensure collection exists
  const collections = await qdrant.getCollections();
  if (!collections.collections.some(c => c.name === COLLECTION)) {
    console.log(`[kb-seed] Creating collection ${COLLECTION}...`);
    await qdrant.createCollection(COLLECTION, {
      vectors: { size: 768, distance: 'Cosine' }
    });
  }

  // 2. Load notecards
  // For now, we'll pull from the codebase-graph.json
  const graphPath = resolve('docs/graph/codebase-graph.json');
  if (!existsSync(graphPath)) {
    console.error(`[kb-seed] Graph JSON missing: ${graphPath}`);
    process.exit(1);
  }

  const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
  const files = graph.files || [];

  console.log(`[kb-seed] Found ${files.length} candidate cards.`);

  // 3. Batch Ingest
  const BATCH_SIZE = 50;
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const points = [];

    for (const file of batch) {
      if (!file.summary) continue;

      const vector = await generateEmbedding(file.summary);
      if (!vector) continue;

      points.push({
        id: crypto.randomUUID(),
        vector,
        payload: {
          card_id: `card:path:${file.rel}`,
          source_path: file.rel,
          content: file.summary,
          tags: file.tags,
          kind: file.isRoute ? 'route' : 'file'
        }
      });
    }

    if (points.length > 0) {
      await qdrant.upsert(COLLECTION, { wait: true, points });
      console.log(`[kb-seed] Ingested ${i + points.length}/${files.length}...`);
    }
  }

  console.log('[kb-seed] Seeding complete.');
}

main().catch(console.error);
