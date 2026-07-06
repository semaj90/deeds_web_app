#!/usr/bin/env node
/**
 * Phase 106: Route HMM output to kanban.
 *
 * Deterministic consumer only. Does not mutate identity or enqueue repair jobs.
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
const OUTPUT_JSONL = path.join(TMP_DIR, 'hmm-kanban-actions.ndjson');
const REPORT_JSON = path.join(REPORTS_DIR, 'hmm-kanban-actions.json');
const REPORT_MD = path.join(REPORTS_DIR, 'hmm-kanban-actions.md');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run') || argv.includes('--dry');
const LIMIT = parseIntFlag(argv, '--limit', 500);
const OFFSET = parseIntFlag(argv, '--offset', 0);

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

async function getRows(limit, offset) {
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
      if (metricCols.has('hmm_recommendations')) select.push('apm.hmm_recommendations');
      if (metricCols.has('hmm_state')) select.push('apm.hmm_state');
      if (metricCols.has('acp_action')) select.push('apm.acp_action');
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
    }));
  } finally {
    client.release();
  }
}

function determineState(row) {
  if (!normalizeText(row.packet_key) || !normalizeText(row.source_ref) || !normalizeText(row.feature_id) || !normalizeText(row.title_id)) {
    return 'IdentityError';
  }
  if (!Array.isArray(row.ast_symbols) || row.ast_symbols.filter(Boolean).length === 0) return 'StructureError';
  if (!Array.isArray(row.lexical_features) || row.lexical_features.filter(Boolean).length === 0) return 'LexicalError';
  if (!Array.isArray(row.used_concepts) || row.used_concepts.filter(Boolean).length === 0) return 'SemanticError';
  if (!row.embedding && !row.content_embedding_384 && !row.latent_64) return 'VectorError';
  if (!normalizeText(row.qdrant_point_id)) return 'QdrantBridgeError';
  if (!Number.isFinite(Number(row.som_row)) || !Number.isFinite(Number(row.som_col))) return 'TopologyError';
  if (!normalizeText(row.tree_node_id)) return 'TreePropagationError';
  return normalizeText(row.naive_bayes_predictions?.predicted_label) === 'COMPLETE' ? 'COMPLETE' : 'COMPLETE';
}

function chooseRepairLane(state) {
  switch (state) {
    case 'IdentityError': return 'identity_backfill';
    case 'StructureError': return 'ast_grep';
    case 'LexicalError': return 'lexical_splitter';
    case 'SemanticError': return 'langextract';
    case 'VectorError': return 'embedding_backfill';
    case 'QdrantBridgeError': return 'qdrant_bridge';
    case 'TopologyError': return 'som_backfill';
    case 'TreePropagationError': return 'tree_node_backfill';
    default: return 'accept';
  }
}

function recommendedCommand(lane) {
  const commands = {
    identity_backfill: 'npm run atlas:packet-metadata:backfill:apply',
    ast_grep: 'npm run atlas:phase8:step3:langextract:apply',
    lexical_splitter: 'node scripts/atlas/export-semantic-training-rows.mjs --limit=50',
    langextract: 'npm run atlas:phase8:step3:langextract:apply',
    embedding_backfill: 'npm run atlas:phase1:canonical:embeddings:apply',
    qdrant_bridge: 'npm run atlas:qdrant-payload:sync:apply',
    som_backfill: 'node scripts/atlas/validate-som-20x20-topology.mjs --dry-run',
    tree_node_backfill: 'node scripts/atlas/backfill-neo4j-cell-id.mjs --apply',
    accept: 'noop',
  };
  return commands[lane] ?? 'noop';
}

function renderMarkdown(report) {
  return [
    '# HMM Kanban Actions',
    '',
    `Generated: ${report.generatedAt}`,
    `Mode: ${report.mode}`,
    '',
    '## Summary',
    '',
    `- rows processed: ${report.summary.rowsProcessed}`,
    `- actions emitted: ${report.summary.actionsEmitted}`,
    '',
    '## Next Safe Action',
    '',
    report.nextSafeAction,
    '',
  ].join('\n');
}

async function main() {
  const rows = await getRows(LIMIT, OFFSET);
  const actions = rows.map((row) => {
    const hmmState = determineState(row);
    const repairLane = chooseRepairLane(hmmState);
    const nbPrediction = row.naive_bayes_predictions?.predicted_label ?? row.naive_bayes_predictions?.likely_error_state ?? null;
    const confidence = Number(row.naive_bayes_predictions?.confidence ?? row.naive_bayes_predictions?.error_state_confidence ?? 0);
    return {
      task_id: `hmm:${normalizeText(row.packet_key) || 'unknown'}`,
      packet_key: normalizeText(row.packet_key) || null,
      source_ref: normalizeText(row.source_ref) || null,
      feature_id: normalizeText(row.feature_id) || null,
      hmm_state: hmmState,
      repair_lane: repairLane,
      confidence: Number.isFinite(confidence) ? confidence : 0,
      recommended_command: recommendedCommand(repairLane),
      safe_scope: repairLane === 'accept' ? 'report-only' : 'bounded-repair',
      nb_hint: nbPrediction,
      created_at: new Date().toISOString(),
    };
  });

  await fs.mkdir(TMP_DIR, { recursive: true });
  await fs.mkdir(REPORTS_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_JSONL, `${actions.map((row) => JSON.stringify(row)).join('\n')}${actions.length > 0 ? '\n' : ''}`, 'utf8');

  const report = {
    generatedAt: new Date().toISOString(),
    mode: DRY_RUN ? 'dry-run' : 'report',
    inputs: {
      packetSource: 'atlas_packets + atlas_packet_features + atlas_packet_metrics',
    },
    outputs: {
      ndjson: path.relative(REPO_ROOT, OUTPUT_JSONL).replace(/\\/g, '/'),
    },
    summary: {
      rowsProcessed: actions.length,
      actionsEmitted: actions.length,
      stateCounts: actions.reduce((acc, action) => {
        acc[action.hmm_state] = (acc[action.hmm_state] || 0) + 1;
        return acc;
      }, {}),
    },
    sample: actions.slice(0, 10),
    nextSafeAction: 'Use HMM states as deterministic repair routing, and keep Naive Bayes as soft evidence only.',
  };

  await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(REPORT_MD, `${renderMarkdown(report)}\n`, 'utf8');

  console.log(JSON.stringify({
    status: 'READY',
    rowsProcessed: actions.length,
    actionsEmitted: actions.length,
    output: path.relative(REPO_ROOT, OUTPUT_JSONL).replace(/\\/g, '/'),
  }, null, 2));
}

main().catch((error) => {
  console.error('[route-hmm-output-to-kanban] failed:', error?.stack || error?.message || String(error));
  process.exit(1);
});
