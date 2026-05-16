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
        const pointId = crypto.randomUUID(); 
        
        // Mocking vector generation for external docs (using 768 zeros if no embedder)
        const vector = new Array(768).fill(0); 

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
