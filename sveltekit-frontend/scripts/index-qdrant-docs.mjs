import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSingleEmbedding } from '../src/lib/server/grpc/embedding-client.js';
import { qdrant } from '../src/lib/server/vector/qdrant-manager.js';
import { upsertValidated } from '../../scripts/lib/upsert-validated.mjs';
import crypto from 'crypto';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DOC_FILE = 'C:/Users/james/.gemini/antigravity/brain/9930b33c-0a99-45e6-abf7-308a1e625560/.system_generated/steps/1227/content.md';
const COLLECTION = 'qdrant_docs';

async function main() {
  const content = readFileSync(DOC_FILE, 'utf-8');
  const sections = content.split(/\n# /);

  const points = [];

  for (let i = 0; i < sections.length; i++) {
    const section = (i === 0 ? '' : '# ') + sections[i];
    if (section.trim().length < 50) continue;

    console.log(`Embedding section ${i}...`);
    const embedding = await generateSingleEmbedding(section.slice(0, 1000));

    if (embedding && (Array.isArray(embedding) || embedding instanceof Float32Array)) {
      if (embedding.length !== Number(process.env.EMBED_DIM ?? '768')) {
        console.warn(`Skipping section ${i}: embedding dim ${embedding.length} != expected ${process.env.EMBED_DIM ?? '768'}`);
        continue;
      }
      points.push({
        id: crypto.randomUUID(),
        vector: embedding,
        payload: {
          title: section.split('\n')[0].replace(/^#+ /, ''),
          content: section,
          url: 'https://qdrant.tech/documentation/examples/graphrag-qdrant-neo4j/',
          source: 'qdrant-docs'
        }
      });
    }
  }

  if (points.length > 0) {
    console.log(`Upserting ${points.length} points to ${COLLECTION}...`);
    await upsertValidated({
      client: qdrant,
      collection: COLLECTION,
      points,
      expectedDim: Number(process.env.EMBED_DIM ?? 768),
      wait: true,
    });
    console.log('✓ Indexing complete.');
  } else {
    console.log('⚠ No points to index.');
  }
}

main().catch(console.error);
