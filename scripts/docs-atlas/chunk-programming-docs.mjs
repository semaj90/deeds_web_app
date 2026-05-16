#!/usr/bin/env node
import 'dotenv/config';
import { resolve, join } from 'node:path';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { crypto } from 'node:crypto';

const NORM_DIR = resolve(process.cwd(), 'data/external-docs/normalized');
const CHUNK_DIR = resolve(process.cwd(), 'data/external-docs/chunks');

async function chunk() {
  if (!existsSync(NORM_DIR)) return;
  if (!existsSync(CHUNK_DIR)) await mkdir(CHUNK_DIR, { recursive: true });

  const sourceDirs = await readdir(NORM_DIR);

  for (const sourceId of sourceDirs) {
    const srcDir = join(NORM_DIR, sourceId);
    const files = await readdir(srcDir);
    const chunks = [];

    for (const file of files) {
      if (file.endsWith('.md')) {
        const content = await readFile(join(srcDir, file), 'utf8');
        // Simple chunking by paragraph for now
        const paragraphs = content.split('\n\n').filter(p => p.trim());

        for (let i = 0; i < paragraphs.length; i++) {
          const text = paragraphs[i];
          const chunkId = `doc_${sourceId}_${crypto.createHash('md5').update(text).digest('hex').slice(0, 12)}`;
          
          chunks.push({
            chunkId,
            sourceId,
            sourceUrl: '', // To be enriched
            sourceTitle: file,
            version: 'latest',
            language: '', // To be detected
            framework: sourceId,
            topic: '',
            subtopic: '',
            chunkType: 'documentation',
            content: text,
            symbols: [],
            apiNames: [],
            protocols: [],
            relatedConcepts: [],
            trustTier: 'external_unverified',
            licensePolicy: 'fair_use_docs',
            indexedAt: new Date().toISOString(),
            sourceRefs: [`docs/llms/generated/${sourceId}.llms-full.txt`]
          });
        }
      }
    }

    await writeFile(join(CHUNK_DIR, `${sourceId}.jsonl`), chunks.map(c => JSON.stringify(c)).join('\n'));
    console.log(`[chunk] ${sourceId} -> ${chunks.length} chunks`);
  }
}

chunk().catch(console.error);
