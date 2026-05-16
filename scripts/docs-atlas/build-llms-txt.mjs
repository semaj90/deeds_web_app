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
    let summaryContent = `# ${sourceId} Documentation Summary\n\n`;

    for (const file of files) {
      if (file.endsWith('.md')) {
        const content = await readFile(join(srcDir, file), 'utf8');
        fullContent += `## ${file}\n\n${content}\n\n`;
        summaryContent += `- [${file}](./${file})\n`;
      }
    }

    await writeFile(join(OUTPUT_DIR, `${sourceId}.llms.txt`), summaryContent);
    await writeFile(join(OUTPUT_DIR, `${sourceId}.llms-full.txt`), fullContent);
    console.log(`[llms.txt] Generated for ${sourceId}`);
  }
}

build().catch(console.error);
