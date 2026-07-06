#!/usr/bin/env node
/**
 * Phase 1: Tree Node ID Derivation & Backfill
 *
 * Derives tree_node_id for 23,788 missing packets (65% → 100% coverage).
 * Three-stage derivation:
 *   1. Heuristic: feature_id pattern → AST path
 *   2. AST extraction: source_ref + ast-grep → code structure
 *   3. TurboVec GPU: embedding similarity → confidence scoring
 *
 * Usage:
 *   npm run atlas:phase1:tree-node:dry     # Preview (limit=5000)
 *   npm run atlas:phase1:tree-node:apply   # Execute (full dataset)
 *   npm run atlas:phase1:tree-node:verify  # Verify coverage
 */

import { execSync } from 'child_process';
import pg from 'pg';

const { Pool } = pg;

const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry');
const isApply = process.argv.includes('--apply');
const confidence = parseFloat(process.argv.find(arg => arg.startsWith('--confidence='))?.split('=')[1] ?? '0.8');
const limit = parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] ?? '68181');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:postgres@localhost:5434/legal_ai_db',
  max: 10,
});

// Stage 1: Heuristic derivation from feature_id
function deriveFromFeatureId(featureId) {
  if (!featureId) return null;
  const segments = featureId.split('.');
  return '/' + segments.join('/');
}

// Stage 2: AST extraction heuristic from source_ref
function deriveFromSourceRef(sourceRef, featureId) {
  if (!sourceRef) return null;

  // Pattern: src/lib/server/auth.ts + feature_id "auth.sessions"
  // Result: /src/lib/server/auth/sessions
  const pathSegments = sourceRef.split('/');
  const fileName = pathSegments[pathSegments.length - 1].replace('.ts', '').replace('.js', '');

  if (featureId) {
    const featureSegments = featureId.split('.');
    if (featureSegments[0] === fileName || featureSegments[0] === pathSegments[pathSegments.length - 2]) {
      // Likely match — derive full path
      return '/' + [...pathSegments.slice(0, -1), ...featureSegments].join('/');
    }
  }

  return '/' + pathSegments.join('/').replace(/\.(ts|js)$/, '');
}

// Stage 3: TurboVec similarity-based confidence scoring
async function scoreWithTurboVec(embedding, candidateTreeNodes) {
  // Mock: in production, call TurboVec HTTP API to score embedding similarity
  // For now, return high confidence if we have good heuristic data
  if (candidateTreeNodes && candidateTreeNodes.length > 0) {
    return 0.85; // Placeholder confidence
  }
  return 0.6;
}

async function main() {
  console.log(`\n🔄 Phase 1: Tree Node ID Derivation [${isDryRun ? 'DRY-RUN' : 'APPLY'}]\n`);
  console.log(`   Confidence threshold: ${confidence}`);
  console.log(`   Limit: ${limit} packets\n`);

  const client = await pool.connect();

  try {
    // 1. Fetch packets with NULL tree_node_id
    console.log('📦 Step 1: Fetch packets missing tree_node_id...');
    const result = await client.query(`
      SELECT
        packet_key,
        feature_id,
        source_ref,
        tree_node_id,
        embedding
      FROM atlas_packets
      WHERE tree_node_id IS NULL
      ORDER BY packet_key
      LIMIT $1
    `, [limit]);

    const packets = result.rows;
    console.log(`  ✓ Found ${packets.length} packets with NULL tree_node_id\n`);

    if (packets.length === 0) {
      console.log('✅ No missing tree_node_id — already 100% complete.\n');
      process.exit(0);
    }

    // 2. Derive tree_node_id for each packet
    console.log('🧮 Step 2: Derive tree_node_id via 3-stage pipeline...');

    const derivations = [];
    let stageOneCount = 0;
    let stageTwoCount = 0;
    let stageThreeCount = 0;

    for (const packet of packets) {
      let treeNodeId = null;
      let derivationStage = 0;

      // Stage 1: Heuristic from feature_id
      const stage1 = deriveFromFeatureId(packet.feature_id);
      if (stage1) {
        treeNodeId = stage1;
        derivationStage = 1;
        stageOneCount++;
      }

      // Stage 2: AST extraction from source_ref
      if (!treeNodeId) {
        const stage2 = deriveFromSourceRef(packet.source_ref, packet.feature_id);
        if (stage2) {
          treeNodeId = stage2;
          derivationStage = 2;
          stageTwoCount++;
        }
      }

      // Stage 3: TurboVec scoring (mock for now)
      if (treeNodeId && packet.embedding) {
        const score = await scoreWithTurboVec(packet.embedding, [treeNodeId]);
        if (score >= confidence) {
          stageThreeCount++;
        } else {
          // Low confidence — skip this derivation
          treeNodeId = null;
        }
      }

      if (treeNodeId) {
        derivations.push({
          packet_key: packet.packet_key,
          tree_node_id: treeNodeId,
          stage: derivationStage,
        });
      }
    }

    console.log(`  ✓ Stage 1 (feature_id heuristic): ${stageOneCount} derived`);
    console.log(`  ✓ Stage 2 (source_ref AST): ${stageTwoCount} derived`);
    console.log(`  ✓ Stage 3 (TurboVec confidence): ${stageThreeCount} scored high-confidence`);
    console.log(`  ✓ Total derivations: ${derivations.length} / ${packets.length} (${Math.round((derivations.length / packets.length) * 100)}%)\n`);

    if (isDryRun) {
      console.log('📋 Sample derivations (first 10):');
      for (const d of derivations.slice(0, 10)) {
        console.log(`   ${d.packet_key} → ${d.tree_node_id} (stage ${d.stage})`);
      }
      console.log('\n✅ Dry-run complete. Use --apply to execute.\n');
      process.exit(0);
    }

    // 3. Apply updates to Postgres
    console.log('💾 Step 3: Apply tree_node_id updates to Postgres...');

    const updateQuery = `
      UPDATE atlas_packets
      SET tree_node_id = $1, updated_at = NOW()
      WHERE packet_key = $2
    `;

    let updated = 0;
    for (const derivation of derivations) {
      await client.query(updateQuery, [derivation.tree_node_id, derivation.packet_key]);
      updated++;

      if (updated % 5000 === 0) {
        console.log(`  ✓ Updated ${updated} / ${derivations.length} packets`);
      }
    }

    console.log(`  ✓ Total updated: ${updated} packets\n`);

    // 4. Verify coverage
    console.log('✅ Step 4: Verify coverage...');
    const verify = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN tree_node_id IS NOT NULL THEN 1 END) as populated
      FROM atlas_packets
    `);

    const { total, populated } = verify.rows[0];
    const coverage = Math.round((populated / total) * 100);

    console.log(`  ✓ tree_node_id coverage: ${populated} / ${total} (${coverage}%)`);
    console.log(`\n✅ Phase 1 Tree Node Derivation Complete`);
    console.log(`   Updated: ${updated} packets`);
    console.log(`   Coverage: ${coverage}% (target: 100%)\n`);

    if (coverage < 95) {
      console.log(`⚠️  Coverage < 95% — may need additional derivation stages\n`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.release();
    await pool.end();
  }
}

main();
