#!/usr/bin/env node
import 'dotenv/config';
import { resolve, join } from 'node:path';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const SOURCE_ID = args.find(a => a.startsWith('--source='))?.split('=')[1];

const NORM_DIR = resolve(process.cwd(), 'data/external-docs/normalized');
const CHUNK_DIR = resolve(process.cwd(), 'data/external-docs/chunks');

async function chunk() {
  if (!existsSync(NORM_DIR)) {
    console.log(`[chunk] No normalized docs found in ${NORM_DIR}`);
    return;
  }
  if (!existsSync(CHUNK_DIR)) await mkdir(CHUNK_DIR, { recursive: true });

  const sourceDirs = SOURCE_ID ? [SOURCE_ID] : await readdir(NORM_DIR);

  for (const sourceId of sourceDirs) {
    const srcDir = join(NORM_DIR, sourceId);
    const files = await readdir(srcDir);
    const chunks = [];

    for (const file of files) {
      if (file.endsWith('.md')) {
        const content = await readFile(join(srcDir, file), 'utf8');
        // Simple concept/paragraph chunking
        const sections = content.split('\n## ').filter(s => s.trim());

        for (let i = 0; i < sections.length; i++) {
          const text = sections[i];
          const chunkHash = crypto.createHash('md5').update(text).digest('hex').slice(0, 8);
          const chunkId = `${sourceId}:${file.replace('.md','')}:${chunkHash}`;
          
          chunks.push({
            chunkId,
            sourceId,
            sourceUrl: `https://.../${sourceId}/${file}`, // Mock URL resolution
            sourceTitle: file.replace('.md', ''),
            version: 'latest',
            language: detectLanguage(text),
            framework: sourceId,
            topic: detectTopic(text),
            subtopic: '',
            chunkType: detectChunkType(text),
            symbols: extractSymbols(text),
            apiNames: extractApiNames(text),
            protocols: extractProtocols(text),
            relatedConcepts: [],
            summary: text.slice(0, 200) + '...',
            text: text,
            trustTier: 'official_docs',
            licensePolicy: 'respect_site_terms',
            indexedAt: new Date().toISOString(),
            sourceRefs: [`docs/llms/generated/${sourceId}.llms-full.txt`],
            retrievalUse: ["coding_help", "error_fixing", "agent_command_planning"]
          });
        }
      }
    }

    await writeFile(join(CHUNK_DIR, `${sourceId}.jsonl`), chunks.map(c => JSON.stringify(c)).join('\n'));
    console.log(`[chunk] ${sourceId} -> ${chunks.length} chunks written to ${sourceId}.jsonl`);
  }
}

function detectLanguage(text) {
  if (text.includes('interface ') || text.includes(': string')) return 'typescript';
  if (text.includes('function ') || text.includes('const ')) return 'javascript';
  return 'markdown';
}

function detectTopic(text) {
  if (text.toLowerCase().includes('routing')) return 'routing';
  if (text.toLowerCase().includes('load')) return 'load';
  return 'general';
}

function detectChunkType(text) {
  if (text.toLowerCase().includes('example') || text.includes('```')) return 'example';
  if (text.toLowerCase().includes('error') || text.toLowerCase().includes('fail')) return 'error';
  return 'concept';
}

function extractSymbols(text) {
  const matches = text.match(/\+[\w\.]+/g);
  return matches ? [...new Set(matches)] : [];
}

function extractApiNames(text) {
  const matches = text.match(/`(\w+)`/g);
  return matches ? matches.map(m => m.slice(1, -1)) : [];
}

function extractProtocols(text) {
  const protocols = ['http', 'grpc', 'ws', 'quic'];
  return protocols.filter(p => text.toLowerCase().includes(p));
}

chunk().catch(console.error);
