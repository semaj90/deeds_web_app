// Initialize Qdrant collections for Phase 72/76/78
import { QdrantClient } from '@qdrant/js-client-rest';

const client = new QdrantClient({ url: 'http://127.0.0.1:6333' });

const collections = [
  'phase72_evidence_embeddings',
  'phase72_summaries',
  'phase76_knowledge_base',
  'phase72_error_patterns'
];

async function initCollections() {
  console.log("🔌 Connecting to Qdrant at http://127.0.0.1:6333...\n");

  for (const name of collections) {
    try {
      const collections = await client.getCollections();
      const exists = collections.collections.some(c => c.name === name);

      if (!exists) {
        console.log(`✨ Creating collection: ${name}`);
        // CRITICAL: Using 768 to match embeddinggemma:latest model
        await client.createCollection(name, {
          vectors: {
            size: 768,
            distance: 'Cosine'
          }
        });
        console.log(`   ✅ Created successfully\n`);
      } else {
        console.log(`✅ Collection already exists: ${name}\n`);
      }
    } catch (error) {
      console.error(`❌ Error processing ${name}:`, error.message);
    }
  }

  console.log("✅ Qdrant initialization complete!");
}

initCollections().catch(console.error);