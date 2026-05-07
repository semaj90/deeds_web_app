#!/usr/bin/env node
/**
 * run-authority-scores.mjs
 *
 * Standalone runner for writeAuthorityScoresToQdrant().
 * Reads PageRank / Louvain community scores from Neo4j (via GDS) and
 * patches graphAuthorityScore onto codebase_chunks_768 Qdrant payloads.
 *
 * Usage:
 *   node scripts/run-authority-scores.mjs
 *   node scripts/run-authority-scores.mjs --dry-run
 *   node scripts/run-authority-scores.mjs --limit=2000
 *
 * Environment (from .env):
 *   QDRANT_URL       — default http://127.0.0.1:6333
 *   NEO4J_URI        — default bolt://localhost:7687
 *   NEO4J_USER       — default neo4j
 *   NEO4J_PASSWORD   — default neo4j
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.slice(8), 10) : 5000;

// Load .env for Neo4j / Qdrant credentials
try {
  const { config } = await import('dotenv');
  config({ path: resolve(__dirname, '../.env') });
} catch { /* dotenv optional */ }

console.log(`[authority] Running writeAuthorityScoresToQdrant (limit=${limit}${dryRun ? ', DRY RUN' : ''})...`);

if (dryRun) {
  console.log('[authority] Dry run — would patch Qdrant authority scores from Neo4j GDS.');
  console.log('[authority] Set QDRANT_URL and NEO4J_* env vars, then run without --dry-run.');
  process.exit(0);
}

try {
  // Import the function via Vite-free direct import using the compiled JS output
  // If running from sveltekit-frontend/, we import from the compiled path
  const { writeAuthorityScoresToQdrant } = await import(
    resolve(__dirname, '../src/lib/server/graph/neo4j-gds.js')
  );

  const qdrantUrl = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
  const result = await writeAuthorityScoresToQdrant(qdrantUrl, 'codebase_chunks_768', limit);
  console.log(`[authority] ✓ Mirrored ${result.mirrored} authority scores in ${result.durationMs}ms`);
} catch (err) {
  console.error('[authority] ✗ Failed:', err.message ?? err);
  console.error('[authority] Ensure Neo4j GDS is running and QDRANT_URL is reachable.');
  process.exit(1);
}
