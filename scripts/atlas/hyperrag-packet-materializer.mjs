#!/usr/bin/env node
/**
 * HyperRAG Packet Materializer
 *
 * Bounded joiner / writer for the packet materialization lane:
 *   Postgres truth -> canonical envelope -> MsgPack packet -> hot registry
 *   -> optional atlas_packet_registry upsert -> audit / telemetry report
 *
 * This script is intentionally conservative:
 * - it does not mutate identity fields
 * - it only promotes validated packets into the MsgPack/mmap registry
 * - rejected rows are written to audit output, not the hot binary store
 *
 * Usage:
 *   node scripts/atlas/hyperrag-packet-materializer.mjs --dry-run --limit=100
 *   node scripts/atlas/hyperrag-packet-materializer.mjs --apply --limit=500 --batch-size=100
 */

import 'dotenv/config';
import fs from 'node:fs/promises';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { encode } from '../../sveltekit-frontend/node_modules/@msgpack/msgpack/dist.esm/index.mjs';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { buildCanonicalFeatureEnvelope } from './lib/envelope-builder.mjs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { values: args } = parseArgs({
  options: {
    apply: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    limit: { type: 'string' },
    'batch-size': { type: 'string' },
    verbose: { type: 'boolean', default: false },
  },
  strict: false,
});

const APPLY = Boolean(args.apply);
const DRY_RUN = Boolean(args['dry-run']) || !APPLY;
const LIMIT = Number(args.limit ?? 500);
const BATCH_SIZE = Number(args['batch-size'] ?? 200);
const VERBOSE = Boolean(args.verbose);

const env = loadRepoEnv(process.env);
const pool = new Pool({
  connectionString: resolveDatabaseUrl(env),
  max: 4,
});

const TMP_DIR = path.join(REPO_ROOT, '.tmp');
const REPORT_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const HOT_DIR = path.join(REPO_ROOT, 'memory', 'packets');
const MSGPACK_FILE = path.join(HOT_DIR, 'hyperrag-packets.msgpack');
const MANIFEST_FILE = path.join(HOT_DIR, 'hyperrag-packets.manifest.json');
const NDJSON_FILE = path.join(TMP_DIR, 'hyperrag-packet-materializer.ndjson');
const REPORT_JSON = path.join(REPORT_DIR, 'hyperrag-packet-materializer.json');
const REPORT_MD = path.join(REPORT_DIR, 'hyperrag-packet-materializer.md');

function normalizeText(value) {
  return String(value ?? '').trim();
}

function asArray(value) {
  if (Array.isArray(value)) return value.map((item) => normalizeText(item)).filter(Boolean);
  if (!value) return [];
  return [normalizeText(value)].filter(Boolean);
}

function uniq(values) {
  return [...new Set(values.map(normalizeText).filter(Boolean))];
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map((item) => stableJson(item));
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      const next = stableJson(value[key]);
      if (next !== undefined) acc[key] = next;
      return acc;
    }, {});
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableJson(value));
}

function sha256(text) {
  return createHash('sha256').update(String(text)).digest('hex');
}

function numericOrNull(value) {
  const text = normalizeText(value);
  if (!text) return null;
  return /^[0-9]+$/.test(text) ? Number(text) : null;
}

function base64Json(value) {
  return Buffer.from(stableStringify(value), 'utf8').toString('base64');
}

function makeTraceId(packetKey, sourceRef) {
  return sha256(`${packetKey}:${sourceRef}`).slice(0, 32);
}

function detectMaterializationState(row) {
  if (!normalizeText(row.packet_key) || !normalizeText(row.source_ref) || !normalizeText(row.feature_id) || !normalizeText(row.title_id)) {
    return 'IdentityError';
  }
  if (!Array.isArray(row.ast_symbols) || row.ast_symbols.filter(Boolean).length === 0) return 'StructureError';
  if (!Array.isArray(row.lexical_features) || row.lexical_features.filter(Boolean).length === 0) return 'LexicalError';
  if (!Array.isArray(row.used_concepts) || row.used_concepts.filter(Boolean).length === 0) return 'SemanticError';
  if (!normalizeText(row.qdrant_point_id)) return 'QdrantBridgeError';
  if (!Number.isFinite(Number(row.som_row)) || !Number.isFinite(Number(row.som_col))) return 'TopologyError';
  return 'COMPLETE';
}

