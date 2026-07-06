#!/usr/bin/env node
/**
 * Phase 106: Train Naive Bayes Packet Classifier
 *
 * Reads rejected semantic training rows (from export-rejected-semantic-training-rows.mjs)
 * and trains Naive Bayes models in JSON format for error state prediction.
 *
 * Input: .tmp/rejected-semantic-training-rows.ndjson
 * Output: models/naive-bayes-rejected-errors.json (trained model)
 *         docs/reports/naive-bayes-training-report.json (metrics + samples)
 *
 * Model predicts: error_state (suggested_label) based on failure patterns
 * Classes: IdentityError, VectorError, QdrantBridgeError, SemanticError,
 *          StructureError, TopologyError, TreePropagationError, CachePromotionError
 *
 * Naive Bayes formula:
 *   P(error_class | features) = P(features | error_class) * P(error_class) / P(features)
 *   Naive assumption: features are independent given the class
 *
 * Usage:
 *   npm run atlas:train:naive-bayes:dry --limit=100
 *   npm run atlas:train:naive-bayes:apply --limit=500
 */

import fs from 'fs';
import path from 'path';

const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry');
const limit = parseInt(
  process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] ?? '500'
);

/**
 * Simple Naive Bayes classifier in JSON (no pickle, no sklearn)
 * Stores: class priors, feature conditional probabilities per class, feature vocabulary
 */
class NaiveBayesClassifier {
  constructor() {
    this.classPriors = {};      // P(class)
    this.featureProbs = {};     // P(feature | class)
    this.vocabulary = new Set(); // all observed features
    this.classes = new Set();
    this.alpha = 1.0;           // Laplace smoothing
  }

  train(samples) {
    // Initialize
    samples.forEach(s => this.classes.add(s.suggested_label));
    const classDocCount = {};
    const featureClassCount = {}; // [feature][class] -> count

    // Count occurrences
    for (const sample of samples) {
      const cls = sample.suggested_label;
      classDocCount[cls] = (classDocCount[cls] || 0) + 1;

      // Extract features from the sample
      const features = this.extractFeatures(sample);
      features.forEach(feat => {
        this.vocabulary.add(feat);
        if (!featureClassCount[feat]) featureClassCount[feat] = {};
        featureClassCount[feat][cls] = (featureClassCount[feat][cls] || 0) + 1;
      });
    }

    // Calculate priors: P(class) = count(class) / total_documents
    const totalDocs = samples.length;
    for (const cls of this.classes) {
      this.classPriors[cls] = classDocCount[cls] / totalDocs;
    }

    // Calculate conditional probabilities: P(feature | class)
    // Using Laplace smoothing to avoid zero probabilities
    this.featureProbs = {};
    for (const feature of this.vocabulary) {
      this.featureProbs[feature] = {};
      for (const cls of this.classes) {
        const count = featureClassCount[feature]?.[cls] || 0;
        const classTotal = classDocCount[cls] || 1;
        // Laplace: (count + alpha) / (classTotal + alpha * vocab_size)
        this.featureProbs[feature][cls] =
          (count + this.alpha) / (classTotal + this.alpha * this.vocabulary.size);
      }
    }
  }

  predict(sample) {
    const features = this.extractFeatures(sample);
    const scores = {};

    // Calculate log probability for each class (log to avoid underflow)
    for (const cls of this.classes) {
      let logProb = Math.log(this.classPriors[cls] || 1e-10);

      for (const feature of features) {
        const prob = this.featureProbs[feature]?.[cls] || (this.alpha / (1 + this.alpha * this.vocabulary.size));
        logProb += Math.log(prob);
      }

      scores[cls] = logProb;
    }

    // Return class with highest score
    const predictedClass = Object.entries(scores).reduce((max, [cls, score]) =>
      score > max.score ? { cls, score } : max
    , { cls: null, score: -Infinity }).cls;

    return {
      predicted_label: predictedClass,
      confidence: Math.exp(scores[predictedClass] - Math.max(...Object.values(scores))), // softmax approximation
      all_scores: scores
    };
  }

