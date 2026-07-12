#!/usr/bin/env node
/**
 * Phase 2D Simplified: Backfill atlas_feature_envelopes with AST + Lexical data
 * Writes to existing schema columns: lexical_terms, tree_node_id, topology
 */

import pg from 'pg';
const { Pool } = pg;

const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry');
const limit = parseInt(
  process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] ?? '100'
);

const pool = new Pool({
  host: '127.0.0.1',
  port: 5434,
  database: 'legal_ai_db',
  user: 'legal_admin',
  password: 'legal_admin_password',
});

async function backfill() {
  const client = await pool.connect();
  try {
    console.log('\n📦 Phase 2D Simplified: Envelope Backfill\n');

    // Query packets with P2A + P2C data
    console.log(`📊 Querying packets with AST + lexical (limit: ${limit})...`);

    const queryResult = await client.query(`
      SELECT
        ap.packet_key,
        apf.ast_symbols,
        apf.tree_node_ids,
        apf.lexical_features,
        apf.imports,
        apf.exports,
        ap.feature_label,
        ap.community_id
      FROM atlas_packets ap
      LEFT JOIN atlas_packet_features apf ON ap.packet_key = apf.packet_key
      WHERE ap.packet_key IS NOT NULL
        AND (apf.ast_symbols IS NOT NULL OR apf.lexical_features IS NOT NULL)
      ORDER BY ap.packet_key
      LIMIT $1
    `, [limit]);

    const packets = queryResult.rows;
    console.log(`  ✓ Found ${packets.length} packets\n`);

    if (packets.length === 0) {
      console.log('No packets to process.\n');
      process.exit(0);
    }

    // Prepare updates
    const updates = packets.map(p => ({
      packet_key: p.packet_key,
      tree_node_id: p.tree_node_ids ? Object.values(p.tree_node_ids)[0] : null,
      lexical_terms: JSON.stringify({
        features: p.lexical_features || [],
        imports: p.imports || [],
        exports: p.exports || []
      }),
      topology: JSON.stringify({
        ast_count: p.ast_symbols?.length || 0,
        lexical_count: p.lexical_features?.length || 0,
        has_imports: (p.imports?.length || 0) > 0,
        has_exports: (p.exports?.length || 0) > 0
      })
    }));

    console.log('🔨 Building updates...');
    console.log(`  - tree_node_id: ${updates.filter(u => u.tree_node_id).length}/${updates.length}`);
    console.log(`  - lexical_terms: ${updates.filter(u => u.lexical_terms).length}/${updates.length}`);
    console.log(`  - topology: ${updates.filter(u => u.topology).length}/${updates.length}\n`);

    if (isDryRun) {
      console.log('📝 [DRY-RUN] Would update:');
      console.log(`  Sample 1: ${JSON.stringify(updates[0], null, 2)}\n`);
      console.log('✨ DRY-RUN COMPLETE\n');
      process.exit(0);
    }

    // Apply updates
    console.log('📝 Writing updates to atlas_feature_envelopes...\n');

    let updated = 0;
    const batchSize = 100;

    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, Math.min(i + batchSize, updates.length));

      for (const update of batch) {
        await client.query(`
          UPDATE atlas_feature_envelopes
          SET
            tree_node_id = $2,
            lexical_terms = $3::jsonb,
            topology = $4::jsonb,
            updated_at = NOW()
          WHERE packet_key = $1
        `, [update.packet_key, update.tree_node_id, update.lexical_terms, update.topology]);
        updated++;
      }

      const progress = Math.min(i + batchSize, updates.length);
      if (progress % 100 === 0) {
        console.log(`  ✓ Updated ${progress}/${updates.length} rows...`);
      }
    }

    console.log(`  ✓ Total updated: ${updated} rows\n`);

    // Verify
    console.log('📊 Verification:\n');
    const verifyResult = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN tree_node_id IS NOT NULL THEN 1 END) as with_tree_node_id,
        COUNT(CASE WHEN lexical_terms IS NOT NULL AND lexical_terms != '{}'::jsonb THEN 1 END) as with_lexical_terms
      FROM atlas_feature_envelopes
      WHERE packet_key IN (${packets.map((_, i) => `$${i+1}`).join(',')})
    `, packets.map(p => p.packet_key));

    const ver = verifyResult.rows[0];
    console.log(`  Total in batch: ${ver.total}`);
    console.log(`  With tree_node_id: ${ver.with_tree_node_id}`);
    console.log(`  With lexical_terms: ${ver.with_lexical_terms}\n`);

    console.log('✨ Phase 2D Backfill COMPLETE!\n');

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

backfill();
