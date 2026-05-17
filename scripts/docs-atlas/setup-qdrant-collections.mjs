#!/usr/bin/env node
import 'dotenv/config';

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';

async function setup() {
  const collections = [
    { name: 'external_programming_docs_768', size: 768 },
    { name: 'external_programming_docs_64d', size: 64 },
    { name: 'external_api_examples', size: 768 },
    { name: 'external_error_fixes', size: 768 }
  ];

  for (const col of collections) {
    console.log(`[qdrant] Setting up collection: ${col.name}...`);
    try {
      const res = await fetch(`${QDRANT_URL}/collections/${col.name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vectors: { 
            size: col.size, 
            distance: 'Cosine',
            on_disk: true 
          },
          hnsw_config: {
            on_disk: true
          }
        })
      });
      if (res.ok) console.log(`✅ Collection ${col.name} created.`);
      else console.log(`⚠️ Collection ${col.name} already exists or failed: ${res.statusText}`);
    } catch (e) {
      console.error(`❌ Failed to connect to Qdrant: ${e.message}`);
    }
  }
}

setup();
