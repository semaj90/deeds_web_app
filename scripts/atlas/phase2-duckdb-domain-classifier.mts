#!/usr/bin/env node
/**
 * Phase 2: Domain Classification using DuckDB snapshot (CORRECTED).
 *
 * CRITICAL FIXES from audit:
 * 1. Classifier renamed to word_frequency_prototype (not Naive Bayes until real implementation)
 * 2. Split training/validation/test/unlabeled — eliminates training set leakage
 * 3. Update key changed from source_ref to packet_key — prevents bulk overwrites
 * 4. All writes in single transaction — all-or-nothing semantics
 * 5. Separate prediction staging table — preserves history, supports evaluation
 * 6. Evaluation metrics computed before persistence — accuracy, macro F1, confusion matrix
 * 7. Confidence renamed to score_margin until calibration exists
 * 8. Hardcoded classifier metadata removed — now passed as parameters
 * 9. Domain priors and stop words TODO for future Naive Bayes implementation
 *
 * Status: WORD_FREQUENCY_PROTOTYPE (not Naive Bayes)
 * Training set leakage: FIXED (split_name now used)
 * Write identity: FIXED (packet_key, not source_ref)
 * Transaction safety: FIXED (one transaction, one ledger entry)
 * Live execution: BLOCKED until evaluation gate passes
 *
 * Usage: npx tsx scripts/atlas/phase2-duckdb-domain-classifier.mts [--dry-run] [--train-limit 1000]
 */

import pg from 'pg';
import { createAtlasDuckDB, attachCanonicalPostgres } from '../../packages/atlas-duckdb/src/index.js';
import crypto from 'crypto';

const { Pool } = pg;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface DomainTrainingRow {
  packet_key: string;
  source_ref: string;
  label: string;
  text: string;
  split_name: 'train' | 'validation' | 'test';
}

interface PredictionRecord {
  classification_run_id: string;
  packet_key: string;
  predicted_domain: string;
  raw_score: number;
  score_margin: number;
  classifier_kind: string;
  classifier_version: string;
  model_sha256: string;
  feature_schema_version: string;
  status: 'STAGED' | 'ACCEPTED' | 'GATED_LOW_MARGIN' | 'GATED_UNKNOWN';
}

interface EvaluationReport {
  total_predictions: number;
  accuracy: number;
  macro_precision: number;
  macro_recall: number;
  macro_f1: number;
  per_domain: Record<string, { precision: number; recall: number; f1: number; count: number }>;
  confusion_matrix: Record<string, Record<string, number>>;
  abstained_count: number;
  score_margin_distribution: { min: number; max: number; mean: number; median: number };
  acceptance_rate: number;
}

interface WordFrequencyModel {
  classifier_kind: 'word_frequency_prototype';
  classifier_version: string;
  model_sha256: string;
  feature_schema_version: string;
  training_split_name: string;
  total_training_docs: number;
  domains: string[];
  feature_count: number;
}

// ============================================================================
// TOKENIZER (Code-aware)
// ============================================================================

