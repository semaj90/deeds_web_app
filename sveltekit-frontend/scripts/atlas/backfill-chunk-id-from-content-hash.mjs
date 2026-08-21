#!/usr/bin/env node
/**
 * backfill-chunk-id-from-content-hash.mjs
 *
 * Root cause (found live, 2026-08-21 EG-GGUF session): chunk_id write support was
 * added to the indexing writer partway through 2026-05-08. Rows written before
 * that point (2026-04-20 full batch + early 2026-05-08) never got chunk_id
 * populated, and were never retroactively backfilled — 35,575 rows as of this
 * writing. Postgres's own `qdrant_id` column for these rows is stale/unusable
 * (confirmed: points up at IDs that no longer exist in the live Qdrant
 * collection) — do NOT use it for lookups.
 *
 * The correct join key is Qdrant's `payload.postgres_id`, which does match
 * `codebase_chunk_index.id`. Cross-checking 4/4 sampled rows via that path
 * confirmed the live Qdrant payload already carries `qdrant_point_id` in the
 * exact form `card:{source_ref}:{content_hash}` for these rows — it was simply
 * never copied into `chunk_id` (in Qdrant OR Postgres) at write time. Since
 * `source_ref` and `content_hash` are both already present in Postgres for
 * 28,667 of the 35,575 affected rows, this backfill needs NO Qdrant call and
 * NO hash recomputation — it's a pure string concatenation of existing columns.
 *
 * Scope: only the 28,667 rows that already have content_hash. The remaining
 * 6,908 rows have NEITHER chunk_id NOR content_hash and need a separate,
 * not-yet-identified fix (the writer that produces the 16-hex content_hash
 * format used here is not index-full-repo-for-search.mjs — that script writes
 * full 64-hex sha256 digests, a different format. Not resolved this pass).
 *
 * Usage:
 *   node scripts/atlas/backfill-chunk-id-from-content-hash.mjs           # dry-run (default)
 *   node scripts/atlas/backfill-chunk-id-from-content-hash.mjs --apply   # writes to Postgres
 *
 * Safety:
 *   - Dry-run is read-only: SELECT + report only, zero writes.
 *   - --apply runs a single UPDATE ... WHERE chunk_id IS NULL AND content_hash
 *     IS NOT NULL — idempotent (re-running after apply finds 0 rows left).
 *   - Does NOT touch Qdrant. Does NOT touch the 6,908-row residual gap.
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

const WHERE = `chunk_id IS NULL AND content_hash IS NOT NULL AND content_embedding IS NOT NULL`;

async function main() {
  const { rows: countRows } = await pool.query(
    `SELECT count(*)::int AS n FROM codebase_chunk_index WHERE ${WHERE}`,
  );
  const eligible = countRows[0].n;

  const { rows: sample } = await pool.query(
    `SELECT source_ref, content_hash, 'card:' || source_ref || ':' || content_hash AS proposed_chunk_id
     FROM codebase_chunk_index WHERE ${WHERE} LIMIT 5`,
  );

  console.log(`Eligible rows (chunk_id NULL, content_hash present, embedded): ${eligible}`);
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

  console.log();
  console.log(`Applying UPDATE to ${eligible} rows...`);
  const result = await pool.query(
    `UPDATE codebase_chunk_index
     SET chunk_id = 'card:' || source_ref || ':' || content_hash
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
