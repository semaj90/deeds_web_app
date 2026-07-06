#!/usr/bin/env node

/**
 * Validate Canonical Completeness Audit
 *
 * Real-time coverage report for all canonical packet dimensions:
 * - feature_id, domain_class, title_id (identity)
 * - tree_node_id, concept_ids, som_cluster (enrichment)
 * - community_id, page_rank_score (topology)
 *
 * Usage:
 *   npm run atlas:validate:completeness
 *   npm run atlas:validate:completeness:watch
 */

import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const { Pool } = pg;

const args = process.argv.slice(2);
const isWatch = args.includes('--watch');
const env = loadRepoEnv();
const DATABASE_URL = resolveDatabaseUrl(env);

const pool = new Pool({ connectionString: DATABASE_URL });

async function auditCompleteness() {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN feature_id IS NOT NULL THEN 1 END) as feature_id,
        COUNT(CASE WHEN domain_class IS NOT NULL THEN 1 END) as domain_class,
        COUNT(CASE WHEN title_id IS NOT NULL THEN 1 END) as title_id,
        COUNT(CASE WHEN tree_node_id IS NOT NULL THEN 1 END) as tree_node_id,
        COUNT(CASE WHEN concept_ids IS NOT NULL AND jsonb_array_length(concept_ids) > 0 THEN 1 END) as concept_ids,
        COUNT(CASE WHEN som_cluster IS NOT NULL THEN 1 END) as som_cluster,
        COUNT(CASE WHEN community_id IS NOT NULL THEN 1 END) as community_id,
        COUNT(CASE WHEN page_rank_score IS NOT NULL THEN 1 END) as page_rank_score
      FROM atlas_packets
    `);

    const row = result.rows[0];
    const total = parseInt(row.total);

    console.clear();
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║  Canonical Packet Completeness Audit — LIVE                    ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    console.log(`Timestamp: ${new Date().toISOString()}\n`);

    // Identity Layer (REQUIRED)
    console.log('✅ IDENTITY LAYER (REQUIRED FOR ALL)\n');
    const showDim = (name, count) => {
      const pct = ((count / total) * 100).toFixed(2);
      const bar = '█'.repeat(Math.floor(pct / 2)) + '░'.repeat(50 - Math.floor(pct / 2));
      const status = pct >= 99.5 ? '✅' : pct >= 90 ? '🟡' : '❌';
      console.log(`  ${status} ${name.padEnd(20)} ${count.toString().padStart(6)} / ${total}  [${bar}] ${pct}%`);
    };

    showDim('feature_id', parseInt(row.feature_id));
    showDim('domain_class', parseInt(row.domain_class));
    showDim('title_id', parseInt(row.title_id));

    // Enrichment Layer (PARTIAL, BACKFILL IN PROGRESS)
    console.log('\n⏳ ENRICHMENT LAYER (BACKFILL IN PROGRESS)\n');
    showDim('tree_node_id', parseInt(row.tree_node_id));
    showDim('concept_ids', parseInt(row.concept_ids));
    showDim('som_cluster', parseInt(row.som_cluster));

    // Topology Layer (GDS SUITE)
    console.log('\n🧪 TOPOLOGY LAYER (GDS SUITE)\n');
    showDim('community_id', parseInt(row.community_id));
    showDim('page_rank_score', parseInt(row.page_rank_score));

    // Completion Summary
    console.log('\n📊 COMPLETION STATUS\n');
    const identity = [parseInt(row.feature_id), parseInt(row.domain_class), parseInt(row.title_id)];
    const identityComplete = identity.every(c => c === total);
    const enrichment = [parseInt(row.tree_node_id), parseInt(row.concept_ids), parseInt(row.som_cluster)];
    const enrichmentAvg = Math.floor((enrichment.reduce((a, b) => a + b, 0) / enrichment.length / total) * 100);
    const topology = [parseInt(row.community_id), parseInt(row.page_rank_score)];
    const topologyAvg = Math.floor((topology.reduce((a, b) => a + b, 0) / topology.length / total) * 100);

    console.log(`  Identity:   ${identityComplete ? '✅ 100% COMPLETE' : '❌ INCOMPLETE'}`);
    console.log(`  Enrichment: ⏳ ${enrichmentAvg}% complete (target: 95%+)`);
    console.log(`  Topology:   ❌ ${topologyAvg}% complete (blocked on GDS)`);

    // Phase Recommendations
    console.log('\n🎯 NEXT PHASES\n');
    if (parseInt(row.tree_node_id) < total * 0.95) {
      const gap = total - parseInt(row.tree_node_id);
      console.log(`  Phase 1: Backfill tree_node_id (${gap} packets remaining)`);
    }
    if (parseInt(row.concept_ids) < total * 0.70) {
      const gap = total - parseInt(row.concept_ids);
      console.log(`  Phase 2: Extract concept_ids via LangExtract (${gap} packets remaining)`);
    }
    if (parseInt(row.som_cluster) < total * 0.99) {
      const gap = total - parseInt(row.som_cluster);
      console.log(`  Phase 3: Train SOM 20x20 (${gap} packets without trained coords)`);
    }
    if (parseInt(row.community_id) === 0) {
      console.log(`  Phase 4: Run Louvain community detection on Neo4j (0% complete)`);
    }

    console.log('\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
  }

  if (!isWatch) {
    await pool.end();
    process.exit(0);
  }
}

if (isWatch) {
  console.log('🔍 Watch mode enabled (updates every 10 seconds). Press Ctrl+C to exit.\n');
  setInterval(auditCompleteness, 10000);
} else {
  auditCompleteness();
}
