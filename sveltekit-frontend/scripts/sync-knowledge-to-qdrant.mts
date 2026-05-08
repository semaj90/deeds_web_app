#!/usr/bin/env tsx
/**
 * Sync knowledge_base from PostgreSQL to Qdrant
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import postgres from 'postgres';

const sql = postgres('postgresql://legal_admin:legal_admin_pass@localhost:5434/legal_ai_db');
const qdrant = new QdrantClient({ url: 'http://localhost:6333' });

const COLLECTION = 'phase79_knowledge_base';
const BATCH_SIZE = 100;

async function main() {
  console.log('🔄 Syncing knowledge_base to Qdrant...\n');

  // 1. Ensure collection exists with correct config
  console.log('1️⃣ Checking Qdrant collection...');
  try {
    await qdrant.getCollection(COLLECTION);
    console.log(`   ✅ Collection ${COLLECTION} exists`);
  } catch {
    console.log(`   📦 Creating collection ${COLLECTION}...`);
    await qdrant.createCollection(COLLECTION, {
      vectors: {
        size: 768,
        distance: 'Cosine',
      },
    });
    console.log('   ✅ Collection created');
  }

  // 2. Fetch all items with embeddings from PostgreSQL
  console.log('\n2️⃣ Fetching items from PostgreSQL...');
  const items = await sql<Array<{
    id: number;
    chunk_id: string;
    content: string;
    embedding: string; // pgvector returns as string, need to parse
    chunk_type: string;
    source_file: string;
    metadata: any;
  }>>`
    SELECT id, chunk_id, content, embedding::text as embedding, chunk_type, source_file, metadata
    FROM knowledge_base
    WHERE embedding IS NOT NULL
    ORDER BY id
  `;
  console.log(`   ✅ Found ${items.length} items with embeddings`);

  // 3. Upload to Qdrant in batches
  console.log('\n3️⃣ Uploading to Qdrant...');
  let uploaded = 0;
  let errors = 0;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);

    const points = batch.map(item => {
      // Parse pgvector string format: "[0.1,0.2,0.3,...]" -> [0.1, 0.2, 0.3, ...]
      let vector: number[];
      try {
        vector = JSON.parse(item.embedding.replace(/[\[\]]/g, match => match === '[' ? '[' : ']'));
      } catch {
        // Fallback: split by comma and parse manually
        vector = item.embedding
          .replace(/^\[|\]$/g, '')
          .split(',')
          .map(v => parseFloat(v.trim()));
      }

      // Ensure vector is exactly 768 dimensions
      if (vector.length !== 768) {
        console.warn(`   ⚠️  Item ${item.id} has ${vector.length} dimensions, expected 768`);
        return null;
      }

      return {
        id: item.id,
        vector,
        payload: {
          chunk_id: item.chunk_id,
          content: item.content.substring(0, 1000), // Limit payload size
          chunk_type: item.chunk_type,
          source_file: item.source_file || 'unknown',
          metadata: item.metadata,
        },
      };
    }).filter(Boolean); // Remove nulls

    if (points.length === 0) {
      console.log(`   ⏭️  Skipped batch ${i}-${i + BATCH_SIZE} (no valid vectors)`);
      continue;
    }

    try {
      await qdrant.upsert(COLLECTION, {
        wait: true,
        points,
      });

      uploaded += points.length;
      console.log(`   📤 Uploaded ${uploaded}/${items.length} items...`);
    } catch (err: any) {
      console.error(`   ❌ Batch failed: ${err.message}`);
      errors += batch.length;
    }
  }

  // 4. Verify
  console.log('\n4️⃣ Verifying sync...');
  const info = await qdrant.getCollection(COLLECTION);
  console.log(`   ✅ Qdrant now has ${info.points_count} points`);
  console.log(`   ✅ PostgreSQL has ${items.length} items`);

  if (errors > 0) {
    console.log(`   ⚠️  ${errors} items failed to upload`);
  }

  if (info.points_count === items.length) {
    console.log('\n✅ Sync complete! All knowledge items now in Qdrant.\n');
  } else {
    console.log(`\n⚠️  Mismatch: Qdrant=${info.points_count}, PG=${items.length}\n`);
  }

  await sql.end();
}main().catch(console.error);
