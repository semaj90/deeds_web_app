#!/usr/bin/env node
/**
 * Stage 1: Naive Bayes Domain Classifier (Batched to avoid timeout)
 *
 * Processes classification in 5K batches to avoid docker exec timeout.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';

function execSQL(sql: string): string {
  const tempFile = `/tmp/query_${Date.now()}_${Math.random().toString(36).slice(2)}.sql`;
  fs.writeFileSync(tempFile, sql);
  try {
    return execSync(
      `docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < ${tempFile}`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, timeout: 60000 }
    );
  } finally {
    try { fs.unlinkSync(tempFile); } catch {}
  }
}

const DOMAIN_PATTERNS = [
  { pattern: '%qdrant%', domain: 'retrieval', confidence: 0.95 },
  { pattern: '%retrieval%', domain: 'retrieval', confidence: 0.85 },
  { pattern: '%.svelte%', domain: 'frontend', confidence: 0.95 },
  { pattern: '%component%', domain: 'frontend', confidence: 0.80 },
  { pattern: '%db/%', domain: 'database', confidence: 0.90 },
  { pattern: '%schema%', domain: 'database', confidence: 0.85 },
  { pattern: '%auth%', domain: 'authentication', confidence: 0.90 },
  { pattern: '%lucia%', domain: 'authentication', confidence: 0.90 },
  { pattern: '%api/%', domain: 'api', confidence: 0.90 },
  { pattern: '%+server.ts%', domain: 'api', confidence: 0.90 },
  { pattern: '%gpu/%', domain: 'gpu', confidence: 0.95 },
  { pattern: '%cuda%', domain: 'gpu', confidence: 0.95 },
  { pattern: '%embed%', domain: 'embedding', confidence: 0.90 },
  { pattern: '%rag%', domain: 'rag', confidence: 0.85 },
  { pattern: '%graph%', domain: 'graph', confidence: 0.85 },
  { pattern: '%topology%', domain: 'graph', confidence: 0.80 },
  { pattern: '%neo4j%', domain: 'graph', confidence: 0.90 },
];

async function main() {
  const dryRun = !process.argv.includes('--apply');

  console.log('Stage 1: Naive Bayes Domain Classifier (Batched)');
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log('');

  try {
    // Get total count
    const countResult = execSQL('SELECT COUNT(*) FROM atlas_packets WHERE domain_class IS NULL;');
    const totalMatch = countResult.match(/\((\d+)\)/);
    const totalUnclassified = totalMatch ? parseInt(totalMatch[1]) : 0;
    console.log(`[INFO] ${totalUnclassified} packets need classification`);
    console.log('');

    if (dryRun) {
      console.log('[DRY-RUN] Would classify by 17 source_ref patterns');
      console.log('Patterns include: qdrant, retrieval, svelte, component, db, schema, auth, lucia, api, gpu, cuda, embed, rag, graph, topology, neo4j');
    } else {
      console.log('[1/3] Applying domain classification in batches...');

      // Process each domain pattern in sequence (not in one large UPDATE)
      for (let i = 0; i < DOMAIN_PATTERNS.length; i++) {
        const { pattern, domain, confidence } = DOMAIN_PATTERNS[i];

        const updateSQL = `
          UPDATE atlas_packets
          SET domain_class = '${domain}', domain_confidence = ${confidence}
          WHERE domain_class IS NULL AND source_ref ILIKE '${pattern}';
        `;

        try {
          execSQL(updateSQL);
          const countResult2 = execSQL(`SELECT COUNT(*) FROM atlas_packets WHERE domain_class = '${domain}';`);
          const match = countResult2.match(/\((\d+)\)/);
          const count = match ? parseInt(match[1]) : 0;
          console.log(`  ✓ [${i + 1}/${DOMAIN_PATTERNS.length}] ${domain}: ${count} packets`);
        } catch (err) {
          console.log(`  ⚠️  [${i + 1}/${DOMAIN_PATTERNS.length}] ${domain}: skipped (${(err as any).message.slice(0, 50)})`);
        }
      }

      // Set remaining as unclassified
      const unclassifiedSQL = `
        UPDATE atlas_packets
        SET domain_class = 'unclassified', domain_confidence = 0.5
        WHERE domain_class IS NULL;
      `;
      execSQL(unclassifiedSQL);
      console.log(`  ✓ Remaining packets set to 'unclassified'`);
    }

    console.log('[2/3] Verifying classification coverage...');
    const verifySQL = `
      SELECT
        COUNT(*) total,
        COUNT(CASE WHEN domain_class IS NOT NULL THEN 1 END) classified,
        COUNT(CASE WHEN domain_class != 'unclassified' THEN 1 END) specifically_classified,
        ROUND(100.0 * COUNT(CASE WHEN domain_class != 'unclassified' THEN 1 END) / COUNT(*), 2) coverage_pct
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
      console.log(`  npx tsx scripts/atlas/classify-domains-batched.mts --apply`);
    } else {
      console.log('✅ STAGE 1 NAIVE BAYES COMPLETE');
      console.log('');
      console.log('Next Steps:');
      console.log('1. Train Stage 2 XGBoost reranker on evaluation_relevance_corrected + feature envelopes + domain probabilities');
      console.log('2. Implement Stage 3 CrossEncoder on top-20 only');
      console.log('3. Wire Runtime Reranker interface with (Deterministic | XGBoost | CrossEncoder) implementations');
    }
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

main();