function repairLaneForState(state) {
  switch (state) {
    case 'IdentityError': return 'identity_backfill';
    case 'StructureError': return 'ast_grep';
    case 'LexicalError': return 'lexical_splitter';
    case 'SemanticError': return 'langextract';
    case 'QdrantBridgeError': return 'qdrant_bridge';
    case 'TopologyError': return 'som_backfill';
    default: return 'accept';
  }
}

function recommendedCommandForLane(lane) {
  switch (lane) {
    case 'identity_backfill':
      return 'npm run atlas:packet-metadata:backfill:apply';
    case 'ast_grep':
      return 'npm run atlas:phase8:step3:langextract:apply';
    case 'lexical_splitter':
      return 'node scripts/atlas/export-semantic-training-rows.mjs --apply';
    case 'langextract':
      return 'npm run atlas:phase8:step3:langextract:apply';
    case 'qdrant_bridge':
      return 'node scripts/atlas/qdrant-point-id-bridge.mjs --apply --batch-size=500';
    case 'som_backfill':
      return 'node scripts/atlas/validate-som-20x20-topology.mjs --dry-run';
    default:
      return 'noop';
  }
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

function pushColumn(select, alias, column, outAlias = null, columns = null) {
  if (columns && !columns.has(column)) return;
  select.push(`${alias}.${column}${outAlias ? ` AS ${outAlias}` : ''}`);
}

async function fetchRows(limit) {
  const client = await pool.connect();
  try {
    const packetCols = await getColumns(client, 'atlas_packets');
    const featureExists = await tableExists(client, 'atlas_packet_features');
    const metricExists = await tableExists(client, 'atlas_packet_metrics');
    const bridgeExists = await tableExists(client, 'packet_qdrant_bridge');
    const regExists = await tableExists(client, 'atlas_packet_registry');
    const featureCols = featureExists ? await getColumns(client, 'atlas_packet_features') : new Set();
    const metricCols = metricExists ? await getColumns(client, 'atlas_packet_metrics') : new Set();
    const bridgeCols = bridgeExists ? await getColumns(client, 'packet_qdrant_bridge') : new Set();
    const regCols = regExists ? await getColumns(client, 'atlas_packet_registry') : new Set();

    const select = [
      'ap.packet_id',
      'ap.packet_key',
      'ap.packet_ulid',
      'ap.source_ref',
      'ap.source_ref_key',
      'ap.canonical_source_ref',
      'ap.source_path',
      'ap.file_path',
      'ap.directory_path',
      'ap.feature_id',
      'ap.feature_label',
      'ap.title_id',
      'ap.tree_node_id',
      'ap.domain_class',
      `COALESCE(
        NULLIF(TRIM(ap.metadata->>'ontology_label'), ''),
        NULLIF(TRIM(ap.payload->>'ontology_label'), ''),
        NULLIF(TRIM(ap.topology->>'ontology_label'), ''),
        NULLIF(TRIM(ap.metadata->>'ontology'), ''),
        NULLIF(TRIM(ap.payload->>'ontology'), '')
      ) AS ontology_label`,
      `COALESCE(
        NULLIF(TRIM(ap.metadata->>'topology_label'), ''),
        NULLIF(TRIM(ap.payload->>'topology_label'), ''),
        NULLIF(TRIM(ap.topology->>'topology_label'), ''),
        NULLIF(TRIM(ap.topology->>'cluster_key'), ''),
        NULLIF(TRIM(ap.topology->>'som_cluster'), '')
      ) AS topology_label`,
      'ap.summary',
      'ap.payload',
      'ap.metadata',
      'ap.permissions',
      'ap.topology',
      'ap.routing_hints',
      'ap.keywords',
      'ap.ngrams',
      'ap.trigrams',
      'ap.engrams',
      'ap.concept_ids',
      'ap.used_concepts',
      'ap.qdrant_point_id',
      'ap.community_id',
      'ap.som_row',
      'ap.som_col',
      'ap.som_cluster',
      'ap.kmeans_cluster',
      'ap.page_rank_score',
      'ap.k_core',
      'ap.latent_64',
      'ap.created_at',
      'ap.updated_at',
    ];

    if (packetCols.has('embedding')) select.push('ap.embedding');
    if (packetCols.has('content_embedding_384')) select.push('ap.content_embedding_384');
    if (packetCols.has('cheirank_score')) select.push('ap.cheirank_score');
    if (featureExists) {
      pushColumn(select, 'apf', 'used_concepts', 'features_used_concepts', featureCols);
      pushColumn(select, 'apf', 'lexical_features', 'features_lexical_features', featureCols);
      pushColumn(select, 'apf', 'ast_symbols', 'features_ast_symbols', featureCols);
      pushColumn(select, 'apf', 'entities', 'features_entities', featureCols);
    }
    if (metricExists) {
      pushColumn(select, 'apm', 'feature_density', 'feature_density', metricCols);
      pushColumn(select, 'apm', 'complexity_score', 'complexity_score', metricCols);
      pushColumn(select, 'apm', 'semantic_entropy', 'semantic_entropy', metricCols);
      pushColumn(select, 'apm', 'retrieval_relevance', 'retrieval_relevance', metricCols);
      pushColumn(select, 'apm', 'authority_score', 'authority_score', metricCols);
      pushColumn(select, 'apm', 'naive_bayes_predictions', 'naive_bayes_predictions', metricCols);
      pushColumn(select, 'apm', 'hmm_recommendations', 'hmm_recommendations', metricCols);
    }
    if (bridgeExists) {
      pushColumn(select, 'b', 'qdrant_point_id', 'bridge_qdrant_point_id', bridgeCols);
      pushColumn(select, 'b', 'relative_path', 'bridge_relative_path', bridgeCols);
      pushColumn(select, 'b', 'directory_path', 'bridge_directory_path', bridgeCols);
    }
    if (regExists) {
      pushColumn(select, 'r', 'seaweedfs_filer_path', 'registry_seaweedfs_filer_path', regCols);
      pushColumn(select, 'r', 'valkey_cache_key', 'registry_valkey_cache_key', regCols);
      pushColumn(select, 'r', 'ace_cache_key', 'registry_ace_cache_key', regCols);
      pushColumn(select, 'r', 'validation_status', 'registry_validation_status', regCols);
      pushColumn(select, 'r', 'status', 'registry_status', regCols);
    }

    const sql = `
      SELECT ${select.join(',\n             ')}
      FROM atlas_packets ap
      ${featureExists ? 'LEFT JOIN atlas_packet_features apf ON apf.packet_key = ap.packet_key' : ''}
      ${metricExists ? 'LEFT JOIN atlas_packet_metrics apm ON apm.packet_key = ap.packet_key' : ''}
      ${bridgeExists ? 'LEFT JOIN packet_qdrant_bridge b ON b.packet_key = ap.packet_key' : ''}
      ${regExists ? 'LEFT JOIN atlas_packet_registry r ON r.packet_key = ap.packet_key' : ''}
      WHERE ap.packet_key IS NOT NULL
        AND COALESCE(NULLIF(TRIM(ap.qdrant_point_id), ''), NULLIF(TRIM(b.qdrant_point_id), '')) IS NOT NULL
      ORDER BY ap.packet_key
      LIMIT $1
    `;
    const { rows } = await client.query(sql, [limit]);
    return rows.map((row) => ({
      ...row,
      used_concepts: row.used_concepts ?? row.features_used_concepts ?? row.concept_ids ?? [],
      lexical_features: row.lexical_features ?? row.features_lexical_features ?? [],
      ast_symbols: row.ast_symbols ?? row.features_ast_symbols ?? [],
      entities: row.entities ?? row.features_entities ?? row.extracted_entities ?? [],
      qdrant_point_id: normalizeText(row.qdrant_point_id) || normalizeText(row.bridge_qdrant_point_id) || null,
      source_ref: normalizeText(row.source_ref || row.canonical_source_ref || row.source_path || row.file_path),
      file_path: normalizeText(row.file_path || row.source_path || row.bridge_relative_path || row.bridge_directory_path || row.source_ref),
      directory_path: normalizeText(row.directory_path || row.bridge_directory_path || '').replace(/\\/g, '/') || null,
      title_id: normalizeText(row.title_id) || normalizeText(row.feature_label) || normalizeText(row.feature_id).replace(/\./g, ':') || null,
    }));
  } finally {
    client.release();
  }
}

function buildLedgerPacket(row) {
  const { envelope, validation } = buildCanonicalFeatureEnvelope({
    ...row,
    used_concepts: row.used_concepts,
    qdrant_point_id: row.qdrant_point_id,
  });

  const hmmState = detectMaterializationState({
    ...row,
    used_concepts: row.used_concepts,
  });
  const repairLane = repairLaneForState(hmmState);

  const routingHints = uniq([
    ...(Array.isArray(row.routing_hints) ? row.routing_hints : []),
    row.domain_class,
    row.ontology_label,
    row.topology_label,
    row.feature_id,
    row.title_id,
    row.som_cluster,
    row.community_id != null ? `community:${row.community_id}` : null,
    row.som_row != null && row.som_col != null ? `som:${row.som_row}:${row.som_col}` : null,
  ]);

  const materialized = {
    packet_key: row.packet_key,
    packet_id: row.packet_id,
    packet_ulid: row.packet_ulid,
    source_ref: row.source_ref,
    source_ref_key: row.source_ref_key || row.source_ref,
    canonical_source_ref: row.canonical_source_ref || row.source_ref,
    source_path: row.source_path || row.file_path || null,
    file_path: row.file_path || row.source_path || null,
    directory_path: row.directory_path || null,
    feature_id: row.feature_id,
    feature_label: row.feature_label || null,
    title_id: row.title_id || null,
    tree_node_id: row.tree_node_id || null,
    domain_class: row.domain_class || null,
    ontology_label: row.ontology_label || null,
    topology_label: row.topology_label || null,
    used_concepts: row.used_concepts || [],
    ast_symbols: row.ast_symbols || [],
    lexical_features: row.lexical_features || [],
    entities: row.entities || [],
    keywords: row.keywords || [],
    ngrams: row.ngrams || [],
    trigrams: row.trigrams || [],
    engrams: row.engrams || [],
    qdrant_point_id: row.qdrant_point_id || null,
    community_id: row.community_id || null,
    som_row: row.som_row ?? null,
    som_col: row.som_col ?? null,
    som_cluster: row.som_cluster || null,
    kmeans_cluster: row.kmeans_cluster ?? null,
    page_rank_score: row.page_rank_score ?? null,
    cheirank_score: row.cheirank_score ?? null,
    k_core: row.k_core ?? null,
    latent_64: row.latent_64 ? Buffer.from(row.latent_64).toString('base64') : null,
    payload: row.payload && typeof row.payload === 'object' ? row.payload : null,
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : null,
    permissions: row.permissions && typeof row.permissions === 'object' ? row.permissions : null,
    topology: row.topology && typeof row.topology === 'object' ? row.topology : null,
    routing_hints: routingHints,
    ace_packet: envelope,
    acp: {
      hmm_state: hmmState,
      repair_lane: repairLane,
      recommended_command: recommendedCommandForLane(repairLane),
      trace_id: makeTraceId(row.packet_key, row.source_ref),
      opentelemetry: {
        trace_id: makeTraceId(row.packet_key, row.source_ref),
        span_name: 'hyperrag.packet.materializer',
        source: 'scripts/atlas/hyperrag-packet-materializer.mjs',
      },
    },
    provenance: {
      packet_key: row.packet_key,
      source_ref: row.source_ref,
      source_ref_key: row.source_ref_key || row.source_ref,
      qdrant_point_id: row.qdrant_point_id || null,
      validation_status: validation.isValid ? 'valid' : 'invalid',
      hard_failures: validation.hardFailures,
      soft_warnings: validation.softWarnings,
      generated_at: new Date().toISOString(),
    },
  };

  return {
    validation,
    hmmState,
    repairLane,
    routingHints,
    materialized,
  };
}

async function ensureHotTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS atlas_packet_registry (
      packet_key TEXT PRIMARY KEY,
      trace_id TEXT,
      source_ref TEXT,
      source_ref_key TEXT,
      canonical_source_ref TEXT,
      file_path TEXT,
      directory_path TEXT,
      feature_id TEXT,
      title TEXT,
      title_id TEXT,
      tree_node_id TEXT,
      parent_node_id TEXT,
      root_node_id TEXT,
      summary TEXT,
      embedding_status TEXT,
      embedding_dim INTEGER,
      embedding_768d BYTEA,
      latent_384d BYTEA,
      latent_64 BYTEA,
      kmeans_cluster_id TEXT,
      som_x INTEGER,
      som_y INTEGER,
      semantic_z REAL,
      activity_w REAL,
      manifold4 JSONB,
      qdrant_point_id BIGINT,
      turbovec_id TEXT,
      neo4j_node_id TEXT,
      valkey_cache_key TEXT,
      ace_cache_key TEXT,
      seaweedfs_filer_path TEXT,
      pagerank_score REAL,
      authority_blend REAL,
      karpathy_score REAL,
      last_rerank_score REAL,
      retrieval_count INTEGER,
      cache_hits INTEGER,
      cache_misses INTEGER,
      last_retrieved TIMESTAMP,
      cache_state TEXT,
      activity JSONB,
      status TEXT,
      created_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ,
      kag_edges JSONB,
      dag_edges JSONB,
      total_size_bytes BIGINT,
      validation_status TEXT,
      last_validated TIMESTAMP
    )
  `);
  await client.query(`
    ALTER TABLE atlas_packet_registry
      ADD COLUMN IF NOT EXISTS source_ref_key TEXT,
      ADD COLUMN IF NOT EXISTS canonical_source_ref TEXT,
      ADD COLUMN IF NOT EXISTS directory_path TEXT,
      ADD COLUMN IF NOT EXISTS title_id TEXT,
      ADD COLUMN IF NOT EXISTS tree_node_id TEXT,
      ADD COLUMN IF NOT EXISTS parent_node_id TEXT,
      ADD COLUMN IF NOT EXISTS root_node_id TEXT
  `);
}

async function upsertRegistry(client, packet) {
  const payload = {
    packet_key: packet.packet_key,
    source_ref: packet.source_ref,
    source_ref_key: packet.source_ref_key,
    canonical_source_ref: packet.canonical_source_ref,
    file_path: packet.file_path,
    directory_path: packet.directory_path,
    feature_id: packet.feature_id,
    title_id: packet.title_id,
    tree_node_id: packet.tree_node_id,
    parent_node_id: packet.parent_node_id || null,
    root_node_id: packet.root_node_id || null,
    domain_class: packet.domain_class,
    ontology_label: packet.ontology_label,
    topology_label: packet.topology_label,
    used_concepts: packet.used_concepts,
    ast_symbols: packet.ast_symbols,
    lexical_features: packet.lexical_features,
    entities: packet.entities,
    qdrant_point_id: packet.qdrant_point_id,
    community_id: packet.community_id,
    som_row: packet.som_row,
    som_col: packet.som_col,
    som_cluster: packet.som_cluster,
    kmeans_cluster: packet.kmeans_cluster,
    page_rank_score: packet.page_rank_score,
    cheirank_score: packet.cheirank_score,
    k_core: packet.k_core,
    routing_hints: packet.routing_hints,
    acp: packet.acp,
    provenance: packet.provenance,
  };

  const msgpackBytes = encode(payload);
  const checksum = sha256(Buffer.from(msgpackBytes));

  const traceId = payload.acp.trace_id;
  const registryPath = path.join('memory', 'packets', 'hyperrag', `${packet.packet_key}.msgpack`);
  const valkeyKey = `bitfrost:hyperrag:${packet.packet_key}`;
  const qdrantRegistryId = numericOrNull(packet.qdrant_point_id);

  await client.query(`
    INSERT INTO atlas_packet_registry (
      packet_key,
      trace_id,
      source_ref,
      source_ref_key,
      canonical_source_ref,
      file_path,
      directory_path,
      feature_id,
      title,
      title_id,
      tree_node_id,
      parent_node_id,
      root_node_id,
      summary,
      embedding_status,
      embedding_dim,
      qdrant_point_id,
      pagerank_score,
      cache_state,
      status,
      validation_status,
      created_at,
      updated_at,
      seaweedfs_filer_path,
      valkey_cache_key,
      ace_cache_key,
      total_size_bytes
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27
    )
    ON CONFLICT (packet_key) DO UPDATE SET
      trace_id = EXCLUDED.trace_id,
      source_ref = EXCLUDED.source_ref,
      source_ref_key = EXCLUDED.source_ref_key,
      canonical_source_ref = EXCLUDED.canonical_source_ref,
      file_path = EXCLUDED.file_path,
      directory_path = EXCLUDED.directory_path,
      feature_id = EXCLUDED.feature_id,
      title = EXCLUDED.title,
      title_id = EXCLUDED.title_id,
      tree_node_id = EXCLUDED.tree_node_id,
      parent_node_id = EXCLUDED.parent_node_id,
      root_node_id = EXCLUDED.root_node_id,
      summary = EXCLUDED.summary,
      embedding_status = EXCLUDED.embedding_status,
      embedding_dim = EXCLUDED.embedding_dim,
      qdrant_point_id = EXCLUDED.qdrant_point_id,
      pagerank_score = EXCLUDED.pagerank_score,
      cache_state = EXCLUDED.cache_state,
      status = EXCLUDED.status,
      validation_status = EXCLUDED.validation_status,
      created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at,
      seaweedfs_filer_path = EXCLUDED.seaweedfs_filer_path,
      valkey_cache_key = EXCLUDED.valkey_cache_key,
      ace_cache_key = EXCLUDED.ace_cache_key,
      total_size_bytes = EXCLUDED.total_size_bytes
  `, [
    packet.packet_key,
    traceId,
    packet.source_ref,
    packet.source_ref_key || null,
    packet.canonical_source_ref || null,
    packet.file_path,
    packet.directory_path || null,
    packet.feature_id,
    packet.feature_label || packet.title_id || null,
    packet.title_id,
    packet.tree_node_id || null,
    packet.parent_node_id || null,
    packet.root_node_id || null,
    packet.summary || null,
    packet.qdrant_point_id ? 'complete' : 'pending',
    packet.latent_64 ? 64 : null,
    qdrantRegistryId,
    packet.page_rank_score ?? null,
    packet.qdrant_point_id ? 'L3:qdrant' : 'cold',
    'active',
    'valid',
    new Date().toISOString(),
    new Date().toISOString(),
    registryPath,
    valkeyKey,
    `ace:packet:${packet.packet_key}`,
    Buffer.byteLength(JSON.stringify(packet), 'utf8'),
  ]);

  return { msgpackBytes, checksum, traceId, registryPath, valkeyKey };
}

function renderMarkdown(report) {
  return [
    '# HyperRAG Packet Materializer',
    '',
    `Generated: ${report.generated_at}`,
    `Mode: ${report.mode}`,
    `Limit: ${report.limit}`,
    `Batch size: ${report.batch_size}`,
    '',
    '## Summary',
    '',
    `- rows read: ${report.summary.rows_read}`,
    `- validated: ${report.summary.validated}`,
    `- rejected: ${report.summary.rejected}`,
    `- registry writes: ${report.summary.registry_writes}`,
    `- msgpack bytes: ${report.summary.msgpack_bytes}`,
    `- mmap file: ${report.outputs.msgpack_file}`,
    `- manifest: ${report.outputs.manifest}`,
    '',
    '## HMM States',
    '',
    ...Object.entries(report.summary?.state_counts ?? {}).map(([state, count]) => `- ${state}: ${count}`),
    '',
    '## Next Action',
    '',
    report.next_action,
    '',
  ].join('\n');
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  HyperRAG Packet Materializer                                 ║');
  console.log('║  MsgPack + mmap registry + ACP handoff                        ║');
  console.log(`║  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'.padEnd(54)}║`);
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  console.log(`[hyperrag-materializer] limit=${LIMIT} batch_size=${BATCH_SIZE}`);

  await fs.mkdir(TMP_DIR, { recursive: true });
  await fs.mkdir(REPORT_DIR, { recursive: true });
  await fs.mkdir(HOT_DIR, { recursive: true });

  const client = await pool.connect();
  try {
    await ensureHotTable(client);
    const rows = await fetchRows(LIMIT);
    const accepted = [];
    const rejected = [];
    const registryWrites = [];
    const msgpackChunks = [];
    const manifestEntries = [];

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      for (const row of batch) {
        const { validation, hmmState, repairLane, routingHints, materialized } = buildLedgerPacket(row);
        const isAccepted = validation.isValid && normalizeText(row.qdrant_point_id);
        const ledgerRow = {
          packet_key: row.packet_key,
          source_ref: row.source_ref,
          feature_id: row.feature_id,
          title_id: row.title_id,
          tree_node_id: row.tree_node_id || null,
          qdrant_point_id: row.qdrant_point_id || null,
          hmm_state: hmmState,
          repair_lane: repairLane,
          routing_hints: routingHints,
          validation: {
            isValid: validation.isValid,
            hardFailures: validation.hardFailures,
            softWarnings: validation.softWarnings,
          },
          accepted: isAccepted,
          created_at: new Date().toISOString(),
        };

        if (!isAccepted) {
          rejected.push({
            ...ledgerRow,
            reason: !validation.isValid ? validation.hardFailures.join('; ') : 'missing qdrant_point_id',
          });
          continue;
        }

        accepted.push(ledgerRow);

        const packed = await upsertRegistry(client, {
          ...row,
          ...materialized,
          validation_status: 'valid',
          dag_edges: [
            row.source_ref && row.feature_id ? `DESCRIBES:${row.source_ref}->${row.feature_id}` : null,
            row.feature_id && row.title_id ? `GROUPS_AS:${row.title_id}->${row.feature_id}` : null,
            row.feature_id && row.domain_class ? `IN_DOMAIN:${row.feature_id}->${row.domain_class}` : null,
            row.feature_id && row.community_id != null ? `HAS_COMMUNITY:${row.feature_id}->${row.community_id}` : null,
            row.feature_id && row.som_row != null && row.som_col != null ? `HAS_SOM:${row.feature_id}->${row.som_row},${row.som_col}` : null,
          ].filter(Boolean),
        });

        registryWrites.push({
          packet_key: row.packet_key,
          qdrant_point_id: row.qdrant_point_id,
          trace_id: packed.traceId,
          checksum_sha256: packed.checksum,
          msgpack_bytes: packed.msgpackBytes.length,
          registry_path: packed.registryPath,
          valkey_cache_key: packed.valkeyKey,
        });
        msgpackChunks.push(Buffer.from(packed.msgpackBytes));
        manifestEntries.push({
          packet_key: row.packet_key,
          trace_id: packed.traceId,
          qdrant_point_id: row.qdrant_point_id,
          source_ref: row.source_ref,
          feature_id: row.feature_id,
          title_id: row.title_id,
          hmm_state: hmmState,
          repair_lane: repairLane,
          offset: msgpackChunks.slice(0, -1).reduce((sum, chunk) => sum + chunk.length, 0),
          length: packed.msgpackBytes.length,
          checksum_sha256: packed.checksum,
          valkey_cache_key: packed.valkeyKey,
        });
      }
    }

    const msgpackBytes = Buffer.concat(msgpackChunks);
    const manifest = {
      generated_at: new Date().toISOString(),
      mode: APPLY ? 'apply' : 'dry-run',
      limit: LIMIT,
      batch_size: BATCH_SIZE,
      totals: {
        rows_read: rows.length,
        validated: accepted.length,
        rejected: rejected.length,
        registry_writes: registryWrites.length,
        msgpack_bytes: msgpackBytes.length,
      },
      accepted,
      rejected,
      registry_writes: registryWrites,
      manifest_entries: manifestEntries,
      outputs: {
        msgpack_file: path.relative(REPO_ROOT, MSGPACK_FILE).replace(/\\/g, '/'),
        manifest: path.relative(REPO_ROOT, MANIFEST_FILE).replace(/\\/g, '/'),
        ndjson: path.relative(REPO_ROOT, NDJSON_FILE).replace(/\\/g, '/'),
      },
    };

    await fs.writeFile(NDJSON_FILE, `${[...accepted, ...rejected].map((row) => stableStringify(row)).join('\n')}${accepted.length + rejected.length > 0 ? '\n' : ''}`, 'utf8');
    await fs.writeFile(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await fs.writeFile(REPORT_JSON, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await fs.writeFile(REPORT_MD, `${renderMarkdown({
      generated_at: manifest.generated_at,
      mode: manifest.mode,
      limit: LIMIT,
      batch_size: BATCH_SIZE,
      summary: manifest.totals,
      outputs: manifest.outputs,
      next_action: 'Use the validated MsgPack registry as the hot packet lane; keep rejected rows in audit storage only.',
    })}\n`, 'utf8');

    if (APPLY) {
      await fs.writeFile(MSGPACK_FILE, msgpackBytes);
    }

    console.log(JSON.stringify({
      status: APPLY ? 'APPLY' : 'DRY_RUN',
      rows_read: rows.length,
      validated: accepted.length,
      rejected: rejected.length,
      registry_writes: registryWrites.length,
      msgpack_bytes: msgpackBytes.length,
      outputs: manifest.outputs,
    }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[hyperrag-packet-materializer] fatal:', error?.stack || error?.message || String(error));
  process.exit(1);
});
