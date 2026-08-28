#!/usr/bin/env node

/** Read-only semantic_768 coverage audit for the lineage-qualified canary. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv } from './connection-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mapPath = path.join(ROOT, '.tmp/atlas/lineage-qualified-candidate-map-v1.json');
const reportPath = path.join(ROOT, 'docs/reports/lineage-qualified-semantic-coverage-v1.json');
const env = loadRepoEnv(process.env);
const qdrantUrl = (env.QDRANT_URL || `http://${env.QDRANT_HOST || '127.0.0.1'}:${env.QDRANT_PORT || '6333'}`).replace(/\/+$/, '');
const collection = env.ATLAS_QDRANT_COLLECTION || 'codebase_chunks_768';
const placeholder = new Set(['', '0', 'unknown', 'legacy', 'null']);
const clean = (value) => String(value ?? '').trim();
const validRevision = (value) => /^sha256:[0-9a-f]{64}$/i.test(clean(value));

async function qdrant(pathname, init = {}) {
  const response = await fetch(`${qdrantUrl}${pathname}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
    signal: init.signal || AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`QDRANT_${response.status}:${JSON.stringify(body).slice(0, 400)}`);
  return body.result ?? body;
}

function payloadValue(payload, ...keys) {
  for (const key of keys) {
    const value = clean(payload?.[key]);
    if (value && !placeholder.has(value.toLowerCase())) return value;
  }
  return null;
}

async function main() {
  const ordinalMap = JSON.parse(await fs.readFile(mapPath, 'utf8'));
  const candidates = ordinalMap.candidates || [];
  if (!candidates.length) throw new Error('SEMANTIC_COVERAGE_CANDIDATE_MAP_EMPTY');
  const pool = new pg.Pool({
    host: env.DB_HOST || env.PGHOST || '127.0.0.1',
    port: Number(env.DB_PORT || env.PGPORT || 5434),
    database: env.DB_NAME || env.PGDATABASE || 'legal_ai_db',
    user: env.DB_USER || env.PGUSER || 'legal_admin',
    password: env.DB_PASSWORD || env.PGPASSWORD,
    connectionTimeoutMillis: 15_000,
  });
  const columns = await pool.query(`
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'codebase_chunk_index'
  `);
  const names = new Set(columns.rows.map((row) => row.column_name));
  const vectorColumn = ['content_embedding_768', 'embedding_768', 'content_embedding'].find((name) => names.has(name)) || null;
  const packetColumn = names.has('packet_key') ? 'packet_key' : null;
  const sourceColumn = names.has('source_ref') ? 'source_ref' : null;
  const postgresByKey = new Map();
  if (vectorColumn && (packetColumn || sourceColumn)) {
    const keyColumn = packetColumn || sourceColumn;
    const result = await pool.query(`
      SELECT ${keyColumn}::text AS identity_key,
             count(*)::integer AS rows,
             count(*) FILTER (WHERE ${vectorColumn} IS NOT NULL)::integer AS vector_rows
      FROM public.codebase_chunk_index
      WHERE ${keyColumn} IS NOT NULL
      GROUP BY ${keyColumn}
    `);
    for (const row of result.rows) postgresByKey.set(clean(row.identity_key), { rows: Number(row.rows), vectorRows: Number(row.vector_rows) });
  }
  const info = await qdrant(`/collections/${encodeURIComponent(collection)}`);
  const vector = info?.config?.params?.vectors?.content;
  const qdrantRows = [];
  for (const candidate of candidates) {
    const result = await qdrant(`/collections/${encodeURIComponent(collection)}/points/scroll`, {
      method: 'POST',
      body: JSON.stringify({
        limit: 100,
        with_payload: true,
        with_vector: false,
        filter: { must: [{ key: 'packet_key', match: { value: candidate.packetKey } }] },
      }),
    });
    const points = result.points || [];
    const exactPayload = points.filter((point) => {
      const payload = point.payload || {};
      return payloadValue(payload, 'packet_key', 'packetKey') === candidate.packetKey
        && payloadValue(payload, 'source_ref', 'sourceRef') === candidate.sourceRef
        && payloadValue(payload, 'source_revision', 'sourceRevision') === candidate.sourceRevision
        && validRevision(payloadValue(payload, 'workspace_revision', 'workspaceRevision'))
        && payloadValue(payload, 'representation_id', 'representationId') === 'semantic_768'
        && Boolean(payloadValue(payload, 'representation_revision', 'representationRevision'));
    });
    const postgres = postgresByKey.get(candidate.packetKey) || postgresByKey.get(candidate.sourceRef) || null;
    qdrantRows.push({
      candidateOrdinal: candidate.candidateOrdinal,
      packetKey: candidate.packetKey,
      sourceRef: candidate.sourceRef,
      postgres,
      qdrantPoints: points.length,
      qdrantExactLineagePoints: exactPayload.length,
      qdrantPointIds: exactPayload.map((point) => String(point.id)),
      classification: exactPayload.length > 0 ? 'QDRANT_SEMANTIC_768_LINEAGE_EXACT' : points.length > 0 ? 'QDRANT_IDENTITY_PRESENT_SEMANTIC_LINEAGE_UNPROVEN' : 'QDRANT_PACKET_NOT_FOUND',
    });
  }
  await pool.end();
  const exactQdrant = qdrantRows.filter((row) => row.qdrantExactLineagePoints > 0).length;
  const postgresVectors = qdrantRows.filter((row) => (row.postgres?.vectorRows || 0) > 0).length;
  const physicalContractProven = vector?.size === 768 && String(vector?.distance).toLowerCase() === 'cosine';
  const report = {
    schema: 'atlas.lineage-qualified-semantic-coverage.v1',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_CANARY_RECONCILIATION',
    candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    representation: {
      representationId: 'semantic_768',
      dimensions: vector?.size ?? null,
      distance: vector?.distance ?? null,
      vectorName: 'content',
      physicalContractProven,
    },
    postgres: { table: 'codebase_chunk_index', keyColumn: packetColumn || sourceColumn, vectorColumn, candidatesWithVectorRows: postgresVectors },
    qdrant: { url: qdrantUrl, collection, candidatesWithExactLineagePoints: exactQdrant },
    counts: { candidates: candidates.length, qdrantExactSemantic768: exactQdrant, postgresVectorPresent: postgresVectors, semanticQualified: Math.min(exactQdrant, postgresVectors) },
    candidates: qdrantRows,
    writes: { postgresWrites: false, qdrantWrites: false, neo4jWrites: false, valkeyWrites: false, vectorDownloads: false },
    status: exactQdrant === candidates.length && postgresVectors === candidates.length && physicalContractProven ? 'SEMANTIC_768_CANARY_PROVEN' : 'SEMANTIC_768_CANARY_BLOCKED',
    nextGate: exactQdrant === candidates.length && postgresVectors === candidates.length ? 'GOLDEN_RETRIEVAL_READ_ONLY_REPLAY' : 'SEMANTIC_768_CURRENT_COHORT_REPAIR_OR_RECONCILIATION',
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ status: report.status, counts: report.counts, representation: report.representation, reportPath }, null, 2));
}

main().catch(async (error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
