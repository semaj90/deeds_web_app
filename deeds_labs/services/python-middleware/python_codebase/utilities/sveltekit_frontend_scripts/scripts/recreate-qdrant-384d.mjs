#!/usr/bin/env node
/**
 * Recreate Qdrant collection for 384d embeddings
 */
import { QdrantClient } from '@qdrant/js-client-rest';

const qdrant = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });
const collectionName = 'error_embeddings';

console.log('🔧 Recreating Qdrant collection for 384d vectors...\n');

try {
  // Delete old collection if exists
  console.log(`🗑️  Deleting old collection: ${collectionName}`);
  try {
    await qdrant.deleteCollection(collectionName);
    console.log('✅ Old collection deleted');
  } catch (e) {
    console.log('ℹ️  No existing collection found');
  }

  // Create new collection
  console.log(`\n📦 Creating new collection: ${collectionName}`);
  await qdrant.createCollection(collectionName, {
    vectors: {
      size: 384, // Memory-optimized embeddinggemma:latest
      distance: 'Cosine'
    },
    optimizers_config: {
      default_segment_number: 2
    },
    replication_factor: 2
  });
  console.log('✅ Collection created with 384d vectors');

  // Verify
  const info = await qdrant.getCollection(collectionName);
  console.log(`\n📊 Collection Info:`);
  console.log(`  • Name: ${info.name}`);
  console.log(`  • Vector Size: ${info.config.params.vectors.size}`);
  console.log(`  • Distance: ${info.config.params.vectors.distance}`);
  console.log(`\n✅ Qdrant ready for phase43 pipeline!`);

} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
