#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const args = process.argv.slice(2);

let query = 'duckdb offline';
let limit = 3;
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--query' && args[i + 1]) {
    query = args[i + 1];
    i += 1;
  } else if (arg.startsWith('--query=')) {
    query = arg.slice('--query='.length);
  } else if (arg === '--limit' && args[i + 1]) {
    limit = Number(args[i + 1]) || limit;
    i += 1;
  } else if (arg.startsWith('--limit=')) {
    limit = Number(arg.slice('--limit='.length)) || limit;
  }
}

const modulePath = pathToFileURL(resolve(ROOT, 'src/lib/server/atlas/feature-card-semantic-index.ts')).href;
const mod = await import(modulePath);

const source = mod.getFeatureSemanticIndexSource();
const payload = {
  source,
  query,
  limit,
  results: query ? mod.searchFeatureSemanticCards(query, limit, true) : null,
};

console.log(JSON.stringify(payload, null, 2));
