#!/usr/bin/env node

/**
 * Lexical Feature Extraction Lane
 *
 * Extracts lexical features for recall and fallback indexing:
 *   keywords (domain nouns/verbs)
 *   ngrams (2-3 word sequences)
 *   trigrams (char-level 3-grams for fuzzy matching)
 *   engrams (entity n-grams for entity alignment)
 *
 * These feed into:
 *   pg_fts (full-text search)
 *   GIN indexes (array search)
 *   Qdrant payload (keyword matching)
 *   concept_ids (lexical enrichment before semantic)
 *
 * NOT the identity; just recall + reranking layer.
 *
 * Usage:
 *   node scripts/atlas/lexical-feature-extraction.mjs --dry-run --limit 10
 *   node scripts/atlas/lexical-feature-extraction.mjs --apply --batch 500
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { buildCanonicalFeatureEnvelope, reportValidation } from './lib/envelope-builder.mjs';
import { extractLexicalTuples, extractOntologyTuple } from './lib/semantic-tuple-extractor.mjs';

config({ path: resolve('.', '.env') });

const env = loadRepoEnv(process.env);
const POSTGRES_URL = resolveDatabaseUrl(env);
const pgPool = new pg.Pool({ connectionString: POSTGRES_URL });

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const LIMIT = parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '0') || 100;
const BATCH_SIZE = parseInt(process.argv.find(arg => arg.startsWith('--batch='))?.split('=')[1] || '500') || 500;

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Lexical Feature Extraction Lane                              ║');
console.log('║  Keywords, ngrams, trigrams, engrams for recall indexing      ║');
console.log(`║  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'.padEnd(54)}║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

async function lexicalFeatureExtraction() {
  try {
    console.log('📊 Step 1: Audit current coverage\n');

    const auditRes = await pgPool.query(`
      SELECT
        COUNT(*) total,
        COUNT(CASE WHEN summary IS NOT NULL AND LENGTH(summary) > 10 THEN 1 END) with_summary,
        COUNT(CASE WHEN keywords IS NOT NULL AND array_length(keywords, 1) > 0 THEN 1 END) with_keywords,
        COUNT(CASE WHEN concept_ids IS NOT NULL AND array_length(concept_ids, 1) > 0 THEN 1 END) with_concepts
      FROM atlas_packets
    `);

    const { total, with_summary, with_keywords, with_concepts } = auditRes.rows[0];
    console.log(`Total packets: ${total}`);
    console.log(`With summary: ${with_summary}`);
    console.log(`With keywords: ${with_keywords}`);
    console.log(`With concept_ids: ${with_concepts}`);
    console.log();

    if (DRY_RUN) {
      console.log('📋 DRY-RUN: Would extract lexical features\n');

      const sampleRes = await pgPool.query(`
        SELECT
          packet_key,
          feature_id,
          summary
        FROM atlas_packets
        WHERE summary IS NOT NULL AND LENGTH(summary) > 10
        LIMIT 3
      `);

      console.log('Sample lexical extraction:');
      for (const row of sampleRes.rows) {
        const features = extractLexicalTuples(row.summary);
        console.log(`\n  ${row.feature_id}`);
        console.log(`    Keywords (${features.keywords.length}): ${features.keywords.slice(0, 5).join(', ')}`);
        console.log(`    Ngrams (${features.ngrams.length}): ${features.ngrams.slice(0, 3).join(', ')}`);
        console.log(`    Trigrams (${features.trigrams.length}): ${features.trigrams.slice(0, 3).join(', ')}`);
        console.log(`    Engrams (${features.engrams.length}): ${features.engrams.slice(0, 3).join(', ')}`);
      }
      console.log();

    } else {
      console.log('💾 Step 2: Extract and update Postgres\n');

      // Fetch candidates with all canonical envelope fields
      const candidatesRes = await pgPool.query(
        `
        SELECT
          packet_key,
          source_ref,
          source_ref_key,
          feature_id,
          title_id,
          tree_node_id,
          feature_label,
          concept_ids,
          domain_class,
          community_id,
          som_cluster,
          qdrant_point_id,
          summary
        FROM atlas_packets
        WHERE summary IS NOT NULL AND LENGTH(summary) > 10
        ORDER BY packet_key
        LIMIT $1
        `,
        [LIMIT || 1000]
      );

      console.log(`   Processing ${candidatesRes.rows.length} packets\n`);

      let processed = 0;
      let validationFailures = 0;
      const updates = [];

      for (const row of candidatesRes.rows) {
        // Validate canonical envelope before processing
        const { validation } = buildCanonicalFeatureEnvelope({
          packet_key: row.packet_key,
          source_ref: row.source_ref,
          source_ref_key: row.source_ref_key,
          feature_id: row.feature_id,
          title_id: row.title_id,
          tree_node_id: row.tree_node_id,
          feature_label: row.feature_label,
          concept_ids: row.concept_ids,
          domain_class: row.domain_class,
          community_id: row.community_id,
          som_cluster: row.som_cluster,
          qdrant_point_id: row.qdrant_point_id,
        });

        if (!validation.isValid && validation.hardFailures.length > 0) {
          if (process.argv.includes('--verbose')) {
            reportValidation(validation, row.packet_key);
          }
          validationFailures++;
          processed++;
          continue;
        }

        const lexical = extractLexicalTuples(row.summary);
        const ontology = extractOntologyTuple(row);

        updates.push({
          packet_key: row.packet_key,
          keywords: lexical.keywords,
          ngrams: lexical.ngrams,
          trigrams: lexical.trigrams,
          engrams: lexical.engrams,
          lexical_nouns: lexical.nouns,
          lexical_verbs: lexical.verbs,
          lexical_adjectives: lexical.adjectives,
          title_id: ontology.title_id,
          title_label: ontology.title_label,
          domain_class: ontology.domain_class,
          all_lexical: [
            ...lexical.keywords,
            ...lexical.ngrams,
            ...lexical.trigrams,
            ...lexical.engrams,
          ],
        });

        processed++;
        if (processed % 100 === 0) {
          console.log(`   ✓ Extracted ${processed}/${candidatesRes.rows.length}`);
        }
      }

      // Batch update Postgres
      console.log(`\n   ✓ Extracted ${updates.length} valid packets (${validationFailures} validation failures)\n`);
      console.log(`   Batch updating Postgres...\n`);

      for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const batch = updates.slice(i, i + BATCH_SIZE);

        const VALUES = batch.map((_, idx) => `($${idx * 10 + 1}, $${idx * 10 + 2}, $${idx * 10 + 3}, $${idx * 10 + 4}, $${idx * 10 + 5}, $${idx * 10 + 6}, $${idx * 10 + 7}, $${idx * 10 + 8}, $${idx * 10 + 9}, $${idx * 10 + 10})`).join(',');
        const params = [];

        for (const update of batch) {
          params.push(
            update.packet_key,
            update.keywords,
            update.ngrams,
            update.trigrams,
            update.engrams,
            update.lexical_nouns,
            update.lexical_verbs,
            update.lexical_adjectives,
            update.title_id,
            update.domain_class
          );
        }

        const updateRes = await pgPool.query(
          `
          UPDATE atlas_packets ap
          SET
            keywords = v.keywords::TEXT[],
            ngrams = v.ngrams::TEXT[],
            trigrams = v.trigrams::TEXT[],
            engrams = v.engrams::TEXT[],
            metadata = COALESCE(ap.metadata, '{}'::jsonb) || jsonb_build_object(
              'lexical_nouns', v.lexical_nouns::TEXT[],
              'lexical_verbs', v.lexical_verbs::TEXT[],
              'lexical_adjectives', v.lexical_adjectives::TEXT[],
              'title_id', COALESCE(ap.title_id, v.title_id),
              'domain_class', COALESCE(ap.domain_class, v.domain_class)
            ),
            title_id = COALESCE(ap.title_id, v.title_id),
            domain_class = COALESCE(ap.domain_class, v.domain_class),
            updated_at = NOW()
          FROM (VALUES ${VALUES})
          AS v(packet_key, keywords, ngrams, trigrams, engrams, lexical_nouns, lexical_verbs, lexical_adjectives, title_id, domain_class)
          WHERE ap.packet_key = v.packet_key
          `,
          params
        );

        console.log(`   ✓ Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${updateRes.rowCount} rows updated`);
      }

      console.log();
    }

    console.log('4️⃣  Step 3: Verify coverage\n');

    const verifyRes = await pgPool.query(`
      SELECT
        COUNT(*) total,
        COUNT(CASE WHEN keywords IS NOT NULL AND array_length(keywords, 1) > 0 THEN 1 END) with_keywords,
        COUNT(CASE WHEN ngrams IS NOT NULL AND array_length(ngrams, 1) > 0 THEN 1 END) with_ngrams,
        COUNT(CASE WHEN trigrams IS NOT NULL AND array_length(trigrams, 1) > 0 THEN 1 END) with_trigrams,
        COUNT(CASE WHEN engrams IS NOT NULL AND array_length(engrams, 1) > 0 THEN 1 END) with_engrams
      FROM atlas_packets
    `);

    const {
      total: finalTotal,
      with_keywords: finalKw,
      with_ngrams: finalNg,
      with_trigrams: finalTg,
      with_engrams: finalEg,
    } = verifyRes.rows[0];

    console.log(`Keywords: ${finalKw}/${finalTotal} (${(100 * finalKw / finalTotal).toFixed(1)}%)`);
    console.log(`Ngrams: ${finalNg}/${finalTotal} (${(100 * finalNg / finalTotal).toFixed(1)}%)`);
    console.log(`Trigrams: ${finalTg}/${finalTotal} (${(100 * finalTg / finalTotal).toFixed(1)}%)`);
    console.log(`Engrams: ${finalEg}/${finalTotal} (${(100 * finalEg / finalTotal).toFixed(1)}%)`);
    console.log();

    console.log('✅ Lexical feature extraction complete');

  } catch (err) {
    console.error('❌ Error:', err.message);
    if (process.argv.includes('--verbose')) console.error(err.stack);
    process.exit(1);
  } finally {
    await pgPool.end();
  }
}

lexicalFeatureExtraction();
