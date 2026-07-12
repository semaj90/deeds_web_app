#!/usr/bin/env node
/**
 * Phase 3: Materialize Feature Envelopes (Simplified)
 * Uses direct SQL UPDATE with computed envelopes
 */

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

  console.log('Phase 3: Materialize Feature Envelopes (Direct SQL)');
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log('');

  try {
    if (dryRun) {
      console.log('DRY-RUN MODE:');
      console.log('Will execute SQL UPDATE with computed feature_envelope JSON');
      console.log('');
      console.log('Update logic:');
      console.log('  dense: 0.8 if embedding exists, else 0.5');
      console.log('  lexical: scaled from concept_ids array length');
      console.log('  ast: 0.85 if ast_symbols in payload, else 0.5');
      console.log('  graph: 0.75 if community_id exists, else 0.5');
      console.log('  pagerank: from topology.pagerank_score, else 0.5');
      console.log('  ontology: 0.7 if >3 concepts, 0.5 if >0, else 0.3');
      console.log('  telemetry: scaled from metadata.access_count');
      console.log('  reranker: null (populated later)');
      console.log('  recommendation: null (populated later)');
      console.log('');
      console.log('To apply, run:');
      console.log('  npx tsx scripts/atlas/materialize-feature-envelopes-simple.mts --apply');
    } else {
      console.log('[1/3] Materializing feature envelopes via SQL...');
      
      const updateSQL = `
        UPDATE atlas_packets
        SET feature_envelope = jsonb_build_object(
          'dense', CASE WHEN embedding IS NOT NULL THEN 0.8 ELSE 0.5 END,
          'lexical', CASE WHEN array_length(concept_ids, 1) > 0 THEN LEAST(1.0, array_length(concept_ids, 1)::float / 10.0) ELSE 0.5 END,
          'ast', CASE WHEN payload->>'ast_symbols' IS NOT NULL THEN 0.85 ELSE 0.5 END,
          'graph', CASE WHEN community_id IS NOT NULL THEN 0.75 ELSE 0.5 END,
          'pagerank', CASE WHEN (topology->>'pagerank_score')::float IS NOT NULL THEN (topology->>'pagerank_score')::float ELSE 0.5 END,
          'ontology', CASE WHEN array_length(concept_ids, 1) > 3 THEN 0.7 WHEN array_length(concept_ids, 1) > 0 THEN 0.5 ELSE 0.3 END,
          'telemetry', CASE WHEN (metadata->>'access_count')::float IS NOT NULL THEN LEAST(1.0, (metadata->>'access_count')::float / 100.0) ELSE 0.5 END,
          'reranker', NULL,
          'recommendation', NULL
        )
        WHERE feature_envelope IS NULL;
      `;

      execSQL(updateSQL);
      console.log('  ✓ Feature envelopes materialized');
      console.log('');

      console.log('[2/3] Verifying coverage...');
      const verifySQL = `
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN feature_envelope IS NOT NULL THEN 1 END) as with_envelope,
          ROUND(100.0 * COUNT(CASE WHEN feature_envelope IS NOT NULL THEN 1 END) / NULLIF(COUNT(*), 0), 2) as coverage_pct
        FROM atlas_packets;
      `;

      const result = execSQL(verifySQL);
      console.log(result);
      console.log('');

      console.log('[3/3] Sample envelope:');
      const sampleSQL = `SELECT feature_envelope FROM atlas_packets WHERE feature_envelope IS NOT NULL LIMIT 1;`;
      const sample = execSQL(sampleSQL);
      console.log(sample);
      console.log('');

      console.log('✅ FEATURE ENVELOPE MATERIALIZATION COMPLETE');
      console.log('');
      console.log('Next: Generate evaluation relevance judgments');
    }
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

main();
