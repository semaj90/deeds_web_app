#!/usr/bin/env node
/**
 * backfill-chunk-id-and-content-hash.mjs
 *
 * !! DO NOT RUN --apply ON THIS SCRIPT YET !!
 * Unlike backfill-chunk-id-from-content-hash.mjs (safe, applied 2026-08-21),
 * this one is NOT verified safe. Checked 20/20 sampled residual rows against
 * live Qdrant: every single one has payload.qdrant_point_id ending in the
 * literal string ":null" (e.g. "card:src/lib/server/auth.ts:null") — meaning
 * content-hash computation genuinely failed/was skipped for these rows at
 * original write time, not just "never backfilled". Writing a freshly
 * computed real hash into Postgres chunk_id here would create a NEW
 * Postgres/Qdrant mismatch, not fix an existing one — the opposite of what
 * was verified for the other backfill. Left as a dry-run-only diagnostic;
 * the correct fix needs investigation into why these Qdrant points never got
 * a real content hash (possibly needs re-embedding/re-indexing these rows,
 * not just a label patch) before any write is safe. See
 * memory/SESSION-201-EG-GGUF-PROOF-GATES-0-2.md.
 *
 * Second half of the chunk_id gap investigated in the same session as
 * backfill-chunk-id-from-content-hash.mjs (which handled the 28,667 rows that
 * already had content_hash, safely applied). This script covers the remaining
 * 6,908 rows that have NEITHER chunk_id NOR content_hash.
 *
 * Writer/formula identified live: sveltekit-frontend/scripts/codebase-semantic-indexer.ts:556
 *   const hash = createHash('sha256').update(text).digest('hex').slice(0, 16);
 *   const id = `card:${relPath}:${hash}`;
 *
 * Verified this session: pgcrypto's digest(content, 'sha256') recomputation
 * matched 10/10 sampled existing content_hash values exactly, so this is safe
 * to run as a single in-database UPDATE rather than round-tripping content
 * through JS.
 *
 * Usage:
 *   node scripts/atlas/backfill-chunk-id-and-content-hash.mjs           # dry-run (default)
 *   node scripts/atlas/backfill-chunk-id-and-content-hash.mjs --apply   # writes to Postgres
 *
 * Safety:
 *   - Dry-run is read-only: SELECT + report only, zero writes.
 *   - --apply runs a single UPDATE ... WHERE chunk_id IS NULL AND content_hash
 *     IS NULL — idempotent (re-running after apply finds 0 rows left).
 *   - Requires the pgcrypto extension (confirmed present in this database).
 *   - Does NOT touch Qdrant.
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(HERE, '../../../.env') });
dotenv.config({ path: resolve(HERE, '../../.env') });

const APPLY = process.argv.includes('--apply');

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl || !URL.canParse(databaseUrl)) {
  console.error('DATABASE_URL is not set or invalid.');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 5000 });

const WHERE = `chunk_id IS NULL AND content_hash IS NULL AND content_embedding IS NOT NULL AND content IS NOT NULL AND btrim(content) <> ''`;
const HASH_EXPR = `substring(encode(digest(content, 'sha256'), 'hex') from 1 for 16)`;

async function main() {
  const { rows: extCheck } = await pool.query(
    `SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'`,
  );
  if (extCheck.length === 0) {
    console.error('pgcrypto extension not installed — aborting.');
    process.exit(1);
  }

  const { rows: countRows } = await pool.query(
    `SELECT count(*)::int AS n FROM codebase_chunk_index WHERE ${WHERE}`,
  );
  const eligible = countRows[0].n;

  const { rows: sample } = await pool.query(
    `SELECT source_ref, ${HASH_EXPR} AS proposed_content_hash,
            'card:' || source_ref || ':' || ${HASH_EXPR} AS proposed_chunk_id
     FROM codebase_chunk_index WHERE ${WHERE} LIMIT 5`,
  );

  console.log(`Eligible rows (chunk_id NULL, content_hash NULL, embedded, has content): ${eligible}`);
  console.log('Sample of proposed values:');
  for (const row of sample) {
    console.log(`  ${row.source_ref}  ->  ${row.proposed_chunk_id}`);
  }

  if (!APPLY) {
    console.log();
    console.log('DRY RUN — no writes made. Re-run with --apply to commit.');
    await pool.end();
    return;
  }

  if (!process.env.CONFIRM_UNSAFE_NULL_HASH_BACKFILL) {
    console.error();
    console.error(
      'REFUSING TO APPLY: 20/20 sampled rows have Qdrant payload.qdrant_point_id ending in the ' +
        'literal string ":null" — content-hash computation failed/was skipped for these rows at ' +
        'original write time. Writing a freshly computed hash here would create a NEW ' +
        'Postgres/Qdrant mismatch, not fix an existing one. See the file header and ' +
        'memory/SESSION-201-EG-GGUF-PROOF-GATES-0-2.md before overriding. If you have verified ' +
        'this is actually safe for your case, set CONFIRM_UNSAFE_NULL_HASH_BACKFILL=1.',
    );
    await pool.end();
    process.exit(1);
  }

  console.log();
  console.log(`Applying UPDATE to ${eligible} rows...`);
  const result = await pool.query(
    `UPDATE codebase_chunk_index
     SET content_hash = ${HASH_EXPR},
         chunk_id = 'card:' || source_ref || ':' || ${HASH_EXPR}
     WHERE ${WHERE}`,
  );
  console.log(`Updated ${result.rowCount} rows.`);

  const { rows: verify } = await pool.query(
    `SELECT count(*)::int AS n FROM codebase_chunk_index WHERE ${WHERE}`,
  );
  console.log(`Remaining eligible rows after apply (should be 0): ${verify[0].n}`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
