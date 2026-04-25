#!/usr/bin/env node
/**
 * Phase 77: Import Training Data to Knowledge Base
 *
 * This script imports all Phase 77 training JSONL files into the Qdrant knowledge base
 * for use by ACE agents, Phase 72 RAG/KAG pipelines, and the command center.
 *
 * Training Data Files (151 total examples):
 * - polyglot_training_data.jsonl (45 examples, 26.6 KB)
 * - gold_svelte5_migrations.jsonl (10 examples, 12.5 KB)
 * - enhanced_training_data.jsonl (52 examples, 15.3 KB)
 * - docs_training_data.jsonl (33 examples, 14.6 KB)
 * - uiux_training_data.jsonl (11 examples, 17.8 KB)
 * - combined_training_data.jsonl (151 examples, 86.7 KB)
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Configuration
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION_NAME = 'phase77_training_knowledge';
const EMBEDDING_DIM = 384; // nomic-embed-text dimension

// Training data files to import
const TRAINING_FILES = [
  'polyglot_training_data.jsonl',
  'enhanced_training_data.jsonl',
  'docs_training_data.jsonl',
  'uiux_training_data.jsonl',
  'kb_training_data.jsonl',
];

// Check if gold_svelte5_migrations.jsonl exists
const OPTIONAL_FILES = [
  'gold_svelte5_migrations.jsonl',
  'svelte5_training_data.jsonl',
];

const client = new QdrantClient({ url: QDRANT_URL });

/**
 * Generate embedding using Ollama nomic-embed-text
 */
