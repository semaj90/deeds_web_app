#!/usr/bin/env node
/**
 * Compile trained scikit-learn Naive Bayes models to the dictionary JSON format
 * consumed by apply-naive-bayes-predictions.mjs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const MODELS_DIR = path.join(REPO_ROOT, 'sveltekit-frontend', 'models');
const TMP_DIR = path.join(REPO_ROOT, '.tmp');

const NB_MODELS_PATH = path.join(MODELS_DIR, 'naive_bayes_models.json');
const VECTORIZER_PATH = path.join(MODELS_DIR, 'tfidf_vectorizer.json');
const OUTPUT_MODEL_PATH = path.join(TMP_DIR, 'semantic-naive-bayes-model.json');

function main() {
  if (!fs.existsSync(NB_MODELS_PATH) || !fs.existsSync(VECTORIZER_PATH)) {
    console.error('Trained model or vectorizer JSON not found in sveltekit-frontend/models');
    process.exit(1);
  }

  const models = JSON.parse(fs.readFileSync(NB_MODELS_PATH, 'utf8'));
  const vectorizer = JSON.parse(fs.readFileSync(VECTORIZER_PATH, 'utf8'));

  // Target the error_state model for packet anomaly classification
  const targetModel = models.error_state;
  if (!targetModel) {
    console.error('error_state model not found in naive_bayes_models.json');
    process.exit(1);
  }

  const vocabWords = Object.keys(vectorizer.vocabulary);
  const priors = {};
  targetModel.classes.forEach((cls, idx) => {
    priors[cls] = targetModel.class_log_prior[idx];
  });

  const logLikelihoods = {};
  targetModel.classes.forEach((cls, clsIdx) => {
    const classLL = {};
    for (const [word, wordIdx] of Object.entries(vectorizer.vocabulary)) {
      classLL[word] = targetModel.feature_log_prob[clsIdx][wordIdx];
    }
    logLikelihoods[cls] = classLL;
  });

  const compiled = {
    model_version: 'nb-packet-features-v2-multiclass',
    target: 'error_state',
    accuracy: targetModel.accuracy,
    classes: targetModel.classes,
    priors,
    vocabulary: vocabWords,
    log_likelihoods: logLikelihoods,
    compiledAt: new Date().toISOString(),
  };

  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_MODEL_PATH, JSON.stringify(compiled, null, 2), 'utf8');
  console.log(`[OK] Successfully compiled multi-class model to ${OUTPUT_MODEL_PATH}`);
  console.log(`     Target: error_state (${targetModel.classes.length} classes: ${targetModel.classes.join(', ')})`);
  console.log(`     Vocabulary size: ${vocabWords.length} features`);
  console.log(`     Accuracy: ${(targetModel.accuracy * 100).toFixed(1)}%`);
}

main();
