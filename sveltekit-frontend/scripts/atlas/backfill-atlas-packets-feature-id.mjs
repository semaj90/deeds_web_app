#!/usr/bin/env node
/**
 * backfill-atlas-packets-feature-id.mjs
 *
 * Backfill missing feature_id in atlas_packets by deriving from available fields.
 *
 * Priority order:
 * 1. Existing source_ref (parse directory)
 * 2. packet_key (parse structure)
 * 3. source_ref_key
 * 4. payload.source_refs JSONB array
 * 5. file_path
 * 6. Hash fallback
 *
 * IMPORTANT: Do NOT join nes_chrom_packets by feature_id (cartesian explosion).
 * nes_chrom_packets and atlas_packets are parallel ledgers, not merged.
 *
 * Modes:
 *   --verify          Count missing, estimate coverage (default)
 *   --dry-run         Show sample updates without applying
 *   --apply           Apply updates to database
 *   --limit N         Process max N rows
 *
 * Usage:
 *   npm run atlas:atlas-packets:feature-id:verify
 *   npm run atlas:atlas-packets:feature-id:backfill -- --limit 25
 *   npm run atlas:atlas-packets:feature-id:backfill:apply -- --limit 25
 */

import pg from 'pg';
import crypto from 'crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';

const { Pool } = pg;
const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '../..');
const DATABASE_URL = resolveDatabaseUrl(loadRepoEnv(process.env));

const MODE = process.argv.includes('--apply') ? 'apply' :
            process.argv.includes('--dry-run') ? 'dry-run' : 'verify';
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0') ||
            (MODE !== 'verify' ? 0 : 0);

const GENERIC_NAMES = new Set([
  'index', 'server', 'client', 'lib', 'utils', 'helpers', 'types', 'index.ts',
  'constants', 'config', 'main', 'app', 'handler', 'route'
]);

function deriveFeatureIdFromSourceRef(sourceRef) {
  if (!sourceRef || typeof sourceRef !== 'string') return null;

  // "src/lib/server/auth.ts" → try "auth", fallback to "server"
  const segments = sourceRef.split('/').filter(s => s.length > 0);
  const fileName = segments[segments.length - 1] || '';
  const baseName = fileName.split('.')[0];

  if (baseName && !GENERIC_NAMES.has(baseName) && baseName.length > 2) {
    return baseName;
  }

  // Fallback to parent directory
  if (segments.length > 1) {
    const parentDir = segments[segments.length - 2];
    if (parentDir && !GENERIC_NAMES.has(parentDir) && parentDir.length > 2) {
      return parentDir;
    }
  }

  // Last resort: use domain-like parent (src/lib/server → server)
  if (segments.length >= 2) {
    const domain = segments[segments.length - 2];
    if (domain && domain.length > 2) return domain;
  }

  return null;
}

function deriveFeatureIdFromPacketKey(packetKey) {
  if (!packetKey || typeof packetKey !== 'string') return null;

  // "ace:packet:auth:001" → "auth"
  const parts = packetKey.split(':');
  if (parts.length >= 3) {
    return parts[2]; // third segment
  }

  return null;
}

function hashFallback(sourceRef, packetKey) {
  const input = (sourceRef || packetKey || '').slice(0, 50);
  return `hash_${crypto.createHash('sha1').update(input).digest('hex').slice(0, 8)}`;
}

