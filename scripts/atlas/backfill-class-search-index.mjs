#!/usr/bin/env node
/**
 * Backfill atlas_class_search_index_v1 from atlas_ast_nodes (node_kind='class').
 *
 * Source of truth: atlas_ast_nodes (AST-grep extraction, read-only here).
 * packet_key/feature_id/feature_label are best-effort LEFT JOIN resolution
 * via atlas_packets.source_ref = atlas_ast_nodes.relative_path — a class's
 * containing file, not the class itself. Resolution rate is low (~4% as of
 * 2026-08-26, 145/3675) because most files aren't yet packet-registered;
 * this script does not fabricate or promote packet identity, it just
 * records what resolves and leaves the rest NULL.
 *
 * embedding is intentionally left NULL — no class-level embedding pipeline
 * exists yet. Never fabricate vectors.
 *
 * Usage:
 *   node scripts/atlas/backfill-class-search-index.mjs            # dry run (default)
 *   node scripts/atlas/backfill-class-search-index.mjs --apply    # real writes
 *   node scripts/atlas/backfill-class-search-index.mjs --limit 50 --apply
 */
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import pg from 'pg';

const APPLY = process.argv.includes('--apply');
const limitArgIndex = process.argv.indexOf('--limit');
const LIMIT = limitArgIndex >= 0 ? Number(process.argv[limitArgIndex + 1]) : null;

function sha256Hex(input) {
  return createHash('sha256').update(input).digest('hex');
}

async function main() {
  const pool = new pg.Pool({
    host: process.env.POSTGRES_HOST ?? '127.0.0.1',
    port: Number(process.env.POSTGRES_PORT ?? 5434),
    user: process.env.POSTGRES_USER ?? 'legal_admin',
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB ?? 'legal_ai_db',
  });

  try {
    const sourceRows = await pool.query(
      `
        SELECT
          an.tree_node_id, an.qualified_symbol, an.relative_path, an.source_ref_key,
          an.source_revision, an.parser_language, an.normalized_signature,
          an.line_start, an.line_end,
          ap.packet_key, ap.feature_id, ap.feature_label
        FROM atlas_ast_nodes an
        LEFT JOIN atlas_packets ap ON ap.source_ref = an.relative_path
        WHERE an.node_kind = 'class'
        ORDER BY an.tree_node_id
        ${LIMIT ? 'LIMIT $1' : ''}
      `,
      LIMIT ? [LIMIT] : [],
    );

    const rows = sourceRows.rows;
    const resolvedPacketCount = rows.filter((r) => r.packet_key).length;

    console.log(`[backfill-class-search-index] source rows: ${rows.length}`);
    console.log(`[backfill-class-search-index] packet_key resolved: ${resolvedPacketCount}/${rows.length} (${rows.length > 0 ? ((resolvedPacketCount / rows.length) * 100).toFixed(1) : '0.0'}%)`);
    console.log(`[backfill-class-search-index] mode: ${APPLY ? 'APPLY (real writes)' : 'DRY_RUN (no writes)'}`);

    if (!APPLY) {
      console.log('[backfill-class-search-index] sample (first 3):');
      for (const row of rows.slice(0, 3)) {
        console.log(`  - ${row.qualified_symbol} @ ${row.relative_path} (packet_key=${row.packet_key ?? 'NULL'})`);
      }
      console.log('[backfill-class-search-index] DRY_RUN complete. Re-run with --apply to write.');
      return;
    }

    let written = 0;
    const errors = [];
    for (const row of rows) {
      try {
        await pool.query(
          `
            INSERT INTO atlas_class_search_index_v1 (
              tree_node_id, qualified_symbol, relative_path, packet_key, feature_id,
              feature_label, source_ref, source_ref_hash, source_revision,
              parser_language, normalized_signature, line_start, line_end,
              tokens, provenance
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            ON CONFLICT (tree_node_id) DO UPDATE SET
              qualified_symbol = EXCLUDED.qualified_symbol,
              relative_path = EXCLUDED.relative_path,
              packet_key = EXCLUDED.packet_key,
              feature_id = EXCLUDED.feature_id,
              feature_label = EXCLUDED.feature_label,
              source_ref = EXCLUDED.source_ref,
              source_ref_hash = EXCLUDED.source_ref_hash,
              source_revision = EXCLUDED.source_revision,
              normalized_signature = EXCLUDED.normalized_signature,
              line_start = EXCLUDED.line_start,
              line_end = EXCLUDED.line_end,
              tokens = EXCLUDED.tokens,
              provenance = EXCLUDED.provenance,
              updated_at = now()
          `,
          [
            row.tree_node_id,
            row.qualified_symbol,
            row.relative_path,
            row.packet_key,
            row.feature_id,
            row.feature_label,
            row.source_ref_key || row.relative_path,
            sha256Hex(row.source_ref_key || row.relative_path),
            row.source_revision,
            row.parser_language,
            row.normalized_signature ?? '',
            row.line_start,
            row.line_end,
            [row.qualified_symbol].filter(Boolean),
            JSON.stringify({ producer: 'backfill-class-search-index.mjs@v1', sourceTable: 'atlas_ast_nodes' }),
          ],
        );
        written += 1;
      } catch (error) {
        errors.push({ treeNodeId: row.tree_node_id, message: error.message });
      }
    }

    console.log(`[backfill-class-search-index] APPLIED: attempted=${rows.length} written=${written} errors=${errors.length}`);
    if (errors.length > 0) {
      console.log('[backfill-class-search-index] first 5 errors:', errors.slice(0, 5));
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error('[backfill-class-search-index] fatal:', error);
    process.exitCode = 1;
  });
}
