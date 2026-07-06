#!/usr/bin/env node

/**
 * Qdrant Point ID Bridge
 *
 * Deterministic mapping: packet_key ↔ qdrant_point_id
 * plus concrete provenance propagation:
 *   source_ref, canonical_source_ref, source_path, file_path, directory_path
 *
 * The bridge is intentionally conservative:
 *   - prefer existing qdrant_point_id values
 *   - otherwise resolve from concrete source/path joins
 *   - never invent synthetic point IDs
 *
 * Usage:
 *   node scripts/atlas/qdrant-point-id-bridge.mjs --dry-run
 *   node scripts/atlas/qdrant-point-id-bridge.mjs --apply
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { buildCanonicalFeatureEnvelope, reportValidation } from './lib/envelope-builder.mjs';

config({ path: resolve('.', '.env') });

const env = loadRepoEnv(process.env);
const POSTGRES_URL = resolveDatabaseUrl(env);

const pgPool = new pg.Pool({ connectionString: POSTGRES_URL });

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const BATCH_SIZE = Number(process.argv.find((value) => value.startsWith('--batch-size='))?.split('=')[1] ?? 500);

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Qdrant Point ID Bridge                                        ║');
console.log('║  Deterministic packet_key ↔ qdrant_point_id(s) mapping        ║');
console.log(`║  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'.padEnd(54)}║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');
console.log(`   Batch size: ${BATCH_SIZE}`);

async function bridgeQdrantPoints() {
  try {
    console.log('📊 Step 1: Audit current state\n');

    // Count atlas_packets with source_ref
    const packetRes = await pgPool.query(`
      SELECT
        COUNT(*) total,
        COUNT(CASE WHEN source_ref IS NOT NULL THEN 1 END) with_ref,
        COUNT(CASE WHEN canonical_source_ref IS NOT NULL THEN 1 END) with_canonical,
        COUNT(CASE WHEN source_path IS NOT NULL THEN 1 END) with_source_path,
        COUNT(CASE WHEN directory_path IS NOT NULL THEN 1 END) with_directory_path,
        COUNT(CASE WHEN qdrant_point_id IS NOT NULL THEN 1 END) with_qdrant_point_id
      FROM atlas_packets
    `);
    const {
      total: packetTotal,
      with_ref: packetWithRef,
      with_canonical: packetWithCanonical,
      with_source_path: packetWithSourcePath,
      with_directory_path: packetWithDirectoryPath,
      with_qdrant_point_id: packetWithQdrantPointId,
    } = packetRes.rows[0];
    console.log(`   Atlas packets: ${packetTotal} (${packetWithRef} with source_ref)`);
    console.log(`   Canonical refs: ${packetWithCanonical}`);
    console.log(`   Source paths:   ${packetWithSourcePath}`);
    console.log(`   Directories:    ${packetWithDirectoryPath}`);
    console.log(`   Qdrant ids:     ${packetWithQdrantPointId}`);
    console.log();

    console.log('🔗 Step 2: Build deterministic packet bridge via concrete provenance joins\n');

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS packet_qdrant_bridge (
        packet_key TEXT PRIMARY KEY,
        source_ref TEXT NOT NULL,
        feature_id TEXT,
        qdrant_point_id TEXT NOT NULL,
        qdrant_collection TEXT NOT NULL DEFAULT 'codebase_chunks_768',
        matched_by TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 1.0,
        relative_path TEXT,
        directory_path TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE packet_qdrant_bridge
        ADD COLUMN IF NOT EXISTS directory_path TEXT;
      CREATE INDEX IF NOT EXISTS idx_packet_qdrant_bridge_point_id
        ON packet_qdrant_bridge (qdrant_point_id);
      CREATE INDEX IF NOT EXISTS idx_packet_qdrant_bridge_source_ref
        ON packet_qdrant_bridge (source_ref);
    `);

    // Join: atlas_packets + codebase_chunk_index
    // Goal: for each packet_key, resolve one concrete qdrant_point_id and persist provenance
    const bridgeRes = await pgPool.query(`
      SELECT
        ap.packet_key,
        ap.source_ref,
        ap.canonical_source_ref,
        ap.source_ref_key,
        ap.source_path,
        ap.file_path,
        ap.directory_path,
        ap.feature_id,
        ap.title_id,
        ap.tree_node_id,
        ap.feature_label,
        ap.concept_ids,
        ap.domain_class,
        ap.community_id,
        ap.som_cluster,
        ap.qdrant_point_id,
        COUNT(DISTINCT cci.id)::int as chunk_count,
        array_agg(DISTINCT NULLIF(cci.qdrant_id::text, '')) FILTER (WHERE NULLIF(cci.qdrant_id::text, '') IS NOT NULL) AS chunk_qdrant_ids,
        array_agg(DISTINCT NULLIF(cci.relative_path, '')) FILTER (WHERE NULLIF(cci.relative_path, '') IS NOT NULL) AS chunk_relative_paths
      FROM atlas_packets ap
      LEFT JOIN codebase_chunk_index cci
        ON cci.relative_path = COALESCE(
          NULLIF(ap.file_path, ''),
          NULLIF(ap.source_path, ''),
          NULLIF(ap.canonical_source_ref, ''),
          NULLIF(ap.source_ref, '')
        )
      WHERE COALESCE(NULLIF(ap.source_ref, ''), NULLIF(ap.canonical_source_ref, ''), NULLIF(ap.source_path, ''), NULLIF(ap.file_path, '')) IS NOT NULL
      GROUP BY
        ap.packet_key,
        ap.source_ref,
        ap.canonical_source_ref,
        ap.source_ref_key,
        ap.source_path,
        ap.file_path,
        ap.directory_path,
        ap.feature_id,
        ap.title_id,
        ap.tree_node_id,
        ap.feature_label,
        ap.concept_ids,
        ap.domain_class,
        ap.community_id,
        ap.som_cluster,
        ap.qdrant_point_id
    `);

    let validationFailures = 0;
    const validatedRows = [];

    // Validate all rows before building bridge
    for (const row of bridgeRes.rows) {
      const { validation } = buildCanonicalFeatureEnvelope({
        packet_key: row.packet_key,
        source_ref: row.source_ref,
        canonical_source_ref: row.canonical_source_ref,
        source_ref_key: row.source_ref_key,
        source_path: row.source_path,
        file_path: row.file_path,
        directory_path: row.directory_path,
        feature_id: row.feature_id,
        title_id: row.title_id,
        tree_node_id: row.tree_node_id,
        feature_label: row.feature_label,
        concept_ids: row.concept_ids,
        domain_class: row.domain_class,
        community_id: row.community_id,
        som_cluster: row.som_cluster,
        qdrant_point_id: row.qdrant_point_id,
      });

      if (!validation.isValid && validation.hardFailures.length > 0) {
        if (process.argv.includes('--verbose')) {
          reportValidation(validation, row.packet_key);
        }
        validationFailures++;
      } else {
        validatedRows.push(row);
      }
    }

    const bridgeRows = validatedRows;
    console.log(`   Built bridge: ${bridgeRows.length} packets → chunks (${validationFailures} validation failures skipped)`);

    // Estimate coverage
    const withChunks = bridgeRows.filter(r => r.chunk_count > 0).length;
    console.log(`   Packets with ≥1 chunk: ${withChunks}/${bridgeRows.length} (${(100 * withChunks / bridgeRows.length).toFixed(1)}%)`);
    console.log();

    if (DRY_RUN) {
      console.log('📋 DRY-RUN: Sample bridge mappings\n');
      bridgeRows.slice(0, 5).forEach(row => {
        console.log(`   packet_key: ${row.packet_key}`);
        console.log(`   source_ref: ${row.source_ref}`);
        console.log(`   chunks: ${row.chunk_count} (qdrant IDs: ${row.chunk_qdrant_ids?.slice(0, 3)?.join(', ')}${row.chunk_count > 3 ? '...' : ''})`);
        console.log();
      });
    } else {
      console.log('📝 Step 4: Materialize packet_qdrant_bridge and update atlas_packets from the ledger\n');

      let insertedCount = 0;
      for (let i = 0; i < bridgeRows.length; i += BATCH_SIZE) {
        const batch = bridgeRows.slice(i, i + BATCH_SIZE);
        const inserts = [];
        const params = [];
        let p = 1;

        for (const row of batch) {
          const resolvedPointId =
            row.qdrant_point_id ||
            (Array.isArray(row.chunk_qdrant_ids) && row.chunk_qdrant_ids.length > 0
              ? String(row.chunk_qdrant_ids[0])
              : null);

          const resolvedRelativePath =
            (Array.isArray(row.chunk_relative_paths) && row.chunk_relative_paths.length > 0
              ? String(row.chunk_relative_paths[0])
              : null) ||
            row.source_path ||
            row.file_path ||
            row.canonical_source_ref ||
            row.source_ref ||
            null;

          if (!resolvedPointId) continue;

          inserts.push(`($${p}, $${p + 1}, $${p + 2}, $${p + 3}, $${p + 4}, $${p + 5}, $${p + 6}, $${p + 7}, $${p + 8})`);
          params.push(
            row.packet_key,
            row.source_ref || row.canonical_source_ref || row.packet_key,
            row.feature_id || null,
            resolvedPointId,
            'source_ref_relative_path',
            1.0,
            resolvedRelativePath,
            row.directory_path || null,
            new Date().toISOString(),
          );
          p += 9;
        }

        if (!inserts.length) continue;

        const insertResult = await pgPool.query(
          `
          INSERT INTO packet_qdrant_bridge (
            packet_key,
            source_ref,
            feature_id,
            qdrant_point_id,
            matched_by,
            confidence,
            relative_path,
            directory_path,
            updated_at
          )
          VALUES ${inserts.join(', ')}
          ON CONFLICT (packet_key)
          DO UPDATE SET
            source_ref = EXCLUDED.source_ref,
            feature_id = EXCLUDED.feature_id,
            qdrant_point_id = EXCLUDED.qdrant_point_id,
            matched_by = EXCLUDED.matched_by,
            confidence = EXCLUDED.confidence,
            relative_path = EXCLUDED.relative_path,
            directory_path = EXCLUDED.directory_path,
            updated_at = NOW()
        `,
          params
        );

        insertedCount += insertResult.rowCount ?? 0;
      }

      console.log(`   ✅ Materialized ${insertedCount} packet_qdrant_bridge rows\n`);

      const updateResult = await pgPool.query(`
        UPDATE atlas_packets ap
        SET
          qdrant_point_id = COALESCE(NULLIF(ap.qdrant_point_id, ''), b.qdrant_point_id),
          source_path = COALESCE(NULLIF(ap.source_path, ''), b.relative_path),
          file_path = COALESCE(NULLIF(ap.file_path, ''), b.relative_path),
          canonical_source_ref = COALESCE(NULLIF(ap.canonical_source_ref, ''), ap.source_ref, b.source_ref),
          source_ref = COALESCE(NULLIF(ap.source_ref, ''), b.source_ref),
          source_ref_key = COALESCE(NULLIF(ap.source_ref_key, ''), b.source_ref, ap.packet_key),
          directory_path = COALESCE(NULLIF(ap.directory_path, ''), split_part(b.relative_path, '/', 1)),
          updated_at = NOW()
        FROM packet_qdrant_bridge b
        WHERE ap.packet_key = b.packet_key
      `);

      console.log(`   ✅ Updated ${updateResult.rowCount} atlas_packets from packet_qdrant_bridge\n`);
    }

    console.log('✅ Qdrant bridge complete!');

  } catch (err) {
    console.error('❌ Error:', err.message);
    if (process.argv.includes('--verbose')) console.error(err.stack);
    process.exit(1);
  } finally {
    await pgPool.end();
  }
}

bridgeQdrantPoints();
