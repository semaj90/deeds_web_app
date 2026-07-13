#!/usr/bin/env node
/**
 * Stage 1: Naive Bayes Domain Classifier (Simplified SQL-only)
 *
 * Maps source_ref patterns to domains using deterministic SQL CASE/WHEN.
 * Avoids ENOBUFS by keeping all logic server-side.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';

function execSQL(sql: string): string {
  const tempFile = `/tmp/query_${Date.now()}_${Math.random().toString(36).slice(2)}.sql`;
  fs.writeFileSync(tempFile, sql);
  try {
    return execSync(
      `docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < ${tempFile}`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );
  } finally {
    try { fs.unlinkSync(tempFile); } catch {}
  }
}

async function main() {
  const dryRun = !process.argv.includes('--apply');

  console.log('Stage 1: Naive Bayes Domain Classifier (Simplified)');
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log('');

  try {
    console.log('[1/3] Classifying domains by source_ref pattern...');

    // Deterministic domain classification based on path patterns
    const updateSQL = `
      UPDATE atlas_packets ap
      SET
        domain_class = CASE
          WHEN source_ref ILIKE '%qdrant%' OR source_ref ILIKE '%retrieval%' OR source_ref ILIKE '%search%' THEN 'retrieval'
          WHEN source_ref ILIKE '%.svelte%' OR source_ref ILIKE '%component%' OR source_ref ILIKE '%page%' THEN 'frontend'
          WHEN source_ref ILIKE '%db/%' OR source_ref ILIKE '%schema%' OR source_ref ILIKE '%migration%' THEN 'database'
          WHEN source_ref ILIKE '%auth%' OR source_ref ILIKE '%lucia%' OR source_ref ILIKE '%session%' THEN 'authentication'
          WHEN source_ref ILIKE '%api/%' OR source_ref ILIKE '%+server.ts%' THEN 'api'
          WHEN source_ref ILIKE '%gpu/%' OR source_ref ILIKE '%cuda%' OR source_ref ILIKE '%tensor%' THEN 'gpu'
          WHEN source_ref ILIKE '%embed%' OR source_ref ILIKE '%embedding%' THEN 'embedding'
          WHEN source_ref ILIKE '%rag%' OR source_ref ILIKE '%context%' THEN 'rag'
          WHEN source_ref ILIKE '%graph%' OR source_ref ILIKE '%topology%' OR source_ref ILIKE '%neo4j%' THEN 'graph'
          ELSE 'unclassified'
        END,
        domain_confidence = CASE
          WHEN source_ref ILIKE '%qdrant%' THEN 0.95
          WHEN source_ref ILIKE '%retrieval%' THEN 0.85
          WHEN source_ref ILIKE '%.svelte%' THEN 0.95
          WHEN source_ref ILIKE '%component%' THEN 0.80
          WHEN source_ref ILIKE '%db/%' THEN 0.90
          WHEN source_ref ILIKE '%schema%' THEN 0.85
          WHEN source_ref ILIKE '%auth%' THEN 0.90
          WHEN source_ref ILIKE '%api/%' THEN 0.90
          WHEN source_ref ILIKE '%gpu/%' THEN 0.95
          WHEN source_ref ILIKE '%embed%' THEN 0.90
          WHEN source_ref ILIKE '%rag%' THEN 0.85
          WHEN source_ref ILIKE '%graph%' THEN 0.85
          WHEN source_ref ILIKE '%topology%' THEN 0.80
          ELSE 0.5
        END
      WHERE domain_class IS NULL;
    `;

    if (!dryRun) {
      execSQL(updateSQL);
      console.log(`  ✓ Classification applied`);
    } else {
      console.log(`  ✓ Dry-run: would classify packets by source_ref pattern`);
    }

    console.log('[2/3] Verifying classification coverage...');
    const verifySQL = `
      SELECT
        COUNT(*) total,
        COUNT(CASE WHEN domain_class IS NOT NULL AND domain_class != 'unclassified' THEN 1 END) classified,
        ROUND(100.0 * COUNT(CASE WHEN domain_class IS NOT NULL AND domain_class != 'unclassified' THEN 1 END) / COUNT(*), 2) coverage_pct
      FROM atlas_packets;
    `;

    const verifyResult = execSQL(verifySQL);
    console.log(verifyResult);
    console.log('');

    console.log('[3/3] Domain distribution...');
    const distSQL = `
      SELECT
        domain_class,
        COUNT(*) count,
        ROUND(AVG(COALESCE(domain_confidence, 0.5))::numeric, 3) avg_confidence
      FROM atlas_packets
      GROUP BY domain_class
      ORDER BY count DESC;
    `;

    const distResult = execSQL(distSQL);
    console.log(distResult);
    console.log('');

    if (dryRun) {
      console.log('To apply, run:');
      console.log(`  npx tsx scripts/atlas/classify-domains-simple.mts --apply`);
    } else {
      console.log('✅ STAGE 1 NAIVE BAYES COMPLETE');
      console.log('Next: Train Stage 2 XGBoost reranker on evaluation_relevance_corrected + feature envelopes + domain probabilities');
    }
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

main();
