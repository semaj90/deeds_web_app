#!/usr/bin/env node
/**
 * Backfill missing feature_id for graphify packets
 *
 * Issue: 1,425 graphify packets (mostly doc chunks) have NULL feature_id
 * Strategy: Derive feature_id from source_ref pattern
 *   - schema/*.ts → 'database_orm' or 'schema'
 *   - docs/*.md#chunk-* → 'documentation'
 *   - src/lib/* → 'client_libraries'
 *   - src/routes/* → 'api_endpoints'
 *   - default → hash-based stable feature_id
 *
 * Execution:
 *   node scripts/atlas/backfill-graphify-feature-id.mjs [--dry-run] [--verbose]
 *
 * Output:
 *   - Console: Summary of backfilled packets
 *   - Postgres: Updated atlas_packets table
 */

import { createHash } from 'crypto';

const VERBOSE = process.argv.includes('--verbose');
const DRY_RUN = process.argv.includes('--dry-run');

// Feature ID derivation rules
function deriveFeatureId(sourceRef) {
  const lower = sourceRef.toLowerCase();

  // Document chunks
  if (lower.includes('docs/') && (lower.includes('.md') || lower.includes('#chunk'))) {
    return 'documentation';
  }

  // Database schema
  if (lower.includes('schema/') && lower.endsWith('.ts')) {
    return 'database_orm';
  }

  // Client libraries
  if (lower.startsWith('sveltekit-frontend/src/lib/')) {
    if (lower.includes('server/')) return 'server_libraries';
    if (lower.includes('components/')) return 'ui_components';
    if (lower.includes('stores/')) return 'state_management';
    return 'client_libraries';
  }

  // API routes
  if (lower.includes('src/routes/api/')) {
    return 'api_endpoints';
  }

  // Config files
  if (lower.match(/\.(env|config|json)$/)) {
    return 'configuration';
  }

  // Default: stable hash-based ID from source_ref
  const hash = createHash('sha256').update(sourceRef).digest('hex').slice(0, 12);
  return hash;
}

async function backfill() {
  const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

  try {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({
      connectionString: DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 5000
    });

    try {
      console.log(`${DRY_RUN ? '[DRY-RUN] ' : ''}Backfilling missing feature_id for graphify packets...\n`);

      // Fetch all missing feature_id packets
      const r = await pool.query(`
        SELECT packet_id, packet_key, source_ref, feature_id
        FROM atlas_packets
        WHERE source_kind = 'graphify' AND (feature_id IS NULL OR feature_id = '')
        ORDER BY source_ref
      `);

      const toUpdate = r.rows;
      console.log(`Found ${toUpdate.length} packets with missing feature_id\n`);

      if (toUpdate.length === 0) {
        console.log('✅ All graphify packets have feature_id');
        await pool.end();
        return;
      }

      // Group by derived feature_id to show distribution
      const distribution = {};
      const updates = [];

      for (const row of toUpdate) {
        const derivedId = deriveFeatureId(row.source_ref);
        if (!distribution[derivedId]) distribution[derivedId] = 0;
        distribution[derivedId]++;
        updates.push({ packet_id: row.packet_id, packet_key: row.packet_key, source_ref: row.source_ref, feature_id: derivedId });
      }

      console.log('Distribution of derived feature_ids:');
      Object.entries(distribution)
        .sort((a, b) => b[1] - a[1])
        .forEach(([fid, cnt]) => {
          console.log(`  ${fid.padEnd(25)} ${cnt.toString().padStart(4)}`);
        });
      console.log('');

      if (VERBOSE) {
        console.log('Sample updates:');
        updates.slice(0, 10).forEach(u => {
          console.log(`  ${u.packet_key.padEnd(50)} → ${u.feature_id}`);
        });
        console.log('');
      }

      if (DRY_RUN) {
        console.log('[DRY-RUN] Would update:');
        console.log(`  ${toUpdate.length} packets`);
        return;
      }

      // Perform update in batch
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        for (const update of updates) {
          await client.query(
            'UPDATE atlas_packets SET feature_id = $1 WHERE packet_id = $2',
            [update.feature_id, update.packet_id]
          );
        }

        await client.query('COMMIT');
        console.log(`✅ Updated ${updates.length} packets`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      // Verify
      const verify = await pool.query(`
        SELECT COUNT(*) as missing
        FROM atlas_packets
        WHERE source_kind = 'graphify' AND (feature_id IS NULL OR feature_id = '')
      `);

      const stillMissing = Number(verify.rows[0].missing);
      if (stillMissing === 0) {
        console.log('✅ Verification passed: all graphify packets now have feature_id\n');
      } else {
        console.warn(`⚠️  ${stillMissing} packets still missing feature_id after backfill\n`);
      }
    } finally {
      await pool.end();
    }
  } catch (err) {
    console.error('❌ Backfill failed:', err.message);
    process.exit(1);
  }
}

backfill();
