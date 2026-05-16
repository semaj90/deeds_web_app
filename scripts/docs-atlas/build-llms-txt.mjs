#!/usr/bin/env node
import 'dotenv/config';
import { resolve, join } from 'node:path';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const NORM_DIR = resolve(process.cwd(), 'data/external-docs/normalized');
const OUTPUT_DIR = resolve(process.cwd(), 'docs/llms/generated');

async function build() {
  if (!existsSync(NORM_DIR)) return;
  if (!existsSync(OUTPUT_DIR)) await mkdir(OUTPUT_DIR, { recursive: true });

  const sourceDirs = await readdir(NORM_DIR);

  for (const sourceId of sourceDirs) {
    const srcDir = join(NORM_DIR, sourceId);
    const files = await readdir(srcDir);
    
    let fullContent = `# ${sourceId} Documentation\n\n`;
    let summaryContent = `# ${sourceId} Documentation Map\n\n> Normalized for local Gemma4/HyperRAG use.\n\n`;

    for (const file of files) {
      if (file.endsWith('.md')) {
        const content = await readFile(join(srcDir, file), 'utf8');
        const topic = file.replace('.md', '');
        
        fullContent += `# ${sourceId} — ${topic}\n\n`;
        fullContent += `Source: https://.../${sourceId}/${topic}\n`;
        fullContent += `Version: latest\n`;
        fullContent += `Topic: ${topic}\n\n`;
        fullContent += `${content}\n\n`;
        
        summaryContent += `## ${topic}\n`;
        summaryContent += `- [${topic}](./${file})\n`;
      }
    }

    await writeFile(join(OUTPUT_DIR, `${sourceId}.llms.txt`), summaryContent);
    await writeFile(join(OUTPUT_DIR, `${sourceId}.llms-full.txt`), fullContent);
    console.log(`[llms.txt] Generated ${sourceId}.llms.txt and ${sourceId}.llms-full.txt`);
  }
}

build().catch(console.error);