async function generateEmbedding(text) {
  try {
    const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    const response = await fetch(`${ollamaUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'nomic-embed-text',
        prompt: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.embedding;
  } catch (error) {
    console.error('❌ Embedding generation failed:', error.message);
    // Return zero vector as fallback
    return Array(EMBEDDING_DIM).fill(0);
  }
}

/**
 * Create or recreate Qdrant collection
 */
async function setupCollection() {
  console.log(`\n🔧 Setting up Qdrant collection: ${COLLECTION_NAME}...`);

  try {
    // Check if collection exists
    const collections = await client.getCollections();
    const exists = collections.collections.some((c) => c.name === COLLECTION_NAME);

    if (exists) {
      console.log(`   ℹ️  Collection exists, recreating...`);
      await client.deleteCollection(COLLECTION_NAME);
    }

    // Create collection
    await client.createCollection(COLLECTION_NAME, {
      vectors: {
        size: EMBEDDING_DIM,
        distance: 'Cosine',
      },
    });

    console.log(`   ✅ Collection created with ${EMBEDDING_DIM}-dim vectors\n`);
    return true;
  } catch (error) {
    console.error(`   ❌ Collection setup failed:`, error.message);
    return false;
  }
}

/**
 * Parse JSONL file and return array of training examples
 */
async function parseJSONL(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    return lines.map((line) => JSON.parse(line));
  } catch (error) {
    console.error(`   ❌ Failed to parse ${path.basename(filePath)}:`, error.message);
    return [];
  }
}

/**
 * Extract searchable text from training example
 */
function extractText(example) {
  const parts = [];

  // Add messages (instruction + response)
  if (example.messages) {
    for (const msg of example.messages) {
      if (msg.content) parts.push(msg.content);
    }
  }

  // Add system message
  if (example.system) {
    parts.push(example.system);
  }

  // Add metadata
  if (example.metadata) {
    const meta = example.metadata;
    if (meta.category) parts.push(`Category: ${meta.category}`);
    if (meta.tags) parts.push(`Tags: ${meta.tags.join(', ')}`);
    if (meta.description) parts.push(meta.description);
  }

  return parts.join('\n\n');
}

/**
 * Import training examples from a JSONL file
 */
async function importTrainingFile(filePath) {
  const fileName = path.basename(filePath);
  console.log(`\n📥 Importing ${fileName}...`);

  const examples = await parseJSONL(filePath);
  if (examples.length === 0) {
    console.log(`   ⚠️  No examples found`);
    return 0;
  }

  console.log(`   Found ${examples.length} examples`);

  const points = [];
  let processed = 0;

  for (let i = 0; i < examples.length; i++) {
    const example = examples[i];
    const text = extractText(example);

    if (!text) {
      console.log(`   ⚠️  Example ${i + 1}: No text content, skipping`);
      continue;
    }

    process.stdout.write(`\r   Embedding example ${i + 1}/${examples.length}...`);

    const embedding = await generateEmbedding(text);

    points.push({
      id: `${fileName.replace('.jsonl', '')}_${i}`,
      vector: embedding,
      payload: {
        source: fileName,
        index: i,
        text: text.substring(0, 1000), // Store first 1000 chars
        category: example.metadata?.category || 'unknown',
        tags: example.metadata?.tags || [],
        created: new Date().toISOString(),
      },
    });

    processed++;

    // Batch upload every 50 examples
    if (points.length >= 50) {
      await client.upsert(COLLECTION_NAME, { points });
      points.length = 0; // Clear array
    }
  }

  // Upload remaining points
  if (points.length > 0) {
    await client.upsert(COLLECTION_NAME, { points });
  }

  console.log(`\n   ✅ Imported ${processed} examples\n`);
  return processed;
}

/**
 * Import Svelte 5 complete documentation
 */
async function importSvelteCompleteDocs() {
  const docsPath = path.join(rootDir, 'svelte-complete.txt');

  try {
    console.log(`\n📚 Importing Svelte 5 complete documentation...`);

    const content = await fs.readFile(docsPath, 'utf-8');
    const fileSize = (content.length / 1024).toFixed(1);
    console.log(`   File size: ${fileSize} KB`);

    // Split into chunks of ~4000 characters (to stay under token limits)
    const chunkSize = 4000;
    const chunks = [];

    for (let i = 0; i < content.length; i += chunkSize) {
      chunks.push(content.slice(i, i + chunkSize));
    }

    console.log(`   Split into ${chunks.length} chunks`);

    const points = [];

    for (let i = 0; i < chunks.length; i++) {
      process.stdout.write(`\r   Embedding chunk ${i + 1}/${chunks.length}...`);

      const embedding = await generateEmbedding(chunks[i]);

      points.push({
        id: `svelte5_docs_chunk_${i}`,
        vector: embedding,
        payload: {
          source: 'svelte-complete.txt',
          chunk_index: i,
          total_chunks: chunks.length,
          text: chunks[i],
          category: 'svelte5_documentation',
          tags: ['svelte5', 'runes', 'documentation', 'official'],
          created: new Date().toISOString(),
        },
      });

      // Batch upload every 50 chunks
      if (points.length >= 50) {
        await client.upsert(COLLECTION_NAME, { points });
        points.length = 0;
      }
    }

    // Upload remaining points
    if (points.length > 0) {
      await client.upsert(COLLECTION_NAME, { points });
    }

    console.log(`\n   ✅ Imported ${chunks.length} documentation chunks\n`);
    return chunks.length;
  } catch (error) {
    console.error(`   ❌ Failed to import Svelte docs:`, error.message);
    return 0;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Phase 77: Import Training Data to Knowledge Base             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  console.log(`\n🎯 Target: ${QDRANT_URL}`);
  console.log(`📦 Collection: ${COLLECTION_NAME}`);

  // Setup collection
  const setupSuccess = await setupCollection();
  if (!setupSuccess) {
    console.error('\n❌ Failed to setup collection, aborting');
    process.exit(1);
  }

  let totalExamples = 0;

  // Import required training files
  for (const fileName of TRAINING_FILES) {
    const filePath = path.join(rootDir, fileName);

    try {
      await fs.access(filePath);
      const count = await importTrainingFile(filePath);
      totalExamples += count;
    } catch (error) {
      console.log(`   ⚠️  File not found: ${fileName}, skipping`);
    }
  }

  // Import optional files
  for (const fileName of OPTIONAL_FILES) {
    const filePath = path.join(rootDir, fileName);

    try {
      await fs.access(filePath);
      const count = await importTrainingFile(filePath);
      totalExamples += count;
    } catch (error) {
      // Silent skip for optional files
    }
  }

  // Import Svelte 5 documentation
  const docsChunks = await importSvelteCompleteDocs();

  // Get final collection stats
  const info = await client.getCollection(COLLECTION_NAME);

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Import Complete                                               ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  console.log(`   📊 Training Examples:     ${totalExamples}`);
  console.log(`   📚 Documentation Chunks:  ${docsChunks}`);
  console.log(`   📈 Total Vectors:         ${info.points_count}`);
  console.log(`   🎯 Collection:            ${COLLECTION_NAME}`);
  console.log(`\n✅ Knowledge base ready for ACE agents and Phase 72 RAG/KAG!\n`);
}

// Run
main().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