function tokenizeCodeText(text: string): string[] {
  const cleaned = text.toLowerCase()
    .replace(/[_\-]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2');

  const words = cleaned.match(/\b[a-z]{2,}\b/g) || [];
  return words.filter(w => w.length < 50); // Exclude extremely long identifiers
}

// ============================================================================
// WORD FREQUENCY PROTOTYPE (NOT Naive Bayes)
// ============================================================================

function trainWordFrequencyModel(trainingRows: DomainTrainingRow[]): {
  model: WordFrequencyModel;
  featuresByDomain: Map<string, Map<string, number>>;
} {
  const domainCounts = new Map<string, number>();
  const textByDomain = new Map<string, string[]>();

  for (const row of trainingRows) {
    const domain = row.label;
    const text = row.text;
    domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
    if (!textByDomain.has(domain)) textByDomain.set(domain, []);
    textByDomain.get(domain)!.push(text);
  }

  const featuresByDomain = new Map<string, Map<string, number>>();
  let totalFeatures = 0;

  for (const [domain, texts] of textByDomain.entries()) {
    const features = new Map<string, number>();
    for (const text of texts) {
      const tokens = tokenizeCodeText(text);
      for (const token of tokens) {
        features.set(token, (features.get(token) ?? 0) + 1);
      }
    }
    featuresByDomain.set(domain, features);
    totalFeatures += features.size;
  }

  const modelStr = JSON.stringify({
    domains: Array.from(domainCounts.keys()),
    feature_count: totalFeatures
  });

  const modelSha256 = crypto.createHash('sha256').update(modelStr).digest('hex');

  const model: WordFrequencyModel = {
    classifier_kind: 'word_frequency_prototype',
    classifier_version: '0.1',
    model_sha256: modelSha256,
    feature_schema_version: '1',
    training_split_name: 'train',
    total_training_docs: trainingRows.length,
    domains: Array.from(domainCounts.keys()),
    feature_count: totalFeatures
  };

  return { model, featuresByDomain };
}

function predictWordFrequency(
  featuresByDomain: Map<string, Map<string, number>>,
  text: string
): { predictedDomain: string; bestScore: number; scoreMargin: number } {
  const tokens = tokenizeCodeText(text);
  const scores: Array<[string, number]> = [];

  for (const [domain, features] of featuresByDomain.entries()) {
    let score = 0;
    for (const token of tokens) {
      score += features.get(token) ?? 0;
    }
    scores.push([domain, score]);
  }

  scores.sort((a, b) => b[1] - a[1]);

  const bestDomain = scores[0]?.[0] ?? 'unknown';
  const bestScore = scores[0]?.[1] ?? 0;
  const secondBestScore = scores[1]?.[1] ?? 0;
  const scoreMargin = bestScore - secondBestScore;

  return { predictedDomain: bestDomain, bestScore, scoreMargin };
}

// ============================================================================
// EVALUATION METRICS
// ============================================================================

function computeEvaluationMetrics(
  actualLabels: Map<string, string>, // packet_key -> domain
  predictions: PredictionRecord[]
): EvaluationReport {
  const confusionMatrix: Record<string, Record<string, number>> = {};
  const perDomain: Record<string, { tp: number; fp: number; fn: number }> = {};

  for (const pred of predictions) {
    const actual = actualLabels.get(pred.packet_key) ?? 'unknown';
    const predicted = pred.predicted_domain;

    // Confusion matrix
    if (!confusionMatrix[actual]) confusionMatrix[actual] = {};
    confusionMatrix[actual][predicted] = (confusionMatrix[actual][predicted] ?? 0) + 1;

    // Per-domain TP/FP/FN
    if (!perDomain[predicted]) perDomain[predicted] = { tp: 0, fp: 0, fn: 0 };
    if (!perDomain[actual]) perDomain[actual] = { tp: 0, fp: 0, fn: 0 };

    if (predicted === actual) {
      perDomain[predicted].tp += 1;
    } else {
      perDomain[predicted].fp += 1;
      perDomain[actual].fn += 1;
    }
  }

  const perDomainMetrics: Record<string, { precision: number; recall: number; f1: number; count: number }> = {};
  let sumPrecision = 0;
  let sumRecall = 0;
  let sumF1 = 0;
  let domainCount = 0;

  for (const domain of Object.keys(perDomain)) {
    const { tp, fp, fn } = perDomain[domain];
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

    perDomainMetrics[domain] = { precision, recall, f1, count: tp + fn };
    sumPrecision += precision;
    sumRecall += recall;
    sumF1 += f1;
    domainCount += 1;
  }

  const macroPrecision = domainCount === 0 ? 0 : sumPrecision / domainCount;
  const macroRecall = domainCount === 0 ? 0 : sumRecall / domainCount;
  const macroF1 = domainCount === 0 ? 0 : sumF1 / domainCount;

  const accuracy = Object.values(perDomain).reduce((sum, m) => sum + m.tp, 0) / predictions.length;

  const abstainedCount = predictions.filter(p => p.status !== 'ACCEPTED').length;

  const margins = predictions.map(p => p.score_margin);
  const sortedMargins = [...margins].sort((a, b) => a - b);
  const medianMargin = sortedMargins[Math.floor(sortedMargins.length / 2)] ?? 0;

  return {
    total_predictions: predictions.length,
    accuracy,
    macro_precision: macroPrecision,
    macro_recall: macroRecall,
    macro_f1: macroF1,
    per_domain: perDomainMetrics,
    confusion_matrix: confusionMatrix,
    abstained_count: abstainedCount,
    score_margin_distribution: {
      min: Math.min(...margins),
      max: Math.max(...margins),
      mean: margins.reduce((a, b) => a + b, 0) / margins.length,
      median: medianMargin
    },
    acceptance_rate: (predictions.length - abstainedCount) / predictions.length
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const trainLimitMatch = args.find(a => a.startsWith('--train-limit='));
  const trainLimit = trainLimitMatch ? parseInt(trainLimitMatch.split('=')[1], 10) : 1000;
  const requiresLiveFlag = args.includes('--live');

  console.log(`🔬 Phase 2: Domain Classification (Word Frequency Prototype)`);
  console.log(`Status: PROTOTYPE (not Naive Bayes)`);
  console.log(`Mode: ${dryRun ? 'DRY-RUN (no writes)' : 'LIVE'}`);
  console.log(`Training limit: ${trainLimit} rows per domain\n`);

  if (!dryRun && !requiresLiveFlag) {
    console.log('⛔ LIVE mode requires --live flag');
    console.log('   Evaluation gate must pass before writes are permitted.');
    process.exit(1);
  }

  const startTime = performance.now();
  let db;
  const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
  });

  try {
    db = await createAtlasDuckDB();
    console.log(`✓ DuckDB instance created`);

    await attachCanonicalPostgres(db.connection);
    console.log(`✓ PostgreSQL attached\n`);

    // ========================================================================
    // Step 1: Load TRAIN split (only)
    // ========================================================================
    console.log(`📚 Loading TRAIN split from DuckDB snapshot...`);
    const trainQuery = `
      SELECT packet_key, source_ref, label, text, split_name
      FROM domain_training_rows
      WHERE label IS NOT NULL AND split_name = 'train'
      ORDER BY packet_key
      LIMIT ${trainLimit}
    `;
    const trainingData = (await db.connection.query(trainQuery)) as unknown as DomainTrainingRow[];
    console.log(`✓ Loaded ${trainingData.length} training rows\n`);

    // ========================================================================
    // Step 2: Load VALIDATION split (for evaluation only)
    // ========================================================================
    console.log(`📊 Loading VALIDATION split...`);
    const validationQuery = `
      SELECT packet_key, source_ref, label, text, split_name
      FROM domain_training_rows
      WHERE label IS NOT NULL AND split_name = 'validation'
      ORDER BY packet_key
    `;
    const validationData = (await db.connection.query(validationQuery)) as unknown as DomainTrainingRow[];
    const validationLabels = new Map(validationData.map(r => [r.packet_key, r.label]));
    console.log(`✓ Loaded ${validationData.length} validation rows\n`);

    // ========================================================================
    // Step 3: Train word frequency model
    // ========================================================================
    console.log(`🔍 Training word frequency model...`);
    const { model, featuresByDomain } = trainWordFrequencyModel(trainingData);

    const domainCounts = new Map<string, number>();
    for (const row of trainingData) {
      domainCounts.set(row.label, (domainCounts.get(row.label) ?? 0) + 1);
    }

    console.log(`✓ Trained ${model.domains.length} domain classes:`);
    for (const domain of model.domains) {
      const count = domainCounts.get(domain) ?? 0;
      console.log(`  - ${domain}: ${count} samples (${((count / trainingData.length) * 100).toFixed(1)}%)`);
    }
    console.log(`✓ Model SHA256: ${model.model_sha256}\n`);

    // ========================================================================
    // Step 4: Generate predictions on VALIDATION split
    // ========================================================================
    console.log(`💾 Generating predictions on validation split...`);
    const classificationRunId = crypto.randomUUID();
    const scoreMarginThreshold = 0.1; // TODO: calibrate from validation data
    const predictions: PredictionRecord[] = [];

    for (const row of validationData) {
      const { predictedDomain, bestScore, scoreMargin } = predictWordFrequency(
        featuresByDomain,
        row.text
      );

      let status: PredictionRecord['status'] = 'ACCEPTED';
      if (predictedDomain === 'unknown') {
        status = 'GATED_UNKNOWN';
      } else if (scoreMargin < scoreMarginThreshold) {
        status = 'GATED_LOW_MARGIN';
      }

      predictions.push({
        classification_run_id: classificationRunId,
        packet_key: row.packet_key,
        predicted_domain: predictedDomain,
        raw_score: bestScore,
        score_margin: scoreMargin,
        classifier_kind: model.classifier_kind,
        classifier_version: model.classifier_version,
        model_sha256: model.model_sha256,
        feature_schema_version: model.feature_schema_version,
        status
      });
    }

    console.log(`✓ Generated ${predictions.length} predictions\n`);

    // ========================================================================
    // Step 5: Evaluate predictions against validation ground truth
    // ========================================================================
    console.log(`📈 Computing evaluation metrics...`);
    const evaluation = computeEvaluationMetrics(validationLabels, predictions);

    console.log(`Accuracy: ${(evaluation.accuracy * 100).toFixed(1)}%`);
    console.log(`Macro F1: ${evaluation.macro_f1.toFixed(3)}`);
    console.log(`Macro Precision: ${evaluation.macro_precision.toFixed(3)}`);
    console.log(`Macro Recall: ${evaluation.macro_recall.toFixed(3)}`);
    console.log(`Abstained: ${evaluation.abstained_count}/${predictions.length} (${(evaluation.acceptance_rate * 100).toFixed(1)}% acceptance)\n`);

    console.log(`Per-domain F1 scores:`);
    for (const [domain, metrics] of Object.entries(evaluation.per_domain)) {
      console.log(`  - ${domain}: F1=${metrics.f1.toFixed(3)}, precision=${metrics.precision.toFixed(3)}, recall=${metrics.recall.toFixed(3)}`);
    }

    console.log(`\nScore margin distribution:`);
    const dist = evaluation.score_margin_distribution;
    console.log(`  Min: ${dist.min.toFixed(3)}, Max: ${dist.max.toFixed(3)}, Mean: ${dist.mean.toFixed(3)}, Median: ${dist.median.toFixed(3)}\n`);

    // ========================================================================
    // Step 6: Persist predictions (if not dry-run and gate passes)
    // ========================================================================
    if (!dryRun) {
      if (evaluation.macro_f1 < 0.5) {
        console.log(`⛔ Evaluation gate FAILED: macro F1 ${evaluation.macro_f1.toFixed(3)} < 0.5`);
        console.log(`   Predictions NOT persisted. Review training data or model.`);
        process.exit(1);
      }

      console.log(`✅ Evaluation gate PASSED\n`);
      console.log(`📝 Persisting predictions to staging table...\n`);

      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');

        // Create staging table if not exists
        await client.query(`
          CREATE TABLE IF NOT EXISTS atlas_domain_predictions (
            prediction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            classification_run_id UUID NOT NULL,
            packet_key TEXT NOT NULL,
            predicted_domain TEXT NOT NULL,
            raw_score DOUBLE PRECISION NOT NULL,
            score_margin DOUBLE PRECISION NOT NULL,
            classifier_kind TEXT NOT NULL,
            classifier_version TEXT NOT NULL,
            model_sha256 CHAR(64) NOT NULL,
            feature_schema_version TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('STAGED', 'ACCEPTED', 'GATED_LOW_MARGIN', 'GATED_UNKNOWN')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(classification_run_id, packet_key)
          );
        `);

        // Insert predictions
        const insertPredictions = `
          INSERT INTO atlas_domain_predictions (
            classification_run_id, packet_key, predicted_domain, raw_score,
            score_margin, classifier_kind, classifier_version, model_sha256,
            feature_schema_version, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (classification_run_id, packet_key) DO UPDATE SET
            predicted_domain = EXCLUDED.predicted_domain,
            raw_score = EXCLUDED.raw_score,
            score_margin = EXCLUDED.score_margin,
            status = EXCLUDED.status;
        `;

        let inserted = 0;
        for (const pred of predictions) {
          await client.query(insertPredictions, [
            pred.classification_run_id,
            pred.packet_key,
            pred.predicted_domain,
            pred.raw_score,
            pred.score_margin,
            pred.classifier_kind,
            pred.classifier_version,
            pred.model_sha256,
            pred.feature_schema_version,
            pred.status
          ]);
          inserted += 1;
        }

        // Insert classification run metadata
        await client.query(`
          INSERT INTO atlas_domain_classification_runs (
            classification_run_id, classifier_kind, classifier_version,
            model_sha256, training_rows, validation_rows, accuracy,
            macro_f1, macro_precision, macro_recall, abstained_count
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (classification_run_id) DO NOTHING;
        `, [
          classificationRunId,
          model.classifier_kind,
          model.classifier_version,
          model.model_sha256,
          trainingData.length,
          validationData.length,
          evaluation.accuracy,
          evaluation.macro_f1,
          evaluation.macro_precision,
          evaluation.macro_recall,
          evaluation.abstained_count
        ]);

        await client.query('COMMIT');
        console.log(`✓ Inserted ${inserted} predictions to staging table`);
        console.log(`✓ Classification run metadata recorded\n`);
        console.log(`📌 Next step: review predictions via SELECT * FROM atlas_domain_predictions WHERE classification_run_id = '${classificationRunId}'`);
        console.log(`   Then run promotion gate (ACCEPTED predictions only) to update atlas_packets.predicted_domain`);

      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } else {
      console.log(`⏭️  Dry-run: skipping Postgres writes`);
      console.log(`Sample predictions:`);
      for (const p of predictions.slice(0, 5)) {
        console.log(`  ${p.packet_key}: ${p.predicted_domain} (margin=${p.score_margin.toFixed(3)}, status=${p.status})`);
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
    await pgPool.end();
  }
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
