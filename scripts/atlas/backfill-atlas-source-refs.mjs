#!/usr/bin/env node
/**
 * backfill-atlas-source-refs.mjs
 *
 * Phase 3I: Replace .tmp/parent_atlas_packets/* artifact source_ref values
 * with canonical code file paths by reading each packet's JSONB payload
 * and extracting the original file reference.
 *
 * Strategy:
 *   1. Load all atlas_packets where source_ref looks like .tmp/ artifact
 *   2. For each packet, parse payload to extract original file path
 *   3. Apply canonicalPath normalization
 *   4. Update source_ref, source_path, source_kind, packet_key
 *
 * Usage:
 *   node scripts/atlas/backfill-atlas-source-refs.mjs
 *   node scripts/atlas/backfill-atlas-source-refs.mjs --dry-run
 *   node scripts/atlas/backfill-atlas-source-refs.mjs --limit 50
 */

import pg from 'pg';
import { createHash } from 'node:crypto';
import { normalizeSourceRef } from '../lib/canonical-source-ref.mjs';

const { Pool } = pg;

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT_ARG = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : 0;
const BATCH_SIZE = 50;

// Fields to check in payload for source path
const PATH_FIELDS = [
  'file', 'filePath', 'file_path', 'path', 'source', 'source_path',
  'sourcePath', 'source_ref', 'sourceRef', 'artifactPath',
  'originalPath', 'origin', 'uri',
];

function extractPathFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;

  for (const field of PATH_FIELDS) {
    const val = payload[field];
    if (val && typeof val === 'string' && val.length > 0) {
      // Skip obvious artifact paths
      if (!val.includes('parent_atlas_packets') && !val.startsWith('.tmp')) {
        return val;
      }
    }
  }

  // Check nested metadata
  if (payload.metadata && typeof payload.metadata === 'object') {
    return extractPathFromPayload(payload.metadata);
  }

  return null;
}

function inferSourceKind(sourceRef, payload) {
  if (!sourceRef) return 'unknown';

  if (sourceRef.includes('neschrom97') || payload?.kind === 'neschrom97') return 'neschrom97';
  if (sourceRef.includes('chr97') || payload?.kind === 'chr97') return 'chr97';
  if (sourceRef.startsWith('scripts/')) return 'graphify';
  if (sourceRef.startsWith('src/')) return 'graphify';
  if (sourceRef.startsWith('docs/')) return 'docs';
  if (sourceRef.endsWith('.ts') || sourceRef.endsWith('.svelte') || sourceRef.endsWith('.js')) return 'graphify';
  if (payload?.source_kind) return payload.source_kind;
  if (payload?.kind) return payload.kind;

  return 'graphify';
}

function buildPacketKey(sourceRef, packetId) {
  const ref = normalizeSourceRef(sourceRef) || sourceRef || '';
  const hash = createHash('sha256')
    .update(`${ref}:${packetId}`)
    .digest('hex')
    .slice(0, 16);
  return `${ref}:${hash}`;
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  console.log('\n🔧 Atlas Packets — Source Ref Backfill (Phase 3I)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Check for required columns
  const colRes = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'atlas_packets'
  `);
  const cols = new Set(colRes.rows.map((r) => r.column_name));

  if (!cols.has('packet_key')) {
    console.error('❌ packet_key column missing — run add-atlas-packets-columns.mjs first');
    process.exit(1);
  }

  try {
    let query = `
      SELECT packet_id, artifact_id, source_ref, payload
      FROM atlas_packets
      WHERE source_ref LIKE '.tmp/%'
         OR source_ref LIKE 'tmp/%'
         OR source_ref LIKE '%parent_atlas_packets%'
         OR source_ref IS NULL
         OR source_ref = ''
      ORDER BY packet_id
    `;
    if (LIMIT > 0) query += ` LIMIT ${LIMIT}`;

    const res = await pool.query(query);
    const total = res.rows.length;

    if (total === 0) {
      console.log('  ✅ No artifact source_refs found — nothing to backfill\n');
      return;
    }

    console.log(`  Found ${total} packets to backfill${LIMIT > 0 ? ` (limited to ${LIMIT})` : ''}\n`);

    let fixed = 0;
    let failed = 0;
    let noPath = 0;

    // Process in batches
    for (let i = 0; i < res.rows.length; i += BATCH_SIZE) {
      const batch = res.rows.slice(i, i + BATCH_SIZE);

      for (const row of batch) {
        const payload = row.payload ?? {};
        const oldSourceRef = row.source_ref ?? '';

        // Try to extract real path from payload
        let rawPath = extractPathFromPayload(payload);

        // Fall back to artifact_id if it looks like a path
        if (!rawPath && row.artifact_id && !row.artifact_id.includes('parent_atlas_packets')) {
          if (row.artifact_id.includes('/') || row.artifact_id.includes('\\')) {
            rawPath = row.artifact_id;
          }
        }

        if (!rawPath) {
          noPath++;
          continue;
        }

        const canonRef = normalizeSourceRef(rawPath);
        if (!canonRef || canonRef === oldSourceRef) {
          noPath++;
          continue;
        }

        const sourceKind = inferSourceKind(canonRef, payload);
        const packetKey = buildPacketKey(canonRef, row.packet_id);

        if (DRY_RUN) {
          console.log(`  [dry] ${row.packet_id.slice(0, 8)}... ${oldSourceRef} → ${canonRef} (${sourceKind})`);
          fixed++;
          continue;
        }

        const updates = {
          source_ref: canonRef,
          source_path: rawPath,
          source_kind: sourceKind,
          packet_key: packetKey,
        };

        // Only set columns that exist
        const setClauses = [];
        const params = [];
        let idx = 1;
        for (const [col, val] of Object.entries(updates)) {
          if (cols.has(col)) {
            setClauses.push(`${col} = $${idx++}`);
            params.push(val);
          }
        }
        if (cols.has('updated_at')) {
          setClauses.push(`updated_at = now()`);
        }
        params.push(row.packet_id);

        try {
          await pool.query(
            `UPDATE atlas_packets SET ${setClauses.join(', ')} WHERE packet_id = $${idx}`,
            params
          );
          fixed++;
        } catch (err) {
          console.error(`  ⚠ Update failed for ${row.packet_id}: ${err.message}`);
          failed++;
        }
      }

      const done = Math.min(i + BATCH_SIZE, res.rows.length);
      process.stdout.write(`\r  Progress: ${done}/${total} (fixed: ${fixed}, no-path: ${noPath}, failed: ${failed})`);
    }

    console.log('');
    console.log(`\n  Summary:`);
    console.log(`    Fixed:   ${fixed}`);
    console.log(`    No path in payload: ${noPath}`);
    console.log(`    Failed:  ${failed}`);

    if (noPath > 0) {
      console.log(`\n  ⚠️  ${noPath} packets had no extractable path in their payload.`);
      console.log(`     These need to be re-ingested from their original sources.`);
      console.log(`     Inspect: SELECT packet_id, payload FROM atlas_packets WHERE source_ref LIKE '.tmp/%' LIMIT 5;`);
    }

    if (!DRY_RUN) {
      console.log('\n  Next step: node scripts/atlas/verify-atlas-packets.mjs\n');
    } else {
      console.log('\n  [dry-run] No changes made. Remove --dry-run to apply.\n');
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ Backfill failed:', err.message);
  process.exit(1);
});
