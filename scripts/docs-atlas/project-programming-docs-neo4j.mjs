#!/usr/bin/env node
import 'dotenv/config';
import { resolve, join } from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const CHUNK_DIR = resolve(process.cwd(), 'data/external-docs/chunks');

async function project() {
  if (!existsSync(CHUNK_DIR)) return;
  const files = await readdir(CHUNK_DIR);

  for (const file of files) {
    if (file.endsWith('.jsonl')) {
      const content = await readFile(join(CHUNK_DIR, file), 'utf8');
      const chunks = content.split('\n').filter(Boolean).map(JSON.parse);

      console.log(`[neo4j] Projecting ${chunks.length} nodes from ${file}...`);
      
      for (const chunk of chunks) {
        // Projection logic placeholder
        // MERGE (s:DocSource {id: chunk.sourceId})
        // MERGE (p:DocPage {id: chunk.sourceTitle})
        // MERGE (c:DocChunk {id: chunk.chunkId})
        // CREATE (s)-[:HAS_PAGE]->(p)-[:HAS_CHUNK]->(c)
      }
    }
  }
}

project().catch(console.error);
