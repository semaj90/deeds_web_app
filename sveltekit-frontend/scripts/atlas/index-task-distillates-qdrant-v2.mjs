#!/usr/bin/env node
/**
 * scripts/atlas/index-task-distillates-qdrant.mjs
 * 
 * Indexes the v2 task distillates into Qdrant.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const COLLECTION_NAME = 'task_distillates';
const DISTILLATES_FILE = resolve(process.cwd(), 'tmp/task-distillates-v2.json');

async function getEmbedding(text) {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    body: JSON.stringify({
      model: 'embeddinggemma:latest',
      prompt: text
    })
  });
  const data = await res.json();
  return data.embedding;
}

async function main() {
  console.log(`🚀 Atlas: Indexing v2 Task Distillates to Qdrant (${COLLECTION_NAME})...`);

  if (!existsSync(DISTILLATES_FILE)) {
    console.error(`❌ Distillates file not found: ${DISTILLATES_FILE}`);
    process.exit(1);
  }

  const distillates = JSON.parse(readFileSync(DISTILLATES_FILE, 'utf-8'));
  
  // Create collection if missing
  await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vectors: { size: 768, distance: 'Cosine' }
    })
  }).catch(() => {});

  const points = [];
  for (let i = 0; i < distillates.length; i++) {
    const task = distillates[i];
    console.log(`   Embedding [${i+1}/${distillates.length}]: ${task.task_key}`);
    const vector = await getEmbedding(`${task.task_key} ${task.summary}`);
    
    points.push({
      id: i + 1000, // Offset for v2 tasks
      vector,
      payload: { ...task, source: 'atlas_v2' }
    });
  }

  const uploadRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points })
  });

  if (uploadRes.ok) {
    console.log('✅ v2 Task distillates indexed.');
  } else {
    console.error(`❌ Failed: ${await uploadRes.text()}`);
  }
}

main().catch(err => {
  console.error(`❌ Error: ${err.message}`);
  process.exit(1);
});
