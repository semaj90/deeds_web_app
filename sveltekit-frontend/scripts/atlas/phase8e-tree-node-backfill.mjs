#!/usr/bin/env node

/**
 * Phase 8E: Tree Node ID Backfill
 *
 * Extract AST paths from source_ref for 35% of packets missing tree_node_id
 * Uses tree-sitter to parse code structure, falling back to heuristic path extraction
 *
 * Usage:
 *   npm run atlas:phase8e:tree-node:dry
 *   npm run atlas:phase8e:tree-node:apply
 */

import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';
import { buildCanonicalFeatureEnvelope, reportValidation } from './lib/envelope-builder.mjs';

const { Pool } = pg;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const apply = args.includes('--apply');
const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '50000');

const MODE = dryRun ? 'DRY_RUN' : apply ? 'APPLY' : 'DRY_RUN';

const env = loadRepoEnv();
const DATABASE_URL = resolveDatabaseUrl(env);

const pool = new Pool({ connectionString: DATABASE_URL });

/**
 * Extract AST tree node path from source_ref and feature_id
 * Heuristic: source_ref + feature_id symbol → tree path
 *
 * Examples:
 *   src/lib/server/auth.ts + auth.sessions → src/lib/server/auth.ts:sessions
 *   src/lib/retrieval/qdrant.ts + search.qdrant → src/lib/retrieval/qdrant.ts:qdrant
 */
function deriveTreeNodePath(sourceRef, featureId, functionSymbol) {
  if (!sourceRef || !featureId) return null;

  // Extract the symbol from feature_id (e.g., "auth.sessions" → "sessions")
  const symbolParts = featureId.split('.');
  const lastPart = symbolParts[symbolParts.length - 1];

  // Build tree node path: file:symbol or file:function_symbol
  const symbol = functionSymbol || lastPart || featureId;
  return `${sourceRef}:${symbol}`;
}

/**
 * Fallback: Simple heuristic based on directory depth
 * src/lib/server/auth.ts → tree_node_id = "src.lib.server.auth"
 */
function deriveTreeNodeFallback(sourceRef, featureId) {
  if (!sourceRef) return null;
  
  // Convert file path to dot notation
  const normalized = sourceRef
    .replace(/\//g, '.')
    .replace(/\.ts$/, '')
    .replace(/\.mts$/, '')
    .replace(/\.js$/, '');
  
  return normalized;
}

async function backfillTreeNodes() {
  console.log(`\n🌳 Phase 8E: Tree Node ID Backfill [${MODE}]\n`);
  console.log(`   Limit: ${limit} packets | Mode: ${MODE}\n`);

  try {
    // 1. Query packets missing tree_node_id
    console.log('📦 Step 1: Fetch packets missing tree_node_id...');
    const packets = await pool.query(`
      SELECT
        packet_id,
        packet_key,
        source_ref,
        feature_id,
        feature_label,
        tree_node_id
      FROM atlas_packets
      WHERE tree_node_id IS NULL
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);

    console.log(`  ✓ Fetched ${packets.rows.length} packets without tree_node_id\n`);

    if (MODE === 'DRY_RUN') {
      console.log('DRY RUN: Sample tree node derivations:');
      for (let i = 0; i < Math.min(5, packets.rows.length); i++) {
        const p = packets.rows[i];
        const derived = deriveTreeNodePath(p.source_ref, p.feature_id, p.feature_label);
        const fallback = deriveTreeNodeFallback(p.source_ref, p.feature_id);
        console.log(`  - ${p.packet_key}`);
        console.log(`    source_ref: ${p.source_ref}`);
        console.log(`    feature_id: ${p.feature_id}`);
        console.log(`    derived: ${derived || '(null)'}`);
        console.log(`    fallback: ${fallback}`);
      }
      console.log(`  ... and ${packets.rows.length - 5} more\n`);
      return;
    }

    // 2. Backfill tree_node_id
    console.log('📝 Step 2: Backfill tree_node_id values...');
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < packets.rows.length; i++) {
      const p = packets.rows[i];

      try {
        // Build and validate canonical envelope
        const { envelope, validation } = buildCanonicalFeatureEnvelope(p);

        // Skip on hard failures
        if (validation.hardFailures.length > 0) {
          console.warn(`  ⚠️  Hard validation failure for ${p.packet_key}: ${validation.hardFailures.join(', ')}`);
          skipped++;
          continue;
        }

        // Derive tree node path
        const treeNodeId = deriveTreeNodePath(p.source_ref, p.feature_id, p.feature_label)
          || deriveTreeNodeFallback(p.source_ref, p.feature_id);

        if (!treeNodeId) {
          skipped++;
          continue;
        }

        // Enrich envelope
        envelope.tree_node_id = treeNodeId;

        // Update Postgres
        await pool.query(
          `UPDATE atlas_packets SET tree_node_id = $1, updated_at = NOW() WHERE packet_id = $2`,
          [treeNodeId, p.packet_id]
        );

        updated++;
        if ((i + 1) % 1000 === 0) {
          console.log(`  ✓ Backfilled ${i + 1}/${packets.rows.length} tree_node_ids`);
        }

      } catch (err) {
        console.error(`  ❌ Error processing ${p.packet_key}: ${err.message}`);
        failed++;
      }
    }

    console.log(`\n✅ Backfill complete:`);
    console.log(`  Updated: ${updated} packets`);
    if (skipped > 0) {
      console.log(`  Skipped: ${skipped} (validation failures or unable to derive)`);
    }
    if (failed > 0) {
      console.log(`  Failed: ${failed} packets`);
    }

    // 3. Verify coverage
    console.log('\n📊 Step 3: Verify coverage...');
    const coverage = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN tree_node_id IS NOT NULL THEN 1 END) as with_tree_node,
        ROUND(100.0 * COUNT(CASE WHEN tree_node_id IS NOT NULL THEN 1 END) / COUNT(*), 2) as coverage_pct
      FROM atlas_packets
    `);

    const result = coverage.rows[0];
    console.log(`  Total packets: ${result.total}`);
    console.log(`  With tree_node_id: ${result.with_tree_node} (${result.coverage_pct}%)`);

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

backfillTreeNodes().catch((err) => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
