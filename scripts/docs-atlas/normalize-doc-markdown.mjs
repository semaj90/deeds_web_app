#!/usr/bin/env node
import 'dotenv/config';
import { resolve, join } from 'node:path';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const RAW_DIR = resolve(process.cwd(), 'data/external-docs/raw');
const NORM_DIR = resolve(process.cwd(), 'data/external-docs/normalized');

async function normalize() {
  if (!existsSync(RAW_DIR)) return;
  const sourceDirs = await readdir(RAW_DIR);

  for (const sourceId of sourceDirs) {
    const srcDir = join(RAW_DIR, sourceId);
    const destDir = join(NORM_DIR, sourceId);
    if (!existsSync(destDir)) await mkdir(destDir, { recursive: true });

    const files = await readdir(srcDir);
    for (const file of files) {
      if (file.endsWith('.html') || file.endsWith('.md')) {
        const content = await readFile(join(srcDir, file), 'utf8');
        // Simple normalization for now
        const normalized = content.replace(/<[^>]+>/g, '').trim(); 
        await writeFile(join(destDir, file.replace('.html', '.md')), normalized);
        console.log(`[norm] ${sourceId}/${file} -> normalized`);
      }
    }
  }
}

normalize().catch(console.error);
