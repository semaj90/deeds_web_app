#!/usr/bin/env node
import 'dotenv/config';
import { resolve, join } from 'node:path';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const SOURCE_ID = args.find(a => a.startsWith('--source='))?.split('=')[1];

const NORM_DIR = resolve(process.cwd(), 'data/external-docs/normalized');
const OUTPUT_DIR = resolve(process.cwd(), 'docs/llms/generated');
const SOURCES_FILE = resolve(process.cwd(), 'docs/graph/programming-doc-sources.json');

async function build() {
  if (!existsSync(NORM_DIR)) return;
  if (!existsSync(OUTPUT_DIR)) await mkdir(OUTPUT_DIR, { recursive: true });

  const sourcesData = existsSync(SOURCES_FILE) 
    ? JSON.parse(await readFile(SOURCES_FILE, 'utf8')) 
    : { tier1: [], tier2: [] };
  const allSources = [...sourcesData.tier1, ...sourcesData.tier2];

  const sourceDirs = SOURCE_ID ? [SOURCE_ID] : await readdir(NORM_DIR);
  let masterIndex = `# Programming Docs Atlas Index\n\n> Consolidated documentation for local Gemma4/HyperRAG use.\n\n`;

  for (const sourceId of sourceDirs) {
    const srcDir = join(NORM_DIR, sourceId);
    if (!existsSync(srcDir)) continue;
    
    const sourceMeta = allSources.find(s => s.sourceId === sourceId);
    const sourceTitle = sourceMeta?.title || sourceId;
    const baseUrl = sourceMeta?.baseUrl || 'https://...';

    const files = await readdir(srcDir);
    
    let fullContent = `# ${sourceTitle}\n\n`;
    let summaryContent = `# ${sourceTitle} Map\n\n> Normalized for local Gemma4/HyperRAG use.\n\n`;

    for (const file of files) {
      if (file.endsWith('.md')) {
        const content = await readFile(join(srcDir, file), 'utf8');
        const topic = file.replace('.md', '');
        
        fullContent += `# ${sourceTitle} — ${topic}\n\n`;
        fullContent += `Source: ${baseUrl}/${topic}\n`;
        fullContent += `Version: ${sourceMeta?.version || 'latest'}\n`;
        fullContent += `Topic: ${topic}\n\n`;
        fullContent += `${content}\n\n`;
        
        summaryContent += `## ${topic}\n`;
        summaryContent += `- [${topic}](./${file})\n`;
      }
    }

    await writeFile(join(OUTPUT_DIR, `${sourceId}.llms.txt`), summaryContent);
    await writeFile(join(OUTPUT_DIR, `${sourceId}.llms-full.txt`), fullContent);
    
    masterIndex += `## ${sourceTitle}\n`;
    masterIndex += `- [Map](./${sourceId}.llms.txt)\n`;
    masterIndex += `- [Full](./${sourceId}.llms-full.txt)\n\n`;
    
    console.log(`[llms.txt] Generated ${sourceId}.llms.txt and ${sourceId}.llms-full.txt`);
  }

  if (!SOURCE_ID) {
    await writeFile(join(OUTPUT_DIR, `llms.txt`), masterIndex);
    console.log(`[llms.txt] Generated master index: docs/llms/generated/llms.txt`);
  }
}

build().catch(console.error);
