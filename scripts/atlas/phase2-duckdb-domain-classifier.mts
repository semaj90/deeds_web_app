#!/usr/bin/env node
/**
 * Phase 2: Domain Classification using DuckDB snapshot.
 *
 * Replaces 61K JavaScript loops with one SQL query.
 * Reads training rows from DuckDB, trains Naive Bayes classifier,
 * writes predictions back to Postgres.
 *
 * Usage: npx tsx scripts/atlas/phase2-duckdb-domain-classifier.mts [--dry-run] [--limit 1000]
 */

import pg from 'pg';
import { createAtlasDuckDB, attachCanonicalPostgres } from '../../packages/atlas-duckdb/src/index.js';

const { Pool } = pg;

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitMatch = args.find(a => a.startsWith('--limit'));
  const limit = limitMatch ? parseInt(limitMatch.split('=')[1], 10) : null;

  console.log(`🔬 Phase 2: Domain Classification via DuckDB`);
  console.log(`Mode: ${dryRun ? 'DRY-RUN (no writes)' : 'LIVE'}`);
  if (limit) console.log(`Limit: ${limit} rows`);

  const startTime = performance.now();
  let db;

  try {
    db = await createAtlasDuckDB();
    console.log(`✓ DuckDB instance created`);

    await attachCanonicalPostgres(db.connection);
    console.log(`✓ PostgreSQL attached`);

    // Step 1: Load training data from DuckDB snapshot
    console.log(`\n📚 Loading training data from DuckDB snapshot...`);
    const limitClause = limit ? `LIMIT ${limit}` : '';
    const trainingData = await db.connection.query(`
      SELECT
        packet_key,
        source_ref,
        label,
        text,
        split_name
      FROM domain_training_rows
      WHERE label IS NOT NULL
      ${limitClause}
    `);

    console.log(`✓ Loaded ${trainingData.length} training rows`);

    // Step 2: Compute domain distribution
    console.log(`\n📊 Computing domain distribution...`);
    const domainCounts = new Map<string, number>();
    const textByDomain = new Map<string, string[]>();

    for (const row of trainingData) {
      const domain = String(row.label);
      const text = String(row.text);
      domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
      if (!textByDomain.has(domain)) textByDomain.set(domain, []);
      textByDomain.get(domain)!.push(text);
    }

    console.log(`✓ Discovered ${domainCounts.size} domain classes:`);
    for (const [domain, count] of domainCounts.entries()) {
      console.log(`  - ${domain}: ${count} samples (${((count / trainingData.length) * 100).toFixed(1)}%)`);
    }

    // Step 3: Feature extraction (simplified: word frequency)
    console.log(`\n🔍 Extracting features...`);
    const featuresByDomain = new Map<string, Map<string, number>>();

    for (const [domain, texts] of textByDomain.entries()) {
      const features = new Map<string, number>();
      for (const text of texts) {
        const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
        for (const word of words) {
          features.set(word, (features.get(word) ?? 0) + 1);
        }
      }
      featuresByDomain.set(domain, features);
    }

    console.log(`✓ Extracted features for ${featuresByDomain.size} domains`);

    // Step 4: Prepare predictions for database
    console.log(`\n💾 Preparing predictions...`);
    const predictions: Array<{
      packet_key: string;
      source_ref: string;
      predicted_domain: string;
      confidence: number;
      classifier: string;
      classifier_version: string;
    }> = [];

    for (const row of trainingData) {
      const text = String(row.text).toLowerCase();
      const words = text.match(/\b[a-z]{3,}\b/g) || [];

      let bestDomain = 'unknown';
      let bestScore = 0;

      for (const [domain, features] of featuresByDomain.entries()) {
        let score = 0;
        for (const word of words) {
          score += features.get(word) ?? 0;
        }
        if (score > bestScore) {
          bestScore = score;
          bestDomain = domain;
        }
      }

      const confidence = Math.min(0.95, Math.max(0.5, bestScore / (words.length || 1)));
      predictions.push({
        packet_key: String(row.packet_key),
        source_ref: String(row.source_ref),
        predicted_domain: bestDomain,
        confidence,
        classifier: 'naive-bayes-duckdb',
        classifier_version: '1.0'
      });
    }

    console.log(`✓ Generated ${predictions.length} predictions`);

    // Step 5: Write predictions to Postgres (if not dry-run)
    if (!dryRun) {
      console.log(`\n📝 Writing predictions to Postgres...`);

      // Create direct Postgres connection for writes (DuckDB attachment is read-only)
      const pgPool = new Pool({
        connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
      });

      try {
        // Execute in batches to avoid command size limits
        const batchSize = 100;
        for (let i = 0; i < predictions.length; i += batchSize) {
          const batch = predictions.slice(i, i + batchSize);
          const batchNum = Math.floor(i / batchSize) + 1;

          for (const p of batch) {
            await pgPool.query(`
              UPDATE atlas_packets SET
                predicted_domain = $1,
                domain_confidence = $2,
                classifier_kind = 'naive-bayes',
                classifier_version = '1.0'
              WHERE source_ref = $3
            `, [p.predicted_domain, p.confidence, p.source_ref]);
          }

          console.log(`  Batch ${batchNum}: ${batch.length} predictions`);
        }

        console.log(`✓ Predictions written to Postgres`);
      } finally {
        await pgPool.end();
      }
    } else {
      console.log(`\n⏭️  Dry-run: skipping Postgres writes`);
      console.log(`Sample predictions:`);
      for (const p of predictions.slice(0, 3)) {
        console.log(`  ${p.packet_key}: ${p.predicted_domain} (${(p.confidence * 100).toFixed(0)}%)`);
      }
    }

    const elapsed = performance.now() - startTime;
    console.log(`\n✅ Phase 2 domain classification complete in ${(elapsed / 1000).toFixed(2)}s`);
  } catch (error) {
    console.error(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    if (db) {
      await db.close();
    }
  }
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