async function backfillAtlasPackets() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  console.log('\n═══ Backfill atlas_packets feature_id ═══\n');
  console.log(`Mode: ${MODE}${LIMIT ? ` (limit ${LIMIT})` : ''}`);

  try {
    // 1. Count current state
    const statsResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN feature_id IS NOT NULL AND feature_id != '' THEN 1 ELSE 0 END) as has_feature_id
      FROM atlas_packets
    `);

    const total = parseInt(statsResult.rows[0].total);
    const hasFeatureId = parseInt(statsResult.rows[0].has_feature_id);
    const missing = total - hasFeatureId;
    const pct = (100 * hasFeatureId / total).toFixed(1);

    console.log(`Before: ${hasFeatureId}/${total} (${pct}%)`);
    console.log(`Missing: ${missing}\n`);

    if (missing === 0) {
      console.log('✅ No missing feature_id. Done.\n');
      return { updated: 0, skipped: 0, coverage: pct };
    }

    if (MODE === 'verify') {
      console.log(`Run: npm run atlas:atlas-packets:feature-id:backfill -- --limit ${Math.min(25, missing)}`);
      console.log(`Then: npm run atlas:atlas-packets:feature-id:backfill:apply\n`);
      return { updated: 0, skipped: 0, coverage: pct };
    }

    // 2. Fetch rows to backfill (highest priority first)
    const query = `
      SELECT
        packet_id,
        source_ref,
        packet_key,
        source_ref_key,
        payload,
        file_path
      FROM atlas_packets
      WHERE (feature_id IS NULL OR feature_id = '')
      ORDER BY
        CASE WHEN source_ref IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN packet_key IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN payload IS NOT NULL THEN 0 ELSE 1 END
      ${LIMIT ? `LIMIT ${LIMIT}` : 'LIMIT 10000'}
    `;

    const rowsResult = await pool.query(query);
    const rows = rowsResult.rows;

    console.log(`Rows to process: ${rows.length}`);

    // 3. Derive feature_id for each row
    const updates = [];
    const sources = { source_ref: 0, packet_key: 0, payload: 0, hash: 0, skipped: 0 };

    for (const row of rows) {
      let featureId = null;
      let source = null;

      // Priority 1: source_ref
      if (row.source_ref) {
        featureId = deriveFeatureIdFromSourceRef(row.source_ref);
        if (featureId) {
          source = 'source_ref';
          sources.source_ref++;
        }
      }

      // Priority 2: packet_key
      if (!featureId && row.packet_key) {
        featureId = deriveFeatureIdFromPacketKey(row.packet_key);
        if (featureId && featureId !== 'packet') {
          source = 'packet_key';
          sources.packet_key++;
        }
      }

      // Priority 3: payload.source_refs array
      if (!featureId && row.payload && typeof row.payload === 'object') {
        const srcRefs = row.payload.source_refs;
        if (Array.isArray(srcRefs) && srcRefs.length > 0) {
          featureId = deriveFeatureIdFromSourceRef(srcRefs[0]);
          if (featureId) {
            source = 'payload';
            sources.payload++;
          }
        }
      }

      // Priority 4: Hash fallback (always possible)
      if (!featureId) {
        featureId = hashFallback(row.source_ref, row.packet_key);
        source = 'hash';
        sources.hash++;
      }

      if (featureId && featureId.length > 2) {
        updates.push({
          packet_id: row.packet_id,
          feature_id: featureId,
          source: source,
          inferred: true
        });
      } else {
        sources.skipped++;
      }
    }

    console.log(`\nInference sources:`);
    console.log(`  source_ref: ${sources.source_ref}`);
    console.log(`  packet_key: ${sources.packet_key}`);
    console.log(`  payload:    ${sources.payload}`);
    console.log(`  hash:       ${sources.hash}`);
    console.log(`  skipped:    ${sources.skipped}`);

    if (updates.length === 0) {
      console.log('\n❌ No derivable feature_ids.\n');
      return { updated: 0, skipped: sources.skipped, coverage: pct };
    }

    if (MODE === 'dry-run') {
      // Show sample
      console.log('\n--- DRY-RUN: Sample updates ---');
      updates.slice(0, 5).forEach(u => {
        console.log(`  ${u.packet_id}: → ${u.feature_id} (via ${u.source})`);
      });
      console.log(`  ... (${updates.length - 5} more)\n`);
      console.log('Run: npm run atlas:atlas-packets:feature-id:backfill:apply\n');
      return { updated: 0, skipped: sources.skipped, coverage: pct };
    }

    // 4. Apply updates in batches
    console.log(`\nApplying ${updates.length} updates...`);
    const batchSize = 500;
    let updated = 0;

    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);

      // Build parameterized update with metadata
      const values = [];
      const sets = [];

      for (let j = 0; j < batch.length; j++) {
        const u = batch[j];
        const paramIdx = j * 3 + 1;

        values.push(u.packet_id, u.feature_id, JSON.stringify({
          feature_id_inferred: true,
          feature_id_source: u.source,
          lineage_version: 'packet-identity-v1'
        }));

        sets.push(`
          WHEN $${paramIdx} THEN (
            $${paramIdx + 1},
            jsonb_set(
              COALESCE(metadata, '{}'::jsonb),
              '{feature_id_inferred,feature_id_source,lineage_version}',
              $${paramIdx + 2}::jsonb
            )
          )
        `);
      }

      await pool.query(`
        UPDATE atlas_packets
        SET
          feature_id = CASE packet_id ${sets.map((_, j) => `WHEN $${j * 3 + 1} THEN $${j * 3 + 2}`).join(' ')} ELSE feature_id END,
          metadata = CASE packet_id ${sets.map((_, j) => `WHEN $${j * 3 + 1} THEN (jsonb_set(COALESCE(metadata, '{}'::jsonb), '{feature_id_inferred}', 'true'::jsonb) || jsonb_set('{}'::jsonb, '{feature_id_source}', json_build_object('source', $${j * 3 + 3}::text)::jsonb))`).join(' ')} ELSE metadata END
        WHERE packet_id IN (${batch.map((_, j) => `$${j * 3 + 1}`).join(',')})
      `, batch.flatMap(u => [u.packet_id, u.feature_id, u.source]));

      updated += batch.length;
      process.stdout.write(`\r  Updated: ${updated}/${updates.length}`);
    }

    console.log('\n\n✅ Backfill complete.');

    // 5. Verify
    const verifyResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN feature_id IS NOT NULL AND feature_id != '' THEN 1 ELSE 0 END) as has_feature_id
      FROM atlas_packets
    `);

    const totalAfter = parseInt(verifyResult.rows[0].total);
    const hasFeatureIdAfter = parseInt(verifyResult.rows[0].has_feature_id);
    const pctAfter = (100 * hasFeatureIdAfter / totalAfter).toFixed(1);

    console.log(`After:  ${hasFeatureIdAfter}/${totalAfter} (${pctAfter}%)`);
    console.log(`Gain:   +${(pctAfter - pct).toFixed(1)}%`);
    console.log(`Gate (≥90%): ${pctAfter >= 90 ? '✅ PASS' : '⚠️ PARTIAL'}\n`);

    // 6. Write report
    const reportDir = join(ROOT, 'docs', 'reports');
    mkdirSync(reportDir, { recursive: true });

    writeFileSync(
      join(reportDir, 'atlas-packets-backfill.json'),
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        table: 'atlas_packets',
        mode: MODE,
        rowsProcessed: updates.length,
        updated: updated,
        sources: sources,
        coverage: {
          before: { has: hasFeatureId, total, percent: pct },
          after: { has: hasFeatureIdAfter, total: totalAfter, percent: pctAfter }
        },
        gate: pctAfter >= 90 ? 'PASS' : 'PARTIAL'
      }, null, 2)
    );

    console.log(`Report: docs/reports/atlas-packets-backfill.json\n`);
    console.log('Next: npm run atlas:qdrant-payload:verify\n');

    return { updated, skipped: sources.skipped, coverage: pctAfter };

  } finally {
    await pool.end();
  }
}

backfillAtlasPackets().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
