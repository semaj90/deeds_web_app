#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const ROUTE_MAP = resolve(ROOT, 'docs/graph/sveltekit-route-map.json');
const OUT_MD = resolve(ROOT, 'docs/audit/2026-05-14_sveltekit-route-gap-atlas.md');
const OUT_JSON = resolve(ROOT, 'docs/graph/sveltekit-route-gap-atlas.json');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readText(relPath) {
  if (!relPath) return '';
  try {
    return readFileSync(resolve(ROOT, relPath), 'utf8');
  } catch {
    return '';
  }
}

function contentBundle(record) {
  return Object.values(record.files)
    .map((rel) => readText(rel))
    .filter(Boolean)
    .join('\n\n');
}

function detectGaps(record) {
  const content = contentBundle(record);
  const gaps = [];

  if (record.kind === 'api') {
    if (!record.authRequired) gaps.push('Missing auth guard');
    if (record.validation !== 'zod') gaps.push('Missing Zod validation');
    if (!record.tests?.length) gaps.push('Missing paired route test');

    if (record.routePath === '/api/search/hyperrag') {
      if (!/synthesize/i.test(content)) gaps.push('Missing synthesis lane');
      if (!/fail open|failed open|catch \(err\)/i.test(content)) gaps.push('Missing fail-open synthesis handling');
      if (!/provenance/.test(content)) gaps.push('Missing provenance contract');
      if (!/HyperRagFusionService/.test(content)) gaps.push('Route bypasses canonical fusion service');
    }
  }

  if (record.kind === 'page') {
    if (/fetch\(['"`]\/?api\//.test(content) && !record.files.pageServerTs && !record.files.pageServerJs) {
      gaps.push('Client fetches API without nearby +page.server.ts');
    }
    if (/\bexport\s+let\b|^\s*\$:/m.test(content)) gaps.push('Legacy Svelte 4 syntax');
    if (/<slot\b/.test(content)) gaps.push('Legacy slot usage');
    if (/\b<form\b/.test(content) && !/superValidate|superForm/.test(content)) {
      gaps.push('Form without Superforms/Zod');
    }
    if (!record.tests?.length) gaps.push('Missing paired route test');
  }

  if (record.kind === 'layout') {
    if (/<slot\b/.test(content)) gaps.push('Legacy slot usage in layout');
    if (/\bexport\s+let\b|^\s*\$:/m.test(content)) gaps.push('Legacy Svelte 4 syntax');
    if (!record.tests?.length) gaps.push('Missing paired route test');
  }

  return gaps;
}

function renderMarkdown(items) {
  const totalGaps = items.reduce((sum, item) => sum + item.gaps.length, 0);
  const lines = [
    '# SvelteKit Route Gap Atlas',
    '',
    `- Routes analyzed: ${items.length}`,
    `- Total gaps: ${totalGaps}`,
    `- Generated for Karpathy / GraphRAG / HyperRAG ingestion`,
    '',
    '## Canonical Feed',
    '',
    '- Source: `docs/graph/sveltekit-route-map.json`',
    '- Projection: route -> files -> imports -> services -> datastores -> tests -> gaps',
    '- Ingestion target: ACE packet builder / HyperRAG retrieval lanes',
    '',
  ];

  for (const item of items.filter((entry) => entry.gaps.length > 0 || entry.routePath === '/api/search/hyperrag')) {
    lines.push(`### ${item.routePath}`);
    lines.push(`Status: ${item.status}`);
    lines.push('');
    lines.push('Files:');
    for (const [key, value] of Object.entries(item.files)) {
      lines.push('- `' + value + '` (' + key + ')');
    }
    if (item.tests?.length) {
      lines.push('');
      lines.push('Tests:');
      for (const test of item.tests) lines.push('- `' + test + '`');
    }
    lines.push('');
    lines.push('Detected:');
    lines.push(`- Auth check: ${item.authRequired ? 'yes' : 'no'}`);
    lines.push(`- Zod validation: ${item.validation === 'zod' ? 'yes' : 'no'}`);
    lines.push(`- Server-only boundary: ${item.serverOnly ? 'yes' : 'no'}`);
    lines.push(`- Fail-open hints: ${item.failOpen ? 'yes' : 'no'}`);
    lines.push('');
    lines.push('Services:');
    lines.push(`- ${item.services.length ? item.services.join(', ') : 'none detected'}`);
    lines.push('');
    lines.push('Datastores:');
    lines.push(`- ${item.datastores.length ? item.datastores.join(', ') : 'none detected'}`);
    lines.push('');
    lines.push('Gaps:');
    if (item.gaps.length) {
      for (const gap of item.gaps) lines.push(`- ${gap}`);
    } else {
      lines.push('- none');
    }
    lines.push('');
    lines.push('Recommended next action:');
    if (item.routePath === '/api/search/hyperrag') {
      lines.push('- `test(retrieval): lock HyperRAG fusion contract`');
    } else if (item.gaps.length) {
      lines.push('- Repair the highest-signal gap and add/adjust the paired test');
    } else {
      lines.push('- No action required');
    }
    lines.push('');
  }

  return lines.join('\n');
}

function main() {
  const routeMap = readJson(ROUTE_MAP);
  const items = routeMap.records.map((record) => ({
    ...record,
    gaps: detectGaps(record),
  }));

  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'docs/graph/sveltekit-route-map.json',
    items,
  };

  mkdirSync(dirname(OUT_MD), { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2));
  writeFileSync(OUT_MD, renderMarkdown(items));

  const gapCount = items.reduce((sum, item) => sum + item.gaps.length, 0);
  console.log(`[route-gaps] wrote ${relative(ROOT, OUT_JSON)}`);
  console.log(`[route-gaps] wrote ${relative(ROOT, OUT_MD)}`);
  console.log(`[route-gaps] gaps=${gapCount}`);
}

main();
