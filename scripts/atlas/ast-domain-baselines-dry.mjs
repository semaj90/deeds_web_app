#!/usr/bin/env node
/**
 * Read-only AST-grep/NLP domain baseline evaluation.
 *
 * Consumes the Graphify AST domain candidate JSONL and evaluates two small,
 * deterministic baselines over the same token stream. This is a wiring and
 * comparison receipt, not a promotion path: labels are the existing OKF
 * candidate labels and no database, model, or cache writes are performed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = process.cwd().toLowerCase().endsWith(`${path.sep}sveltekit-frontend`)
  ? path.dirname(process.cwd())
  : process.cwd();
const args = new Map(process.argv.slice(2).filter((arg) => arg.startsWith('--')).map((arg) => {
  const [key, value = 'true'] = arg.slice(2).split('=', 2);
  return [key, value];
}));
const input = path.resolve(root, String(args.get('input') ?? '.tmp/atlas/graphify-file-index-v1/ast-entity-okf-domain.jsonl'));
const reportPath = path.resolve(root, String(args.get('out') ?? 'docs/reports/ast-domain-baselines-dry-v1.json'));
const limit = Math.max(1, Number(args.get('limit') ?? 10000));
const testFraction = 0.2;
const featureBuckets = 256;
const epochs = 18;

function stableFraction(value) {
  return parseInt(createHash('sha256').update(value).digest('hex').slice(0, 8), 16) / 0xffffffff;
}

function tokensFor(row) {
  const raw = [
    row.source_ref,
    row.symbol_name,
    row.symbol_kind,
    row.ast_kind,
    row.language,
    ...(Array.isArray(row.secondary_domains) ? row.secondary_domains : []),
    ...(Array.isArray(row.evidence) ? row.evidence.flatMap((item) => [item.kind, item.value]) : []),
  ].filter(Boolean).join(' ');
  return raw.toLowerCase().replace(/[^a-z0-9_./:-]+/g, ' ').split(/[\s./:-]+/).filter((token) => token.length > 1);
}

function bucket(token) {
  return parseInt(createHash('sha256').update(token).digest('hex').slice(0, 8), 16) % featureBuckets;
}

function vectorize(tokens) {
  const vector = new Float64Array(featureBuckets);
  for (const token of tokens) vector[bucket(token)] += 1;
  return vector;
}

function softmax(scores) {
  const max = Math.max(...scores);
  const exps = scores.map((score) => Math.exp(Math.max(-40, Math.min(40, score - max))));
  const total = exps.reduce((sum, value) => sum + value, 0) || 1;
  return exps.map((value) => value / total);
}

function fitNaiveBayes(rows, labels) {
  const counts = labels.map(() => new Float64Array(featureBuckets));
  const totals = new Float64Array(labels.length);
  const priors = new Float64Array(labels.length);
  for (const row of rows) {
    const label = labels.indexOf(row.label);
    priors[label] += 1;
    for (let i = 0; i < row.vector.length; i += 1) {
      counts[label][i] += row.vector[i];
      totals[label] += row.vector[i];
    }
  }
  const totalRows = rows.length || 1;
  return (vector) => {
    const scores = labels.map((_, label) => {
      let score = Math.log((priors[label] + 1) / (totalRows + labels.length));
      for (let i = 0; i < vector.length; i += 1) {
        if (vector[i] > 0) score += vector[i] * Math.log((counts[label][i] + 1) / (totals[label] + featureBuckets));
      }
      return score;
    });
    const probabilities = softmax(scores);
    const index = probabilities.indexOf(Math.max(...probabilities));
    return { label: labels[index], confidence: probabilities[index] };
  };
}

function fitLogistic(rows, labels) {
  const weights = labels.map(() => new Float64Array(featureBuckets));
  const learningRate = 0.08;
  for (let epoch = 0; epoch < epochs; epoch += 1) {
    for (const row of rows) {
      const scores = labels.map((_, label) => row.vector.reduce((sum, value, i) => sum + weights[label][i] * value, 0));
      const probabilities = softmax(scores);
      const actual = labels.indexOf(row.label);
      for (let label = 0; label < labels.length; label += 1) {
        const error = (label === actual ? 1 : 0) - probabilities[label];
        for (let i = 0; i < row.vector.length; i += 1) weights[label][i] += learningRate * error * row.vector[i];
      }
    }
  }
  return (vector) => {
    const probabilities = softmax(labels.map((_, label) => vector.reduce((sum, value, i) => sum + weights[label][i] * value, 0)));
    const index = probabilities.indexOf(Math.max(...probabilities));
    return { label: labels[index], confidence: probabilities[index] };
  };
}

function evaluate(rows, predict, labels) {
  const matrix = new Map(labels.map((label) => [label, new Map(labels.map((other) => [other, 0]))]));
  let correct = 0;
  for (const row of rows) {
    const result = predict(row.vector);
    if (result.label === row.label) correct += 1;
    matrix.get(row.label).set(result.label, matrix.get(row.label).get(result.label) + 1);
  }
  const f1 = labels.map((label) => {
    const tp = matrix.get(label).get(label);
    const fp = labels.reduce((sum, actual) => sum + (actual === label ? 0 : matrix.get(actual).get(label)), 0);
    const fn = labels.reduce((sum, predicted) => sum + (predicted === label ? 0 : matrix.get(label).get(predicted)), 0);
    const precision = tp / Math.max(1, tp + fp);
    const recall = tp / Math.max(1, tp + fn);
    return (2 * precision * recall) / Math.max(1e-9, precision + recall);
  });
  return { accuracy: rows.length ? correct / rows.length : 0, macroF1: f1.reduce((sum, value) => sum + value, 0) / Math.max(1, labels.length), evaluated: rows.length };
}

const report = {
  schema: 'atlas.ast-domain-baselines-dry.v1',
  readOnly: true,
  canonicalWrites: false,
  databaseWrites: false,
  input,
  featureContract: { extractor: 'ast-grep', nlp: 'tokenized structural/evidence fields', dimensions: featureBuckets, hash: 'sha256-modulo' },
  labelSource: 'OKF candidate domain_id',
  models: {},
};

try {
  const rows = fs.readFileSync(input, 'utf8').split(/\r?\n/).filter(Boolean).slice(0, limit).map((line) => JSON.parse(line)).filter((row) => row.domain_id);
  const labels = [...new Set(rows.map((row) => String(row.domain_id)))].sort();
  const prepared = rows.map((row) => ({ label: String(row.domain_id), vector: vectorize(tokensFor(row)) }));
  const train = prepared.filter((_, index) => stableFraction(rows[index].subject_ref ?? `${index}`) >= testFraction);
  const test = prepared.filter((_, index) => stableFraction(rows[index].subject_ref ?? `${index}`) < testFraction);
  const astGrepRows = rows.filter((row) =>
    String(row.schema ?? '').startsWith('atlas.ast-entity-okf-domain-candidate.')
    || row.evidence?.some((item) => item.kind === 'ast-grep' || item.source === 'ast-grep'),
  ).length;
  report.dataset = {
    selected: rows.length,
    train: train.length,
    test: test.length,
    labels,
    astGrepRows,
    astGrepProvenance: 'candidate schema or evidence marker',
  };
  report.models.naiveBayes = evaluate(test, fitNaiveBayes(train, labels), labels);
  report.models.logisticRegression = evaluate(test, fitLogistic(train, labels), labels);
  report.status = rows.length && train.length && test.length ? 'PASS_READ_ONLY_BASELINES' : 'BLOCKED_INSUFFICIENT_LABELED_ROWS';
} catch (error) {
  report.status = 'ERROR';
  report.error = String(error?.message ?? error);
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
