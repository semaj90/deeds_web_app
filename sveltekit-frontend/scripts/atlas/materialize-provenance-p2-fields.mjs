#!/usr/bin/env node
/**
 * Materialize P2 fields (retrieval_strategy, retrieval_path) into retrieval_provenance.
 *
 * Reads replay trace JSONL, extracts retrieval_strategy and retrieval_path,
 * and updates existing retrieval_provenance rows by query_hash.
 *
 * Part of P1h provenance breadth gap fix.
 * Dependency: run-replay-breadth-50.mjs must have written initial data.
 *
 * Usage:
 *   node scripts/atlas/materialize-provenance-p2-fields.mjs
 *   node scripts/atlas/materialize-provenance-p2-fields.mjs --dry-run
 *   node scripts/atlas/materialize-provenance-p2-fields.mjs --verbose
 *   node scripts/atlas/materialize-provenance-p2-fields.mjs --apply
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPLAY_JSONL = path.join(REPO_ROOT, 'docs', 'reports', 'replay-trace.jsonl');

const APPLY = process.argv.includes('--apply');
const DRY_RUN = process.argv.includes('--dry-run') || !APPLY;
const VERBOSE = process.argv.includes('--verbose');

// ── Load environment ───────────────────────────────────────────────────────
await loadAtlasEnv();
const PG_URL = process.env.DATABASE_URL;

if (!PG_URL) {
  console.error('[FAIL] DATABASE_URL not set');
  process.exit(1);
}

// ── PostgreSQL client ──────────────────────────────────────────────────────
const pool = new Pool({ connectionString: PG_URL });

function sha256(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

function asString(value) {
  return String(value ?? '').trim();
}

async function readJsonl(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (err) {
    console.error(`Failed to read ${filePath}:`, err.message);
    return [];
  }
}

/**
 * Extract P2 fields from a replay trace entry, matching export-replay-traces.mjs.
 */
function extractP2Fields(entry) {
  const response = entry.response ?? {};
  const trace = response.trace ?? {};
  const query = asString(entry.query ?? '');
  const createdAt = asString(
    entry.timestamp ?? entry.metadata?.timestamp ?? new Date().toISOString()
  );
  const queryHash = sha256(query);

  // retrieval_path: array of strings representing traversal
  // Per export-replay-traces.mjs line 119-108
  let retrievalPath = [];
  if (Array.isArray(response.trace?.retrieval_path)) {
    retrievalPath = response.trace.retrieval_path;
  } else if (Array.isArray(trace.retrieval_path)) {
    retrievalPath = trace.retrieval_path;
  } else {
    // Build from traversal inference
    retrievalPath = [
      'packet_rpc',
      ...(Boolean(response.cache_hit ?? trace.cache_hit) ? ['redis'] : []),
      ...(Number(trace.postgres_hits ?? trace.bm25_hits ?? 0) > 0 ? ['postgres'] : []),
      ...(Number(trace.qdrant_hits ?? 0) > 0 ? ['qdrant'] : []),
      ...(Number(trace.neo4j_expansions ?? trace.neo4j_hits ?? 0) > 0 ? ['neo4j'] : []),
      ...(Number(trace.rrf_hits ?? 0) > 0 ? ['rrf'] : []),
    ];
  }

  // retrieval_strategy: string (per export-replay-traces.mjs line 139)
  const retrievalStrategy = asString(
    trace.retrieval_strategy ?? response.strategy ?? 'fusion'
  );

  return {
    query_hash: queryHash,
    retrieval_path: retrievalPath,
    retrieval_strategy: retrievalStrategy,
  };
}

/**
 * Update existing row by query_hash.
 * P1h gap: materialization only UPDATEs existing rows.
 */
async function updateProvenance(client, p2Fields) {
  const { query_hash, retrieval_path, retrieval_strategy } = p2Fields;

  // Serialize retrieval_path array as JSON string for storage
  const retrievalPathJson = JSON.stringify(
    Array.isArray(retrieval_path) ? retrieval_path : []
  );

  try {
    const updateRes = await client.query(
      `UPDATE retrieval_provenance
       SET retrieval_path = $2, retrieval_strategy = $3
       WHERE query_hash = $1`,
      [query_hash, retrievalPathJson, retrieval_strategy]
    );

    return updateRes.rowCount > 0; // Return true if row was updated
  } catch (err) {
    console.error(`Failed to update ${query_hash}:`, err.message);
    return false;
  }
}

async function main() {
  console.log('Materialize P2 Fields (retrieval_strategy, retrieval_path)');
  console.log('  Mode:', DRY_RUN ? 'DRY_RUN' : 'APPLY');
  console.log('  Replay JSONL:', REPLAY_JSONL);
  console.log();

  // Read replay traces
  const entries = await readJsonl(REPLAY_JSONL);
  console.log(`  Loaded ${entries.length} replay trace entries`);

  if (entries.length === 0) {
    console.log('[WARN] No replay traces found. Run npm run replay:breadth-50 first.');
    return;
  }

  // Extract P2 fields
  const p2Fields = entries
    .map((entry) => {
      try {
        return extractP2Fields(entry);
      } catch (err) {
        if (VERBOSE) {
          console.error('  [SKIP]', err.message);
        }
        return null;
      }
    })
    .filter(Boolean);

  console.log(`  Extracted ${p2Fields.length} P2 field sets`);
  console.log();

  // Dedup by query_hash
  const unique = new Map();
  for (const fields of p2Fields) {
    if (!unique.has(fields.query_hash)) {
      unique.set(fields.query_hash, fields);
    }
  }
  console.log(`  Deduplicated to ${unique.size} unique queries`);
  console.log();

  if (DRY_RUN) {
    console.log('[DRY_RUN] Would update:');
    for (const [hash, fields] of unique) {
      console.log(
        `  ${hash.slice(0, 12)}... strategy=${fields.retrieval_strategy} path=[${fields.retrieval_path.join(', ')}]`
      );
    }
    console.log();
    console.log('To apply, run: node scripts/atlas/materialize-provenance-p2-fields.mjs --apply');
    return;
  }

  // Connect and update
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let successCount = 0;
    for (const [hash, fields] of unique) {
      const ok = await updateProvenance(client, fields);
      if (ok) successCount++;
      if (VERBOSE && successCount % 10 === 0) {
        console.log(`  Updated ${successCount}/${unique.size}...`);
      }
    }

    await client.query('COMMIT');
    console.log(`[DONE] Updated ${successCount}/${unique.size} rows`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[FAIL]', err.message);
    process.exit(1);
  } finally {
    client.release();
  }

  await pool.end();
}

main().catch((err) => {
  console.error('[FAIL]', err);
  process.exit(1);
});
