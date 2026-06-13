#!/usr/bin/env node
/**
 * Backfill missing feature_label in payload JSONB
 *
 * Issue: 8,744 packets missing payload.feature_label
 * Strategy: Derive human-readable label from feature_id
 *   - database_orm → "Database ORM"
 *   - api_endpoints → "API Endpoints"
 *   - documentation → "Documentation"
 *   - etc.
 *
 * Execution:
 *   node scripts/atlas/backfill-feature-label-payload.mjs [--dry-run] [--limit N]
 */

const VERBOSE = process.argv.includes('--verbose');
const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '500');

// Label mapping from feature_id
const labelMap = {
  'database_orm': 'Database ORM',
  'api_endpoints': 'API Endpoints',
  'documentation': 'Documentation',
  'configuration': 'Configuration',
  'ui_components': 'UI Components',
  'state_management': 'State Management',
  'client_libraries': 'Client Libraries',
  'server_libraries': 'Server Libraries',
  'schema': 'Schema Definition',
  'utility': 'Utility Functions',
};

function getLabelForFeatureId(fid) {
  if (!fid) return null;
  return labelMap[fid] || fid.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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
      console.log(`${DRY_RUN ? '[DRY-RUN] ' : ''}Backfilling feature_label in payload (limit: ${LIMIT} per run)...\n`);

      // Fetch missing feature_label packets
      const r = await pool.query(`
        SELECT packet_id, feature_id, payload
        FROM atlas_packets
        WHERE source_kind != 'unknown'
          AND ((payload->>'feature_label') IS NULL OR (payload->>'feature_label') = '')
          AND feature_id IS NOT NULL AND feature_id != ''
        LIMIT $1
      `, [LIMIT]);

      const toUpdate = r.rows;
      console.log(`Found ${toUpdate.length} packets to enrich (limited to ${LIMIT})\n`);

      if (toUpdate.length === 0) {
        console.log('✅ All packets have feature_label');
        await pool.end();
        return;
      }

      const updates = [];
      for (const row of toUpdate) {
        const label = getLabelForFeatureId(row.feature_id);
        if (label) {
          const newPayload = { ...(row.payload || {}), feature_label: label };
          updates.push({ packet_id: row.packet_id, feature_id: row.feature_id, label, payload: newPayload });
        }
      }

      console.log(`Will enrich ${updates.length} packets with feature_label\n`);

      if (VERBOSE) {
        console.log('Sample enrichments:');
        updates.slice(0, 5).forEach(u => {
          console.log(`  ${u.feature_id.padEnd(25)} → ${u.label}`);
        });
        console.log('');
      }

      if (DRY_RUN) {
        console.log('[DRY-RUN] Would update:');
        console.log(`  ${updates.length} packets`);
        return;
      }

      // Perform update in batch
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        for (const update of updates) {
          await client.query(
            'UPDATE atlas_packets SET payload = $1 WHERE packet_id = $2',
            [JSON.stringify(update.payload), update.packet_id]
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

    } finally {
      await pool.end();
    }
  } catch (err) {
    console.error('❌ Backfill failed:', err.message);
    process.exit(1);
  }
}

backfill();
