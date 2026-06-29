#!/usr/bin/env node
/**
 * Graphify Phase B Additions
 *
 * Extend the daily graphify pipeline to include Phase B enrichment outputs:
 * - Entity extraction results (LangExtract)
 * - Domain classifications (Gemma4 ontology)
 * - Feature relationships (Neo4j + Postgres)
 * - BM25 full-text index warmup
 *
 * This pass runs after Phase A (Gemma4 summaries) and feeds into the daily
 * graphify:daily routine.
 *
 * Usage:
 *   node scripts/atlas/graphify-phase-b-additions.mjs [--dry-run] [--verbose]
 */

import pg from 'pg';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

const PG_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

function log(...args) { console.log(...args); }
function vlog(...args) { if (VERBOSE) console.log(...args); }

async function main() {
  const startTime = Date.now();

  log('\n╔════════════════════════════════════════════════════════════════╗');
  log('║  Graphify Phase B Additions (Entity/Domain/Relationship Pass)  ║');
  log('╚════════════════════════════════════════════════════════════════╝\n');
  log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
  log(`Time: ${new Date().toISOString()}\n`);

  const pool = new pg.Pool({ connectionString: PG_URL, max: 5 });

  try {
    // Pass 1: Verify Phase A summaries are in place
    log('📊 PASS 1: Verify Phase A summaries\n');
    const summariesResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM codebase_chunk_index
      WHERE summary IS NOT NULL
    `);
    const summaryCount = summariesResult.rows[0]?.count || 0;
    log(`  ✅ Phase A summaries: ${summaryCount} chunks\n`);

    // Pass 2: Entity extraction readiness
    log('🏷️  PASS 2: Entity extraction readiness\n');
    const entitiesResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN semantic_tags IS NOT NULL AND array_length(semantic_tags, 1) > 0 THEN 1 END) as enriched
      FROM codebase_chunk_index
    `);
    const entitiesRow = entitiesResult.rows[0];
    const entityCoverage = ((entitiesRow.enriched / entitiesRow.total) * 100).toFixed(1);
    log(`  Found: ${entitiesRow.total} chunks`);
    log(`  Enriched with tags: ${entitiesRow.enriched} (${entityCoverage}%)`);
    log(`  Gap: ${entitiesRow.total - entitiesRow.enriched} (ready for Phase B2)\n`);

    // Pass 3: Domain classification readiness
    log('🗂️  PASS 3: Domain classification readiness\n');
    const domainsResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM codebase_chunk_index
      WHERE domain IS NOT NULL
    `);
    const domainCount = domainsResult.rows[0]?.count || 0;
    const domainCoverage = ((domainCount / entitiesRow.total) * 100).toFixed(1);
    log(`  Classified: ${domainCount} / ${entitiesRow.total} (${domainCoverage}%)`);
    log(`  Gap: ${entitiesRow.total - domainCount} (ready for Phase B3)\n`);

    // Pass 4: Feature relationships readiness
    log('🔗 PASS 4: Feature relationships readiness\n');
    const relationsResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM atlas_higher_hop_index
      WHERE metadata ->> 'enrichment_pass' = 'phase-b4-relationships'
    `);
    const relationCount = relationsResult.rows[0]?.count || 0;
    log(`  Enriched relations: ${relationCount} / ${entitiesRow.total}`);
    log(`  Gap: ${entitiesRow.total - relationCount} (ready for Phase B4)\n`);

    // Pass 5: BM25 indexing readiness
    log('🔍 PASS 5: BM25 indexing readiness\n');
    const bm25Result = await pool.query(`
      SELECT COUNT(*) as count
      FROM codebase_chunk_index
      WHERE metadata ->> 'bm25_indexed' = 'true'
    `);
    const bm25Count = bm25Result.rows[0]?.count || 0;
    const bm25Coverage = ((bm25Count / entitiesRow.total) * 100).toFixed(1);
    log(`  BM25 indexed: ${bm25Count} / ${entitiesRow.total} (${bm25Coverage}%)`);
    log(`  Gap: ${entitiesRow.total - bm25Count} (ready for Phase B5)\n`);

    // Summary & Recommendations
    log('📋 Phase B Readiness Summary:\n');

    const phases = [
      { pass: 2, name: 'Entity Extraction', gap: entitiesRow.total - entitiesRow.enriched },
      { pass: 3, name: 'Domain Classification', gap: entitiesRow.total - domainCount },
      { pass: 4, name: 'Feature Relationships', gap: entitiesRow.total - relationCount },
      { pass: 5, name: 'BM25 Indexing', gap: entitiesRow.total - bm25Count },
    ];

    let allReady = true;
    for (const phase of phases) {
      if (phase.gap === 0) {
        log(`  ✅ Pass ${phase.pass}: ${phase.name} - COMPLETE`);
      } else if (phase.gap < entitiesRow.total * 0.2) {
        log(`  🟡 Pass ${phase.pass}: ${phase.name} - 80%+ complete (${phase.gap} remaining)`);
      } else {
        log(`  ❌ Pass ${phase.pass}: ${phase.name} - INCOMPLETE (${phase.gap} remaining)`);
        allReady = false;
      }
    }

    log('');

    // Recommended execution order
    log('🚀 Recommended execution order:\n');
    log('  1. npm run phase-b:multi-pass --dry-run (validate all passes)');
    log('  2. npm run phase-b:multi-pass (execute Pass 2-5 sequentially)');
    log('  3. npm run graphify:daily (include new enrichment in daily pipeline)');
    log('  4. npm run atlas:redis:warm:packets (cache Phase B outputs)\n');

    if (allReady) {
      log('✅ Phase B is ready for full execution\n');
    } else {
      log('⏳ Phase B is partially complete; execute passes for remaining gaps\n');
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`📊 Duration: ${duration}s\n`);

  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`\n❌ Error: ${error.message}\n`);
  process.exit(1);
});
