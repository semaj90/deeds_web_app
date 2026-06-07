#!/usr/bin/env node
/**
 * scripts/atlas/promote-to-synthesis.mjs
 *
 * Promotes atlas_feature_map rows into atlas_feature_synthesis.
 *
 * Groups atlas_feature_map by feature_id, joins parent_atlas_documents for
 * richer metadata, and upserts one synthesis row per feature.
 *
 * Deterministic — no LLM calls.
 *
 * Usage:
 *   node scripts/atlas/promote-to-synthesis.mjs --dry-run
 *   node scripts/atlas/promote-to-synthesis.mjs --apply
 *   node scripts/atlas/promote-to-synthesis.mjs --apply --batch=200
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');
const APPLY = process.argv.includes('--apply');
const batchArg = process.argv.find(a => a.startsWith('--batch='));
const BATCH_SIZE = batchArg ? parseInt(batchArg.split('=')[1]) : 200;
const ATLAS_VERSION = '2026-06-06';

function loadEnv() {
  for (const p of [
    path.join(ROOT, 'sveltekit-frontend', '.env'),
    path.join(ROOT, '.env'),
  ]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.trimEnd().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    break;
  }
}
loadEnv();

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

// ── Build per-feature aggregates ─────────────────────────────────────────────

async function buildSynthesisRows(pool) {
  // Aggregate atlas_feature_map grouped by feature_id
  const { rows: mapAgg } = await pool.query(`
    SELECT
      feature_id,
      COUNT(*)                          AS file_count,
      COUNT(DISTINCT cluster_id)        AS cluster_count,
      COUNT(DISTINCT qdrant_point_id)   AS qdrant_count,
      -- Collect top 10 source_refs by recency
      array_agg(source_ref ORDER BY indexed_at DESC NULLS LAST) FILTER (WHERE source_ref IS NOT NULL) AS all_source_refs,
      -- Collect unique cluster_ids
      array_agg(DISTINCT cluster_id) FILTER (WHERE cluster_id IS NOT NULL) AS cluster_ids,
      -- Most common cluster_id = primary
      mode() WITHIN GROUP (ORDER BY cluster_id) AS primary_cluster_id,
      mode() WITHIN GROUP (ORDER BY centroid_id) AS primary_centroid_id
    FROM atlas_feature_map
    WHERE feature_id IS NOT NULL
    GROUP BY feature_id
    ORDER BY COUNT(*) DESC
  `);

  // Aggregate parent_atlas_documents for richer summary material
  const { rows: docAgg } = await pool.query(`
    SELECT
      feature_id,
      COUNT(*)                          AS doc_count,
      AVG(CASE WHEN has_auth THEN 1.0 ELSE 0.0 END)  AS auth_ratio,
      AVG(CASE WHEN has_zod  THEN 1.0 ELSE 0.0 END)  AS zod_ratio,
      array_agg(DISTINCT source_kind) FILTER (WHERE source_kind IS NOT NULL) AS source_kinds,
      -- Best summary: prefer lod1, fallback to summary
      (array_agg(COALESCE(summary_lod1, summary) ORDER BY
        CASE WHEN length(COALESCE(summary_lod1,'')) >= 20 THEN 0 ELSE 1 END,
        id DESC)
      )[1]                              AS best_summary,
      -- Top 10 file paths by feature
      (array_agg(rel_path ORDER BY id DESC))[1:10] AS top_paths
    FROM parent_atlas_documents
    WHERE feature_id IS NOT NULL
    GROUP BY feature_id
  `);

  const docMap = new Map(docAgg.map(r => [r.feature_id, r]));

  const rows = mapAgg.map(m => {
    const doc = docMap.get(m.feature_id) ?? {};
    const sourceRefs = (m.all_source_refs ?? []).slice(0, 20);
    const clusterIds = m.cluster_ids ?? [];
    const topPaths = (doc.top_paths ?? []).filter(Boolean).slice(0, 10);

    // Derive a human-readable synthesized_summary
    const kinds = (doc.source_kinds ?? []).join(', ');
    const fileCount = Number(m.file_count);
    const kindStr = kinds ? ` (${kinds})` : '';
    const summary = doc.best_summary ??
      `${capitalize(m.feature_id)} feature — ${fileCount} files${kindStr}.`;

    return {
      feature_id:          m.feature_id,
      atlas_file_count:    fileCount,
      qdrant_point_count:  Number(m.qdrant_count),
      packet_count:        0, // updated by packet indexer when available
      avg_confidence:      null,
      max_confidence:      null,
      semantic_confidence: null,
      behavior_score:      null,
      primary_cluster_id:  m.primary_cluster_id ?? null,
      primary_centroid_id: m.primary_centroid_id ?? null,
      cluster_ids:         JSON.stringify(clusterIds),
      top_file_paths:      JSON.stringify(topPaths),
      source_refs:         JSON.stringify(sourceRefs),
      synthesized_summary: summary.slice(0, 1000),
      next_actions:        JSON.stringify([]),
      dominant_status:     'active',
      has_blocked:         false,
      atlas_version:       ATLAS_VERSION,
    };
  });

  return rows;
}

function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══ Atlas Synthesis Promotion ════════════════════════════════');
  console.log(`  Mode:       ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`  Batch size: ${BATCH_SIZE}`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  const rows = await buildSynthesisRows(pool);
  console.log(`\n  Features to upsert: ${rows.length}`);

  // Sample
  for (const r of rows.slice(0, 5)) {
    console.log(`\n  ${r.feature_id} (${r.atlas_file_count} files)`);
    console.log(`    clusters:  ${JSON.parse(r.cluster_ids).length}`);
    console.log(`    summary:   ${r.synthesized_summary.slice(0, 80)}`);
  }

  if (!APPLY) {
    console.log('\n  [dry-run] Pass --apply to write changes.');
    await pool.end();
    return;
  }

  // Apply in batches via INSERT ... ON CONFLICT (feature_id) DO UPDATE
  let applied = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of batch) {
        await client.query(`
          INSERT INTO atlas_feature_synthesis (
            feature_id, atlas_file_count, qdrant_point_count, packet_count,
            primary_cluster_id, primary_centroid_id,
            cluster_ids, top_file_paths, source_refs,
            synthesized_summary, next_actions,
            dominant_status, has_blocked, atlas_version,
            synthesized_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7::jsonb, $8::jsonb, $9::jsonb,
            $10, $11::jsonb,
            $12, $13, $14,
            now(), now()
          )
          ON CONFLICT (feature_id) DO UPDATE SET
            atlas_file_count    = EXCLUDED.atlas_file_count,
            qdrant_point_count  = EXCLUDED.qdrant_point_count,
            primary_cluster_id  = EXCLUDED.primary_cluster_id,
            primary_centroid_id = EXCLUDED.primary_centroid_id,
            cluster_ids         = EXCLUDED.cluster_ids,
            top_file_paths      = EXCLUDED.top_file_paths,
            source_refs         = EXCLUDED.source_refs,
            synthesized_summary = EXCLUDED.synthesized_summary,
            dominant_status     = EXCLUDED.dominant_status,
            atlas_version       = EXCLUDED.atlas_version,
            updated_at          = now()
        `, [
          r.feature_id, r.atlas_file_count, r.qdrant_point_count, r.packet_count,
          r.primary_cluster_id, r.primary_centroid_id,
          r.cluster_ids, r.top_file_paths, r.source_refs,
          r.synthesized_summary, r.next_actions,
          r.dominant_status, r.has_blocked, r.atlas_version,
        ]);
      }
      await client.query('COMMIT');
      applied += batch.length;
      process.stdout.write(`\r  Applied: ${applied}/${rows.length}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('\n  ROLLBACK batch', i, err.message);
    } finally {
      client.release();
    }
  }

  // Final counts
  const { rows: stats } = await pool.query(`
    SELECT count(*) AS total,
           avg(atlas_file_count) AS avg_files,
           max(atlas_file_count) AS max_files
    FROM atlas_feature_synthesis
  `);
  const s = stats[0];
  console.log(`\n\n  Final synthesis rows: ${s.total}`);
  console.log(`  Avg files/feature:   ${Number(s.avg_files).toFixed(1)}`);
  console.log(`  Max files/feature:   ${s.max_files}`);

  await pool.end();
  console.log('\n  Done.\n');
}

main().catch(err => { console.error(err); process.exit(1); });
