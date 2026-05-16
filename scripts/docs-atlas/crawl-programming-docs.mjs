#!/usr/bin/env node
import 'dotenv/config';
import { resolve, join } from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SOURCE_ID = args.find(a => a.startsWith('--source='))?.split('=')[1] || args.find(a => !a.startsWith('--'));

const REPO_ROOT = resolve(process.cwd());
const RAW_DIR = join(REPO_ROOT, 'data/external-docs/raw');
const SOURCES_FILE = join(REPO_ROOT, 'docs/graph/programming-doc-sources.json');

async function crawl() {
  const sourcesData = JSON.parse(await readFile(SOURCES_FILE, 'utf8'));
  const allSources = [...sourcesData.tier1, ...sourcesData.tier2];
  
  const target = SOURCE_ID ? allSources.find(s => s.sourceId === SOURCE_ID) : null;
  const sourcesToCrawl = target ? [target] : (SOURCE_ID ? [] : allSources);

  if (sourcesToCrawl.length === 0) {
    console.error(`Source not found: ${SOURCE_ID}`);
    process.exit(1);
  }

  console.log(`🔍 Crawling ${sourcesToCrawl.length} sources...`);

  for (const source of sourcesToCrawl) {
    const outDir = join(RAW_DIR, source.sourceId);
    if (!existsSync(outDir)) await mkdir(outDir, { recursive: true });

    console.log(`[crawl] ${source.title} -> ${source.baseUrl}`);

    if (DRY_RUN) {
      console.log(`[dry-run] Would crawl ${source.baseUrl} and save to ${outDir}`);
      continue;
    }

    // Firecrawl adapter logic
    if (process.env.FIRECRAWL_API_KEY) {
      console.log(`[firecrawl] Using Firecrawl for ${source.sourceId}...`);
      // Integration placeholder
    } else {
      console.warn(`[warn] No FIRECRAWL_API_KEY found. Falling back to simple fetch (limited).`);
      // Simple fetch logic for demonstration
      const res = await fetch(source.baseUrl);
      const html = await res.text();
      await writeFile(join(outDir, 'index.html'), html);
      console.log(`[crawl] Saved index.html for ${source.sourceId}`);
    }
  }
}

crawl().catch(console.error);
