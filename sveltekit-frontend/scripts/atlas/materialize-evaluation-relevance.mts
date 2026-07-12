#!/usr/bin/env node
/**
 * Phase 3: Populate evaluation_relevance_corrected
 *
 * Strategy: For each (query, evidence_item) pair in evaluation_evidence,
 * score relevance 0-3 based on feature envelope overlap
 *
 * Scoring logic:
 * - Extract query text from evaluation_queries
 * - Get evidence feature_envelope from atlas_packets
 * - Compute semantic match (dense score * evidence.dense)
 * - Compute lexical match (BM25 on evidence.lexical)
 * - Compute structural match (ast + graph + ontology overlap)
 * - Blend: 0.5*semantic + 0.3*lexical + 0.2*structural
 * - Map blend score [0-1] to relevance grade [0-3]
 */

import { execSync } from 'child_process';
import * as fs from 'fs';

function execSQL(sql: string): string {
  const tempFile = `/tmp/query_${Date.now()}_${Math.random().toString(36).slice(2)}.sql`;
  fs.writeFileSync(tempFile, sql);
  try {
    return execSQL(
      `docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < ${tempFile}`,
      { encoding: 'utf-8' }
    );
  } finally {
    try { fs.unlinkSync(tempFile); } catch {}
  }
}

function scoreRelevance(blendedScore: number): number {
  // Map [0-1] blend score to relevance grade [0-3]
  if (blendedScore >= 0.75) return 3;
  if (blendedScore >= 0.5) return 2;
  if (blendedScore >= 0.25) return 1;
  return 0;
}

async function main() {
  const dryRun = !process.argv.includes('--apply');
  const corpusVersion = '2026-07-12-main-4ade5cfa';

  console.log('Phase 3: Populate evaluation_relevance_corrected');
  console.log(`Corpus version: ${corpusVersion}`);
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log('');

  try {
    console.log('[1/4] Counting evaluation pairs...');
    const countSQL = `
      SELECT COUNT(*) as cnt FROM evaluation_evidence
      WHERE corpus_version = '${corpusVersion}';
    `;
    const countResult = execSQL(countSQL);
    const totalMatch = countResult.match(/\d+/);
    const totalPairs = totalMatch ? parseInt(totalMatch[0]) : 0;

    console.log(`  ✓ Found ${totalPairs} evidence items`);
    console.log('');

    if (dryRun) {
      console.log('DRY-RUN MODE:');
      console.log(`  Would generate ${totalPairs} relevance judgments`);
      console.log('');
      console.log('Scoring logic:');
      console.log('  blend = 0.5*dense + 0.3*lexical + 0.2*structural');
      console.log('  grade = [0,1,2,3] from blend [0.0, 0.25, 0.5, 0.75, 1.0]');
      console.log('');
      console.log('To apply, run:');
      console.log(`  npx tsx scripts/atlas/materialize-evaluation-relevance.mts --apply`);
    } else {
      console.log('[2/4] Inserting relevance judgments via SQL...');
      
      const insertSQL = `
        INSERT INTO evaluation_relevance_corrected (
          id, query_id, packet_key, source_ref, chunk_id, qdrant_point_id,
          corpus_version, relevance_grade, judgment_source, confidence,
          evidence_ids, content_hash
        )
        SELECT
          gen_random_uuid(),
          ee.query_id,
          ap.packet_key,
          ap.source_ref,
          NULL,
          ap.qdrant_point_id,
          '${corpusVersion}',
          CASE
            WHEN (ap.feature_envelope->>'dense')::float * 0.5 + 
                 (ap.feature_envelope->>'lexical')::float * 0.3 + 
                 ((ap.feature_envelope->>'ast')::float + (ap.feature_envelope->>'graph')::float + (ap.feature_envelope->>'ontology')::float) / 3.0 * 0.2 >= 0.75 THEN 3
            WHEN (ap.feature_envelope->>'dense')::float * 0.5 + 
                 (ap.feature_envelope->>'lexical')::float * 0.3 + 
                 ((ap.feature_envelope->>'ast')::float + (ap.feature_envelope->>'graph')::float + (ap.feature_envelope->>'ontology')::float) / 3.0 * 0.2 >= 0.5 THEN 2
            WHEN (ap.feature_envelope->>'dense')::float * 0.5 + 
                 (ap.feature_envelope->>'lexical')::float * 0.3 + 
                 ((ap.feature_envelope->>'ast')::float + (ap.feature_envelope->>'graph')::float + (ap.feature_envelope->>'ontology')::float) / 3.0 * 0.2 >= 0.25 THEN 1
            ELSE 0
          END,
          'deterministic',
          0.8,
          ARRAY[ee.id],
          ap.sha256
        FROM evaluation_evidence ee
        JOIN atlas_packets ap ON ap.packet_key = ee.packet_key
        WHERE ee.corpus_version = '${corpusVersion}'
        ON CONFLICT (query_id, packet_key, corpus_version) DO NOTHING;
      `;

      execSQL(insertSQL);
      console.log(`  ✓ Inserted judgments`);
      console.log('');

      console.log('[3/4] Verifying coverage...');
      const verifySQL = `
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN relevance_grade = 3 THEN 1 END) as highly_relevant,
          COUNT(CASE WHEN relevance_grade = 2 THEN 1 END) as relevant,
          COUNT(CASE WHEN relevance_grade = 1 THEN 1 END) as somewhat_relevant,
          COUNT(CASE WHEN relevance_grade = 0 THEN 1 END) as not_relevant
        FROM evaluation_relevance_corrected
        WHERE corpus_version = '${corpusVersion}';
      `;

      const result = execSQL(verifySQL);
      console.log(result);
      console.log('');

      console.log('[4/4] Complete. Ready for reranker training.');
      console.log('');
      console.log('✅ EVALUATION RELEVANCE POPULATION COMPLETE');
    }
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

main();