  extractFeatures(sample) {
    const features = [];

    // Feature 1: failure type (hard_failures[0])
    if (sample.failure_reason) {
      features.push(`failure:${sample.failure_reason}`);
    }

    // Feature 2: missing fields
    if (sample.missing_fields && sample.missing_fields.length > 0) {
      sample.missing_fields.forEach(field => {
        features.push(`missing:${field}`);
      });
    }

    // Feature 3: semantic lane status
    if (sample.semantic_lane_status) {
      features.push(`lane:${sample.semantic_lane_status}`);
    }

    // Feature 4: presence indicators
    features.push(`qdrant_present:${sample.qdrant_point_id_present}`);
    features.push(`topology_present:${sample.topology_present}`);
    features.push(`tree_node_present:${sample.tree_node_id_present}`);

    // Feature 5: domain class (if available)
    if (sample.domain_class && sample.domain_class !== 'unknown') {
      features.push(`domain:${sample.domain_class}`);
    }

    return features;
  }

  toJSON() {
    return {
      classPriors: this.classPriors,
      featureProbs: this.featureProbs,
      vocabulary: Array.from(this.vocabulary),
      classes: Array.from(this.classes),
      alpha: this.alpha
    };
  }

  static fromJSON(data) {
    const classifier = new NaiveBayesClassifier();
    classifier.classPriors = data.classPriors;
    classifier.featureProbs = data.featureProbs;
    classifier.vocabulary = new Set(data.vocabulary);
    classifier.classes = new Set(data.classes);
    classifier.alpha = data.alpha;
    return classifier;
  }
}

