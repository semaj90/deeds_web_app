#!/usr/bin/env node
/**
 * Phase 106: Audit topology completion gaps.
 *
 * Reads canonical packet rows plus feature/metric mirrors and reports the
 * remaining work in a machine-readable and human-readable form.
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
const REPORT_JSON = path.join(REPORTS_DIR, 'phase-106-next-production-gaps.json');
const REPORT_MD = path.join(REPORTS_DIR, 'phase-106-next-production-gaps.md');

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
  const { rows } = await client.query('SELECT to_regclass($1) IS NOT NULL AS exists', [`public.${tableName}`]);
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

function pushIfHas(select, hasColumn, tableAlias, columnName, alias = columnName) {
  if (hasColumn) {
    select.push(alias === columnName ? `${tableAlias}.${columnName}` : `${tableAlias}.${columnName} AS ${alias}`);
  }
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

async function loadRows(limit, offset) {
  const client = await pool.connect();
  try {
    const packetCols = await getColumns(client, 'atlas_packets');
    const featureCols = (await tableExists(client, 'atlas_packet_features')) ? await getColumns(client, 'atlas_packet_features') : new Set();
    const metricCols = (await tableExists(client, 'atlas_packet_metrics')) ? await getColumns(client, 'atlas_packet_metrics') : new Set();
    const featuresExists = await tableExists(client, 'atlas_packet_features');
    const metricsExists = await tableExists(client, 'atlas_packet_metrics');
    const select = [
      'ap.packet_key',
      'ap.source_ref',
      'ap.feature_id',
      'ap.title_id',
      'ap.domain_class',
      'ap.tree_node_id',
      'ap.qdrant_point_id',
      'ap.som_row',
      'ap.som_col',
      'ap.som_cluster',
      'ap.page_rank_score',
      'ap.pagerank',
      'ap.embedding',
      'ap.latent_64',
      'ap.concept_ids',
      'ap.keywords',
      'ap.topology',
      'ap.metadata',
    ];
    if (packetCols.has('content_embedding_384')) select.push('ap.content_embedding_384');
    pushIfHas(select, packetCols.has('used_concepts'), 'ap', 'used_concepts');
    pushIfHas(select, packetCols.has('extracted_entities'), 'ap', 'extracted_entities', 'packet_entities');
    pushIfHas(select, packetCols.has('ast_symbols'), 'ap', 'ast_symbols', 'packet_ast_symbols');
    pushIfHas(select, packetCols.has('lexical_features'), 'ap', 'lexical_features', 'packet_lexical_features');
    pushIfHas(select, packetCols.has('mmap_file'), 'ap', 'mmap_file');
    pushIfHas(select, packetCols.has('mmap_offset'), 'ap', 'mmap_offset');
    pushIfHas(select, packetCols.has('mmap_length'), 'ap', 'mmap_length');
    if (featuresExists) {
      pushIfHas(select, featureCols.has('used_concepts'), 'apf', 'used_concepts', 'features_used_concepts');
      pushIfHas(select, featureCols.has('entities'), 'apf', 'entities', 'features_entities');
      pushIfHas(select, featureCols.has('ast_symbols'), 'apf', 'ast_symbols', 'features_ast_symbols');
      pushIfHas(select, featureCols.has('lexical_features'), 'apf', 'lexical_features', 'features_lexical_features');
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
      entities: row.packet_entities ?? row.features_entities ?? [],
      ast_symbols: row.packet_ast_symbols ?? row.features_ast_symbols ?? [],
      lexical_features: row.packet_lexical_features ?? row.features_lexical_features ?? [],
      used_concepts: row.used_concepts ?? row.features_used_concepts ?? row.concept_ids ?? [],
    }));
  } finally {
    client.release();
  }
}

function rowState(row) {
  const missing = [];
  if (!normalizeText(row.packet_key)) missing.push('packet_key');
  if (!normalizeText(row.source_ref)) missing.push('source_ref');
  if (!normalizeText(row.feature_id)) missing.push('feature_id');
  if (!normalizeText(row.title_id)) missing.push('title_id');
  if (!Array.isArray(row.ast_symbols) || row.ast_symbols.filter(Boolean).length === 0) missing.push('ast_symbols');
  if (!Array.isArray(row.lexical_features) || row.lexical_features.filter(Boolean).length === 0) missing.push('lexical_features');
  if (!Array.isArray(row.used_concepts) || row.used_concepts.filter(Boolean).length === 0) missing.push('used_concepts');
  if (!normalizeText(row.qdrant_point_id)) missing.push('qdrant_point_id');
  if (!Number.isFinite(Number(row.som_row)) || !Number.isFinite(Number(row.som_col))) missing.push('som_cell');
  if (!normalizeText(row.tree_node_id)) missing.push('tree_node_id');
  if (('mmap_file' in row || 'mmap_offset' in row || 'mmap_length' in row) && (!normalizeText(row.mmap_file) || !Number.isFinite(Number(row.mmap_offset)) || !Number.isFinite(Number(row.mmap_length)))) missing.push('mmap_registry');
  if (!normalizeText(row.page_rank_score) && !normalizeText(row.pagerank)) missing.push('page_rank_score');
  if (!normalizeText(row.som_cluster)) missing.push('som_cluster');
  if (!normalizeText(row.topology)) missing.push('topology');

  if (missing.length === 0) return 'COMPLETE';
  if (missing.includes('packet_key') || missing.includes('source_ref') || missing.includes('feature_id') || missing.includes('title_id')) return 'IdentityError';
  if (missing.includes('ast_symbols')) return 'StructureError';
  if (missing.includes('lexical_features')) return 'LexicalError';
  if (missing.includes('used_concepts')) return 'SemanticError';
  if (missing.includes('qdrant_point_id')) return 'QdrantBridgeError';
  if (missing.includes('som_cell') || missing.includes('page_rank_score') || missing.includes('som_cluster')) return 'TopologyError';
  if (missing.includes('mmap_registry')) return 'CachePromotionError';
  if (missing.includes('tree_node_id')) return 'TreePropagationError';
  return 'SemanticError';
}

function laneForState(state) {
  switch (state) {
    case 'COMPLETE': return 'accept';
    case 'IdentityError': return 'identity_backfill';
    case 'StructureError': return 'ast_grep';
    case 'LexicalError': return 'lexical_splitter';
    case 'SemanticError': return 'langextract';
    case 'QdrantBridgeError': return 'qdrant_bridge';
    case 'TopologyError': return 'topology_backfill';
    case 'TreePropagationError': return 'tree_node_backfill';
    case 'CachePromotionError': return 'mmap_registry';
    default: return 'investigate';
  }
}

function commandForLane(lane) {
  const commands = {
    accept: 'noop',
    identity_backfill: 'node scripts/atlas/backfill-canonical-envelope-fields.mjs --apply --limit=500',
    ast_grep: 'npm run atlas:phase8:step3:langextract:apply',
    lexical_splitter: 'node scripts/atlas/export-semantic-training-rows.mjs --dry-run --limit=500',
    langextract: 'npm run atlas:phase8:step3:langextract:apply',
    qdrant_bridge: 'npm run atlas:qdrant-payload:sync:apply',
    topology_backfill: 'node scripts/atlas/validate-som-20x20-topology.mjs --dry-run',
    tree_node_backfill: 'node scripts/atlas/backfill-tree-nodes.mjs --apply --limit=500',
    mmap_registry: 'node scripts/atlas/seed-memory-address-registry.mjs --dry-run',
    investigate: 'node scripts/atlas/validate-progressive-semantic-compiler.mjs --dry-run',
  };
  return commands[lane] ?? 'noop';
}

function summaryText(counts, total) {
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted.map(([state, count]) => `- ${state}: ${count}`).join('\n');
}

function renderMarkdown(report) {
  return [
    '# Phase 106 Next Production Gaps',
    '',
    `Generated: ${report.generatedAt}`,
    `Mode: ${report.mode}`,
    '',
    '## Gap Summary',
    '',
    summaryText(report.summary.stateCounts, report.summary.rowsProcessed),
    '',
    '## Top Missing Fields',
    '',
    ...report.summary.topMissingFields.map(([field, count]) => `- ${field}: ${count}`),
    '',
    '## Next Safe Actions',
    '',
    ...report.nextActions.map((item) => `- ${item.state}: ${item.command}`),
    '',
    '## Notes',
    '',
    '- Extraction writes features.',
    '- Training writes metrics.',
    '- Retrieval reads both.',
    '- ACP repairs missing layers.',
    '- Postgres remains canonical.',
    '',
  ].join('\n');
}

async function main() {
  const rows = await loadRows(LIMIT, OFFSET);
  const stateCounts = {};
  const missingCounts = {};
  const nextActions = [];
  const evidence = [];

  for (const row of rows) {
    const state = rowState(row);
    stateCounts[state] = (stateCounts[state] || 0) + 1;
    const lane = laneForState(state);
    const command = commandForLane(lane);
    nextActions.push({
      packet_key: normalizeText(row.packet_key) || null,
      state,
      lane,
      command,
      title_id: normalizeText(row.title_id) || null,
      feature_id: normalizeText(row.feature_id) || null,
    });

    const fields = [
      !normalizeText(row.packet_key) && 'packet_key',
      !normalizeText(row.source_ref) && 'source_ref',
      !normalizeText(row.feature_id) && 'feature_id',
      !normalizeText(row.title_id) && 'title_id',
      !Array.isArray(row.ast_symbols) || row.ast_symbols.filter(Boolean).length === 0 ? 'ast_symbols' : null,
      !Array.isArray(row.lexical_features) || row.lexical_features.filter(Boolean).length === 0 ? 'lexical_features' : null,
      !Array.isArray(row.used_concepts) || row.used_concepts.filter(Boolean).length === 0 ? 'used_concepts' : null,
      !normalizeText(row.qdrant_point_id) && 'qdrant_point_id',
      !Number.isFinite(Number(row.som_row)) || !Number.isFinite(Number(row.som_col)) ? 'som_cell' : null,
      !normalizeText(row.tree_node_id) && 'tree_node_id',
      (('mmap_file' in row || 'mmap_offset' in row || 'mmap_length' in row) && (!normalizeText(row.mmap_file) || !Number.isFinite(Number(row.mmap_offset)) || !Number.isFinite(Number(row.mmap_length)))) ? 'mmap_registry' : null,
      !normalizeText(row.page_rank_score) && !normalizeText(row.pagerank) ? 'page_rank_score' : null,
    ].filter(Boolean);

    for (const field of fields) missingCounts[field] = (missingCounts[field] || 0) + 1;
    evidence.push({
      packet_key: normalizeText(row.packet_key) || null,
      state,
      missing_fields: fields,
      lane,
      command,
    });
  }

  const topMissingFields = Object.entries(missingCounts).sort((a, b) => b[1] - a[1]).slice(0, 15);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: DRY_RUN ? 'dry-run' : 'report',
    inputs: {
      packetSource: 'atlas_packets + atlas_packet_features + atlas_packet_metrics',
      limit: LIMIT,
      offset: OFFSET,
    },
    summary: {
      rowsProcessed: rows.length,
      stateCounts,
      topMissingFields,
    },
    nextActions: nextActions.slice(0, 50),
    evidence: evidence.slice(0, 50),
  };

  await fs.mkdir(TMP_DIR, { recursive: true });
  await fs.mkdir(REPORTS_DIR, { recursive: true });
  await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(REPORT_MD, `${renderMarkdown(report)}\n`, 'utf8');

  console.log(JSON.stringify({
    status: 'READY',
    rowsProcessed: rows.length,
    output: path.relative(REPO_ROOT, REPORT_JSON).replace(/\\/g, '/'),
    topMissingFields,
  }, null, 2));
}

main().catch((error) => {
  console.error('[audit-topology-completion-gaps] failed:', error?.stack || error?.message || String(error));
  process.exit(1);
});
