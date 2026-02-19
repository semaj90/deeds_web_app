#!/usr/bin/env node
import { embedDocument, embedVision } from '../src/lib/server/ai/embedding';
import { upsertToPGVector } from '../src/lib/server/vector/pgvector';
import { upsertToQdrant } from '../src/lib/server/vector/qdrant';

async function indexSamples() {
  const docs = [
    { id: 'doc-1', text: 'Example legal contract about lease agreements', source: 'sample' },
    { id: 'doc-2', text: 'Another legal memo about tort law and negligence', source: 'sample' },
  ];

  for (const d of docs) {
    const embedded = await embedDocument(d as any);
    await upsertToPGVector(embedded as any);
    await upsertToQdrant(embedded as any);
    console.log('Indexed', embedded.id);
  }
}

indexSamples().catch((err) => {
  console.error(err);
  process.exit(1);
});
