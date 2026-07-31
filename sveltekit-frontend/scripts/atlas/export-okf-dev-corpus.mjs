#!/usr/bin/env node
/**
 * Render the repository-local OKF dev manifest into a small, reproducible
 * index and summary under docs/.okf/dev.
 *
 * This is an export scaffold, not a fetcher. It keeps discovery and
 * acquisition separate from canonical runtime truth.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAtlasEnv } from './load-atlas-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const DEV_DIR = path.join(REPO_ROOT, 'docs', '.okf', 'dev');
const MANIFEST_PATH = path.join(DEV_DIR, 'manifest.json');
const INVENTORY_PATH = path.join(DEV_DIR, 'local-source-inventory.md');
const INDEX_PATH = path.join(DEV_DIR, 'index.md');
const SUMMARY_PATH = path.join(DEV_DIR, 'summary.json');

function countPages(sources) {
  return sources.reduce((total, source) => total + (Array.isArray(source.pages) ? source.pages.length : 0), 0);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function renderIndex(manifest, inventoryText) {
  const lines = [];
  lines.push('# OKF Dev Export Index', '');
  lines.push(`- schema_version: ${manifest.schema_version}`);
  lines.push(`- generated_at: ${new Date().toISOString()}`);
  lines.push(`- source_count: ${manifest.sources.length}`);
  lines.push(`- page_count: ${countPages(manifest.sources)}`);
  lines.push(`- firecrawl_key_present: ${Boolean(process.env.FIRECRAWL_API_KEY)}`);
  lines.push(`- searxng_url: ${process.env.SEARXNG_URL || 'not_set'}`);
  lines.push('');
  lines.push('## Sources', '');

  for (const source of manifest.sources) {
    lines.push(`### ${source.source_id} - ${source.title}`);
    lines.push(`- kind: ${source.kind}`);
    lines.push(`- domain_class: ${source.domain_class}`);
    lines.push(`- focus_tags: ${(source.focus_tags || []).join(', ')}`);
    lines.push(`- page_count: ${(source.pages || []).length}`);
    lines.push(`- acquisition_lane: ${source.source_id === 'firecrawl' && process.env.FIRECRAWL_API_KEY ? 'firecrawl' : 'plain-fetch'}`);
    lines.push('');
    for (const page of source.pages || []) {
      lines.push(`- ${page}`);
    }
    lines.push('');
  }

  lines.push('## Local Inventory', '');
  lines.push('```md');
  lines.push(inventoryText.trimEnd());
  lines.push('```', '');
  return lines.join('\n');
}

async function main() {
  loadAtlasEnv(REPO_ROOT);
  const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'));
  const inventoryText = await fs.readFile(INVENTORY_PATH, 'utf8');

  await fs.mkdir(DEV_DIR, { recursive: true });

  const summary = {
    schema_version: 'okf.dev.summary.v1',
    generated_at: new Date().toISOString(),
    source_count: manifest.sources.length,
    page_count: countPages(manifest.sources),
    source_ids: manifest.sources.map((source) => source.source_id),
    domain_classes: unique(manifest.sources.map((source) => source.domain_class)),
    focus_tags: unique(manifest.sources.flatMap((source) => source.focus_tags || [])),
    firecrawl_key_present: Boolean(process.env.FIRECRAWL_API_KEY),
    searxng_url: process.env.SEARXNG_URL || null,
    output_files: ['index.md', 'summary.json'],
    inventory_path: 'local-source-inventory.md',
  };

  const indexMd = renderIndex(manifest, inventoryText);

  await fs.writeFile(INDEX_PATH, `${indexMd}\n`, 'utf8');
  await fs.writeFile(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  console.log(`[export-okf-dev-corpus] wrote ${path.relative(REPO_ROOT, INDEX_PATH)}`);
  console.log(`[export-okf-dev-corpus] wrote ${path.relative(REPO_ROOT, SUMMARY_PATH)}`);
}

main().catch((error) => {
  console.error('[export-okf-dev-corpus] failed:', error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
