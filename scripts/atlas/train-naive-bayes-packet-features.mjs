#!/usr/bin/env node
/**
 * Phase 106: Train Naive Bayes packet-features model.
 *
 * JSON-only multinomial NB over the semantic training rows exported by
 * export-semantic-training-rows.mjs.
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const TMP_DIR = path.join(REPO_ROOT, '.tmp');
const REPORTS_DIR = path.join(REPO_ROOT, 'docs', 'reports');

const INPUT_NDJSON = path.join(TMP_DIR, 'semantic-training-rows.ndjson');
const MODEL_JSON = path.join(TMP_DIR, 'semantic-naive-bayes-model.json');
const REPORT_JSON = path.join(REPORTS_DIR, 'semantic-naive-bayes-train-report.json');
const REPORT_MD = path.join(REPORTS_DIR, 'semantic-naive-bayes-train-report.md');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run') || argv.includes('--dry');
const LIMIT = parseIntFlag(argv, '--limit', 5000);
const INPUT = argv.find((arg) => arg.startsWith('--input='))?.split('=')[1]
  ? path.resolve(REPO_ROOT, argv.find((arg) => arg.startsWith('--input='))?.split('=')[1])
  : INPUT_NDJSON;

function parseIntFlag(args, name, fallback) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) {
    const parsed = Number.parseInt(inline.slice(name.length + 1), 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const idx = args.findIndex((arg) => arg === name);
  if (idx >= 0 && args[idx + 1]) {
    const parsed = Number.parseInt(args[idx + 1], 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function readNdjson(filePath) {
  if (!fsSync.existsSync(filePath)) return [];
  return fsSync.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function tokensFromRow(row) {
  const tokens = [];
  const push = (prefix, values) => {
    for (const value of values ?? []) {
      const text = normalizeText(value).toLowerCase();
      if (!text) continue;
      tokens.push(`${prefix}:${text}`);
      for (const part of text.split(/[^a-z0-9_]+/g).filter(Boolean)) {
        tokens.push(`${prefix}_tok:${part}`);
      }
    }
  };

  push('ast', row.ast_symbols);
  push('lex', row.lexical_features);
  push('concept', row.used_concepts);
  push('entity', row.entities);
  push('miss', row.missing_fields);
  tokens.push(`label:${normalizeText(row.suggested_label).toLowerCase()}`);
  tokens.push(`split:${normalizeText(row.training_split).toLowerCase()}`);
  tokens.push(`status:${normalizeText(row.semantic_lane_status).toLowerCase()}`);
  if (normalizeText(row.domain_class)) tokens.push(`domain:${normalizeText(row.domain_class).toLowerCase()}`);
  if (normalizeText(row.feature_id)) tokens.push(`feature:${normalizeText(row.feature_id).toLowerCase()}`);
  if (normalizeText(row.source_ref)) {
    tokens.push(`source:${normalizeText(row.source_ref).toLowerCase()}`);
    for (const part of normalizeText(row.source_ref).toLowerCase().split(/[^a-z0-9_]+/g).filter(Boolean)) {
      tokens.push(`source_tok:${part}`);
    }
  }

  const booleans = {
    has_ast_symbols: row.has_ast_symbols,
    has_lexical_features: row.has_lexical_features,
    has_used_concepts: row.has_used_concepts,
    has_embedding: row.has_embedding,
    has_qdrant_point_id: row.has_qdrant_point_id,
    has_som: row.has_som,
    has_pagerank: row.has_pagerank,
    qdrant_point_id_present: row.qdrant_point_id_present,
    topology_present: row.topology_present,
    tree_node_id_present: row.tree_node_id_present,
  };

  for (const [key, value] of Object.entries(booleans)) {
    tokens.push(`${key}:${value ? '1' : '0'}`);
  }

  return tokens;
}

function trainMultinomialNb(rows) {
  const classCounts = new Map();
  const tokenCounts = new Map();
  const vocab = new Set();
  let totalRows = 0;

  for (const row of rows) {
    const label = normalizeText(row.suggested_label) || 'UNKNOWN';
    const tokens = tokensFromRow(row);
    classCounts.set(label, (classCounts.get(label) || 0) + 1);
    totalRows += 1;

    if (!tokenCounts.has(label)) tokenCounts.set(label, new Map());
    const labelCounts = tokenCounts.get(label);
    for (const token of tokens) {
      vocab.add(token);
      labelCounts.set(token, (labelCounts.get(token) || 0) + 1);
    }
  }

  const vocabulary = [...vocab].sort();
  const classNames = [...classCounts.keys()].sort();
  const priors = {};
  const logLikelihoods = {};

  for (const label of classNames) {
    const labelCounts = tokenCounts.get(label) || new Map();
    const totalTokens = [...labelCounts.values()].reduce((sum, count) => sum + count, 0);
    priors[label] = Math.log((classCounts.get(label) || 1) / Math.max(totalRows, 1));
    const denominator = totalTokens + vocabulary.length;
    logLikelihoods[label] = {};
    for (const token of vocabulary) {
      const count = labelCounts.get(token) || 0;
      logLikelihoods[label][token] = Math.log((count + 1) / Math.max(denominator, 1));
    }
  }

  return {
    model_version: 'nb-packet-features-v1',
    classes: classNames,
    priors,
    vocabulary,
    log_likelihoods: logLikelihoods,
    training_rows: totalRows,
  };
}

function renderMarkdown(report) {
  return [
    '# Naive Bayes Packet Features Training',
    '',
    `Generated: ${report.generatedAt}`,
    `Mode: ${report.mode}`,
    '',
    '## Summary',
    '',
    `- training rows: ${report.summary.trainingRows}`,
    `- classes: ${report.summary.classes.join(', ')}`,
    `- vocabulary size: ${report.summary.vocabularySize}`,
    '',
    '## Next Safe Action',
    '',
    report.nextSafeAction,
    '',
  ].join('\n');
}

async function main() {
  const rows = readNdjson(INPUT).slice(0, LIMIT);
  if (rows.length === 0) {
    throw new Error(`No training rows found at ${INPUT}`);
  }

  const model = trainMultinomialNb(rows);
  await fs.mkdir(TMP_DIR, { recursive: true });
  await fs.mkdir(REPORTS_DIR, { recursive: true });
  await fs.writeFile(MODEL_JSON, `${JSON.stringify(model, null, 2)}\n`, 'utf8');

  const report = {
    generatedAt: new Date().toISOString(),
    mode: DRY_RUN ? 'dry-run' : 'train',
    inputs: {
      ndjson: path.relative(REPO_ROOT, INPUT).replace(/\\/g, '/'),
    },
    outputs: {
      model: path.relative(REPO_ROOT, MODEL_JSON).replace(/\\/g, '/'),
    },
    summary: {
      trainingRows: model.training_rows,
      classes: model.classes,
      vocabularySize: model.vocabulary.length,
    },
    nextSafeAction: 'Apply predictions to atlas_packet_metrics.naive_bayes_predictions, then route HMM states to kanban actions.',
  };

  await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(REPORT_MD, `${renderMarkdown(report)}\n`, 'utf8');

  console.log(JSON.stringify({
    status: 'READY',
    trainingRows: model.training_rows,
    classes: model.classes.length,
    vocabularySize: model.vocabulary.length,
    model: path.relative(REPO_ROOT, MODEL_JSON).replace(/\\/g, '/'),
  }, null, 2));
}

main().catch((error) => {
  console.error('[train-naive-bayes-packet-features] failed:', error?.stack || error?.message || String(error));
  process.exit(1);
});
