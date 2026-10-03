#!/usr/bin/env node
/**
 * Read-only full Qdrant census through payload representation_id, tested as a
 * candidate codebase_chunk_index.id locator. The payload name is not assumed
 * to mean semantic representation revision; canonical Postgres readback is
 * required. Vectors are never fetched.
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(root, 'sveltekit-frontend/.env'), quiet: true });
dotenv.config({ path: resolve(root, 'sveltekit-frontend/.env.local'), override: true, quiet: true });
const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  if (!process.argv[i].startsWith('--')) continue;
  const [key, inline] = process.argv[i].slice(2).split('=', 2);
  const value = inline ?? process.argv[i + 1];
  if (inline === undefined && value && !value.startsWith('--')) i += 1;
  args.set(key, value ?? true);
}
if (typeof args.get('output') !== 'string') throw new Error('EXPLICIT_UNIQUE_OUTPUT_REQUIRED');
const output = resolve(root, args.get('output'));
const qdrantUrl = String(args.get('qdrant-url') ?? 'http://127.0.0.1:6333').replace(/\/$/, '');
const collection = String(args.get('collection') ?? 'codebase_chunks_768');
const batch = Number(args.get('batch') ?? 1000);
if (!Number.isInteger(batch) || batch < 1 || batch > 10_000) throw new Error('BATCH_OUT_OF_RANGE');
const db = {
  host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5434),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db',
  user: process.env.DB_USER || process.env.PGUSER || 'legal_admin',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  connectionTimeoutMillis: 15_000,
};
if (!db.password) throw new Error('POSTGRES_PASSWORD_NOT_CONFIGURED');

const totals = {
  points: 0,
  representationIdPresent: 0,
  representationIdValidUuid: 0,
  canonicalChunkRowUnique: 0,
  canonicalChunkRowMissing: 0,
  canonicalChunkRowAmbiguous: 0,
  exactSourceRef: 0,
  exactContentHash: 0,
  exactSourceRefAndHash: 0,
  allSourceWorkspaceRepresentationRevisionsPresent: 0,
  strictlyRevisionQualified: 0,
  identityLinkPresent: 0,
  identityLinkChunkUuidEqualsRepresentationId: 0,
  identityLinkSourceRevisionPresent: 0,
};
const examples = [];
const pool = new pg.Pool(db);
const client = await pool.connect();
let before;
let after;
let cursor = null;
let pages = 0;
const collectionInfo = async () => {
  const response = await fetch(`${qdrantUrl}/collections/${encodeURIComponent(collection)}`);
  if (!response.ok) throw new Error(`QDRANT_COLLECTION_READ_FAILED:${response.status}`);
  const json = await response.json();
  return { status: json.result?.status ?? null, pointsCount: json.result?.points_count ?? null };
};
const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v ?? '');
try {
  before = await collectionInfo();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL statement_timeout = '120s'");
  do {
    const response = await fetch(`${qdrantUrl}/collections/${encodeURIComponent(collection)}/points/scroll`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        limit: batch, with_vector: false,
        with_payload: ['representation_id', 'canonical_source_ref', 'source_ref', 'content_hash'],
        ...(cursor !== null ? { offset: cursor } : {}),
      }),
    });
    if (!response.ok) throw new Error(`QDRANT_SCROLL_FAILED:${response.status}`);
    const json = await response.json();
    const points = json.result?.points ?? [];
    cursor = json.result?.next_page_offset ?? null;
    pages += 1;
    if (!points.length) break;
    const rows = points.map((point) => {
      const p = point.payload ?? {};
      const representationId = p.representation_id == null ? null : String(p.representation_id).trim();
      const sourceRef = p.canonical_source_ref ?? p.source_ref ?? null;
      return { pointId: String(point.id), representationId, sourceRef: sourceRef == null ? null : String(sourceRef).trim(), contentHash: p.content_hash == null ? null : String(p.content_hash).trim() };
    });
    totals.points += rows.length;
    totals.representationIdPresent += rows.filter((r) => r.representationId).length;
    const validIds = [...new Set(rows.map((r) => r.representationId).filter(isUuid))];
    totals.representationIdValidUuid += rows.filter((r) => isUuid(r.representationId)).length;
    const pointIds = rows.map((r) => r.pointId);
    const [canonical, links] = await Promise.all([
      validIds.length ? client.query(`
        SELECT id::text AS id, source_ref, content_hash,
               source_revision, workspace_revision, representation_revision
        FROM public.codebase_chunk_index WHERE id = ANY($1::uuid[])
      `, [validIds]) : { rows: [] },
      client.query(`
        SELECT qdrant_point_id, chunk_index_id::text AS chunk_index_id, source_revision
        FROM public.atlas_chunk_packet_identity_links
        WHERE qdrant_collection = $1 AND qdrant_point_id = ANY($2::text[])
      `, [collection, pointIds]),
    ]);
    const canonicalById = new Map();
    for (const candidate of canonical.rows) {
      const list = canonicalById.get(candidate.id) ?? [];
      list.push(candidate);
      canonicalById.set(candidate.id, list);
    }
    const linksByPointId = new Map(links.rows.map((link) => [String(link.qdrant_point_id), link]));
    for (const row of rows) {
      const candidates = isUuid(row.representationId) ? (canonicalById.get(row.representationId) ?? []) : [];
      if (!candidates.length) totals.canonicalChunkRowMissing += 1;
      else if (candidates.length > 1) totals.canonicalChunkRowAmbiguous += 1;
      else {
        totals.canonicalChunkRowUnique += 1;
        const candidate = candidates[0];
        const source = row.sourceRef && candidate.source_ref && row.sourceRef === String(candidate.source_ref).trim();
        const hash = row.contentHash && candidate.content_hash && row.contentHash === String(candidate.content_hash).trim();
        if (source) totals.exactSourceRef += 1;
        if (hash) totals.exactContentHash += 1;
        if (source && hash) totals.exactSourceRefAndHash += 1;
        const revisions = ['source_revision', 'workspace_revision', 'representation_revision'].every((key) => candidate[key] != null && String(candidate[key]).trim() !== '');
        if (revisions) totals.allSourceWorkspaceRepresentationRevisionsPresent += 1;
        if (source && hash && revisions) totals.strictlyRevisionQualified += 1;
        if ((!source || !hash || !revisions) && examples.length < 12) examples.push({ pointId: row.pointId, representationId: row.representationId, sourceRefMatches: Boolean(source), contentHashMatches: Boolean(hash), allRequiredRevisionsPresent: revisions });
      }
      const link = linksByPointId.get(row.pointId);
      if (link) {
        totals.identityLinkPresent += 1;
        if (row.representationId === link.chunk_index_id) totals.identityLinkChunkUuidEqualsRepresentationId += 1;
        if (link.source_revision != null && String(link.source_revision).trim()) totals.identityLinkSourceRevisionPresent += 1;
      }
    }
  } while (cursor !== null && cursor !== undefined);
  await client.query('ROLLBACK');
  after = await collectionInfo();
} catch (error) {
  try { await client.query('ROLLBACK'); } catch {}
  throw error;
} finally {
  client.release();
  await pool.end();
}

const report = {
  schema: 'atlas.qdrant-representation-id-canonical-bridge-audit.v1',
  generatedAt: new Date().toISOString(),
  mode: 'FULL_QDRANT_PAYLOAD_SCROLL_PLUS_POSTGRES_REPEATABLE_READ_READ_ONLY',
  qdrant: { url: qdrantUrl, collection, before, after, pages, vectorsFetched: false },
  totals,
  sampleFailures: examples,
  interpretation: {
    representationIdMeaning: 'Accepted only as a candidate codebase_chunk_index.id locator after exact Postgres primary-key readback; it is not a semantic representation revision.',
    qdrantProjectionIsCanonical: false,
    semanticAdmission: false,
  },
  limitations: [
    'Qdrant scrolling is not a transactionally pinned snapshot; before/after counts are recorded.',
    'The current identity-link table may be a stale audit snapshot; its rows corroborate locator equality only and do not confer revision authority.',
    'Strict representation provenance requires immutable source, workspace, and semantic representation revisions plus vector-byte verification.',
    'No vector payloads, inference, or datastore/cache writes were performed.',
  ],
  safeguards: { postgresWrites: 0, qdrantWrites: 0, valkeyWrites: 0, inferenceCalls: 0, vectorsFetched: false },
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ output: relative(root, output), ...totals, before, after }, null, 2));
