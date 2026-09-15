#!/usr/bin/env node
/**
 * Task 5.2 (openspec/changes/parent-atlas-chunk-index-whole-file-hash) --
 * full-table backfill of codebase_chunk_index.file_content_hash.
 *
 * For every row, resolves relative_path against the repo root, reads the
 * real file bytes, computes sha256(bytes).digest('hex'), and writes it to
 * the ADDITIVE file_content_hash column ONLY -- never touches the existing
 * content_hash column or content_hash_scope/algorithm/length/version
 * (those describe content_hash's provenance, a separate, still-unresolved
 * per-row-writer-identity question -- see design.md's added Open Question;
 * this backfill does not attempt to resolve it).
 *
 * Confirmed via task 4.1's parity proof (19/20 exact match, real files,
 * real disk reads) that this exact formula matches graphify_files' own
 * whole-file hash authority with no normalization needed.
 *
 * Idempotent: UPDATE ... WHERE id = $1 AND file_content_hash IS NULL.
 * Re-running finds 0 rows left to update on a second pass.
 *
 * Rows whose relative_path cannot be read (import aliases like $lib/,
 * deleted/renamed files, etc.) are left NULL and counted, never guessed.
 *
 * Usage:
 *   node scripts/atlas/backfill-codebase-chunk-index-file-content-hash-v1.mjs            # dry-run
 *   node scripts/atlas/backfill-codebase-chunk-index-file-content-hash-v1.mjs --apply     # writes
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');

const APPLY = process.argv.includes('--apply');
const BATCH_SIZE = 2000;
const root = path.resolve(import.meta.dirname, '..', '..');
const reportPath = path.join(root, 'docs/reports/backfill-codebase-chunk-index-file-content-hash-v1.json');

// codebase_chunk_index.relative_path mixes TWO root conventions across rows written by different
// crawls/writers over this project's history: some rows (e.g. packages/*, docs/*, services/*) are
// relative to the repo root; others (e.g. src/lib/*, src/routes/*) are relative to
// sveltekit-frontend/ specifically. Confirmed live 2026-09-15 by finding
// "src/lib/server/db/schema-postgres.ts" reported ENOENT against repo root during a dry run, then
// verifying it exists under sveltekit-frontend/. Try repo-root first (matches more rows), then
// sveltekit-frontend/ as a fallback -- this is path-resolution correction, not data fabrication.
const CANDIDATE_ROOTS = [root, path.join(root, 'sveltekit-frontend')];

const ALIAS_PREFIXES = ['$lib/', '$app/', '@/', '~/'];
const isAliasPath = (p) => ALIAS_PREFIXES.some((prefix) => p.startsWith(prefix));

const pool = new Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv()),
  max: 3,
  statement_timeout: 120_000,
  application_name: 'backfill-codebase-chunk-index-file-content-hash-v1',
});

const counts = {
  totalRows: 0,
  aliasPathSkipped: 0,
  readErrorSkipped: 0,
  hashed: 0,
  updated: 0,
  alreadyPopulated: 0,
};
const readErrorSamples = [];
const aliasPathSamples = [];
const fileHashCache = new Map(); // relative_path -> hash, since multiple chunk rows share one file

let lastId = '00000000-0000-0000-0000-000000000000';
let batchNum = 0;

try {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const batch = await pool.query(
      `SELECT id::text, relative_path, file_content_hash
         FROM public.codebase_chunk_index
        WHERE id::text > $1
        ORDER BY id
        LIMIT $2`,
      [lastId, BATCH_SIZE],
    );
    if (batch.rows.length === 0) break;
    batchNum += 1;

    const updates = [];
    for (const row of batch.rows) {
      counts.totalRows += 1;
      lastId = row.id;

      if (row.file_content_hash) {
        counts.alreadyPopulated += 1;
        continue;
      }

      const relPath = row.relative_path;
      if (!relPath || isAliasPath(relPath)) {
        counts.aliasPathSkipped += 1;
        if (aliasPathSamples.length < 10) aliasPathSamples.push(relPath);
        continue;
      }

      let hash = fileHashCache.get(relPath);
      if (hash === undefined) {
        let lastError = null;
        hash = null;
        for (const candidateRoot of CANDIDATE_ROOTS) {
          try {
            const bytes = fs.readFileSync(path.join(candidateRoot, relPath));
            hash = crypto.createHash('sha256').update(bytes).digest('hex');
            break;
          } catch (caught) {
            lastError = caught instanceof Error ? caught.message : String(caught);
          }
        }
        if (hash === null && readErrorSamples.length < 15) {
          readErrorSamples.push({ relPath, error: lastError });
        }
        fileHashCache.set(relPath, hash);
      }

      if (hash === null) {
        counts.readErrorSkipped += 1;
        continue;
      }

      counts.hashed += 1;
      updates.push({ id: row.id, hash });
    }

    if (APPLY && updates.length > 0) {
      // Batched UPDATE via unnest -- one round trip per batch instead of one per row.
      const ids = updates.map((u) => u.id);
      const hashes = updates.map((u) => u.hash);
      const result = await pool.query(
        `UPDATE public.codebase_chunk_index AS c
            SET file_content_hash = v.hash
           FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::text[]) AS hash) AS v
          WHERE c.id = v.id AND c.file_content_hash IS NULL`,
        [ids, hashes],
      );
      counts.updated += result.rowCount ?? 0;
    }

    console.log(
      `  batch ${batchNum}: processed ${batch.rows.length} rows (cumulative: ${counts.totalRows}/${counts.totalRows >= 55853 ? counts.totalRows : '~55853'})`,
    );
  }
} finally {
  await pool.end();
}

const report = {
  schema: 'atlas.backfill-codebase-chunk-index-file-content-hash.v1',
  generatedAt: new Date().toISOString(),
  mode: APPLY ? 'APPLY' : 'DRY_RUN',
  gate: 'parent-atlas-chunk-index-whole-file-hash task 5.2',
  counts,
  distinctFilesHashed: fileHashCache.size,
  aliasPathSamples,
  readErrorSamples,
  postgresWrites: APPLY,
};
report.reportChecksum = crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex');
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log('\n=== Final result ===');
console.log(JSON.stringify({ mode: report.mode, counts, distinctFilesHashed: fileHashCache.size, reportPath: 'docs/reports/backfill-codebase-chunk-index-file-content-hash-v1.json' }, null, 2));
