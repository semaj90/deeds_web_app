#!/usr/bin/env node
/**
 * backfill-atlas-links.mjs
 *
 * Wires parent_atlas_vectors → parent_atlas_documents by joining on normalized
 * source_ref paths. Writes back:
 *   - parent_atlas_documents.qdrant_point_id  ← vectors.record_id
 *   - parent_atlas_documents.cluster_id       ← vectors.feature_id (used as cluster label)
 *
 * Also drains pending parent_atlas_jobs by marking them 'done' (they were queued
 * by the promotion script but no async worker was ever running).
 *
 * Flags:
 *   --dry-run    Print counts, write nothing (default)
 *   --apply      Write updates
 *   --verbose    Log each matched row
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env') });

const argv = process.argv.slice(2);
const APPLY   = argv.includes('--apply');
const VERBOSE = argv.includes('--verbose');
const DRY_RUN = !APPLY;

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error('DATABASE_URL not set'); process.exit(1); }

const pool = new pg.Pool({ connectionString: dbUrl });

// ── path normalization ────────────────────────────────────────────────────────
// Normalize any path form → "sveltekit-frontend/src/..." relative form
// matching what promote-to-postgres.mjs writes into parent_atlas_documents.source_ref

function normalizePath(raw) {
  if (!raw) return null;
  // Replace backslashes
  let p = raw.replace(/\\/g, '/');
  // Strip absolute Windows prefix up to repo root
  const repoMarker = 'deeds-web-app/';
  const markerIdx = p.indexOf(repoMarker);
  if (markerIdx !== -1) p = p.slice(markerIdx + repoMarker.length);
  // Strip leading "./"
  p = p.replace(/^\.\//, '');
  // If starts with "src/" without sveltekit-frontend prefix, add it
  if (p.startsWith('src/')) p = 'sveltekit-frontend/' + p;
  return p;
}

async function main() {
  console.log(`\n🔗 backfill-atlas-links.mjs  [${DRY_RUN ? 'DRY-RUN' : 'APPLY'}]`);

  // ── Step 1: count matchable rows ─────────────────────────────────────────────
  const { rows: rawVecs } = await pool.query(`
    SELECT id, record_id, source_ref, feature_id
    FROM parent_atlas_vectors
    WHERE source_ref IS NOT NULL AND source_ref != ''
    LIMIT 100000
  `);

  console.log(`\n  Vectors with source_ref: ${rawVecs.length}`);

  // Build a map: normalizedPath → best vector row (prefer rows with feature_id)
  const vecMap = new Map();
  for (const v of rawVecs) {
    const norm = normalizePath(v.source_ref);
    if (!norm) continue;
    const existing = vecMap.get(norm);
    if (!existing || (!existing.feature_id && v.feature_id)) {
      vecMap.set(norm, { ...v, norm });
    }
  }
  console.log(`  Unique normalized paths from vectors: ${vecMap.size}`);

  // ── Step 2: load documents that need backfilling ──────────────────────────────
  const { rows: docs } = await pool.query(`
    SELECT id, source_ref
    FROM parent_atlas_documents
    WHERE qdrant_point_id IS NULL
  `);
  console.log(`  Documents missing qdrant_point_id: ${docs.length}`);

  // Match
  const updates = [];
  for (const doc of docs) {
    const norm = normalizePath(doc.source_ref);
    const vec = vecMap.get(norm);
    if (!vec) continue;
    updates.push({
      docId:       doc.id,
      source_ref:  doc.source_ref,
      record_id:   vec.record_id,
      feature_id:  vec.feature_id,
      norm,
    });
  }

  console.log(`  Matchable documents: ${updates.length}`);
  if (VERBOSE) {
    for (const u of updates.slice(0, 10)) {
      console.log(`    ${u.source_ref} → record_id=${u.record_id}`);
    }
  }

  // ── Step 3: pending jobs ──────────────────────────────────────────────────────
  const { rows: jobCount } = await pool.query(`
    SELECT count(*) AS n FROM parent_atlas_jobs WHERE status='pending'
  `);
  const pendingJobs = parseInt(jobCount[0].n, 10);
  console.log(`  Pending jobs to drain: ${pendingJobs}`);

  if (DRY_RUN) {
    console.log(`\n  Would update ${updates.length} documents with qdrant_point_id + cluster_id.`);
    console.log(`  Would drain ${pendingJobs} pending jobs → 'done'.`);
    console.log('\n  Re-run with --apply to write.\n');
    await pool.end();
    return;
  }

  // ── Step 4: apply document backfill ──────────────────────────────────────────
  let written = 0;
  const BATCH = 200;
  for (let i = 0; i < updates.length; i += BATCH) {
    const chunk = updates.slice(i, i + BATCH);
    // Build a single UPDATE ... FROM (VALUES ...) statement for efficiency
    const valuesClause = chunk
      .map((u, j) => `($${j * 2 + 1}::int, $${j * 2 + 2}::text)`)
      .join(', ');
    const params = chunk.flatMap(u => [u.docId, u.record_id]);

    await pool.query(`
      UPDATE parent_atlas_documents AS d
      SET
        qdrant_point_id = v.record_id,
        cluster_id      = split_part(v.record_id, ':', 1),
        updated_at      = now()
      FROM (VALUES ${valuesClause}) AS v(id, record_id)
      WHERE d.id = v.id
    `, params);

    written += chunk.length;
    process.stdout.write(`\r  Written: ${written}/${updates.length}`);
  }
  console.log();
  console.log(`  ✓ Backfilled ${written} documents.`);

  // ── Step 5: drain pending jobs ────────────────────────────────────────────────
  const { rowCount: drained } = await pool.query(`
    UPDATE parent_atlas_jobs
    SET status = 'done', payload = payload || '{"drained_by":"backfill-atlas-links","drained_at":"${new Date().toISOString()}"}'
    WHERE status = 'pending'
  `);
  console.log(`  ✓ Drained ${drained} pending jobs → done.`);

  await pool.end();
  console.log('\n✅ Backfill complete.\n');
}

main().catch(e => { console.error(e); process.exit(1); });
