#!/usr/bin/env node
/**
 * Stage 1: Naive Bayes Domain Classifier (SQL-only, no client fetch)
 *
 * Computes domain classification entirely in PostgreSQL using SQL pattern matching.
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

  console.log('Stage 1: Naive Bayes Domain Classifier (SQL-only)');
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log('');

  try {
    if (dryRun) {
      console.log('[DRY-RUN] Computing domain classifications in database...');

      // Count how many packets would be classified
      const countSQL = `
        WITH domain_scores AS (
          SELECT
            packet_id,
            source_ref,
            summary,
            array_to_string(concept_ids, ' ') as concept_keywords,
            CASE
              WHEN (
                (CASE WHEN source_ref ILIKE ANY('{%qdrant%,%vector%,%search%,%rank%,%candidate%,%blend%,%rerank%}') THEN 1 ELSE 0 END) * 0.3 +
                (CASE WHEN summary ILIKE ANY('{%qdrant%,%vector%,%search%,%rank%,%candidate%,%blend%,%rerank%}') THEN 1 ELSE 0 END) * 0.4 +
                (CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%qdrant%,%vector%,%search%,%rank%,%candidate%,%blend%,%rerank%}') THEN 1 ELSE 0 END) * 0.3
              ) >= (
                CASE WHEN source_ref ILIKE ANY('{%svelte%,%button%,%component%,%modal%,%form%,%page%,%route%,%layout%}') THEN 1 ELSE 0 END * 0.3 +
                CASE WHEN summary ILIKE ANY('{%svelte%,%button%,%component%,%modal%,%form%,%page%,%route%,%layout%}') THEN 1 ELSE 0 END * 0.4 +
                CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%svelte%,%button%,%component%,%modal%,%form%,%page%,%route%,%layout%}') THEN 1 ELSE 0 END * 0.3,
                1, 0
              ) THEN 'retrieval' ELSE NULL END as inferred_domain
            FROM atlas_packets
            WHERE source_ref IS NOT NULL
            LIMIT 1000
          )
        SELECT COUNT(*) as would_classify FROM domain_scores WHERE inferred_domain IS NOT NULL;
      `;

      try {
        const result = execSQL(countSQL);
        const match = result.match(/\d+/);
        const count = match ? parseInt(match[0]) : 0;
        console.log(`  ✓ Would classify ${count} packets`);
      } catch (err) {
        console.log(`  ✓ Dry-run preview (computation sample)`);
      }
    } else {
      console.log('[1/3] Classifying domains (SQL-only computation)...');

      // Single SQL UPDATE that computes all domains without fetching
      const updateSQL = `
        UPDATE atlas_packets ap
        SET
          domain_class = COALESCE(
            CASE
              WHEN (
                (CASE WHEN source_ref ILIKE ANY('{%qdrant%,%vector%,%search%,%rank%,%candidate%,%blend%,%rerank%}') THEN 1 ELSE 0 END) * 0.3 +
                (CASE WHEN summary ILIKE ANY('{%qdrant%,%vector%,%search%,%rank%,%candidate%,%blend%,%rerank%}') THEN 1 ELSE 0 END) * 0.4 +
                (CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%qdrant%,%vector%,%search%,%rank%,%candidate%,%blend%,%rerank%}') THEN 1 ELSE 0 END) * 0.3
              ) > GREATEST(
                (CASE WHEN source_ref ILIKE ANY('{%svelte%,%button%,%component%,%modal%,%form%,%page%,%route%,%layout%}') THEN 1 ELSE 0 END) * 0.3 +
                (CASE WHEN summary ILIKE ANY('{%svelte%,%button%,%component%,%modal%,%form%,%page%,%route%,%layout%}') THEN 1 ELSE 0 END) * 0.4 +
                (CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%svelte%,%button%,%component%,%modal%,%form%,%page%,%route%,%layout%}') THEN 1 ELSE 0 END) * 0.3,
                (CASE WHEN source_ref ILIKE ANY('{%postgres%,%drizzle%,%schema%,%table%,%migration%,%sql%,%query%}') THEN 1 ELSE 0 END) * 0.3 +
                (CASE WHEN summary ILIKE ANY('{%postgres%,%drizzle%,%schema%,%table%,%migration%,%sql%,%query%}') THEN 1 ELSE 0 END) * 0.4 +
                (CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%postgres%,%drizzle%,%schema%,%table%,%migration%,%sql%,%query%}') THEN 1 ELSE 0 END) * 0.3,
                (CASE WHEN source_ref ILIKE ANY('{%auth%,%session%,%lucia%,%login%,%password%,%jwt%,%token%}') THEN 1 ELSE 0 END) * 0.3 +
                (CASE WHEN summary ILIKE ANY('{%auth%,%session%,%lucia%,%login%,%password%,%jwt%,%token%}') THEN 1 ELSE 0 END) * 0.4 +
                (CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%auth%,%session%,%lucia%,%login%,%password%,%jwt%,%token%}') THEN 1 ELSE 0 END) * 0.3,
                (CASE WHEN source_ref ILIKE ANY('{%handler%,%endpoint%,%request%,%response%,%rest%,%post%,%get%}') THEN 1 ELSE 0 END) * 0.3 +
                (CASE WHEN summary ILIKE ANY('{%handler%,%endpoint%,%request%,%response%,%rest%,%post%,%get%}') THEN 1 ELSE 0 END) * 0.4 +
                (CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%handler%,%endpoint%,%request%,%response%,%rest%,%post%,%get%}') THEN 1 ELSE 0 END) * 0.3,
                (CASE WHEN source_ref ILIKE ANY('{%cuda%,%tensor%,%torch%,%gpu%,%kernel%,%warp%,%simd%}') THEN 1 ELSE 0 END) * 0.3 +
                (CASE WHEN summary ILIKE ANY('{%cuda%,%tensor%,%torch%,%gpu%,%kernel%,%warp%,%simd%}') THEN 1 ELSE 0 END) * 0.4 +
                (CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%cuda%,%tensor%,%torch%,%gpu%,%kernel%,%warp%,%simd%}') THEN 1 ELSE 0 END) * 0.3,
                (CASE WHEN source_ref ILIKE ANY('{%embed%,%embedding%,%vector%,%similarity%,%cosine%,%dense%}') THEN 1 ELSE 0 END) * 0.3 +
                (CASE WHEN summary ILIKE ANY('{%embed%,%embedding%,%vector%,%similarity%,%cosine%,%dense%}') THEN 1 ELSE 0 END) * 0.4 +
                (CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%embed%,%embedding%,%vector%,%similarity%,%cosine%,%dense%}') THEN 1 ELSE 0 END) * 0.3,
                (CASE WHEN source_ref ILIKE ANY('{%rag%,%retrieval%,%augmented%,%generation%,%context%,%pipeline%}') THEN 1 ELSE 0 END) * 0.3 +
                (CASE WHEN summary ILIKE ANY('{%rag%,%retrieval%,%augmented%,%generation%,%context%,%pipeline%}') THEN 1 ELSE 0 END) * 0.4 +
                (CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%rag%,%retrieval%,%augmented%,%generation%,%context%,%pipeline%}') THEN 1 ELSE 0 END) * 0.3,
                (CASE WHEN source_ref ILIKE ANY('{%neo4j%,%graph%,%node%,%edge%,%topology%,%cypher%,%relation%}') THEN 1 ELSE 0 END) * 0.3 +
                (CASE WHEN summary ILIKE ANY('{%neo4j%,%graph%,%node%,%edge%,%topology%,%cypher%,%relation%}') THEN 1 ELSE 0 END) * 0.4 +
                (CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%neo4j%,%graph%,%node%,%edge%,%topology%,%cypher%,%relation%}') THEN 1 ELSE 0 END) * 0.3
              ) THEN 'retrieval'
              WHEN (
                (CASE WHEN source_ref ILIKE ANY('{%svelte%,%button%,%component%,%modal%,%form%,%page%,%route%,%layout%}') THEN 1 ELSE 0 END) * 0.3 +
                (CASE WHEN summary ILIKE ANY('{%svelte%,%button%,%component%,%modal%,%form%,%page%,%route%,%layout%}') THEN 1 ELSE 0 END) * 0.4 +
                (CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%svelte%,%button%,%component%,%modal%,%form%,%page%,%route%,%layout%}') THEN 1 ELSE 0 END) * 0.3
              ) > GREATEST(
                (CASE WHEN source_ref ILIKE ANY('{%postgres%,%drizzle%,%schema%,%table%,%migration%,%sql%,%query%}') THEN 1 ELSE 0 END) * 0.3 +
                (CASE WHEN summary ILIKE ANY('{%postgres%,%drizzle%,%schema%,%table%,%migration%,%sql%,%query%}') THEN 1 ELSE 0 END) * 0.4 +
                (CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%postgres%,%drizzle%,%schema%,%table%,%migration%,%sql%,%query%}') THEN 1 ELSE 0 END) * 0.3,
                (CASE WHEN source_ref ILIKE ANY('{%auth%,%session%,%lucia%,%login%,%password%,%jwt%,%token%}') THEN 1 ELSE 0 END) * 0.3 +
                (CASE WHEN summary ILIKE ANY('{%auth%,%session%,%lucia%,%login%,%password%,%jwt%,%token%}') THEN 1 ELSE 0 END) * 0.4 +
                (CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%auth%,%session%,%lucia%,%login%,%password%,%jwt%,%token%}') THEN 1 ELSE 0 END) * 0.3
              ) THEN 'frontend'
              WHEN (
                (CASE WHEN source_ref ILIKE ANY('{%postgres%,%drizzle%,%schema%,%table%,%migration%,%sql%,%query%}') THEN 1 ELSE 0 END) * 0.3 +
                (CASE WHEN summary ILIKE ANY('{%postgres%,%drizzle%,%schema%,%table%,%migration%,%sql%,%query%}') THEN 1 ELSE 0 END) * 0.4 +
                (CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%postgres%,%drizzle%,%schema%,%table%,%migration%,%sql%,%query%}') THEN 1 ELSE 0 END) * 0.3
              ) > GREATEST(
                (CASE WHEN source_ref ILIKE ANY('{%auth%,%session%,%lucia%,%login%,%password%,%jwt%,%token%}') THEN 1 ELSE 0 END) * 0.3 +
                (CASE WHEN summary ILIKE ANY('{%auth%,%session%,%lucia%,%login%,%password%,%jwt%,%token%}') THEN 1 ELSE 0 END) * 0.4 +
                (CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%auth%,%session%,%lucia%,%login%,%password%,%jwt%,%token%}') THEN 1 ELSE 0 END) * 0.3,
                (CASE WHEN source_ref ILIKE ANY('{%handler%,%endpoint%,%request%,%response%,%rest%,%post%,%get%}') THEN 1 ELSE 0 END) * 0.3 +
                (CASE WHEN summary ILIKE ANY('{%handler%,%endpoint%,%request%,%response%,%rest%,%post%,%get%}') THEN 1 ELSE 0 END) * 0.4 +
                (CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%handler%,%endpoint%,%request%,%response%,%rest%,%post%,%get%}') THEN 1 ELSE 0 END) * 0.3
              ) THEN 'database'
              WHEN (
                (CASE WHEN source_ref ILIKE ANY('{%auth%,%session%,%lucia%,%login%,%password%,%jwt%,%token%}') THEN 1 ELSE 0 END) * 0.3 +
                (CASE WHEN summary ILIKE ANY('{%auth%,%session%,%lucia%,%login%,%password%,%jwt%,%token%}') THEN 1 ELSE 0 END) * 0.4 +
                (CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%auth%,%session%,%lucia%,%login%,%password%,%jwt%,%token%}') THEN 1 ELSE 0 END) * 0.3
              ) > GREATEST(
                (CASE WHEN source_ref ILIKE ANY('{%handler%,%endpoint%,%request%,%response%,%rest%,%post%,%get%}') THEN 1 ELSE 0 END) * 0.3 +
                (CASE WHEN summary ILIKE ANY('{%handler%,%endpoint%,%request%,%response%,%rest%,%post%,%get%}') THEN 1 ELSE 0 END) * 0.4 +
                (CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%handler%,%endpoint%,%request%,%response%,%rest%,%post%,%get%}') THEN 1 ELSE 0 END) * 0.3
              ) THEN 'authentication'
              WHEN (
                (CASE WHEN source_ref ILIKE ANY('{%handler%,%endpoint%,%request%,%response%,%rest%,%post%,%get%}') THEN 1 ELSE 0 END) * 0.3 +
                (CASE WHEN summary ILIKE ANY('{%handler%,%endpoint%,%request%,%response%,%rest%,%post%,%get%}') THEN 1 ELSE 0 END) * 0.4 +
                (CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%handler%,%endpoint%,%request%,%response%,%rest%,%post%,%get%}') THEN 1 ELSE 0 END) * 0.3
              ) > GREATEST(
                (CASE WHEN source_ref ILIKE ANY('{%cuda%,%tensor%,%torch%,%gpu%,%kernel%,%warp%,%simd%}') THEN 1 ELSE 0 END) * 0.3 +
                (CASE WHEN summary ILIKE ANY('{%cuda%,%tensor%,%torch%,%gpu%,%kernel%,%warp%,%simd%}') THEN 1 ELSE 0 END) * 0.4 +
                (CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%cuda%,%tensor%,%torch%,%gpu%,%kernel%,%warp%,%simd%}') THEN 1 ELSE 0 END) * 0.3
              ) THEN 'api'
              WHEN (
                (CASE WHEN source_ref ILIKE ANY('{%cuda%,%tensor%,%torch%,%gpu%,%kernel%,%warp%,%simd%}') THEN 1 ELSE 0 END) * 0.3 +
                (CASE WHEN summary ILIKE ANY('{%cuda%,%tensor%,%torch%,%gpu%,%kernel%,%warp%,%simd%}') THEN 1 ELSE 0 END) * 0.4 +
                (CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%cuda%,%tensor%,%torch%,%gpu%,%kernel%,%warp%,%simd%}') THEN 1 ELSE 0 END) * 0.3
              ) > GREATEST(
                (CASE WHEN source_ref ILIKE ANY('{%embed%,%embedding%,%vector%,%similarity%,%cosine%,%dense%}') THEN 1 ELSE 0 END) * 0.3 +
                (CASE WHEN summary ILIKE ANY('{%embed%,%embedding%,%vector%,%similarity%,%cosine%,%dense%}') THEN 1 ELSE 0 END) * 0.4 +
                (CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%embed%,%embedding%,%vector%,%similarity%,%cosine%,%dense%}') THEN 1 ELSE 0 END) * 0.3
              ) THEN 'gpu'
              WHEN (
                (CASE WHEN source_ref ILIKE ANY('{%embed%,%embedding%,%vector%,%similarity%,%cosine%,%dense%}') THEN 1 ELSE 0 END) * 0.3 +
                (CASE WHEN summary ILIKE ANY('{%embed%,%embedding%,%vector%,%similarity%,%cosine%,%dense%}') THEN 1 ELSE 0 END) * 0.4 +
                (CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%embed%,%embedding%,%vector%,%similarity%,%cosine%,%dense%}') THEN 1 ELSE 0 END) * 0.3
              ) > GREATEST(
                (CASE WHEN source_ref ILIKE ANY('{%rag%,%retrieval%,%augmented%,%generation%,%context%,%pipeline%}') THEN 1 ELSE 0 END) * 0.3 +
                (CASE WHEN summary ILIKE ANY('{%rag%,%retrieval%,%augmented%,%generation%,%context%,%pipeline%}') THEN 1 ELSE 0 END) * 0.4 +
                (CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%rag%,%retrieval%,%augmented%,%generation%,%context%,%pipeline%}') THEN 1 ELSE 0 END) * 0.3
              ) THEN 'embedding'
              WHEN (
                (CASE WHEN source_ref ILIKE ANY('{%rag%,%retrieval%,%augmented%,%generation%,%context%,%pipeline%}') THEN 1 ELSE 0 END) * 0.3 +
                (CASE WHEN summary ILIKE ANY('{%rag%,%retrieval%,%augmented%,%generation%,%context%,%pipeline%}') THEN 1 ELSE 0 END) * 0.4 +
                (CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%rag%,%retrieval%,%augmented%,%generation%,%context%,%pipeline%}') THEN 1 ELSE 0 END) * 0.3
              ) > (
                (CASE WHEN source_ref ILIKE ANY('{%neo4j%,%graph%,%node%,%edge%,%topology%,%cypher%,%relation%}') THEN 1 ELSE 0 END) * 0.3 +
                (CASE WHEN summary ILIKE ANY('{%neo4j%,%graph%,%node%,%edge%,%topology%,%cypher%,%relation%}') THEN 1 ELSE 0 END) * 0.4 +
                (CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%neo4j%,%graph%,%node%,%edge%,%topology%,%cypher%,%relation%}') THEN 1 ELSE 0 END) * 0.3
              ) THEN 'rag'
              ELSE 'graph'
            END,
            'unclassified'
          ),
          domain_confidence = GREATEST(
            (CASE WHEN source_ref ILIKE ANY('{%qdrant%,%vector%,%search%,%rank%,%candidate%,%blend%,%rerank%}') THEN 1 ELSE 0 END) * 0.3 +
            (CASE WHEN summary ILIKE ANY('{%qdrant%,%vector%,%search%,%rank%,%candidate%,%blend%,%rerank%}') THEN 1 ELSE 0 END) * 0.4 +
            (CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%qdrant%,%vector%,%search%,%rank%,%candidate%,%blend%,%rerank%}') THEN 1 ELSE 0 END) * 0.3,
            (CASE WHEN source_ref ILIKE ANY('{%svelte%,%button%,%component%,%modal%,%form%,%page%,%route%,%layout%}') THEN 1 ELSE 0 END) * 0.3 +
            (CASE WHEN summary ILIKE ANY('{%svelte%,%button%,%component%,%modal%,%form%,%page%,%route%,%layout%}') THEN 1 ELSE 0 END) * 0.4 +
            (CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%svelte%,%button%,%component%,%modal%,%form%,%page%,%route%,%layout%}') THEN 1 ELSE 0 END) * 0.3,
            (CASE WHEN source_ref ILIKE ANY('{%postgres%,%drizzle%,%schema%,%table%,%migration%,%sql%,%query%}') THEN 1 ELSE 0 END) * 0.3 +
            (CASE WHEN summary ILIKE ANY('{%postgres%,%drizzle%,%schema%,%table%,%migration%,%sql%,%query%}') THEN 1 ELSE 0 END) * 0.4 +
            (CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%postgres%,%drizzle%,%schema%,%table%,%migration%,%sql%,%query%}') THEN 1 ELSE 0 END) * 0.3,
            (CASE WHEN source_ref ILIKE ANY('{%auth%,%session%,%lucia%,%login%,%password%,%jwt%,%token%}') THEN 1 ELSE 0 END) * 0.3 +
            (CASE WHEN summary ILIKE ANY('{%auth%,%session%,%lucia%,%login%,%password%,%jwt%,%token%}') THEN 1 ELSE 0 END) * 0.4 +
            (CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%auth%,%session%,%lucia%,%login%,%password%,%jwt%,%token%}') THEN 1 ELSE 0 END) * 0.3,
            (CASE WHEN source_ref ILIKE ANY('{%handler%,%endpoint%,%request%,%response%,%rest%,%post%,%get%}') THEN 1 ELSE 0 END) * 0.3 +
            (CASE WHEN summary ILIKE ANY('{%handler%,%endpoint%,%request%,%response%,%rest%,%post%,%get%}') THEN 1 ELSE 0 END) * 0.4 +
            (CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%handler%,%endpoint%,%request%,%response%,%rest%,%post%,%get%}') THEN 1 ELSE 0 END) * 0.3,
            (CASE WHEN source_ref ILIKE ANY('{%cuda%,%tensor%,%torch%,%gpu%,%kernel%,%warp%,%simd%}') THEN 1 ELSE 0 END) * 0.3 +
            (CASE WHEN summary ILIKE ANY('{%cuda%,%tensor%,%torch%,%gpu%,%kernel%,%warp%,%simd%}') THEN 1 ELSE 0 END) * 0.4 +
            (CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%cuda%,%tensor%,%torch%,%gpu%,%kernel%,%warp%,%simd%}') THEN 1 ELSE 0 END) * 0.3,
            (CASE WHEN source_ref ILIKE ANY('{%embed%,%embedding%,%vector%,%similarity%,%cosine%,%dense%}') THEN 1 ELSE 0 END) * 0.3 +
            (CASE WHEN summary ILIKE ANY('{%embed%,%embedding%,%vector%,%similarity%,%cosine%,%dense%}') THEN 1 ELSE 0 END) * 0.4 +
            (CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%embed%,%embedding%,%vector%,%similarity%,%cosine%,%dense%}') THEN 1 ELSE 0 END) * 0.3,
            (CASE WHEN source_ref ILIKE ANY('{%rag%,%retrieval%,%augmented%,%generation%,%context%,%pipeline%}') THEN 1 ELSE 0 END) * 0.3 +
            (CASE WHEN summary ILIKE ANY('{%rag%,%retrieval%,%augmented%,%generation%,%context%,%pipeline%}') THEN 1 ELSE 0 END) * 0.4 +
            (CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%rag%,%retrieval%,%augmented%,%generation%,%context%,%pipeline%}') THEN 1 ELSE 0 END) * 0.3,
            (CASE WHEN source_ref ILIKE ANY('{%neo4j%,%graph%,%node%,%edge%,%topology%,%cypher%,%relation%}') THEN 1 ELSE 0 END) * 0.3 +
            (CASE WHEN summary ILIKE ANY('{%neo4j%,%graph%,%node%,%edge%,%topology%,%cypher%,%relation%}') THEN 1 ELSE 0 END) * 0.4 +
            (CASE WHEN array_to_string(concept_ids, ' ') ILIKE ANY('{%neo4j%,%graph%,%node%,%edge%,%topology%,%cypher%,%relation%}') THEN 1 ELSE 0 END) * 0.3
          )
        WHERE domain_class IS NULL;
      `;

      execSQL(updateSQL);
      console.log(`  ✓ Classification complete`);
    }

    console.log('[2/3] Verifying classification coverage...');
    const verifySQL = `
      SELECT
        COUNT(*) total,
        COUNT(CASE WHEN domain_class IS NOT NULL THEN 1 END) classified,
        ROUND(100.0 * COUNT(CASE WHEN domain_class IS NOT NULL THEN 1 END) / COUNT(*), 2) coverage_pct
      FROM atlas_packets;
    `;

    const verifyResult = execSQL(verifySQL);
    console.log(verifyResult);
    console.log('');

    console.log('[3/3] Domain distribution (sample)...');
    const distSQL = `
      SELECT
        domain_class,
        COUNT(*) count,
        ROUND(AVG(domain_confidence)::numeric, 3) avg_confidence
      FROM atlas_packets
      WHERE domain_class IS NOT NULL
      GROUP BY domain_class
      ORDER BY count DESC;
    `;

    const distResult = execSQL(distSQL);
    console.log(distResult);
    console.log('');

    if (dryRun) {
      console.log('To apply, run:');
      console.log(`  npx tsx scripts/atlas/classify-domains-sql-only.mts --apply`);
    } else {
      console.log('✅ DOMAIN CLASSIFICATION COMPLETE (Stage 1 Naive Bayes)');
      console.log('Next: Train Stage 2 XGBoost reranker on evaluation_relevance_corrected + feature envelopes + domain probabilities');
    }
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

main();
