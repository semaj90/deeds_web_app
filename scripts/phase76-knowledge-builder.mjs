// scripts/phase76-knowledge-builder.mjs
// Phase 76 Level 2: Knowledge Builder
// Crawls documentation, generates embeddings, stores in Qdrant + MinIO + Postgres

import { llamaChat } from './atlas/lib/llama-inference.mjs';
import { QdrantClient } from '@qdrant/js-client-rest';
import { storeDeepKnowledge } from './phase76-storage-layer.mjs';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Qdrant client
const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333'
});

const COLLECTION_NAME = 'phase76_knowledge_base';

/**
 * Ensure Qdrant collection exists
 */
async function ensureCollection() {
  try {
    await qdrant.getCollection(COLLECTION_NAME);
    console.log(`✅ Collection "${COLLECTION_NAME}" exists`);
  } catch (err) {
    console.log(`📦 Creating collection "${COLLECTION_NAME}"...`);
    await qdrant.createCollection(COLLECTION_NAME, {
      vectors: {
        size: 768,
        distance: 'Cosine'
      }
    });
    console.log(`✅ Collection created`);
  }
}

/**
 * Fetch and process a URL
 * @param {string} url - URL to crawl
 */
async function processUrl(url) {
  console.log(`\n🔍 Processing: ${url}`);

  try {
    // 1. Fetch the page
    console.log(`   📥 Fetching content...`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const html = await response.text();

    // 2. Extract text (simple extraction - you can enhance this)
    const markdown = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (markdown.length < 100) {
      console.log(`   ⚠️  Content too short, skipping`);
      return;
    }

    // 3. Generate summary using LLM
    console.log(`   🤖 Generating summary...`);
    const summaryData = { response: await llamaChat(`Summarize this documentation in 2-3 sentences:\n\n${markdown.slice(0, 4000)}`, { maxTokens: 300 }) }; // llama-server (Ornith 1.5); Ollama is embeddings-only
    const summary = summaryData.response || markdown.slice(0, 500);

    // 4. Generate Embedding
    console.log(`   🧠 Generating embedding...`);
    const embeddingResponse = await fetch('http://localhost:11434/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'embeddinggemma:latest',
        prompt: summary
      })
    });

    if (!embeddingResponse.ok) {
      throw new Error(`Embedding failed: ${embeddingResponse.statusText}`);
    }

    const { embedding } = await embeddingResponse.json();

    if (!embedding || embedding.length !== 768) {
      throw new Error(`Invalid embedding dimension: ${embedding?.length}`);
    }

    // 5. Generate MinIO key
    const minioKey = `${url.replace(/[^a-z0-9]/gi, '_')}.json`;

    // 6. Store in Qdrant (Search Layer)
    console.log(`   💾 Storing in Qdrant...`);
    await qdrant.upsert(COLLECTION_NAME, {
      points: [
        {
          id: Date.now(),
          vector: embedding,
          payload: {
            url: url,
            summary: summary,
            minio_key: minioKey,
            indexed_at: new Date().toISOString(),
            content_length: markdown.length
          }
        }
      ]
    });

    // 7. Store in Deep Storage (MinIO + Postgres)
    console.log(`   💾 Storing in MinIO + Postgres...`);
    await storeDeepKnowledge(
      minioKey,
      {
        url,
        summary,
        full_text: markdown,
        indexed_at: new Date().toISOString()
      },
      embedding
    );

    console.log(`   ✅ Ingested: ${url}`);
  } catch (err) {
    console.error(`   ❌ Failed to process ${url}:`, err.message);
  }
}

/**
 * Main function
 */
async function main() {
  const urls = process.argv.slice(2);

  if (urls.length === 0) {
    console.log(`
📚 Phase 76 Knowledge Builder

Usage:
  node scripts/phase76-knowledge-builder.mjs <url1> <url2> ...

Example:
  node scripts/phase76-knowledge-builder.mjs \\
    "https://svelte.dev/docs/svelte/v5-migration-guide" \\
    "https://kit.svelte.dev/docs/migrating-to-sveltekit-2"
    `);
    process.exit(1);
  }

  console.log(`🚀 Phase 76 Knowledge Builder`);
  console.log(`📊 Processing ${urls.length} URL(s)...\n`);

  // Ensure collection exists
  await ensureCollection();

  // Process each URL
  for (const url of urls) {
    await processUrl(url);
  }

  console.log(`\n✅ Knowledge building complete!`);
  console.log(`📊 Indexed ${urls.length} documents`);
  console.log(`💾 Stored in: Qdrant + MinIO + Postgres`);
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
