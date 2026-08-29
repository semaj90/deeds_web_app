#!/usr/bin/env node

/**
 * Authorized projection-only repair for the frozen semantic_768 canary.
 * PostgreSQL is read-only and remains the vector authority. No points are deleted.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const env = loadRepoEnv(process.env);
const ROOT = REPO_ROOT;
const mapPath = path.resolve(env.ATLAS_CANDIDATE_MAP ?? path.join(ROOT, '.tmp/atlas/lineage-qualified-candidate-map-v1.json'));
const reportPath = path.resolve(env.ATLAS_QDRANT_PROJECTION_REPAIR_REPORT ?? path.join(ROOT, 'docs/reports/lineage-qdrant-projection-repair-v1.json'));
const qdrantUrl = String(env.QDRANT_URL ?? `http://${env.QDRANT_HOST ?? '127.0.0.1'}:${env.QDRANT_PORT ?? '6333'}`).replace(/\/+$/, '');
const collection = String(env.ATLAS_QDRANT_COLLECTION ?? 'codebase_chunks_768');
const dimensions = 768;
const clean = (value) => String(value ?? '').trim();
const payloadValue = (payload, key) => payload?.[key] ?? payload?.[key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] ?? null;

function contentHash(candidate) {
  const ref = (candidate.evidenceRefs ?? []).find((value) => String(value).startsWith('chunk:'));
  const hash = String(ref ?? '').split(':').at(-1)?.toLowerCase();
  return /^[0-9a-f]{64}$/.test(hash ?? '') ? hash : null;
}

function parseVector(value) {
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(Number) : null;
  } catch {
    return value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1).split(',').map((item) => Number(item.trim())) : null;
  }
}

function vectorDigest(vector) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(vector)).digest('hex')}`;
}

async function scrollPoints(packetKeys) {
  const response = await fetch(`${qdrantUrl}/collections/${encodeURIComponent(collection)}/points/scroll`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ limit: Math.max(100, packetKeys.length * 10), with_payload: true, with_vector: false, filter: { must: [{ key: 'packet_key', match: { any: packetKeys } }] } }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`QDRANT_SCROLL_FAILED:${response.status}`);
  return Array.isArray(body.result?.points) ? body.result.points : [];
}

async function updateContentVectors(points) {
  const response = await fetch(`${qdrantUrl}/collections/${encodeURIComponent(collection)}/points/vectors?wait=true`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ points: points.map((point) => ({ id: point.id, vector: { content: point.vector.content } })) }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`QDRANT_VECTOR_UPDATE_FAILED:${response.status}:${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const authorized = env.ATLAS_AUTHORIZE_QDRANT_PROJECTION_REPAIR === '1';
  if (!authorized && !dryRun) throw new Error('EXPLICIT_QDRANT_PROJECTION_REPAIR_AUTHORIZATION_REQUIRED');
  const map = JSON.parse(await fs.readFile(mapPath, 'utf8'));
  const candidates = Array.isArray(map.candidates) ? map.candidates : [];
  if (candidates.length !== 15) throw new Error(`FROZEN_CANARY_COUNT_REQUIRED:expected=15:actual=${candidates.length}`);
  const report = { schema: 'atlas.lineage-qdrant-projection-repair.v1', generatedAt: new Date().toISOString(), mode: dryRun ? 'DRY_RUN_PROJECTION_ONLY_FROM_POSTGRES' : 'AUTHORIZED_PROJECTION_ONLY_FROM_POSTGRES', authorization: { explicit: authorized, dryRun, envFlag: 'ATLAS_AUTHORIZE_QDRANT_PROJECTION_REPAIR=1', scope: 'frozen 15-candidate lineage canary' }, collection, candidateCount: candidates.length, counts: { postgresRows: 0, qdrantPointsSeen: 0, pointsPlanned: 0, pointsWritten: 0, postgresWrites: 0, deletedPoints: 0 }, points: [], writes: { postgres: false, qdrant: false, deletes: false, neo4j: false, valkey: false }, canonicalAuthority: false, status: 'FAIL', nextGate: 'PGVECTOR_QDRANT_EXACT_PARITY_REPLAY' };
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 2, application_name: 'atlas-qdrant-projection-repair' });
  try {
    const schema = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='codebase_chunk_index'`);
    const names = new Set(schema.rows.map((row) => row.column_name));
    for (const required of ['source_ref', 'content_hash', 'content_embedding_768']) if (!names.has(required)) throw new Error(`REPAIR_REQUIRED_COLUMN_MISSING:${required}`);
    const optional = ['embedding_model', 'embedding_version', 'encoder_id', 'embedding_dimension', 'embedding_normalized', 'qdrant_id'];
    const canonical = new Map();
    for (const candidate of candidates) {
      const hash = contentHash(candidate);
      const columns = ['id::text AS id', 'source_ref', 'content_hash', 'content_embedding_768', ...optional.filter((name) => names.has(name)).map((name) => `"${name}"`)].join(', ');
      const result = hash ? await pool.query(`SELECT ${columns} FROM public.codebase_chunk_index WHERE source_ref=$1 AND lower(content_hash)=lower($2)`, [clean(candidate.sourceRef), hash]) : { rows: [] };
      if (result.rows.length !== 1) throw new Error(`REPAIR_EXACT_POSTGRES_ROW_REQUIRED:${candidate.sourceRef}:${result.rows.length}`);
      const row = result.rows[0];
      const vector = parseVector(row.content_embedding_768);
      if (!vector || vector.length !== dimensions || vector.some((value) => !Number.isFinite(value))) throw new Error(`REPAIR_CANONICAL_VECTOR_INVALID:${candidate.sourceRef}`);
      report.counts.postgresRows += 1;
      canonical.set(candidate.packetKey, { candidate, row, vector, contentHash: hash });
    }
    const existing = await scrollPoints(candidates.map((candidate) => candidate.packetKey));
    report.counts.qdrantPointsSeen = existing.length;
    const points = [];
    for (const point of existing) {
      const payload = point.payload ?? {};
      const packetKey = clean(payloadValue(payload, 'packet_key'));
      const item = canonical.get(packetKey);
      if (!item) continue;
      const sourceRef = clean(payloadValue(payload, 'source_ref'));
      const hash = clean(payloadValue(payload, 'content_hash')).toLowerCase();
      if (sourceRef !== item.candidate.sourceRef || (hash && hash !== item.contentHash)) continue;
      const representationRevision = clean(item.candidate.semanticRevision) || 'semantic_768:unversioned';
      const qdrantId = clean(item.row.qdrant_id);
      const targetMatch = (qdrantId && String(point.id) === qdrantId) || (qdrantId && clean(payloadValue(payload, 'qdrant_point_id')) === qdrantId);
      if (!targetMatch) continue;
      points.push({ id: point.id, vector: { content: item.vector }, targetMatchKind: String(point.id) === qdrantId ? 'POINT_ID' : 'PAYLOAD_QDRANT_POINT_ID', packetKey: item.candidate.packetKey, sourceRef: item.candidate.sourceRef, representationRevision, canonicalVectorDigest: vectorDigest(item.vector) });
    }
    report.counts.pointsPlanned = points.length;
    report.points = points.map((point) => ({ id: String(point.id), packetKey: point.packetKey, sourceRef: point.sourceRef, vectorDimensions: point.vector.content.length, targetMatchKind: point.targetMatchKind, canonicalVectorDigest: point.canonicalVectorDigest }));
    if (!points.length) throw new Error('REPAIR_NO_EXACT_QDRANT_POINTS');
    if (dryRun) {
      report.status = 'QDRANT_PROJECTION_REPAIR_PLAN_READY';
      report.nextGate = 'EXPLICIT_QDRANT_PROJECTION_REPAIR_AUTHORIZATION';
    } else {
      await updateContentVectors(points);
      report.counts.pointsWritten = points.length;
      report.writes.qdrant = true;
      report.status = 'QDRANT_PROJECTION_REPAIR_APPLIED_READBACK_REQUIRED';
    }
  } catch (error) { report.errors = [error?.message || String(error)]; }
  finally { await pool.end(); }
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, counts: report.counts, writes: report.writes, reportPath, errors: report.errors ?? [] }, null, 2));
  if (!['QDRANT_PROJECTION_REPAIR_PLAN_READY', 'QDRANT_PROJECTION_REPAIR_APPLIED_READBACK_REQUIRED'].includes(report.status)) process.exitCode = 1;
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
