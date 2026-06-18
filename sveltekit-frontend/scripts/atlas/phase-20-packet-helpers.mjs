#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';
import { normalizeSourceRef } from './canonical-source-ref.mjs';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');
export const DOCS_DIR = path.join(REPO_ROOT, 'docs', 'reports');
export const TMP_DIR = path.join(REPO_ROOT, '.tmp');
export const ADDRESSABLE_NDJSON = path.join(TMP_DIR, 'addressable-packets.ndjson');
export const ADDRESSABLE_MANIFEST = path.join(TMP_DIR, 'addressable-packets.manifest.json');
export const MATERIALIZER_REPORT_JSON = path.join(DOCS_DIR, 'packet-reader-writer-audit.json');
export const MATERIALIZER_REPORT_MD = path.join(DOCS_DIR, 'packet-reader-writer-audit.md');
export const VALIDATION_REPORT_JSON = path.join(DOCS_DIR, 'phase-20-addressable-packets-validation.json');
export const VALIDATION_REPORT_MD = path.join(DOCS_DIR, 'phase-20-addressable-packets-validation.md');
export const BACKFILL_REPORT_JSON = path.join(DOCS_DIR, 'phase-20-packet-metadata-backfill.json');
export const BACKFILL_REPORT_MD = path.join(DOCS_DIR, 'phase-20-packet-metadata-backfill.md');
export const PACKET_TABLES = ['atlas_packets', 'nes_chrom_packets', 'atlas_feature_packets'];

export function loadPool() {
  loadAtlasEnv(REPO_ROOT);
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
  return new Pool({ connectionString, max: 2, statement_timeout: 30000 });
}

export function ensureDirFor(filePath) {
  return fs.mkdir(path.dirname(filePath), { recursive: true });
}

export function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

export function toNullableText(value) {
  const text = normalizeText(value);
  return text.length ? text : null;
}

export function asArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }
  const text = normalizeText(value);
  return text ? [text] : [];
}

export function asJson(value, fallback = {}) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export function firstText(...values) {
  for (const value of values) {
    const text = toNullableText(value);
    if (text) return text;
  }
  return null;
}

export function firstNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export async function resolveTableColumns(pool, tableName) {
  const { rows } = await pool.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position
    `,
    [tableName],
  );
  return new Set(rows.map((row) => row.column_name));
}

export async function tableExists(pool, tableName) {
  const { rows } = await pool.query(
    `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = $1
      LIMIT 1
    `,
    [tableName],
  );
  return rows.length > 0;
}

export function normalizeSourceRefKey(value) {
  return normalizeSourceRef(normalizeText(value)).toLowerCase();
}

export function normalizeCanonicalSourceRef(value) {
  return normalizeSourceRef(normalizeText(value));
}

export function mergeObjects(...values) {
  const result = {};
  for (const value of values) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    Object.assign(result, value);
  }
  return result;
}

export function buildBm25Text(row) {
  return [
    row.feature_label,
    row.feature_id,
    row.summary,
    row.source_ref,
    row.file_path,
    ...(Array.isArray(row.tags) ? row.tags : []),
    ...(Array.isArray(row.lane_ids) ? row.lane_ids : []),
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildTopology(row, extra = {}) {
  return {
    community_id: row.community_id ?? null,
    community_confidence: row.community_confidence ?? row.communityConfidence ?? null,
    som_cluster: row.som_cluster ?? row.somCluster ?? null,
    som_row: row.som_row ?? row.somRow ?? null,
    som_col: row.som_col ?? row.somCol ?? null,
    som_index: row.som_index ?? row.somIndex ?? null,
    pagerank: row.pagerank ?? null,
    betweenness: row.betweenness ?? null,
    eigenvector: row.eigenvector ?? null,
    neo4j_node_id: row.neo4j_node_id ?? row.neo4jNodeId ?? null,
    redis_centroid_key: row.redis_centroid_key ?? row.redisCentroidKey ?? null,
    cluster_id: row.cluster_id ?? row.clusterId ?? null,
    centroid_id: row.centroid_id ?? row.centroidId ?? null,
    topology_version: row.topology_version ?? row.topologyVersion ?? 'phase-20-v1',
    ...extra,
  };
}

export function buildVectors(row, extra = {}) {
  return {
    qdrant_point_id: row.qdrant_point_id ?? row.qdrantPointId ?? null,
    qdrant_collection: row.qdrant_collection ?? row.qdrantCollection ?? null,
    qdrant_vector_dim: row.qdrant_vector_dim ?? row.qdrantVectorDim ?? null,
    latent_64: row.latent_64 ?? row.latent64 ?? null,
    embedding: row.embedding ?? null,
    vector_source: row.vector_source ?? row.vectorSource ?? null,
    ...extra,
  };
}
