#!/usr/bin/env node
/**
 * Read-only, payload-only census of Qdrant chunk/packet locators against
 * canonical PostgreSQL rows. Qdrant remains a projection; this script does
 * not fetch vectors, perform inference, or write to either datastore.
 *
 * Usage:
 *   node scripts/atlas/audit-qdrant-payload-canonical-bridge-v1.mjs \
 *     --output=docs/reports/<unique-report>.json
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(repoRoot, 'sveltekit-frontend/.env'), quiet: true });
dotenv.config({ path: resolve(repoRoot, 'sveltekit-frontend/.env.local'), override: true, quiet: true });

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  if (!process.argv[i].startsWith('--')) continue;
  const [key, inline] = process.argv[i].slice(2).split('=', 2);
  const value = inline ?? process.argv[i + 1];
  if (inline === undefined && value && !value.startsWith('--')) i += 1;
  args.set(key, value ?? true);
}

const outputArg = args.get('output');
if (typeof outputArg !== 'string' || !outputArg) throw new Error('EXPLICIT_UNIQUE_OUTPUT_REQUIRED');
const outputPath = resolve(repoRoot, outputArg);
const qdrantUrl = String(args.get('qdrant-url') ?? 'http://127.0.0.1:6333').replace(/\/$/, '');
const collection = String(args.get('collection') ?? 'codebase_chunks_768');
const batchSize = Number(args.get('batch') ?? 1000);
if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 10_000) throw new Error('BATCH_OUT_OF_RANGE');

const dbConfig = {
  host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5434),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db',
  user: process.env.DB_USER || process.env.PGUSER || 'legal_admin',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  connectionTimeoutMillis: 15000,
};
if (!dbConfig.password) throw new Error('POSTGRES_PASSWORD_NOT_CONFIGURED');

const pointPresence = {
  pointId: 0, chunkId: 0, packetKey: 0, sourceRef: 0, contentHash: 0,
  representationId: 0, vectorDimension: 0,
};
const totals = {
  points: 0,
  chunkIdUniqueCandidates: 0,
  chunkIdAmbiguousCandidates: 0,
  chunkIdMissingCandidates: 0,
  uniqueChunkCandidatesExactSourceRef: 0,
  uniqueChunkCandidatesExactContentHash: 0,
  uniqueChunkCandidatesExactSourceRefAndHash: 0,
  uniqueChunkCandidatesWithAllRevisions: 0,
  uniqueChunkCandidatesStrictlyRevisionQualified: 0,
  packetKeyMatches: 0,
  packetKeyUnmatched: 0,
};
const exampleFailures = [];

async function getCollectionInfo() {
  const response = await fetch(`${qdrantUrl}/collections/${encodeURIComponent(collection)}`);
  if (!response.ok) throw new Error(`QDRANT_COLLECTION_READ_FAILED:${response.status}`);
  const json = await response.json();
  return {
    status: json.result?.status ?? null,
    pointsCountBefore: json.result?.points_count ?? null,
    vectorsConfig: json.result?.config?.params?.vectors ?? null,
  };
}

const pool = new pg.Pool(dbConfig);
const client = await pool.connect();
let before;
let after;
let cursor = null;
let pageCount = 0;
try {
  before = await getCollectionInfo();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL statement_timeout = '120s'");

  const schema = await client.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ANY($1::text[])
  `, [['codebase_chunk_index', 'atlas_packets']]);
  const columns = new Map();
  for (const row of schema.rows) {
    const set = columns.get(row.table_name) ?? new Set();
    set.add(row.column_name);
    columns.set(row.table_name, set);
  }
  const chunkColumns = columns.get('codebase_chunk_index') ?? new Set();
  const requiredChunkFields = ['chunk_id', 'source_ref', 'content_hash'];
  const absent = requiredChunkFields.filter((field) => !chunkColumns.has(field));
  if (absent.length) throw new Error(`CANONICAL_CHUNK_COLUMNS_MISSING:${absent.join(',')}`);
  const revisionFields = ['source_revision', 'workspace_revision', 'representation_revision'];
  const selectedRevisionFields = revisionFields.filter((field) => chunkColumns.has(field));

  do {
    const response = await fetch(`${qdrantUrl}/collections/${encodeURIComponent(collection)}/points/scroll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        limit: batchSize,
        with_vector: false,
        with_payload: ['chunk_id', 'packet_key', 'canonical_source_ref', 'source_ref', 'content_hash', 'representation_id', 'qdrant_vector_dim'],
        ...(cursor !== null ? { offset: cursor } : {}),
      }),
    });
    if (!response.ok) throw new Error(`QDRANT_SCROLL_FAILED:${response.status}`);
    const json = await response.json();
    const points = json.result?.points ?? [];
    cursor = json.result?.next_page_offset ?? null;
    pageCount += 1;
    if (!points.length) break;

    const get = (payload, ...keys) => {
      for (const key of keys) {
        const value = payload?.[key];
        if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
      }
      return null;
    };
    const rows = points.map((point) => ({
      pointId: point.id === undefined || point.id === null ? null : String(point.id),
      chunkId: get(point.payload, 'chunk_id'),
      packetKey: get(point.payload, 'packet_key'),
      sourceRef: get(point.payload, 'canonical_source_ref', 'source_ref'),
      contentHash: get(point.payload, 'content_hash'),
      representationId: get(point.payload, 'representation_id'),
      vectorDimension: get(point.payload, 'qdrant_vector_dim'),
    }));
    for (const field of Object.keys(pointPresence)) pointPresence[field] += rows.filter((row) => row[field]).length;
    totals.points += rows.length;

    const chunkIds = [...new Set(rows.map((row) => row.chunkId).filter(Boolean))];
    const packetKeys = [...new Set(rows.map((row) => row.packetKey).filter(Boolean))];
    const chunkSelect = [
      'chunk_id', 'source_ref', 'content_hash', ...selectedRevisionFields,
    ].map((field) => `"${field}"`).join(', ');
    const [chunkResult, packetResult] = await Promise.all([
      chunkIds.length
        ? client.query(`SELECT ${chunkSelect} FROM public.codebase_chunk_index WHERE chunk_id = ANY($1::text[])`, [chunkIds])
        : { rows: [] },
      packetKeys.length && (columns.get('atlas_packets') ?? new Set()).has('packet_key')
        ? client.query('SELECT packet_key FROM public.atlas_packets WHERE packet_key = ANY($1::text[])', [packetKeys])
        : { rows: [] },
    ]);
    const chunksById = new Map();
    for (const candidate of chunkResult.rows) {
      const list = chunksById.get(candidate.chunk_id) ?? [];
      list.push(candidate);
      chunksById.set(candidate.chunk_id, list);
    }
    const packetSet = new Set(packetResult.rows.map((row) => String(row.packet_key)));

    for (const row of rows) {
      const candidates = row.chunkId ? (chunksById.get(row.chunkId) ?? []) : [];
      if (!candidates.length) totals.chunkIdMissingCandidates += 1;
      else if (candidates.length === 1) {
        totals.chunkIdUniqueCandidates += 1;
        const candidate = candidates[0];
        const sourceMatches = row.sourceRef && [candidate.source_ref].filter(Boolean).some((value) => String(value).trim() === row.sourceRef);
        const hashMatches = row.contentHash && candidate.content_hash && String(candidate.content_hash).trim() === row.contentHash;
        if (sourceMatches) totals.uniqueChunkCandidatesExactSourceRef += 1;
        if (hashMatches) totals.uniqueChunkCandidatesExactContentHash += 1;
        if (sourceMatches && hashMatches) totals.uniqueChunkCandidatesExactSourceRefAndHash += 1;
        const revisionsPresent = revisionFields.length === selectedRevisionFields.length
          && revisionFields.every((field) => candidate[field] !== null && String(candidate[field]).trim() !== '');
        if (revisionsPresent) totals.uniqueChunkCandidatesWithAllRevisions += 1;
        if (sourceMatches && hashMatches && revisionsPresent) totals.uniqueChunkCandidatesStrictlyRevisionQualified += 1;
        if ((!sourceMatches || !hashMatches || !revisionsPresent) && exampleFailures.length < 12) {
          exampleFailures.push({ pointId: row.pointId, chunkId: row.chunkId, packetKey: row.packetKey, sourceRefMatches: Boolean(sourceMatches), contentHashMatches: Boolean(hashMatches), allRequiredRevisionsPresent: Boolean(revisionsPresent) });
        }
      } else totals.chunkIdAmbiguousCandidates += 1;
      if (row.packetKey && packetSet.has(row.packetKey)) totals.packetKeyMatches += 1;
      else if (row.packetKey) totals.packetKeyUnmatched += 1;
    }
  } while (cursor !== null && cursor !== undefined);

  await client.query('ROLLBACK');
  after = await getCollectionInfo();
} catch (error) {
  try { await client.query('ROLLBACK'); } catch {}
  throw error;
} finally {
  client.release();
  await pool.end();
}

const report = {
  schema: 'atlas.qdrant-payload-canonical-bridge-audit.v1',
  generatedAt: new Date().toISOString(),
  mode: 'QDRANT_PAYLOAD_ONLY_PLUS_POSTGRES_REPEATABLE_READ_READ_ONLY',
  qdrant: { url: qdrantUrl, collection, before, after, scrollPages: pageCount, vectorsFetched: false },
  payloadFieldPresence: pointPresence,
  canonicalPostgresReconciliation: totals,
  sampleFailures: exampleFailures,
  decision: totals.uniqueChunkCandidatesStrictlyRevisionQualified === totals.points && totals.points > 0
    ? 'ALL_SCROLL_POINTS_HAVE_STRICT_CANONICAL_BINDING'
    : 'PAYLOAD_LOCATORS_ARE_NOT_FULLY_REVISION_QUALIFIED',
  limitations: [
    'Qdrant payload is a projection and never canonical authority.',
    'The Postgres snapshot is repeatable-read/read-only, but Qdrant scroll is not a transactionally pinned snapshot; compare before/after collection counts.',
    'Payload representation_id is observed as a projection locator only; it is not accepted as semantic representation provenance.',
    'No vectors, model calls, cache operations, or datastore writes were performed.',
  ],
  safeguards: { postgresWrites: 0, qdrantWrites: 0, valkeyWrites: 0, inferenceCalls: 0, vectorsFetched: false },
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ output: relative(repoRoot, outputPath), points: totals.points, decision: report.decision, canonicalPostgresReconciliation: totals, before, after }, null, 2));
