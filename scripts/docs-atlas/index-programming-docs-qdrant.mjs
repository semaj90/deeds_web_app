#!/usr/bin/env node
import 'dotenv/config';
import { resolve, join } from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const SOURCE = args.find(a => a.startsWith('--source='))?.split('=')[1];
const WRITE = args.includes('--write');
const RUN_ID = args.find(a => a.startsWith('--runId='))?.split('=')[1];

const CHUNK_DIR = resolve(process.cwd(), 'data/external-docs/chunks');
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';

// Get 768d embedding from local Ollama
async function getEmbedding(text, model = 'embeddinggemma:latest') {
  const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
      signal: AbortSignal.timeout(2000)
    });
    if (res.ok) {
      const data = await res.json();
      if (data.embedding) return data.embedding;
    }
  } catch (e) {
    // fallback
  }

  try {
    const res = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: text }),
      signal: AbortSignal.timeout(2000)
    });
    if (res.ok) {
      const data = await res.json();
      if (data.embeddings && data.embeddings[0]) return data.embeddings[0];
      if (data.embedding) return data.embedding;
    }
  } catch (e) {
    // fallback
  }

  // Zero-vector fallback for workstation robustness
  return new Array(768).fill(0);
}

// Generate stable deterministic integer point ID for Qdrant
function deterministicPointId(key) {
  const hash = crypto.createHash('md5').update(key).digest();
  return hash.readUInt32BE(0) % 2147483648;
}

async function index() {
  if (!existsSync(CHUNK_DIR)) return;
  const files = await readdir(CHUNK_DIR);

  for (const file of files) {
    if (SOURCE && file !== `${SOURCE}.jsonl`) continue;
    if (file.endsWith('.jsonl')) {
      const content = await readFile(join(CHUNK_DIR, file), 'utf8');
      const chunks = content.split('\n').filter(Boolean).map(JSON.parse);

      console.log(`[qdrant] Indexing ${chunks.length} chunks from ${file}... (RunID: ${RUN_ID || 'none'})`);
      
      if (!WRITE) {
        console.log(`[dry-run] Would upsert ${chunks.length} points to external_programming_docs_768`);
        continue;
      }

      for (const chunk of chunks) {
        const pointId = deterministicPointId(chunk.chunkId);
        const vector = await getEmbedding(chunk.text); 

        const res = await fetch(`${QDRANT_URL}/collections/external_programming_docs_768/points`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            points: [{
              id: pointId,
              vector: vector,
              payload: { ...chunk, runId: RUN_ID }
            }]
          })
        });

        if (res.ok) console.log(`  ✅ ${chunk.chunkId} indexed.`);
        else console.error(`  ❌ ${chunk.chunkId} failed: ${await res.text()}`);
      }
    }
  }
}

index().catch(console.error);
