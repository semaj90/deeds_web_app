#!/usr/bin/env node
/**
 * Phase 106: Apply Naive Bayes predictions.
 *
 * Writes JSONB predictions to atlas_packet_metrics.naive_bayes_predictions.
 * No ACP jobs, no identity mutation.
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const TMP_DIR = path.join(REPO_ROOT, '.tmp');
const REPORTS_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const MODEL_JSON = path.join(TMP_DIR, 'semantic-naive-bayes-model.json');
const OUTPUT_JSONL = path.join(TMP_DIR, 'naive-bayes-predictions.ndjson');
const REPORT_JSON = path.join(REPORTS_DIR, 'naive-bayes-predictions.json');
const REPORT_MD = path.join(REPORTS_DIR, 'naive-bayes-predictions.md');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run') || argv.includes('--dry');
const LIMIT = parseIntFlag(argv, '--limit', 500);
const OFFSET = parseIntFlag(argv, '--offset', 0);
const MODEL = argv.find((arg) => arg.startsWith('--model='))?.split('=')[1]
  ? path.resolve(REPO_ROOT, argv.find((arg) => arg.startsWith('--model='))?.split('=')[1])
  : MODEL_JSON;

const env = loadRepoEnv(process.env);
const pool = new Pool({ connectionString: resolveDatabaseUrl(env) });

function parseIntFlag(args, name, fallback) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) {
    const parsed = Number.parseInt(inline.slice(name.length + 1), 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  const idx = args.findIndex((arg) => arg === name);
  if (idx >= 0 && args[idx + 1]) {
    const parsed = Number.parseInt(args[idx + 1], 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return fallback;
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function tokenize(value) {
  return normalizeText(value).toLowerCase().split(/[^a-z0-9_]+/g).filter(Boolean);
}

function readJson(absPath) {
  if (!fsSync.existsSync(absPath)) return null;
  return JSON.parse(fsSync.readFileSync(absPath, 'utf8'));
}

async function tableExists(client, tableName) {
  const { rows } = await client.query(`SELECT to_regclass($1) IS NOT NULL AS exists`, [`public.${tableName}`]);
  return rows[0]?.exists === true;
}

async function getColumns(client, tableName) {
  const { rows } = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
  `, [tableName]);
  return new Set(rows.map((row) => row.column_name));
}

function buildTokens(row) {
  const tokens = [];
  const add = (prefix, values) => {
    for (const value of values ?? []) {
      const text = normalizeText(value).toLowerCase();
      if (!text) continue;
      tokens.push(`${prefix}:${text}`);
      for (const part of tokenize(text)) tokens.push(`${prefix}_tok:${part}`);
    }
  };
  add('ast', row.ast_symbols);
  add('lex', row.lexical_features);
  add('concept', row.used_concepts);
  add('entity', row.entities);
  add('miss', row.missing_fields);
  tokens.push(`domain:${normalizeText(row.domain_class).toLowerCase()}`);
  tokens.push(`feature:${normalizeText(row.feature_id).toLowerCase()}`);
  tokens.push(`status:${normalizeText(row.semantic_lane_status).toLowerCase()}`);
  tokens.push(`label:${normalizeText(row.suggested_label).toLowerCase()}`);
  tokens.push(`split:${normalizeText(row.training_split).toLowerCase()}`);
  tokens.push(`has_ast:${row.has_ast_symbols ? '1' : '0'}`);
  tokens.push(`has_lex:${row.has_lexical_features ? '1' : '0'}`);
  tokens.push(`has_concepts:${row.has_used_concepts ? '1' : '0'}`);
  tokens.push(`has_embedding:${row.has_embedding ? '1' : '0'}`);
  tokens.push(`has_qdrant:${row.has_qdrant_point_id ? '1' : '0'}`);
  tokens.push(`has_som:${row.has_som ? '1' : '0'}`);
  tokens.push(`has_pagerank:${row.has_pagerank ? '1' : '0'}`);
  return tokens.filter(Boolean);
}

function predict(model, row) {
  const tokens = buildTokens(row);
  const vocab = new Set(model.vocabulary);
  const classScores = {};

  for (const label of model.classes) {
    let score = model.priors[label] ?? Math.log(1 / Math.max(model.classes.length, 1));
    const ll = model.log_likelihoods[label] || {};
    for (const token of tokens) {
      if (!vocab.has(token)) continue;
      score += ll[token] ?? Math.log(1 / Math.max(model.vocabulary.length + 1, 1));
    }
    classScores[label] = score;
  }

  const entries = Object.entries(classScores).sort((a, b) => b[1] - a[1]);
  const max = entries[0]?.[1] ?? 0;
  const exp = entries.map(([, score]) => Math.exp(score - max));
  const denom = exp.reduce((sum, value) => sum + value, 0) || 1;
  const probs = entries.map(([label], index) => [label, exp[index] / denom]);
  const ranked = probs.sort((a, b) => b[1] - a[1]);
  const top = ranked[0] ?? ['UNKNOWN', 0];
  return {
    model_version: model.model_version || 'nb-packet-features-v1',
    predicted_label: top[0],
    confidence: top[1],
    distribution: Object.fromEntries(ranked),
  };
}

async function loadRows(limit, offset) {
  const client = await pool.connect();
  try {
    const packetCols = await getColumns(client, 'atlas_packets');
    const featuresExists = await tableExists(client, 'atlas_packet_features');
    const metricsExists = await tableExists(client, 'atlas_packet_metrics');
    const featureCols = featuresExists ? await getColumns(client, 'atlas_packet_features') : new Set();
    const metricCols = metricsExists ? await getColumns(client, 'atlas_packet_metrics') : new Set();
    const select = [
      'ap.packet_key',
      'ap.source_ref',
      'ap.feature_id',
      'ap.domain_class',
      'ap.title_id',
      'ap.tree_node_id',
      'ap.qdrant_point_id',
      'ap.som_row',
      'ap.som_col',
      'ap.page_rank_score',
      'ap.pagerank',
      'ap.embedding',
      'ap.latent_64',
      'ap.concept_ids',
      'ap.keywords',
    ];
    if (packetCols.has('content_embedding_384')) {
      select.push('ap.content_embedding_384');
    }
    if (packetCols.has('used_concepts')) select.push('ap.used_concepts');
    if (packetCols.has('extracted_entities')) select.push('ap.extracted_entities AS packet_entities');
    if (packetCols.has('ast_symbols')) select.push('ap.ast_symbols AS packet_ast_symbols');
    if (packetCols.has('lexical_features')) select.push('ap.lexical_features AS packet_lexical_features');
    if (featuresExists) {
      if (featureCols.has('used_concepts')) select.push('apf.used_concepts AS features_used_concepts');
      if (featureCols.has('entities')) select.push('apf.entities AS features_entities');
      if (featureCols.has('ast_symbols')) select.push('apf.ast_symbols AS features_ast_symbols');
      if (featureCols.has('lexical_features')) select.push('apf.lexical_features AS features_lexical_features');
    }
    if (metricsExists) {
      if (metricCols.has('naive_bayes_predictions')) select.push('apm.naive_bayes_predictions');
    }
    const sql = `
      SELECT ${select.join(',\n             ')}
      FROM atlas_packets ap
      ${featuresExists ? 'LEFT JOIN atlas_packet_features apf ON apf.packet_key = ap.packet_key' : ''}
      ${metricsExists ? 'LEFT JOIN atlas_packet_metrics apm ON apm.packet_key = ap.packet_key' : ''}
      WHERE ap.packet_key IS NOT NULL
      ORDER BY ap.packet_key
      LIMIT $1 OFFSET $2
    `;
    const { rows } = await client.query(sql, [limit, offset]);
    return rows.map((row) => ({
      ...row,
      used_concepts: row.used_concepts ?? row.features_used_concepts ?? row.concept_ids ?? [],
      entities: row.packet_entities ?? row.features_entities ?? [],
      ast_symbols: row.packet_ast_symbols ?? row.features_ast_symbols ?? [],
      lexical_features: row.packet_lexical_features ?? row.features_lexical_features ?? [],
      has_ast_symbols: Array.isArray(row.packet_ast_symbols ?? row.features_ast_symbols) && (row.packet_ast_symbols ?? row.features_ast_symbols).filter(Boolean).length > 0,
      has_lexical_features: Array.isArray(row.packet_lexical_features ?? row.features_lexical_features) && (row.packet_lexical_features ?? row.features_lexical_features).filter(Boolean).length > 0,
      has_used_concepts: Array.isArray(row.used_concepts ?? row.features_used_concepts ?? row.concept_ids) && (row.used_concepts ?? row.features_used_concepts ?? row.concept_ids).filter(Boolean).length > 0,
      has_embedding: Boolean(row.embedding || row.content_embedding_384 || row.latent_64),
      has_qdrant_point_id: Boolean(normalizeText(row.qdrant_point_id)),
      has_som: Number.isFinite(Number(row.som_row)) && Number.isFinite(Number(row.som_col)),
      has_pagerank: Number.isFinite(Number(row.page_rank_score ?? row.pagerank)),
      semantic_lane_status: 'COMPLETE',
      suggested_label: 'COMPLETE',
      missing_fields: [],
      training_split: 'accepted',
      failure_reason: '',
    }));
  } finally {
    client.release();
  }
}

async function ensurePredictionColumn(client) {
  await client.query(`
    ALTER TABLE atlas_packet_metrics
    ADD COLUMN IF NOT EXISTS naive_bayes_predictions JSONB DEFAULT '{}'::jsonb
  `);
}

function renderMarkdown(report) {
  return [
    '# Naive Bayes Packet Predictions',
    '',
    `Generated: ${report.generatedAt}`,
    `Mode: ${report.mode}`,
    '',
    '## Summary',
    '',
    `- rows processed: ${report.summary.rowsProcessed}`,
    `- rows written: ${report.summary.rowsWritten}`,
    `- distinct predictions: ${report.summary.distinctPredictions}`,
    '',
    '## Next Safe Action',
    '',
    report.nextSafeAction,
    '',
  ].join('\n');
}

async function main() {
  const model = readJson(MODEL);
  if (!model) throw new Error(`Model not found: ${MODEL}`);

  const rows = await loadRows(LIMIT, OFFSET);
  const predictions = rows.map((row) => ({
    packet_key: normalizeText(row.packet_key),
    source_ref: normalizeText(row.source_ref),
    prediction: predict(model, row),
  }));

  await fs.mkdir(TMP_DIR, { recursive: true });
  await fs.mkdir(REPORTS_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_JSONL, `${predictions.map((row) => JSON.stringify(row)).join('\n')}${predictions.length > 0 ? '\n' : ''}`, 'utf8');

  const client = await pool.connect();
  try {
    await ensurePredictionColumn(client);
    let written = 0;
    if (!DRY_RUN) {
      for (const item of predictions) {
        await client.query(`
          INSERT INTO atlas_packet_metrics (packet_key, naive_bayes_predictions)
          VALUES ($1, $2::jsonb)
          ON CONFLICT (packet_key) DO UPDATE
          SET naive_bayes_predictions = EXCLUDED.naive_bayes_predictions,
              updated_at = NOW()
        `, [item.packet_key, JSON.stringify(item.prediction)]);
        written += 1;
      }
    }

    const report = {
      generatedAt: new Date().toISOString(),
      mode: DRY_RUN ? 'dry-run' : 'apply',
      inputs: { model: path.relative(REPO_ROOT, MODEL).replace(/\\/g, '/') },
      outputs: {
        jsonl: path.relative(REPO_ROOT, OUTPUT_JSONL).replace(/\\/g, '/'),
      },
      summary: {
        rowsProcessed: predictions.length,
        rowsWritten: DRY_RUN ? 0 : written,
        distinctPredictions: [...new Set(predictions.map((row) => row.prediction.predicted_label))].length,
      },
      sample: predictions.slice(0, 5),
      nextSafeAction: 'Use the predictions as soft evidence only; hard missing-field gaps still override routing.',
    };

    await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await fs.writeFile(REPORT_MD, `${renderMarkdown(report)}\n`, 'utf8');

    console.log(JSON.stringify({
      status: 'READY',
      rowsProcessed: predictions.length,
      rowsWritten: DRY_RUN ? 0 : written,
      distinctPredictions: report.summary.distinctPredictions,
      output: path.relative(REPO_ROOT, OUTPUT_JSONL).replace(/\\/g, '/'),
    }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[apply-naive-bayes-predictions] failed:', error?.stack || error?.message || String(error));
  process.exit(1);
});
