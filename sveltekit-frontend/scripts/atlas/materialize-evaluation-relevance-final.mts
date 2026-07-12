#!/usr/bin/env node
import { execSync } from 'child_process';
import * as fs from 'fs';

function execSQL(sql: string): string {
  const tempFile = `/tmp/query_${Date.now()}_${Math.random().toString(36).slice(2)}.sql`;
  fs.writeFileSync(tempFile, sql);
  try {
    return execSync(
      `docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < ${tempFile}`,
      { encoding: 'utf-8' }
    );
  } finally {
    try { fs.unlinkSync(tempFile); } catch {}
  }
}

async function main() {
  const dryRun = !process.argv.includes('--apply');

  console.log('Phase 3: Materialize Evaluation Relevance');
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log('');

  try {
    console.log('[1/4] Counting evaluation evidence items...');
    const countSQL = `SELECT COUNT(*) FROM evaluation_evidence;`;
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
      console.log('  For each (query, evidence) pair:');
      console.log('  blend = 0.5*dense + 0.3*lexical + 0.2*structural');
      console.log('  grade = [0,1,2,3] based on blend score thresholds');
      console.log('  Populated into evaluation_relevance_corrected');
      console.log('');
      console.log('To apply, run:');
      console.log(`  npx tsx scripts/atlas/materialize-evaluation-relevance-final.mts --apply`);
    } else {
      console.log('[2/4] Generating and inserting relevance judgments...');
      
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
          '2026-07-12-main-4ade5cfa',
          CASE
            WHEN COALESCE((ap.feature_envelope->>'dense')::float, 0.5) * 0.5 + 
                 COALESCE((ap.feature_envelope->>'lexical')::float, 0.5) * 0.3 + 
                 (COALESCE((ap.feature_envelope->>'ast')::float, 0.5) + COALESCE((ap.feature_envelope->>'graph')::float, 0.5) + COALESCE((ap.feature_envelope->>'ontology')::float, 0.5)) / 3.0 * 0.2 >= 0.75 THEN 3
            WHEN COALESCE((ap.feature_envelope->>'dense')::float, 0.5) * 0.5 + 
                 COALESCE((ap.feature_envelope->>'lexical')::float, 0.5) * 0.3 + 
                 (COALESCE((ap.feature_envelope->>'ast')::float, 0.5) + COALESCE((ap.feature_envelope->>'graph')::float, 0.5) + COALESCE((ap.feature_envelope->>'ontology')::float, 0.5)) / 3.0 * 0.2 >= 0.5 THEN 2
            WHEN COALESCE((ap.feature_envelope->>'dense')::float, 0.5) * 0.5 + 
                 COALESCE((ap.feature_envelope->>'lexical')::float, 0.5) * 0.3 + 
                 (COALESCE((ap.feature_envelope->>'ast')::float, 0.5) + COALESCE((ap.feature_envelope->>'graph')::float, 0.5) + COALESCE((ap.feature_envelope->>'ontology')::float, 0.5)) / 3.0 * 0.2 >= 0.25 THEN 1
            ELSE 0
          END,
          'deterministic_feature_blend',
          0.8,
          ARRAY[ee.id],
          ap.sha256
        FROM evaluation_evidence ee
        JOIN atlas_packets ap ON ap.packet_key = ee.packet_key
        ON CONFLICT (query_id, packet_key, corpus_version) DO NOTHING;
      `;

      execSQL(insertSQL);
      console.log(`  ✓ Inserted relevance judgments`);
      console.log('');

      console.log('[3/4] Distribution of relevance grades...');
      const distSQL = `
        SELECT
          COUNT(*) total,
          COUNT(CASE WHEN relevance_grade = 3 THEN 1 END) grade_3,
          COUNT(CASE WHEN relevance_grade = 2 THEN 1 END) grade_2,
          COUNT(CASE WHEN relevance_grade = 1 THEN 1 END) grade_1,
          COUNT(CASE WHEN relevance_grade = 0 THEN 1 END) grade_0
        FROM evaluation_relevance_corrected;
      `;

      const dist = execSQL(distSQL);
      console.log(dist);
      console.log('');

      console.log('[4/4] Summary');
      console.log('✅ EVALUATION RELEVANCE POPULATION COMPLETE');
      console.log('');
      console.log('Next: Train XGBoost reranker on relevance labels');
    }
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

main();
