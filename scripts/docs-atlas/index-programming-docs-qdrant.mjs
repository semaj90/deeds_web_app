#!/usr/bin/env node
import 'dotenv/config';
import { resolve, join } from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const CHUNK_DIR = resolve(process.cwd(), 'data/external-docs/chunks');
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';

async function index() {
  if (!existsSync(CHUNK_DIR)) return;
  const files = await readdir(CHUNK_DIR);

  for (const file of files) {
    if (file.endsWith('.jsonl')) {
      const content = await readFile(join(CHUNK_DIR, file), 'utf8');
      const chunks = content.split('\n').filter(Boolean).map(JSON.parse);

      console.log(`[qdrant] Indexing ${chunks.length} chunks from ${file}...`);
      
      if (process.env.DRY_RUN === 'true') {
        console.log(`[dry-run] Would upsert ${chunks.length} points to external_programming_docs_768`);
        continue;
      }

      // Indexing logic placeholder
      // await upsertToQdrant('external_programming_docs_768', chunks);
    }
  }
}

index().catch(console.error);
