#!/usr/bin/env node

/**
 * Export the canonical Parent Atlas semantic-training surface as Arrow IPC.
 *
 * Postgres remains canonical. Arrow is a bounded, replayable batch transport
 * for PyTorch/QLoRA/JEPA workers; it is not a packet registry or database.
 *
 * Usage:
 *   node scripts/atlas/arrow-batch-export.mjs --dry-run --limit=200
 *   node scripts/atlas/arrow-batch-export.mjs --apply --limit=200
 *   node scripts/atlas/arrow-batch-export.mjs --apply --output=.tmp/atlas/packets.arrow
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  Binary,
  Bool,
  Float32,
  Int32,
  Table,
  Utf8,
  tableToIPC,
  vectorFromArray,
} from 'apache-arrow';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const LIMIT = parseIntegerFlag('--limit', 10_000);
const OFFSET = parseIntegerFlag('--offset', 0);
const DEFAULT_OUTPUT = path.join(REPO_ROOT, 'scripts', 'atlas', 'export', 'packets.arrow');
const OUTPUT_FILE = path.resolve(REPO_ROOT, parseStringFlag('--output', DEFAULT_OUTPUT));
const INDEX_FILE = replaceExtension(OUTPUT_FILE, '.index.json');
const REPORT_FILE = path.join(REPO_ROOT, 'docs', 'reports', 'arrow-batch-export.json');

const env = loadRepoEnv(process.env);
const pool = new Pool({ connectionString: resolveDatabaseUrl(env) });

function parseStringFlag(name, fallback) {
  const inline = argv.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

function parseIntegerFlag(name, fallback) {
  const parsed = Number.parseInt(parseStringFlag(name, String(fallback)), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function replaceExtension(filePath, extension) {
  return path.join(path.dirname(filePath), `${path.basename(filePath, path.extname(filePath))}${extension}`);
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function uniqueStrings(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeText).filter(Boolean))];
}

function stableSplit(packetKey) {
  const bucket = createHash('sha256').update(packetKey).digest()[0] % 10;
  if (bucket === 0) return 'test';
  if (bucket === 1) return 'eval';
  return 'train';
}

function parsePgVector(value) {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  const text = normalizeText(value);
  if (!text) return [];
  return text
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split(',')
    .map((item) => Number.parseFloat(item.trim()))
    .filter(Number.isFinite);
}

function floatsToBytes(values) {
  if (!values?.length) return null;
  const floats = Float32Array.from(values);
  return new Uint8Array(floats.buffer, floats.byteOffset, floats.byteLength);
}

function bufferToUint8Array(value) {
  if (!Buffer.isBuffer(value) || value.length === 0) return null;
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function arrayJson(value) {
  return JSON.stringify(uniqueStrings(value));
}

function semanticInput(row) {
  return [
    `source_ref: ${row.source_ref}`,
    `summary: ${row.summary}`,
    `feature_label: ${row.feature_label}`,
    `keywords: ${row.keywords.join(', ')}`,
    `concepts: ${row.used_concepts.join(', ')}`,
    `lexical: ${row.lexical_features.join(', ')}`,
    `symbols: ${row.ast_symbols.join(', ')}`,
  ].filter((line) => !line.endsWith(': ')).join('\n');
}

function semanticTarget(row) {
  return JSON.stringify({
    title_id: row.title_id || null,
    feature_id: row.feature_id || null,
    feature_label: row.feature_label || null,
    domain_class: row.domain_class || null,
  });
}

async function tableExists(client, tableName) {
  const result = await client.query('SELECT to_regclass($1) IS NOT NULL AS exists', [`public.${tableName}`]);
  return result.rows[0]?.exists === true;
}

async function getColumns(client, tableName) {
  const result = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
  `, [tableName]);
  return new Set(result.rows.map((row) => row.column_name));
}

function selectIf(columns, alias, column, outputAlias = column, cast = '') {
  if (!columns.has(column)) return `NULL AS ${outputAlias}`;
  return `${alias}.${column}${cast} AS ${outputAlias}`;
}

async function loadRows() {
  const client = await pool.connect();
  try {
    const packetColumns = await getColumns(client, 'atlas_packets');
    const featureExists = await tableExists(client, 'atlas_packet_features');
    const metricExists = await tableExists(client, 'atlas_packet_metrics');
    const featureColumns = featureExists ? await getColumns(client, 'atlas_packet_features') : new Set();
    const metricColumns = metricExists ? await getColumns(client, 'atlas_packet_metrics') : new Set();

    const featureJoin = featureExists
      ? `LEFT JOIN LATERAL (
           SELECT * FROM atlas_packet_features f
           WHERE f.packet_key = ap.packet_key
           ORDER BY f.updated_at DESC NULLS LAST, f.id
           LIMIT 1
         ) apf ON TRUE`
      : '';
    const metricJoin = metricExists
      ? `LEFT JOIN LATERAL (
           SELECT * FROM atlas_packet_metrics m
           WHERE m.packet_key = ap.packet_key
           ORDER BY m.updated_at DESC NULLS LAST, m.id
           LIMIT 1
         ) apm ON TRUE`
      : '';

    const featureConcepts = featureColumns.has('used_concepts') ? 'apf.used_concepts' : 'NULL';
    const packetConcepts = packetColumns.has('used_concepts') ? 'ap.used_concepts' : 'NULL';
    const conceptIds = packetColumns.has('concept_ids') ? 'ap.concept_ids' : 'NULL';

    const sql = `
      SELECT
        ap.packet_key,
        ${selectIf(packetColumns, 'ap', 'source_ref')},
        ${selectIf(packetColumns, 'ap', 'canonical_source_ref')},
        ${selectIf(packetColumns, 'ap', 'source_ref_key')},
        ${selectIf(packetColumns, 'ap', 'file_path')},
        ${selectIf(packetColumns, 'ap', 'directory_path')},
        ${selectIf(packetColumns, 'ap', 'feature_id')},
        ${selectIf(packetColumns, 'ap', 'feature_label')},
        ${selectIf(packetColumns, 'ap', 'title_id')},
        ${selectIf(packetColumns, 'ap', 'tree_node_id', 'tree_node_id', '::text')},
        ${selectIf(packetColumns, 'ap', 'parent_packet_key')},
        ${selectIf(packetColumns, 'ap', 'domain_class')},
        ${selectIf(packetColumns, 'ap', 'summary')},
        ${selectIf(packetColumns, 'ap', 'qdrant_point_id')},
        ${selectIf(packetColumns, 'ap', 'community_id')},
        ${selectIf(packetColumns, 'ap', 'som_row')},
        ${selectIf(packetColumns, 'ap', 'som_col')},
        ${selectIf(packetColumns, 'ap', 'som_index')},
        ${selectIf(packetColumns, 'ap', 'kmeans_cluster')},
        ${selectIf(packetColumns, 'ap', 'page_rank_score')},
        ${selectIf(packetColumns, 'ap', 'k_core')},
        ${selectIf(packetColumns, 'ap', 'keywords')},
        ${selectIf(packetColumns, 'ap', 'ngrams')},
        ${selectIf(packetColumns, 'ap', 'trigrams')},
        COALESCE(${featureConcepts}, ${packetConcepts}, ${conceptIds}, ARRAY[]::text[]) AS used_concepts,
        ${featureColumns.has('lexical_features') ? 'COALESCE(apf.lexical_features, ARRAY[]::text[])' : 'ARRAY[]::text[]'} AS lexical_features,
        ${featureColumns.has('ast_symbols') ? 'COALESCE(apf.ast_symbols, ARRAY[]::text[])' : 'ARRAY[]::text[]'} AS ast_symbols,
        ${featureColumns.has('entities') ? 'COALESCE(apf.entities, ARRAY[]::text[])' : 'ARRAY[]::text[]'} AS entities,
        ${selectIf(packetColumns, 'ap', 'content_embedding_384', 'content_embedding_384', '::text')},
        ${selectIf(packetColumns, 'ap', 'embedding', 'embedding', '::text')},
        ${selectIf(packetColumns, 'ap', 'latent_64')},
        ${selectIf(metricColumns, 'apm', 'pca_latent')},
        ${selectIf(metricColumns, 'apm', 'jepa_latent')},
        ${selectIf(metricColumns, 'apm', 'packet_jepa_similarity')},
        ${selectIf(metricColumns, 'apm', 'jepa_model_version')},
        COALESCE(NULLIF(ap.metadata->>'ontology_label', ''), NULLIF(ap.payload->>'ontology_label', '')) AS ontology_label,
        COALESCE(NULLIF(ap.metadata->>'topology_label', ''), NULLIF(ap.topology->>'topology_label', '')) AS topology_label,
        ${selectIf(packetColumns, 'ap', 'updated_at', 'updated_at', '::text')}
      FROM atlas_packets ap
      ${featureJoin}
      ${metricJoin}
      WHERE ap.packet_key IS NOT NULL
      ORDER BY ap.packet_key
      LIMIT $1 OFFSET $2
    `;

    const result = await client.query(sql, [LIMIT, OFFSET]);
    return result.rows.map((row) => {
      const content384 = parsePgVector(row.content_embedding_384);
      const embedding = parsePgVector(row.embedding);
      const pca = Array.isArray(row.pca_latent) ? row.pca_latent.map(Number).filter(Number.isFinite) : [];
      const jepa = Array.isArray(row.jepa_latent) ? row.jepa_latent.map(Number).filter(Number.isFinite) : [];
      const primaryVector = content384.length ? content384 : embedding;
      const vectorKind = content384.length ? 'content_embedding_384' : embedding.length ? 'embedding' : 'none';
      const normalized = {
        ...row,
        packet_key: normalizeText(row.packet_key),
        source_ref: normalizeText(row.source_ref || row.canonical_source_ref || row.file_path),
        canonical_source_ref: normalizeText(row.canonical_source_ref || row.source_ref || row.file_path),
        source_ref_key: normalizeText(row.source_ref_key),
        file_path: normalizeText(row.file_path),
        directory_path: normalizeText(row.directory_path),
        feature_id: normalizeText(row.feature_id),
        feature_label: normalizeText(row.feature_label),
        title_id: normalizeText(row.title_id),
        tree_node_id: normalizeText(row.tree_node_id),
        parent_packet_key: normalizeText(row.parent_packet_key),
        domain_class: normalizeText(row.domain_class),
        ontology_label: normalizeText(row.ontology_label),
        topology_label: normalizeText(row.topology_label),
        summary: normalizeText(row.summary),
        qdrant_point_id: normalizeText(row.qdrant_point_id),
        keywords: uniqueStrings(row.keywords),
        ngrams: uniqueStrings(row.ngrams),
        trigrams: uniqueStrings(row.trigrams),
        used_concepts: uniqueStrings(row.used_concepts),
        lexical_features: uniqueStrings(row.lexical_features),
        ast_symbols: uniqueStrings(row.ast_symbols),
        entities: uniqueStrings(row.entities),
        primaryVector,
        vectorKind,
        pca,
        jepa,
        latent64: bufferToUint8Array(row.latent_64),
      };
      return {
        ...normalized,
        split: stableSplit(normalized.packet_key),
        semantic_input: semanticInput(normalized),
        semantic_target: semanticTarget(normalized),
      };
    });
  } finally {
    client.release();
  }
}

function makeTable(rows) {
  const strings = (name, map = (row) => row[name] || null) => vectorFromArray(rows.map(map), new Utf8());
  const ints = (name) => vectorFromArray(rows.map((row) => Number.isFinite(Number(row[name])) ? Number(row[name]) : null), new Int32());
  const floats = (name) => vectorFromArray(rows.map((row) => Number.isFinite(Number(row[name])) ? Number(row[name]) : null), new Float32());
  const bools = (map) => vectorFromArray(rows.map(map), new Bool());
  const binaries = (map) => vectorFromArray(rows.map(map), new Binary());

  return new Table({
    packet_key: strings('packet_key'),
    source_ref: strings('source_ref'),
    canonical_source_ref: strings('canonical_source_ref'),
    source_ref_key: strings('source_ref_key'),
    file_path: strings('file_path'),
    directory_path: strings('directory_path'),
    feature_id: strings('feature_id'),
    feature_label: strings('feature_label'),
    title_id: strings('title_id'),
    tree_node_id: strings('tree_node_id'),
    parent_packet_key: strings('parent_packet_key'),
    domain_class: strings('domain_class'),
    ontology_label: strings('ontology_label'),
    topology_label: strings('topology_label'),
    summary: strings('summary'),
    qdrant_point_id: strings('qdrant_point_id'),
    dataset_split: strings('split'),
    semantic_input: strings('semantic_input'),
    semantic_target: strings('semantic_target'),
    supervision_source: strings('supervision_source', () => 'canonical_postgres_labels'),
    keywords_json: strings('keywords_json', (row) => arrayJson(row.keywords)),
    ngrams_json: strings('ngrams_json', (row) => arrayJson(row.ngrams)),
    trigrams_json: strings('trigrams_json', (row) => arrayJson(row.trigrams)),
    used_concepts_json: strings('used_concepts_json', (row) => arrayJson(row.used_concepts)),
    lexical_features_json: strings('lexical_features_json', (row) => arrayJson(row.lexical_features)),
    ast_symbols_json: strings('ast_symbols_json', (row) => arrayJson(row.ast_symbols)),
    entities_json: strings('entities_json', (row) => arrayJson(row.entities)),
    community_id: ints('community_id'),
    som_row: ints('som_row'),
    som_col: ints('som_col'),
    som_index: ints('som_index'),
    kmeans_cluster: ints('kmeans_cluster'),
    k_core: ints('k_core'),
    page_rank_score: floats('page_rank_score'),
    packet_jepa_similarity: floats('packet_jepa_similarity'),
    jepa_model_version: strings('jepa_model_version'),
    vector_kind: strings('vectorKind'),
    vector_dim: vectorFromArray(rows.map((row) => row.primaryVector.length), new Int32()),
    vector_f32: binaries((row) => floatsToBytes(row.primaryVector)),
    pca_dim: vectorFromArray(rows.map((row) => row.pca.length), new Int32()),
    pca_f32: binaries((row) => floatsToBytes(row.pca)),
    jepa_dim: vectorFromArray(rows.map((row) => row.jepa.length), new Int32()),
    jepa_f32: binaries((row) => floatsToBytes(row.jepa)),
    latent64_blob: binaries((row) => row.latent64),
    has_tree_node: bools((row) => Boolean(row.tree_node_id)),
    has_feature_evidence: bools((row) => row.used_concepts.length > 0 || row.lexical_features.length > 0 || row.ast_symbols.length > 0),
    has_topology: bools((row) => Number.isFinite(Number(row.som_row)) && Number.isFinite(Number(row.som_col))),
    updated_at: strings('updated_at'),
  });
}

function coverage(rows, predicate) {
  return rows.reduce((count, row) => count + (predicate(row) ? 1 : 0), 0);
}

async function main() {
  const rows = await loadRows();
  const duplicatePacketKeys = rows.length - new Set(rows.map((row) => row.packet_key)).size;
  const table = makeTable(rows);
  const ipc = tableToIPC(table, 'file');
  const splits = Object.fromEntries(['train', 'eval', 'test'].map((split) => [split, coverage(rows, (row) => row.split === split)]));
  const report = {
    generated_at: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    inputs: { limit: LIMIT, offset: OFFSET },
    outputs: {
      arrow_ipc: path.relative(REPO_ROOT, OUTPUT_FILE).replace(/\\/g, '/'),
      row_index: path.relative(REPO_ROOT, INDEX_FILE).replace(/\\/g, '/'),
    },
    summary: {
      rows: rows.length,
      columns: table.numCols,
      ipc_bytes: ipc.byteLength,
      duplicate_packet_keys: duplicatePacketKeys,
      splits,
      coverage: {
        source_ref: coverage(rows, (row) => Boolean(row.source_ref)),
        feature_id: coverage(rows, (row) => Boolean(row.feature_id)),
        feature_label: coverage(rows, (row) => Boolean(row.feature_label)),
        title_id: coverage(rows, (row) => Boolean(row.title_id)),
        tree_node_id: coverage(rows, (row) => Boolean(row.tree_node_id)),
        domain_class: coverage(rows, (row) => Boolean(row.domain_class)),
        feature_evidence: coverage(rows, (row) => row.used_concepts.length > 0 || row.lexical_features.length > 0 || row.ast_symbols.length > 0),
        embedding_vector: coverage(rows, (row) => row.primaryVector.length > 0),
        latent64_blob: coverage(rows, (row) => Boolean(row.latent64?.byteLength)),
        topology: coverage(rows, (row) => Number.isFinite(Number(row.som_row)) && Number.isFinite(Number(row.som_col))),
      },
    },
    contract: {
      canonical_store: 'postgres',
      batch_transport: 'apache_arrow_ipc_file',
      hot_packet_transport: 'msgpack_mmap_registry',
      vector_encoding: 'little_endian_float32',
      row_index_semantics: 'arrow_row_index_not_byte_offset',
      split_semantics: 'sha256_packet_key_80_10_10',
    },
  };

  if (duplicatePacketKeys > 0) {
    throw new Error(`Refusing export: ${duplicatePacketKeys} duplicate packet_key rows after joins`);
  }

  if (APPLY) {
    await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
    await fs.writeFile(OUTPUT_FILE, Buffer.from(ipc));
    const index = {
      version: 2,
      arrow_file: path.basename(OUTPUT_FILE),
      total_rows: rows.length,
      entries: Object.fromEntries(rows.map((row, rowIndex) => [row.packet_key, {
        row_index: rowIndex,
        dataset_split: row.split,
        feature_id: row.feature_id || null,
        tree_node_id: row.tree_node_id || null,
      }])),
    };
    await fs.writeFile(INDEX_FILE, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  }

  await fs.mkdir(path.dirname(REPORT_FILE), { recursive: true });
  await fs.writeFile(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: 'READY', ...report }, null, 2));
}

main()
  .catch((error) => {
    console.error('[arrow-batch-export] failed:', error?.stack || error?.message || String(error));
    process.exitCode = 1;
  })
  .finally(() => pool.end());
