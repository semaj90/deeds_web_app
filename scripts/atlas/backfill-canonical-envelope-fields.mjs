#!/usr/bin/env node
/**
 * Backfill Canonical Envelope Required Fields
 *
 * Populates missing hard-requirement fields:
 *   - source_ref_key: derived from source_ref (hash)
 *   - title_id: existing OR derived from feature_id
 *   - tree_node_id: existing (may be null if not applicable)
 *
 * Usage:
 *   node scripts/atlas/backfill-canonical-envelope-fields.mjs --dry-run [--limit=N]
 *   node scripts/atlas/backfill-canonical-envelope-fields.mjs --apply [--limit=N]
 */

import pg from 'pg';
import crypto from 'crypto';
import { loadRepoEnv } from './connection-config.mjs';

const ENV = loadRepoEnv(process.env);
Object.assign(process.env, ENV);

const DRY_RUN = !process.argv.includes('--apply');
const LIMIT = Number(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] ?? 58365);

const { Pool } = pg;

/**
 * Derive source_ref_key from source_ref
 * Keys are normalized: lowercase, no special chars, no slashes
 */
function deriveSourceRefKey(sourceRef) {
  if (!sourceRef) return null;
  return crypto.createHash('sha256').update(sourceRef).digest('hex').slice(0, 16);
}

/**
 * Derive title_id from feature_id (if not present)
 */
function deriveTitleId(featureId, existingTitleId) {
  if (existingTitleId) return existingTitleId;
  if (!featureId) return 'untitled';
  // Normalize: replace dots with colons, keep alphanumeric/colons/underscores/hyphens
  return featureId.replace(/\./g, ':').replace(/[^a-z0-9:_-]/gi, '-').toLowerCase();
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Backfill Canonical Envelope Required Fields                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const pool = new Pool({
    host: ENV.PGHOST ?? '127.0.0.1',
    port: ENV.PGPORT ?? 5434,
    database: ENV.PGDATABASE ?? 'legal_ai_db',
    user: ENV.PGUSER ?? 'legal_admin',
    password: ENV.PGPASSWORD ?? ENV.DB_PASSWORD ?? '123456',
  });

  try {
    console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}\n`);

    // Fetch packets that need backfilling
    console.log('Step 1: Identify packets needing backfill...\n');
    const result = await pool.query(
      `
      SELECT
        packet_key,
        source_ref,
        source_ref_key,
        feature_id,
        title_id,
        tree_node_id
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
        AND (
          source_ref_key IS NULL
          OR title_id IS NULL
        )
      ORDER BY created_at
      LIMIT $1
    `,
      [LIMIT]
    );

    const packets = result.rows;
    console.log(`Found ${packets.length} packets needing backfill\n`);

    // Prepare updates
    const updates = [];
    for (const packet of packets) {
      const sourceRefKey = packet.source_ref_key || deriveSourceRefKey(packet.source_ref);
      const titleId = packet.title_id || deriveTitleId(packet.feature_id, packet.title_id);

      updates.push({
        packet_key: packet.packet_key,
        source_ref_key: sourceRefKey,
        title_id: titleId,
      });
    }

    console.log(`Step 2: Backfill ${updates.length} packets\n`);

    if (DRY_RUN) {
      console.log('DRY-RUN: Sample updates:');
      updates.slice(0, 5).forEach(u => {
        console.log(`  ${u.packet_key}:`);
        console.log(`    source_ref_key: ${u.source_ref_key}`);
        console.log(`    title_id: ${u.title_id}`);
      });
      if (updates.length > 5) {
        console.log(`  ... and ${updates.length - 5} more\n`);
      }
    } else {
      // Apply updates individually (simpler and safer)
      let updated = 0;

      for (const update of updates) {
        try {
          await pool.query(
            `
            UPDATE atlas_packets
            SET
              source_ref_key = COALESCE(source_ref_key, $2),
              title_id = COALESCE(title_id, $3)
            WHERE packet_key = $1
          `,
            [update.packet_key, update.source_ref_key, update.title_id]
          );
          updated++;

          if (updated % 1000 === 0) {
            console.log(`  Updated ${updated}/${updates.length} packets...`);
          }
        } catch (err) {
          console.error(`Error updating ${update.packet_key}:`, err.message);
          throw err;
        }
      }

      console.log(`\n✅ Updated ${updated} packets\n`);
    }

    // Verify
    console.log('Step 3: Verify backfill...\n');
    const verifyResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN source_ref_key IS NOT NULL THEN 1 END) as has_source_ref_key,
        COUNT(CASE WHEN title_id IS NOT NULL THEN 1 END) as has_title_id,
        COUNT(CASE WHEN tree_node_id IS NOT NULL THEN 1 END) as has_tree_node_id
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
    `);

    const stats = verifyResult.rows[0];
    console.log(`Envelope field coverage:`);
    console.log(`  source_ref_key: ${stats.has_source_ref_key}/${stats.total} (${((stats.has_source_ref_key / stats.total) * 100).toFixed(1)}%)`);
    console.log(`  title_id: ${stats.has_title_id}/${stats.total} (${((stats.has_title_id / stats.total) * 100).toFixed(1)}%)`);
    console.log(`  tree_node_id: ${stats.has_tree_node_id}/${stats.total} (${((stats.has_tree_node_id / stats.total) * 100).toFixed(1)}%)`);

    console.log(`\n✅ Backfill complete\n`);
  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();