async function main() {
  console.log(`\n[PHASE 106] Train Naive Bayes Packet Classifier [${isDryRun ? 'DRY-RUN' : 'APPLY'}]\n`);

  try {
    // 1. Read training data
    console.log('Step 1: Read training dataset...');

    const trainingPath = path.join(process.cwd(), '.tmp', 'rejected-semantic-training-rows.ndjson');
    if (!fs.existsSync(trainingPath)) {
      console.log(`  [WARN] No training data found at ${trainingPath}\n`);
      console.log('[SUCCESS] No model to train.\n');
      process.exit(0);
    }

    const trainingContent = fs.readFileSync(trainingPath, 'utf-8');
    const trainingLines = trainingContent
      .trim()
      .split('\n')
      .filter(line => line.length > 0)
      .map((line, idx) => {
        try {
          return JSON.parse(line);
        } catch (err) {
          console.warn(`  Line ${idx + 1}: parse error, skipping`);
          return null;
        }
      })
      .filter(r => r !== null);

    console.log(`  [OK] Found ${trainingLines.length} training samples\n`);

    if (trainingLines.length === 0) {
      console.log('[SUCCESS] No training samples.\n');
      process.exit(0);
    }

    // 2. Split into train/val/test
    console.log('Step 2: Split dataset...');

    const trainSamples = trainingLines.filter(r => r.training_split === 'train');
    const valSamples = trainingLines.filter(r => r.training_split === 'val');
    const testSamples = trainingLines.filter(r => r.training_split === 'test');

    console.log(`  Train: ${trainSamples.length}, Val: ${valSamples.length}, Test: ${testSamples.length}\n`);

    if (trainSamples.length === 0) {
      console.log('[SUCCESS] No training samples to train on.\n');
      process.exit(0);
    }

    // 3. Train classifier
    console.log('Step 3: Train Naive Bayes classifier...');

    const classifier = new NaiveBayesClassifier();
    classifier.train(trainSamples);

    console.log(`  [OK] Trained on ${trainSamples.length} samples\n`);
    console.log(`  Classes: ${Array.from(classifier.classes).join(', ')}`);
    console.log(`  Vocabulary size: ${classifier.vocabulary.size}\n`);

    if (isDryRun) {
      // 4. Evaluate on validation set (dry-run)
      console.log('Step 4: Evaluate on validation set (dry-run)...');

      let correctCount = 0;
      const confusionMatrix = {};

      for (const sample of valSamples.slice(0, Math.min(valSamples.length, 20))) {
        const prediction = classifier.predict(sample);
        const actual = sample.suggested_label;

        if (prediction.predicted_label === actual) {
          correctCount++;
        }

        // Track for confusion matrix
        const key = `${actual}→${prediction.predicted_label}`;
        confusionMatrix[key] = (confusionMatrix[key] || 0) + 1;
      }

      const valSampleSize = Math.min(valSamples.length, 20);
      const accuracy = (correctCount / valSampleSize * 100).toFixed(1);

      console.log(`  Sample predictions (first 20 val samples):`);
      console.log(`    Accuracy: ${accuracy}%`);
      console.log(`    Correct: ${correctCount}/${valSampleSize}\n`);

      console.log('  Confusion matrix (sample):');
      Object.entries(confusionMatrix).forEach(([key, count]) => {
        console.log(`    ${key}: ${count}`);
      });
      console.log();

      console.log('Sample predictions:');
      valSamples.slice(0, 3).forEach((sample, idx) => {
        const pred = classifier.predict(sample);
        console.log(`  [${idx + 1}] Actual: ${sample.suggested_label}`);
        console.log(`       Predicted: ${pred.predicted_label} (confidence: ${(pred.confidence * 100).toFixed(1)}%)`);
        console.log();
      });

      console.log('[OK] Dry-run complete. Use apply to save model.\n');
      process.exit(0);
    }

    // 5. Evaluate on validation set (apply mode)
    console.log('Step 4: Evaluate on validation set...');

    let correctCount = 0;
    const classAccuracy = {};

    for (const sample of valSamples) {
      const prediction = classifier.predict(sample);
      const actual = sample.suggested_label;

      if (prediction.predicted_label === actual) {
        correctCount++;
      }

      // Per-class accuracy
      if (!classAccuracy[actual]) {
        classAccuracy[actual] = { correct: 0, total: 0 };
      }
      classAccuracy[actual].total++;
      if (prediction.predicted_label === actual) {
        classAccuracy[actual].correct++;
      }
    }

    const valAccuracy = (correctCount / valSamples.length * 100).toFixed(2);
    console.log(`  [OK] Validation accuracy: ${valAccuracy}%\n`);

    // 6. Save model
    console.log('Step 5: Save model...');

    const modelsDir = path.join(process.cwd(), 'models');
    if (!fs.existsSync(modelsDir)) fs.mkdirSync(modelsDir, { recursive: true });

    const modelPath = path.join(modelsDir, 'naive-bayes-rejected-errors.json');
    const modelJson = {
      trained_at: new Date().toISOString(),
      model: classifier.toJSON(),
      metadata: {
        training_samples: trainSamples.length,
        validation_samples: valSamples.length,
        test_samples: testSamples.length,
        vocabulary_size: classifier.vocabulary.size,
        num_classes: classifier.classes.size,
        validation_accuracy: parseFloat(valAccuracy)
      }
    };

    fs.writeFileSync(modelPath, JSON.stringify(modelJson, null, 2));
    console.log(`  [OK] Model saved to ${modelPath}\n`);

    // 7. Generate report
    console.log('Step 6: Generate training report...');

    const reportsDir = path.join(process.cwd(), 'docs', 'reports');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

    const report = {
      timestamp: new Date().toISOString(),
      model_path: modelPath,
      summary: {
        total_training_samples: trainSamples.length,
        total_validation_samples: valSamples.length,
        total_test_samples: testSamples.length,
        validation_accuracy: parseFloat(valAccuracy),
        vocabulary_size: classifier.vocabulary.size,
        num_classes: classifier.classes.size
      },
      class_distribution: {
        training: {},
        validation: {},
        test: {}
      },
      class_accuracy: classAccuracy,
      top_features: Array.from(classifier.vocabulary)
        .slice(0, 20)
        .map(f => ({ feature: f, classes: classifier.featureProbs[f] }))
    };

    // Class distribution
    trainSamples.forEach(s => {
      const cls = s.suggested_label;
      report.class_distribution.training[cls] = (report.class_distribution.training[cls] || 0) + 1;
    });
    valSamples.forEach(s => {
      const cls = s.suggested_label;
      report.class_distribution.validation[cls] = (report.class_distribution.validation[cls] || 0) + 1;
    });
    testSamples.forEach(s => {
      const cls = s.suggested_label;
      report.class_distribution.test[cls] = (report.class_distribution.test[cls] || 0) + 1;
    });

    const reportPath = path.join(reportsDir, 'naive-bayes-training-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`  [OK] Report written to ${reportPath}\n`);

    // 8. Summary
    console.log('Training Summary:');
    console.log(`  Training samples: ${trainSamples.length}`);
    console.log(`  Validation accuracy: ${valAccuracy}%`);
    console.log(`  Classes trained: ${Array.from(classifier.classes).join(', ')}`);
    console.log(`  Vocabulary size: ${classifier.vocabulary.size}`);
    console.log();

    console.log('Per-class validation accuracy:');
    Object.entries(classAccuracy).forEach(([cls, acc]) => {
      const pct = (acc.correct / acc.total * 100).toFixed(1);
      console.log(`  ${cls}: ${acc.correct}/${acc.total} (${pct}%)`);
    });
    console.log();

    console.log('[SUCCESS] Naive Bayes Model Trained.\n');
    process.exit(0);
  } catch (error) {
    console.error(`[ERROR] ${error.message}`);
    process.exit(1);
  }
}

main();
