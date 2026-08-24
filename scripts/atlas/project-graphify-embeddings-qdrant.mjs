#!/usr/bin/env node
/** Project recently written canonical Graphify file embeddings to Qdrant. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const { Pool } = pg;
const env = loadRepoEnv(process.env);
const flags = new Set(process.argv.slice(2).filter((arg) => arg.startsWith('--') && !arg.includes('=')));
const arg = (name, fallback) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback;
const APPLY = flags.has('--apply');
const LIMIT = Math.max(1, Math.min(5000, Number(arg('limit', 128))));
const BATCH = Math.max(1, Math.min(256, Number(arg('batch', 64))));
const SINCE_HOURS = Math.max(1, Math.min(720, Number(arg('since-hours', 24))));
const QDRANT_URL = String(arg('qdrant-url', env.QDRANT_URL ?? 'http://127.0.0.1:6333')).replace(/\/+$/, '');
const COLLECTION = String(arg('collection', env.QDRANT_CODE_COLLECTION ?? 'codebase_chunks_768'));
const VECTOR_NAME = String(arg('vector-name', 'content'));
if (!['content', 'signature'].includes(VECTOR_NAME)) throw new Error(`Unsupported vector-name: ${VECTOR_NAME}`);
const SOURCE_COLUMN = VECTOR_NAME === 'signature' ? 'signature_embedding' : 'content_embedding_768';
const PROJECTION_REVISION = String(arg('projection-revision', `graphify-${VECTOR_NAME}-768-v1`));
const OUT = path.resolve(REPO_ROOT, String(arg('out', `docs/reports/graphify-embedding-qdrant-${VECTOR_NAME}-projection-v1.json`)));
let qdrantTransport = 'HOST_HTTP';

function parseVector(value) {
  const text = String(value ?? '').trim().replace(/^\[|\]$/g, '');
  const vector = text ? text.split(',').map(Number) : [];
  if (vector.length !== 768 || vector.some((item) => !Number.isFinite(item))) throw new Error(`Invalid canonical vector dimension: ${vector.length}`);
  return vector;
}
function pointId(value) {
  const text = String(value ?? '').trim();
  if (/^\d+$/.test(text)) {
    const numeric = Number(text);
    if (Number.isSafeInteger(numeric)) return numeric;
  }
  return text;
}
async function jsonFetch(url, options = {}) {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(options.timeoutMs ?? 30_000) });
    const text = await response.text();
    let body = {}; try { body = JSON.parse(text); } catch { body = { raw: text }; }
    if (!response.ok) throw new Error(`${url} HTTP ${response.status}: ${text.slice(0, 300)}`);
    qdrantTransport = 'HOST_HTTP';
    return body;
  } catch (hostError) {
    if (APPLY) throw hostError;
    try {
      const parsed = new URL(url);
      const internalUrl = `http://qdrant:6333${parsed.pathname}${parsed.search}`;
      const args = ['exec', 'legal-ai-go-retrieval', 'wget', '-qO-', '--timeout=30'];
      if (options.headers?.['content-type']) args.push('--header=Content-Type: application/json');
      if (options.method === 'POST') args.push(`--post-data=${options.body ?? ''}`);
      args.push(internalUrl);
      const raw = execFileSync('docker', args, { cwd: REPO_ROOT, encoding: 'utf8', timeout: 35_000, stdio: ['ignore', 'pipe', 'pipe'] });
      qdrantTransport = 'DOCKER_INTERNAL_HTTP';
      return JSON.parse(raw);
    } catch (dockerError) {
      throw new Error(`Qdrant host and Docker transports failed: host=${hostError.message}; docker=${dockerError.message}`);
    }
  }
}
async function main() {
  const started = Date.now();
  const pool = new Pool({ connectionString: resolveDatabaseUrl(env), max: 2, application_name: 'graphify-embedding-qdrant-projection' });
  const report = { schema: 'atlas.graphify-embedding-qdrant-projection.v1', generatedAt: new Date().toISOString(), apply: APPLY, sourceColumn: SOURCE_COLUMN, qdrant: { url: QDRANT_URL, collection: COLLECTION, vectorName: VECTOR_NAME, projectionRevision: PROJECTION_REVISION, transport: qdrantTransport }, payloadFields: ['canonical_id', 'packet_key', 'source_ref', 'repo_id', 'chunk_id', 'domain', 'language', 'tags', 'semantic_tags', 'content_hash', 'embedding_model', 'embedding_version', 'projection_revision', 'content_projection_revision', 'signature_projection_revision', 'projection_revisions'], scope: { sinceHours: SINCE_HOURS, limit: LIMIT }, status: 'FAIL', selected: 0, projected: 0, skipped: 0, errors: [] };
  try {
    const collection = await jsonFetch(`${QDRANT_URL}/collections/${COLLECTION}`);
    report.qdrant.transport = qdrantTransport;
    const vectors = collection?.result?.config?.params?.vectors;
    if (!vectors?.[VECTOR_NAME] || Number(vectors[VECTOR_NAME].size) !== 768) throw new Error(`Qdrant ${VECTOR_NAME} named vector is not configured as 768d`);
    const result = await pool.query(`
      SELECT id::text, qdrant_id, source_ref, repo_id, chunk_id, relative_path, symbol, kind, summary, domain, language, tags, semantic_tags, content_hash, embedding_model, embedding_version, metadata ->> 'packet_key' AS packet_key, ${SOURCE_COLUMN}::text AS embedding
      FROM codebase_chunk_index
      WHERE ${SOURCE_COLUMN} IS NOT NULL
        AND qdrant_id IS NOT NULL
        AND embedding_created_at >= NOW() - ($1 * INTERVAL '1 hour')
      ORDER BY embedding_created_at DESC, id
      LIMIT $2
    `, [SINCE_HOURS, LIMIT]);
    report.selected = result.rows.length;
    report.sample = result.rows.slice(0, 5).map((row) => ({ id: row.id, qdrantId: row.qdrant_id, sourceRef: row.source_ref }));
    if (!APPLY) report.status = 'DRY_RUN';
    else {
      for (let offset = 0; offset < result.rows.length; offset += BATCH) {
        const rows = result.rows.slice(offset, offset + BATCH);
        const existing = await jsonFetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: rows.map((row) => pointId(row.qdrant_id)), with_payload: true, with_vector: false }) });
        const existingPayloads = new Map((existing?.result ?? []).map((point) => [String(point.id), point.payload ?? {}]));
        const points = rows.map((row) => {
          const id = pointId(row.qdrant_id);
          const prior = existingPayloads.get(String(id)) ?? {};
          const projectionRevisions = { ...(prior.projection_revisions ?? {}), [VECTOR_NAME]: PROJECTION_REVISION };
          return { id, vector: { [VECTOR_NAME]: parseVector(row.embedding) }, payload: { ...prior, canonical_id: row.id, packet_key: row.packet_key ?? prior.packet_key ?? null, source_ref: row.source_ref, repo_id: row.repo_id, chunk_id: row.chunk_id, relative_path: row.relative_path, symbol: row.symbol, kind: row.kind, summary: row.summary, domain: row.domain, language: row.language, tags: row.tags, semantic_tags: row.semantic_tags, content_hash: row.content_hash, embedding_model: row.embedding_model, embedding_version: row.embedding_version, projection_revision: PROJECTION_REVISION, [`${VECTOR_NAME}_projection_revision`]: PROJECTION_REVISION, projection_revisions: projectionRevisions, graphify_embedding_projected_at: new Date().toISOString() } };
        });
        await jsonFetch(`${QDRANT_URL}/collections/${COLLECTION}/points?wait=true`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ points }) });
        report.projected += points.length;
      }
      report.status = 'PASS';
    }
  } catch (error) { report.errors.push(error.message); }
  finally { await pool.end(); }
  report.elapsedMs = Date.now() - started;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({ status: report.status, selected: report.selected, projected: report.projected, scope: report.scope, qdrant: report.qdrant, out: OUT, errors: report.errors }, null, 2));
  if (report.status === 'FAIL') process.exit(1);
}
main();
