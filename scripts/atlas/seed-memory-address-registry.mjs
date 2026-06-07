#!/usr/bin/env node
/**
 * seed-memory-address-registry.mjs
 *
 * Seeds atlas_memory_address_registry from the join of:
 *   parent_atlas_documents  (pad) — source_ref + feature_id
 *   atlas_feature_map       (afm) — cluster_id, centroid_id, qdrant_point_id, som_cluster
 *
 * For each matched PAD row, inserts:
 *   - 'postgres' / 'atlas'    row (always — every PAD row is in Postgres)
 *   - 'qdrant'   / 'karpathy' row (when afm.qdrant_point_id IS NOT NULL)
 *
 * Usage:
 *   node scripts/atlas/seed-memory-address-registry.mjs
 *   node scripts/atlas/seed-memory-address-registry.mjs --dry-run
 *   node scripts/atlas/seed-memory-address-registry.mjs --batch=500
 */

import pg from 'pg';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DRY_RUN  = process.argv.includes('--dry-run');
const BATCH    = parseInt(process.argv.find(a => a.startsWith('--batch='))?.split('=')[1] ?? '500', 10);
const DB_URL   = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const { Pool } = pg;
const pool = new Pool({ connectionString: DB_URL });

async function main() {
  const client = await pool.connect();
  try {
    // ── Count existing rows ───────────────────────────────────────────────────
    const { rows: [{ existing }] } = await client.query(
      `SELECT COUNT(*)::int AS existing FROM atlas_memory_address_registry`
    );

    // ── Fetch PAD + AFM join ──────────────────────────────────────────────────
    const { rows: joined } = await client.query(`
      SELECT
        pad.id           AS pad_id,
        pad.source_ref   AS source_ref,
        pad.feature_id   AS feature_id,
        afm.cluster_id   AS cluster_id,
        afm.centroid_id  AS centroid_id,
        afm.qdrant_point_id AS qdrant_point_id,
        afm.som_cluster  AS som_cluster
      FROM parent_atlas_documents pad
      LEFT JOIN atlas_feature_map afm ON afm.source_ref = pad.source_ref
      WHERE pad.source_ref IS NOT NULL
      ORDER BY pad.id
    `);

    console.error(`PAD rows fetched: ${joined.length}; existing registry rows: ${existing}`);

    if (DRY_RUN) {
      const withQdrant = joined.filter(r => r.qdrant_point_id).length;
      console.error(`[dry-run] Would insert up to ${joined.length} postgres/atlas rows`);
      console.error(`[dry-run] Would insert up to ${withQdrant} qdrant/karpathy rows`);
      console.log(JSON.stringify({ ok: true, dryRun: true, padRows: joined.length, withQdrant }));
      return;
    }

    // ── Build insert batches ─────────────────────────────────────────────────
    let inserted = 0;
    let skipped  = 0;

    for (let i = 0; i < joined.length; i += BATCH) {
      const chunk = joined.slice(i, i + BATCH);
      const rows  = [];

      for (const r of chunk) {
        // postgres / atlas row — always
        rows.push({
          source_ref_id: String(r.pad_id),
          source_ref:    r.source_ref,
          feature_id:    r.feature_id ?? null,
          cluster_id:    r.cluster_id ?? null,
          embedding_id:  null,
          storage_lane:  'postgres',
          retrieval_lane:'atlas',
        });

        // qdrant / karpathy row — only when we have a vector point id
        if (r.qdrant_point_id) {
          rows.push({
            source_ref_id: String(r.pad_id),
            source_ref:    r.source_ref,
            feature_id:    r.feature_id ?? null,
            cluster_id:    r.cluster_id ?? null,
            embedding_id:  String(r.qdrant_point_id),
            storage_lane:  'qdrant',
            retrieval_lane:'karpathy',
          });
        }
      }

      if (rows.length === 0) continue;

      // Build multi-row VALUES clause
      const params  = [];
      const values  = rows.map((row, idx) => {
        const base = idx * 7;
        params.push(
          row.source_ref_id,
          row.source_ref,
          row.feature_id,
          row.cluster_id,
          row.embedding_id,
          row.storage_lane,
          row.retrieval_lane,
        );
        return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7})`;
      });

      const result = await client.query(`
        INSERT INTO atlas_memory_address_registry
          (source_ref_id, source_ref, feature_id, cluster_id, embedding_id, storage_lane, retrieval_lane)
        VALUES ${values.join(',')}
        ON CONFLICT DO NOTHING
        RETURNING memory_id
      `, params);

      inserted += result.rowCount ?? 0;
      skipped  += rows.length - (result.rowCount ?? 0);

      console.error(`  batch ${Math.floor(i/BATCH)+1}: +${result.rowCount} inserted (${i+chunk.length}/${joined.length} PAD rows processed)`);
    }

    // ── Final count ───────────────────────────────────────────────────────────
    const { rows: [{ total }] } = await client.query(
      `SELECT COUNT(*)::int AS total FROM atlas_memory_address_registry`
    );

    const summary = { ok: true, padRows: joined.length, inserted, skipped, total };
    console.log(JSON.stringify(summary, null, 2));
    console.error(`Done. Registry now has ${total} rows (inserted ${inserted}, skipped ${skipped}).`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('[seed-memory-address-registry] fatal:', err.message);
  process.exit(1);
});