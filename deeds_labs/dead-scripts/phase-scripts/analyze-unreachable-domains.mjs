#!/usr/bin/env node
/**
 * Analyze unreachable-classified.json to extract CLEAN files by domain.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const data = JSON.parse(readFileSync(resolve(ROOT, 'unreachable-classified.json'), 'utf8'));
const files = data.files;

// Filter CLEAN files and normalize paths
const clean = files
  .filter(f => f.category === 'CLEAN')
  .map(f => ({ path: f.path.split('\\').join('/'), lines: f.lines, size: f.size }));

// Domain matchers — order matters, first match wins
const domains = [
  ['database',         f => /^src\/lib\/server\/db\//.test(f.path)],
  ['vector-search',    f => /^src\/lib\/server\/vector\//.test(f.path) || /^src\/lib\/server\/ai\/vector/.test(f.path) || /qdrant/i.test(f.path)],
  ['grpc',             f => /^src\/lib\/server\/grpc\//.test(f.path) || /^src\/lib\/grpc\//.test(f.path)],
  ['message-queue',    f => /^src\/lib\/server\/queue\//.test(f.path) || /rabbitmq/i.test(f.path) || f.path === 'src/lib/server/queue.ts' || f.path === 'src/lib/server/job-queue.ts'],
  ['analysis-pgai',    f => /^src\/lib\/server\/analysis\//.test(f.path) || /^src\/lib\/server\/pgai\//.test(f.path)],
  ['caching',          f => /^src\/lib\/server\/cache\//.test(f.path) || f.path === 'src/lib/server/cache.ts' || /redis/i.test(f.path)],
  ['indexing',         f => /^src\/lib\/server\/indexer/.test(f.path) || /chunker/i.test(f.path)],
  ['state-machines',   f => /^src\/lib\/machines\//.test(f.path) || /[Mm]achine\.ts$/.test(f.path)],
  ['workers',          f => /worker/i.test(f.path) && /^src\/lib\//.test(f.path)],
  ['server-ai',        f => /^src\/lib\/server\/ai\//.test(f.path)],
  ['server-embedding', f => /^src\/lib\/server\/embedding/.test(f.path) || /^src\/lib\/server\/db\/embedding/.test(f.path)],
  ['server-evidence',  f => /^src\/lib\/server\/evidence/.test(f.path)],
  ['server-api',       f => /^src\/lib\/server\/api\//.test(f.path)],
  ['server-auth',      f => /^src\/lib\/server\/auth/.test(f.path) || f.path === 'src/lib/server/auth.ts'],
  ['server-misc',      f => /^src\/lib\/server\//.test(f.path)],
];

const results = {};
for (const [d] of domains) results[d] = [];

for (const f of clean) {
  for (const [d, matcher] of domains) {
    if (matcher(f)) {
      results[d].push(f);
      break;
    }
  }
}

// Print sorted by lines desc
for (const [d] of domains) {
  const files = results[d];
  files.sort((a, b) => b.lines - a.lines);
  if (files.length === 0) continue;
  console.log('');
  console.log(`=== ${d.toUpperCase()} (${files.length} CLEAN files) ===`);
  for (const f of files.slice(0, 10)) {
    console.log(`  ${String(f.lines).padStart(4)} lines  ${f.path}`);
  }
}

// Grand total
console.log('');
console.log(`Total CLEAN unreachable: ${clean.length}`);
console.log(`Total in target domains: ${Object.values(results).reduce((s, a) => s + a.length, 0)}`);
