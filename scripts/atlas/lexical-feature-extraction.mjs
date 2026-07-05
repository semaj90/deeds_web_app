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

/**
 * Extract lexical features from text
 */
function extractLexicalFeatures(text) {
  if (!text || text.length === 0) {
    return { keywords: [], ngrams: [], trigrams: [], engrams: [] };
  }

  const results = {
    keywords: [],
    ngrams: [],
    trigrams: [],
    engrams: [],
  };

  // Normalize text
  const normalized = text.toLowerCase().trim();

  // ════════════════════════════════════════════════════════════════
  // KEYWORDS: domain nouns/verbs (word-level, common English words excluded)
  // ════════════════════════════════════════════════════════════════

  const stopwords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'is', 'are', 'was', 'were',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
    'can', 'that', 'this', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who',
    'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'some', 'any',
  ]);

  const words = normalized
    .replace(/[^\w\s_-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopwords.has(w));

  results.keywords = [...new Set(words.slice(0, 20))]; // Unique, top 20

  // ════════════════════════════════════════════════════════════════
  // NGRAMS: 2-3 word sequences (for phrase-based recall)
  // ════════════════════════════════════════════════════════════════

  for (let n = 2; n <= 3; n++) {
    const ngrams = [];
    for (let i = 0; i <= words.length - n; i++) {
      const gram = words.slice(i, i + n).join('_');
      if (gram.length > 3) {
        ngrams.push(gram);
      }
    }
    results.ngrams.push(...ngrams.slice(0, 10)); // Top 10 per n
  }
  results.ngrams = [...new Set(results.ngrams)];

  // ════════════════════════════════════════════════════════════════
  // TRIGRAMS: char-level 3-grams (for fuzzy/typo matching)
  // ════════════════════════════════════════════════════════════════

  const trigrams = [];
  const cleanText = normalized.replace(/\s+/g, '_');
  for (let i = 0; i < cleanText.length - 2; i++) {
    trigrams.push(cleanText.substring(i, i + 3));
  }
  results.trigrams = [...new Set(trigrams)].slice(0, 30); // Top 30

  // ════════════════════════════════════════════════════════════════
  // ENGRAMS: entity n-grams (camelCase, snake_case, paths)
  // ════════════════════════════════════════════════════════════════

  const entityMatches = [
    ...normalized.match(/[a-z]+[A-Z][a-zA-Z]*/g) || [], // camelCase
    ...normalized.match(/[a-z_]+\/[a-z_\/]+/g) || [], // paths
    ...normalized.match(/[A-Z][a-z]+/g) || [], // PascalCase
    ...normalized.match(/_[a-z_]+/g) || [], // _snake_case
  ];
  results.engrams = [...new Set(entityMatches.filter(e => e.length > 2))].slice(0, 15);

  return results;
}

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
        const features = extractLexicalFeatures(row.summary);
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

        const features = extractLexicalFeatures(row.summary);

        updates.push({
          packet_key: row.packet_key,
          keywords: features.keywords,
          ngrams: features.ngrams,
          trigrams: features.trigrams,
          engrams: features.engrams,
          all_lexical: [
            ...features.keywords,
            ...features.ngrams,
            ...features.trigrams,
            ...features.engrams,
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

        const VALUES = batch.map((_, idx) => `($${idx * 5 + 1}, $${idx * 5 + 2}, $${idx * 5 + 3}, $${idx * 5 + 4}, $${idx * 5 + 5})`).join(',');
        const params = [];

        for (const update of batch) {
          params.push(
            update.packet_key,
            update.keywords,
            update.ngrams,
            update.trigrams,
            update.engrams
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
            updated_at = NOW()
          FROM (VALUES ${VALUES})
          AS v(packet_key, keywords, ngrams, trigrams, engrams)
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
