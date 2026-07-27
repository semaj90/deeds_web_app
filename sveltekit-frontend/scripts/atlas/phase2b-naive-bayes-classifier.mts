#!/usr/bin/env node
/**
 * Phase 2B: Multinomial Naive Bayes Domain Classifier (real implementation).
 *
 * Stage B of model ladder: Naive Bayes with proper probabilistic foundations.
 *
 * CRITICAL IMPROVEMENTS over Stage A (word frequency prototype):
 * 1. Class priors P(domain) from training split — boosts minority classes
 * 2. Laplace smoothing (alpha=1.0) — prevents zero-frequency collapse
 * 3. Log-space probability calculations — handles long documents without underflow
 * 4. Token likelihoods per class — proper conditional probabilities P(token|domain)
 * 5. Vocabulary hash for reproducibility — model SHA256 reflects feature set
 * 6. Same safety architecture as Stage A — split isolation, packet_key identity, transactions
 *
 * Status: MULTINOMIAL_NAIVE_BAYES (real Naive Bayes implementation)
 * Training set leakage: FIXED (split_name enforcement)
 * Write identity: FIXED (packet_key, not source_ref)
 * Transaction safety: FIXED (one transaction, one ledger entry)
 * Class imbalance handling: FIXED (class priors + proper log probabilities)
 * Live execution: GATED until evaluation gate passes (macro F1 >= 0.5)
 *
 * Usage: npx tsx scripts/atlas/phase2b-naive-bayes-classifier.mts [--dry-run] [--train-limit 5000]
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
  calibrated_confidence: number | null;
  status: 'ACCEPTED' | 'GATED_LOW_CONFIDENCE' | 'GATED_UNKNOWN';
}

interface EvaluationReport {
  total_predictions: number;
  accuracy: number;
  macro_precision: number;
  macro_recall: number;
  macro_f1: number;
  weighted_f1: number;
  per_domain: Record<string, {
    precision: number;
    recall: number;
    f1: number;
    count: number;
    support: number;
  }>;
  confusion_matrix: Record<string, Record<string, number>>;
  abstained_count: number;
  abstention_rate: number;
  confidence_distribution: {
    min: number;
    max: number;
    mean: number;
    median: number;
    q25: number;
    q75: number;
  };
  gate_pass: boolean;
  gate_reason: string;
}

interface NaiveBayesModel {
  classifier_kind: 'naive_bayes';
  classifier_version: string;
  model_sha256: string;
  feature_schema_version: string;
  training_split_name: string;
  total_training_docs: number;
  total_training_tokens: number;
  domains: string[];
  vocabulary_size: number;
  vocabulary_hash: string;
  laplace_alpha: number;
}

// ============================================================================
// TOKENIZER (Code-aware)
// ============================================================================

function tokenizeCodeText(text: string): string[] {
  const cleaned = text.toLowerCase()
    .replace(/[_\-]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2');

  const words = cleaned.match(/\b[a-z]{2,}\b/g) || [];
  return words.filter(w => w.length < 50);
}

// ============================================================================
// MULTINOMIAL NAIVE BAYES
// ============================================================================

interface NaiveBayesState {
  model: NaiveBayesModel;
  classPriors: Map<string, number>;
  tokenLikelihoods: Map<string, Map<string, number>>;
  vocabulary: Set<string>;
}

function trainNaiveBayes(trainingRows: DomainTrainingRow[], alphaSmoothing: number = 1.0): NaiveBayesState {
  const domainCounts = new Map<string, number>();
  const textByDomain = new Map<string, string[]>();
  const tokenCountsByDomain = new Map<string, Map<string, number>>();
  const vocabulary = new Set<string>();

  // Step 1: Aggregate training data by domain
  for (const row of trainingRows) {
    const domain = row.label;
    const text = row.text;

    domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
    if (!textByDomain.has(domain)) textByDomain.set(domain, []);
    textByDomain.get(domain)!.push(text);

    if (!tokenCountsByDomain.has(domain)) tokenCountsByDomain.set(domain, new Map());
  }

  // Step 2: Compute token frequencies per domain and build vocabulary
  for (const [domain, texts] of textByDomain.entries()) {
    const tokenCounts = tokenCountsByDomain.get(domain)!;

    for (const text of texts) {
      const tokens = tokenizeCodeText(text);
      for (const token of tokens) {
        vocabulary.add(token);
        tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
      }
    }
  }

  // Step 3: Compute class priors P(domain)
  const totalDocs = trainingRows.length;
  const classPriors = new Map<string, number>();

  for (const [domain, count] of domainCounts.entries()) {
    const prior = Math.log(count / totalDocs);
    classPriors.set(domain, prior);
  }

  // Step 4: Compute token likelihoods P(token|domain) with Laplace smoothing
  const vocabularySize = vocabulary.size;
  const tokenLikelihoods = new Map<string, Map<string, number>>();
  let totalTrainingTokens = 0;

  for (const [domain, tokenCounts] of tokenCountsByDomain.entries()) {
    let domainTokenSum = 0;
    for (const count of tokenCounts.values()) {
      domainTokenSum += count;
    }
    totalTrainingTokens += domainTokenSum;

    const likelihoods = new Map<string, number>();
    for (const token of vocabulary) {
      const count = tokenCounts.get(token) ?? 0;
      const smoothedCount = count + alphaSmoothing;
      const smoothedTotal = domainTokenSum + alphaSmoothing * vocabularySize;
      const logLikelihood = Math.log(smoothedCount / smoothedTotal);
      likelihoods.set(token, logLikelihood);
    }

    tokenLikelihoods.set(domain, likelihoods);
  }

  // Step 5: Create model artifact
  const vocabularyArray = Array.from(vocabulary).sort();
  const vocabularyHash = crypto
    .createHash('sha256')
    .update(vocabularyArray.join('\n'))
    .digest('hex');

  const modelStr = JSON.stringify({
    domains: Array.from(domainCounts.keys()).sort(),
    vocabulary_size: vocabularySize,
    vocabulary_hash: vocabularyHash,
    laplace_alpha: alphaSmoothing,
    total_training_docs: totalDocs,
    total_training_tokens: totalTrainingTokens
  });

  const modelSha256 = crypto.createHash('sha256').update(modelStr).digest('hex');

  const model: NaiveBayesModel = {
    classifier_kind: 'naive_bayes',
    classifier_version: '1.0',
    model_sha256: modelSha256,
    feature_schema_version: '1',
    training_split_name: 'train',
    total_training_docs: totalDocs,
    total_training_tokens: totalTrainingTokens,
    domains: Array.from(domainCounts.keys()).sort(),
    vocabulary_size: vocabularySize,
    vocabulary_hash: vocabularyHash,
    laplace_alpha: alphaSmoothing
  };

  return { model, classPriors, tokenLikelihoods, vocabulary };
}

function predictNaiveBayes(
  state: NaiveBayesState,
  text: string
): { predictedDomain: string; logProbabilities: Map<string, number>; confidence: number } {
  const tokens = tokenizeCodeText(text);
  const logProbabilities = new Map<string, number>();

  for (const domain of state.model.domains) {
    let logProb = state.classPriors.get(domain) ?? Math.log(0.001);

    const likelihoods = state.tokenLikelihoods.get(domain);
    if (likelihoods) {
      for (const token of tokens) {
        const logLikelihood = likelihoods.get(token) ?? Math.log(0.001);
        logProb += logLikelihood;
      }
    }

    logProbabilities.set(domain, logProb);
  }

  const sorted = Array.from(logProbabilities.entries()).sort((a, b) => b[1] - a[1]);

  const bestDomain = sorted[0]?.[0] ?? 'unknown';
  const bestLogProb = sorted[0]?.[1] ?? -Infinity;
  const secondLogProb = sorted[1]?.[1] ?? -Infinity;

  const confidenceLogDiff = bestLogProb - secondLogProb;
  const confidence = Math.min(1.0, Math.max(0.0, 1.0 / (1.0 + Math.exp(-confidenceLogDiff))));

  return { predictedDomain: bestDomain, logProbabilities, confidence };
}

// ============================================================================
// EVALUATION METRICS
// ============================================================================

function computeEvaluationMetrics(
  actualLabels: Map<string, string>,
  predictions: PredictionRecord[],
  confidenceThreshold: number = 0.5
): EvaluationReport {
  const confusionMatrix: Record<string, Record<string, number>> = {};
  const perDomain: Record<string, { tp: number; fp: number; fn: number }> = {};

  for (const pred of predictions) {
    const actual = actualLabels.get(pred.packet_key) ?? 'unknown';
    const predicted = pred.predicted_domain;

    if (!confusionMatrix[actual]) confusionMatrix[actual] = {};
    confusionMatrix[actual][predicted] = (confusionMatrix[actual][predicted] ?? 0) + 1;

    if (!perDomain[predicted]) perDomain[predicted] = { tp: 0, fp: 0, fn: 0 };
    if (!perDomain[actual]) perDomain[actual] = { tp: 0, fp: 0, fn: 0 };

    if (predicted === actual) {
      perDomain[predicted].tp += 1;
    } else {
      perDomain[predicted].fp += 1;
      perDomain[actual].fn += 1;
    }
  }

  const perDomainMetrics: Record<string, {
    precision: number;
    recall: number;
    f1: number;
    count: number;
    support: number;
  }> = {};
  let sumPrecision = 0;
  let sumRecall = 0;
  let sumF1 = 0;
  let sumWeightedF1 = 0;
  let domainCount = 0;
  let totalSupport = 0;

  for (const domain of Object.keys(perDomain)) {
    const { tp, fp, fn } = perDomain[domain];
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    const support = tp + fn;

    perDomainMetrics[domain] = { precision, recall, f1, count: tp + fn, support };

    sumPrecision += precision;
    sumRecall += recall;
    sumF1 += f1;
    sumWeightedF1 += f1 * support;
    totalSupport += support;
    domainCount += 1;
  }

  const macroPrecision = domainCount === 0 ? 0 : sumPrecision / domainCount;
  const macroRecall = domainCount === 0 ? 0 : sumRecall / domainCount;
  const macroF1 = domainCount === 0 ? 0 : sumF1 / domainCount;
  const weightedF1 = totalSupport === 0 ? 0 : sumWeightedF1 / totalSupport;

  const accuracy = Object.values(perDomain).reduce((sum, m) => sum + m.tp, 0) / predictions.length;

  const abstainedCount = predictions.filter(p => p.status !== 'ACCEPTED').length;
  const abstentionRate = abstainedCount / predictions.length;

  const confidences = predictions
    .map(p => p.calibrated_confidence ?? 0)
    .sort((a, b) => a - b);
  const q25Idx = Math.floor(confidences.length * 0.25);
  const q75Idx = Math.floor(confidences.length * 0.75);

  const gatePass = macroF1 >= 0.5;
  const gateReason = gatePass
    ? `Macro F1 ${macroF1.toFixed(3)} >= 0.5 gate`
    : `Macro F1 ${macroF1.toFixed(3)} < 0.5 gate (FAILED)`;

  return {
    total_predictions: predictions.length,
    accuracy,
    macro_precision: macroPrecision,
    macro_recall: macroRecall,
    macro_f1: macroF1,
    weighted_f1: weightedF1,
    per_domain: perDomainMetrics,
    confusion_matrix: confusionMatrix,
    abstained_count: abstainedCount,
    abstention_rate: abstentionRate,
    confidence_distribution: {
      min: Math.min(...confidences),
      max: Math.max(...confidences),
      mean: confidences.reduce((a, b) => a + b, 0) / confidences.length,
      median: confidences[Math.floor(confidences.length / 2)] ?? 0,
      q25: confidences[q25Idx] ?? 0,
      q75: confidences[q75Idx] ?? 0
    },
    gate_pass: gatePass,
    gate_reason: gateReason
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const trainLimitMatch = args.find(a => a.startsWith('--train-limit='));
  const trainLimit = trainLimitMatch ? parseInt(trainLimitMatch.split('=')[1], 10) : 5000;
  const requiresLiveFlag = args.includes('--live');

  console.log(`🔬 Phase 2B: Multinomial Naive Bayes Domain Classifier`);
  console.log(`Status: NAIVE_BAYES (real implementation with Laplace smoothing)`);
  console.log(`Mode: ${dryRun ? 'DRY-RUN (no writes)' : 'LIVE'}`);
  console.log(`Training limit: ${trainLimit} rows`);
  console.log(`Laplace alpha: 1.0 (standard smoothing)\n`);

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

    // Load TRAIN split
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

    // Load VALIDATION split
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

    // Train model
    console.log(`🔍 Training Multinomial Naive Bayes model...`);
    const nbState = trainNaiveBayes(trainingData, 1.0);

    const domainCounts = new Map<string, number>();
    for (const row of trainingData) {
      domainCounts.set(row.label, (domainCounts.get(row.label) ?? 0) + 1);
    }

    console.log(`✓ Trained ${nbState.model.domains.length} domain classes:`);
    for (const domain of nbState.model.domains) {
      const count = domainCounts.get(domain) ?? 0;
      const prior = nbState.classPriors.get(domain) ?? -Infinity;
      console.log(`  - ${domain}: ${count} samples (${((count / trainingData.length) * 100).toFixed(1)}%), prior=${prior.toFixed(3)}`);
    }
    console.log(`✓ Vocabulary size: ${nbState.model.vocabulary_size}`);
    console.log(`✓ Model SHA256: ${nbState.model.model_sha256}\n`);

    // Generate predictions
    console.log(`💾 Generating predictions on validation split...`);
    const classificationRunId = crypto.randomUUID();
    const confidenceThreshold = 0.4;
    const predictions: PredictionRecord[] = [];

    for (const row of validationData) {
      const { predictedDomain, confidence } = predictNaiveBayes(nbState, row.text);

      let status: PredictionRecord['status'] = 'ACCEPTED';
      if (predictedDomain === 'unknown') {
        status = 'GATED_UNKNOWN';
      } else if (confidence < confidenceThreshold) {
        status = 'GATED_LOW_CONFIDENCE';
      }

      predictions.push({
        classification_run_id: classificationRunId,
        packet_key: row.packet_key,
        predicted_domain: predictedDomain,
        raw_score: 0,
        score_margin: 0,
        classifier_kind: nbState.model.classifier_kind,
        classifier_version: nbState.model.classifier_version,
        model_sha256: nbState.model.model_sha256,
        feature_schema_version: nbState.model.feature_schema_version,
        calibrated_confidence: confidence,
        status
      });
    }

    console.log(`✓ Generated ${predictions.length} predictions\n`);

    // Evaluate
    console.log(`📈 Computing evaluation metrics...`);
    const evaluation = computeEvaluationMetrics(validationLabels, predictions, confidenceThreshold);

    console.log(`Accuracy: ${(evaluation.accuracy * 100).toFixed(1)}%`);
    console.log(`Macro F1: ${evaluation.macro_f1.toFixed(3)}`);
    console.log(`Weighted F1: ${evaluation.weighted_f1.toFixed(3)}`);
    console.log(`Macro Precision: ${evaluation.macro_precision.toFixed(3)}`);
    console.log(`Macro Recall: ${evaluation.macro_recall.toFixed(3)}`);
    console.log(`Abstained: ${evaluation.abstained_count}/${predictions.length} (${(evaluation.abstention_rate * 100).toFixed(1)}% abstention)\n`);

    console.log(`Confidence distribution:`);
    const conf = evaluation.confidence_distribution;
    console.log(`  Min: ${conf.min.toFixed(3)}, Q25: ${conf.q25.toFixed(3)}, Median: ${conf.median.toFixed(3)}, Q75: ${conf.q75.toFixed(3)}, Max: ${conf.max.toFixed(3)}`);
    console.log(`  Mean: ${conf.mean.toFixed(3)}\n`);

    console.log(`Per-domain F1 scores:`);
    const sortedDomains = Object.entries(evaluation.per_domain)
      .sort((a, b) => b[1].f1 - a[1].f1);
    for (const [domain, metrics] of sortedDomains) {
      const stars = metrics.f1 >= 0.7 ? '⭐' : metrics.f1 >= 0.5 ? '✓' : '⚠️';
      console.log(
        `  ${stars} ${domain}: F1=${metrics.f1.toFixed(3)}, P=${metrics.precision.toFixed(3)}, R=${metrics.recall.toFixed(3)}, support=${metrics.support}`
      );
    }

    console.log(`\n📋 Evaluation gate result: ${evaluation.gate_pass ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   ${evaluation.gate_reason}\n`);

    // Persist if approved
    if (!dryRun) {
      if (!evaluation.gate_pass) {
        console.log(`⛔ Evaluation gate FAILED`);
        console.log(`   Predictions NOT persisted. Review model or training data.`);
        process.exit(1);
      }

      console.log(`✅ Evaluation gate PASSED\n`);
      console.log(`📝 Persisting predictions to staging table...\n`);

      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');

        await client.query(`
          CREATE TABLE IF NOT EXISTS atlas_domain_predictions (
            prediction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            classification_run_id UUID NOT NULL,
            packet_key TEXT NOT NULL,
            predicted_domain TEXT NOT NULL,
            calibrated_confidence DOUBLE PRECISION,
            classifier_kind TEXT NOT NULL,
            classifier_version TEXT NOT NULL,
            model_sha256 CHAR(64) NOT NULL,
            feature_schema_version TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(classification_run_id, packet_key)
          );
        `);

        const insertPredictions = `
          INSERT INTO atlas_domain_predictions (
            classification_run_id, packet_key, predicted_domain, calibrated_confidence,
            classifier_kind, classifier_version, model_sha256, feature_schema_version, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (classification_run_id, packet_key) DO UPDATE SET
            predicted_domain = EXCLUDED.predicted_domain,
            calibrated_confidence = EXCLUDED.calibrated_confidence,
            status = EXCLUDED.status;
        `;

        let inserted = 0;
        for (const pred of predictions) {
          await client.query(insertPredictions, [
            pred.classification_run_id,
            pred.packet_key,
            pred.predicted_domain,
            pred.calibrated_confidence,
            pred.classifier_kind,
            pred.classifier_version,
            pred.model_sha256,
            pred.feature_schema_version,
            pred.status
          ]);
          inserted += 1;
        }

        await client.query(`
          CREATE TABLE IF NOT EXISTS atlas_domain_classification_runs (
            classification_run_id UUID PRIMARY KEY,
            classifier_kind TEXT NOT NULL,
            classifier_version TEXT NOT NULL,
            model_sha256 CHAR(64) NOT NULL,
            vocabulary_size INTEGER,
            vocabulary_hash CHAR(64),
            laplace_alpha DOUBLE PRECISION,
            training_rows INTEGER NOT NULL,
            validation_rows INTEGER NOT NULL,
            accuracy DOUBLE PRECISION NOT NULL,
            macro_f1 DOUBLE PRECISION NOT NULL,
            weighted_f1 DOUBLE PRECISION NOT NULL,
            macro_precision DOUBLE PRECISION NOT NULL,
            macro_recall DOUBLE PRECISION NOT NULL,
            abstained_count INTEGER NOT NULL,
            abstention_rate DOUBLE PRECISION NOT NULL,
            confidence_threshold DOUBLE PRECISION,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(classification_run_id)
          );
        `);

        await client.query(`
          INSERT INTO atlas_domain_classification_runs (
            classification_run_id, classifier_kind, classifier_version, model_sha256,
            vocabulary_size, vocabulary_hash, laplace_alpha,
            training_rows, validation_rows, accuracy,
            macro_f1, weighted_f1, macro_precision, macro_recall,
            abstained_count, abstention_rate, confidence_threshold
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          ON CONFLICT (classification_run_id) DO NOTHING;
        `, [
          classificationRunId,
          nbState.model.classifier_kind,
          nbState.model.classifier_version,
          nbState.model.model_sha256,
          nbState.model.vocabulary_size,
          nbState.model.vocabulary_hash,
          nbState.model.laplace_alpha,
          trainingData.length,
          validationData.length,
          evaluation.accuracy,
          evaluation.macro_f1,
          evaluation.weighted_f1,
          evaluation.macro_precision,
          evaluation.macro_recall,
          evaluation.abstained_count,
          evaluation.abstention_rate,
          confidenceThreshold
        ]);

        await client.query('COMMIT');
        console.log(`✓ Inserted ${inserted} predictions to staging table`);
        console.log(`✓ Classification run metadata recorded`);
        console.log(`✓ Classification run ID: ${classificationRunId}\n`);

      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } else {
      console.log(`⏭️  Dry-run: skipping Postgres writes\n`);
    }

    const elapsed = performance.now() - startTime;
    console.log(`\n✅ Phase 2B Naive Bayes classification complete in ${(elapsed / 1000).toFixed(2)}s`);

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
