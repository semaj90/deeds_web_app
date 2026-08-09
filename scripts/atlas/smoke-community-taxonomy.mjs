#!/usr/bin/env node
/**
 * Smoke test for the community taxonomy selector.
 *
 * Proves the community helper can read the legacy Louvain lane and the new
 * Leiden lane without changing the default behavior.
 *
 * Usage:
 *   node scripts/atlas/smoke-community-taxonomy.mjs
 *   node scripts/atlas/smoke-community-taxonomy.mjs --json
 */

import { existsSync } from 'node:fs';
import dotenv from 'dotenv';
import { resolve } from 'node:path';

const frontendEnvLocal = resolve(process.cwd(), '.env.local');
const frontendEnv = resolve(process.cwd(), '.env');
if (existsSync(frontendEnvLocal)) dotenv.config({ path: frontendEnvLocal, override: true });
if (existsSync(frontendEnv)) dotenv.config({ path: frontendEnv, override: false });

const { getCommunityContext } = await import('../../sveltekit-frontend/src/lib/server/graph/community-graph.ts');

const JSON_OUT = process.argv.includes('--json');
const QUERY = process.argv.find((arg) => arg.startsWith('--query='))?.slice('--query='.length) ?? 'graph community taxonomy';

function toCount(rows) {
  return Array.isArray(rows) ? rows.length : 0;
}

function summarize(rows) {
  return rows.slice(0, 2).map((row) => ({
    id: row.id,
    purpose: row.purpose,
    similarity: row.similarity,
  }));
}

async function run() {
  const louvain = await getCommunityContext(QUERY, 2, { algorithm: 'louvain', skipEmbedding: true });
  const leiden = await getCommunityContext(QUERY, 2, { algorithm: 'leiden', skipEmbedding: true });

  const result = {
    query: QUERY,
    louvain: {
      count: toCount(louvain),
      sample: summarize(louvain),
    },
    leiden: {
      count: toCount(leiden),
      sample: summarize(leiden),
    },
    pass: toCount(louvain) > 0 && toCount(leiden) > 0,
  };

  if (!JSON_OUT) {
    console.log('Community taxonomy smoke');
    console.log(`  query: ${result.query}`);
    console.log(`  louvain: ${result.louvain.count} rows`);
    console.log(`  leiden: ${result.leiden.count} rows`);
    console.log(`  sample louvain: ${JSON.stringify(result.louvain.sample)}`);
    console.log(`  sample leiden: ${JSON.stringify(result.leiden.sample)}`);
    console.log(result.pass ? '  PASS' : '  FAIL');
  } else {
    console.log(JSON.stringify(result, null, 2));
  }

  if (!result.pass) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
