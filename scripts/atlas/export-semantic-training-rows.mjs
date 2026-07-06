#!/usr/bin/env node
/**
 * Phase 106: Export semantic training rows.
 *
 * Combines accepted rows from the canonical packet tables with rejected
 * semantic envelopes from the cold archive into a single labeled NDJSON
 * training surface.
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

const INPUT_REJECTED_ARCHIVE = path.join(TMP_DIR, 'rejected-semantic-envelopes.ndjson');
const FALLBACK_REJECTED_ARCHIVE = path.join(TMP_DIR, 'feature-extract-summary-batch.rejected.ndjson');
const OUTPUT_NDJSON = path.join(TMP_DIR, 'semantic-training-rows.ndjson');
const REPORT_JSON = path.join(REPORTS_DIR, 'semantic-training-rows.json');
const REPORT_MD = path.join(REPORTS_DIR, 'semantic-training-rows.md');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run') || argv.includes('--dry');
const LIMIT = parseIntFlag(argv, '--limit', 500);
const OFFSET = parseIntFlag(argv, '--offset', 0);
const INPUT_ARCHIVE = argv.find((arg) => arg.startsWith('--archive='))?.split('=')[1] ?? INPUT_REJECTED_ARCHIVE;

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

function uniqueStrings(values) {
  return [...new Set((values ?? []).map((value) => normalizeText(value)).filter(Boolean))];
}

function tokenize(value) {
  return uniqueStrings(String(value ?? '').toLowerCase().split(/[^a-z0-9_]+/g));
}

function readNdjsonIfExists(absPath) {
  if (!fsSync.existsSync(absPath)) return [];
  return fsSync.readFileSync(absPath, 'utf8')
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

function pushIfHas(select, hasColumn, tableAlias, columnName, alias = columnName) {
  if (hasColumn) {
    select.push(alias === columnName ? `${tableAlias}.${columnName}` : `${tableAlias}.${columnName} AS ${alias}`);
  }
}

function deriveMissingFields(row) {
  const missing = [];
  if (!normalizeText(row.packet_key)) missing.push('packet_key');
  if (!normalizeText(row.source_ref)) missing.push('source_ref');
  if (!normalizeText(row.feature_id)) missing.push('feature_id');
  if (!normalizeText(row.title_id)) missing.push('title_id');
  if (!Array.isArray(row.ast_symbols) || row.ast_symbols.filter(Boolean).length === 0) missing.push('ast_symbols');
  if (!Array.isArray(row.lexical_features) || row.lexical_features.filter(Boolean).length === 0) missing.push('lexical_features');
  if (!Array.isArray(row.used_concepts) || row.used_concepts.filter(Boolean).length === 0) missing.push('used_concepts');
  if (!Array.isArray(row.entities) || row.entities.filter(Boolean).length === 0) missing.push('entities');
  if (!normalizeText(row.qdrant_point_id)) missing.push('qdrant_point_id');
  if (!Number.isFinite(Number(row.som_row)) || !Number.isFinite(Number(row.som_col))) missing.push('som_cell');
  if (!normalizeText(row.tree_node_id)) missing.push('tree_node_id');
  if (!normalizeText(row.page_rank_score) && !normalizeText(row.pagerank)) missing.push('page_rank_score');
  if (!normalizeText(row.community_id)) missing.push('community_id');
  return uniqueStrings(missing);
}

function suggestLabel(missingFields, row) {
  const fields = new Set(missingFields);
  if (fields.has('packet_key') || fields.has('source_ref') || fields.has('feature_id') || fields.has('title_id')) return 'IdentityError';
  if (fields.has('tree_node_id')) return 'TreePropagationError';
  if (fields.has('ast_symbols')) return 'StructureError';
  if (fields.has('lexical_features')) return 'LexicalError';
  if (fields.has('used_concepts') || fields.has('entities')) return 'SemanticError';
  if (fields.has('qdrant_point_id')) return 'QdrantBridgeError';
  if (fields.has('som_cell') || fields.has('page_rank_score') || fields.has('community_id')) return 'TopologyError';
  if (fields.has('mmap_file') || fields.has('mmap_offset') || fields.has('mmap_length')) return 'CachePromotionError';
  return normalizeText(row.semantic_lane_status) === 'COMPLETE' ? 'COMPLETE' : 'SemanticError';
}

function featureFlagsFromRow(row) {
  const hasAst = Array.isArray(row.ast_symbols) && row.ast_symbols.filter(Boolean).length > 0;
  const hasLexical = Array.isArray(row.lexical_features) && row.lexical_features.filter(Boolean).length > 0;
  const concepts = Array.isArray(row.used_concepts) ? row.used_concepts : row.concept_ids;
  const hasConcepts = Array.isArray(concepts) && concepts.filter(Boolean).length > 0;
  const hasEmbedding = Boolean(row.embedding || row.content_embedding_384 || row.latent_64);
  const hasQdrant = normalizeText(row.qdrant_point_id);
  const hasSom = Number.isFinite(Number(row.som_row)) && Number.isFinite(Number(row.som_col));
  const hasPagerank = Number.isFinite(Number(row.page_rank_score ?? row.pagerank));
  return {
    has_ast_symbols: hasAst,
    has_lexical_features: hasLexical,
    has_used_concepts: hasConcepts,
    has_embedding: hasEmbedding,
    has_qdrant_point_id: hasQdrant,
    has_som: hasSom,
    has_pagerank: hasPagerank,
  };
}

function buildTrainingRow(row, trainingSplit, semanticLaneStatus, failureReason, missingFields) {
  const flags = featureFlagsFromRow(row);
  const sourceRefTokens = tokenize(row.source_ref);
  return {
    packet_key: normalizeText(row.packet_key) || null,
    source_ref: normalizeText(row.source_ref) || null,
    feature_id: normalizeText(row.feature_id) || null,
    domain_class: normalizeText(row.domain_class) || null,
    failure_reason: normalizeText(failureReason) || null,
    missing_fields: uniqueStrings(missingFields),
    semantic_lane_status: semanticLaneStatus,
    qdrant_point_id_present: Boolean(flags.has_qdrant_point_id),
    topology_present: Boolean(flags.has_som && flags.hasPagerank),
    tree_node_id_present: Boolean(normalizeText(row.tree_node_id)),
    suggested_label: suggestLabel(missingFields, row),
    training_split: trainingSplit,
    created_at: new Date().toISOString(),
    source_ref_tokens: sourceRefTokens,
    ...flags,
  };
}

async function loadAcceptedRows(limit, offset) {
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
    if (packetCols.has('mmap_file')) select.push('ap.mmap_file');
    if (packetCols.has('mmap_offset')) select.push('ap.mmap_offset');
    if (packetCols.has('mmap_length')) select.push('ap.mmap_length');
    pushIfHas(select, packetCols.has('used_concepts'), 'ap', 'used_concepts');
    pushIfHas(select, packetCols.has('extracted_entities'), 'ap', 'extracted_entities', 'packet_entities');
    pushIfHas(select, packetCols.has('ast_symbols'), 'ap', 'ast_symbols', 'packet_ast_symbols');
    pushIfHas(select, packetCols.has('lexical_features'), 'ap', 'lexical_features', 'packet_lexical_features');
    if (featuresExists) {
      pushIfHas(select, featureCols.has('used_concepts'), 'apf', 'used_concepts', 'features_used_concepts');
      pushIfHas(select, featureCols.has('entities'), 'apf', 'entities', 'features_entities');
      pushIfHas(select, featureCols.has('ast_symbols'), 'apf', 'ast_symbols', 'features_ast_symbols');
      pushIfHas(select, featureCols.has('lexical_features'), 'apf', 'lexical_features', 'features_lexical_features');
    }
    if (metricsExists) {
      if (metricCols.has('naive_bayes_predictions')) select.push('apm.naive_bayes_predictions');
      if (metricCols.has('hmm_recommendations')) select.push('apm.hmm_recommendations');
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

function renderMarkdown(report) {
  return [
    '# Semantic Training Rows Export',
    '',
    `Generated: ${report.generatedAt}`,
    `Mode: ${report.mode}`,
    '',
    '## Counts',
    '',
    `- accepted rows: ${report.summary.acceptedRows}`,
    `- rejected rows: ${report.summary.rejectedRows}`,
    `- total rows: ${report.summary.totalRows}`,
    `- cold archive path: ${report.summary.coldArchivePath}`,
    '',
    '## Label Counts',
    '',
    ...Object.entries(report.summary.labelCounts).map(([key, value]) => `- ${key}: ${value}`),
    '',
    '## Next Safe Action',
    '',
    report.nextSafeAction,
    '',
  ].join('\n');
}

async function main() {
  const client = await pool.connect();
  try {
    const rejectedArchive = readNdjsonIfExists(INPUT_ARCHIVE).length > 0
      ? readNdjsonIfExists(INPUT_ARCHIVE)
      : readNdjsonIfExists(FALLBACK_REJECTED_ARCHIVE);

    const acceptedRows = await loadAcceptedRows(LIMIT, OFFSET);
    const acceptedTrainingRows = acceptedRows.map((row) => buildTrainingRow(row, 'accepted', 'COMPLETE', '', []));

    const rejectedTrainingRows = rejectedArchive.map((row) => {
      const missingFields = Array.isArray(row.missing_fields) ? row.missing_fields : deriveMissingFields(row);
      return buildTrainingRow(
        row,
        row.training_split || 'rejected',
        row.semantic_lane_status || 'REJECTED',
        row.failure_reason || row.rejection_kind || 'semantic_validation_failed',
        missingFields,
      );
    });

    const trainingRows = [...acceptedTrainingRows, ...rejectedTrainingRows];

    await fs.mkdir(TMP_DIR, { recursive: true });
    await fs.mkdir(REPORTS_DIR, { recursive: true });
    await fs.writeFile(OUTPUT_NDJSON, `${trainingRows.map((row) => JSON.stringify(row)).join('\n')}${trainingRows.length > 0 ? '\n' : ''}`, 'utf8');

    const labelCounts = trainingRows.reduce((acc, row) => {
      const key = normalizeText(row.suggested_label) || 'UNKNOWN';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const report = {
      generatedAt: new Date().toISOString(),
      mode: DRY_RUN ? 'dry-run' : 'export',
      inputs: {
        rejectedArchive: path.relative(REPO_ROOT, INPUT_ARCHIVE).replace(/\\/g, '/'),
        fallbackRejectedArchive: path.relative(REPO_ROOT, FALLBACK_REJECTED_ARCHIVE).replace(/\\/g, '/'),
      },
      outputs: {
        ndjson: path.relative(REPO_ROOT, OUTPUT_NDJSON).replace(/\\/g, '/'),
      },
      summary: {
        acceptedRows: acceptedTrainingRows.length,
        rejectedRows: rejectedTrainingRows.length,
        totalRows: trainingRows.length,
        labelCounts,
        coldArchivePath: '.tmp/rejected-semantic-envelopes.ndjson',
      },
      nextSafeAction: 'Train the Naive Bayes packet-features model from the balanced accepted/rejected training rows, then apply soft-evidence predictions.',
    };

    await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await fs.writeFile(REPORT_MD, `${renderMarkdown(report)}\n`, 'utf8');

    console.log(JSON.stringify({
      status: 'READY',
      acceptedRows: acceptedTrainingRows.length,
      rejectedRows: rejectedTrainingRows.length,
      output: path.relative(REPO_ROOT, OUTPUT_NDJSON).replace(/\\/g, '/'),
      report: path.relative(REPO_ROOT, REPORT_JSON).replace(/\\/g, '/'),
    }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[export-semantic-training-rows] failed:', error?.stack || error?.message || String(error));
  process.exit(1);
});
