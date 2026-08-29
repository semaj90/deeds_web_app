#!/usr/bin/env node

/** Read-only exact parity proof for the bounded semantic_768 canary. */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const ROOT = REPO_ROOT;
const env = loadRepoEnv(process.env);
const mapPath = path.resolve(env.ATLAS_CANDIDATE_MAP ?? path.join(ROOT, '.tmp/atlas/lineage-qualified-candidate-map-v1.json'));
const reportPath = path.resolve(env.ATLAS_PGVECTOR_QDRANT_PARITY_REPORT ?? path.join(ROOT, 'docs/reports/lineage-pgvector-qdrant-parity-v1.json'));
const qdrantUrl = String(env.QDRANT_URL ?? `http://${env.QDRANT_HOST ?? '127.0.0.1'}:${env.QDRANT_PORT ?? '6333'}`).replace(/\/+$/, '');
const collection = String(env.ATLAS_QDRANT_COLLECTION ?? 'codebase_chunks_768');
const DIMENSIONS = 768;
const VECTOR_TOLERANCE = Number(env.ATLAS_VECTOR_PARITY_TOLERANCE ?? '1e-5');
const SCORE_TOLERANCE = Number(env.ATLAS_SCORE_PARITY_TOLERANCE ?? '1e-5');

const clean = (value) => String(value ?? '').trim();
const text = (value) => value === null || value === undefined ? null : String(value);
const payloadValue = (payload, key) => payload?.[key] ?? payload?.[key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] ?? null;

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function contentHash(candidate) {
  const ref = (candidate.evidenceRefs ?? []).find((value) => String(value).startsWith('chunk:'));
  if (!ref) return null;
  const parts = String(ref).split(':');
  const hash = parts.at(-1)?.toLowerCase();
  return /^[0-9a-f]{64}$/.test(hash ?? '') ? hash : null;
}

function parseVector(value) {
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed.map(Number) : null;
  } catch {
    const body = trimmed.slice(1, -1).trim();
    if (!body) return [];
    return body.split(',').map((item) => Number(item.trim()));
  }
}

function vectorStats(left, right) {
  if (!left || !right) return { available: false, maxAbsDiff: null, l2Diff: null, withinTolerance: false };
  if (left.length !== DIMENSIONS || right.length !== DIMENSIONS) return { available: false, maxAbsDiff: null, l2Diff: null, withinTolerance: false, dimensionMismatch: true, leftDimensions: left.length, rightDimensions: right.length };
  let maxAbsDiff = 0;
  let sumSquares = 0;
  let finite = true;
  for (let index = 0; index < DIMENSIONS; index += 1) {
    const a = left[index];
    const b = right[index];
    if (!Number.isFinite(a) || !Number.isFinite(b)) finite = false;
    const diff = Math.abs(a - b);
    maxAbsDiff = Math.max(maxAbsDiff, diff);
    sumSquares += diff * diff;
  }
  const l2Diff = Math.sqrt(sumSquares);
  return { available: true, finite, maxAbsDiff, l2Diff, withinTolerance: finite && maxAbsDiff <= VECTOR_TOLERANCE };
}

function cosine(left, right) {
  if (!left || !right || left.length !== right.length) return null;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = Number(left[index]);
    const b = Number(right[index]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) return null;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function extractQdrantVector(point) {
  const vector = point?.vector;
  if (vector && !Array.isArray(vector) && Array.isArray(vector.content)) return vector.content.map(Number);
  if (Array.isArray(vector)) return vector.map(Number);
  return null;
}

async function qdrantQuery(packetKeys) {
  const response = await fetch(`${qdrantUrl}/collections/${encodeURIComponent(collection)}/points/scroll`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      filter: { must: [{ key: 'packet_key', match: { any: packetKeys } }] },
      limit: Math.max(100, packetKeys.length * 10),
      with_payload: true,
      with_vector: true,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`QDRANT_QUERY_HTTP_${response.status}`);
  const body = await response.json();
  return Array.isArray(body.result) ? body.result : (Array.isArray(body.result?.points) ? body.result.points : []);
}

async function main() {
  const map = JSON.parse(await fs.readFile(mapPath, 'utf8'));
  const candidates = Array.isArray(map.candidates) ? map.candidates : [];
  if (!candidates.length) throw new Error('PARITY_CANDIDATE_MAP_EMPTY');
  const report = {
    schema: 'atlas.lineage-pgvector-qdrant-parity.v1',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_EXACT_VECTOR_AND_SCORE_PARITY',
    contract: { representationId: 'semantic_768', dimensions: DIMENSIONS, metric: 'Cosine', postgresColumn: 'content_embedding_768', qdrantCollection: collection, qdrantVectorName: 'content', canonicalAuthority: 'postgres' },
    candidateMap: { path: path.relative(ROOT, mapPath), candidateSnapshotRevision: map.candidateSnapshotRevision ?? null, ordinalMapChecksum: map.ordinalMapChecksum ?? null, workspaceRevision: map.workspaceRevision ?? null, rowCount: candidates.length },
    tolerances: { vectorMaxAbsDiff: VECTOR_TOLERANCE, scoreAbsDiff: SCORE_TOLERANCE },
    counts: { candidates: candidates.length, postgresRows: 0, qdrantPoints: 0, identityMatches: 0, vectorMatches: 0, scoreMatches: 0 },
    rankParity: false,
    query: { kind: 'DETERMINISTIC_STORED_VECTOR_PROBE', dimensions: DIMENSIONS, source: 'first valid PostgreSQL content_embedding_768 row' },
    rows: [],
    writes: { postgres: false, qdrant: false, neo4j: false, valkey: false, vectorGeneration: false },
    canonicalAuthority: false,
    status: 'BLOCKED',
    nextGate: 'REPAIR_SEMANTIC_PROJECTION_OR_IDENTITY_BINDING',
  };
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 2, application_name: 'atlas-lineage-pgvector-qdrant-parity' });
  try {
    const schema = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='codebase_chunk_index'`);
    const names = new Set(schema.rows.map((row) => row.column_name));
    for (const required of ['source_ref', 'content_hash', 'content_embedding_768']) if (!names.has(required)) throw new Error(`PARITY_REQUIRED_COLUMN_MISSING:${required}`);
    const optional = ['embedding_model', 'embedding_version', 'encoder_id', 'embedding_dimension', 'qdrant_id'];
    const byPacket = new Map();
    for (const candidate of candidates) {
      const sourceRef = clean(candidate.sourceRef);
      const hash = contentHash(candidate);
      const selectedOptional = optional.filter((name) => names.has(name));
      const selectColumns = ['source_ref', 'content_hash', 'content_embedding_768', ...selectedOptional.map((name) => `"${name}"`)].join(', ');
      const result = hash ? await pool.query(`SELECT ${selectColumns} FROM public.codebase_chunk_index WHERE source_ref=$1 AND lower(content_hash)=lower($2) ORDER BY source_ref`, [sourceRef, hash]) : { rows: [] };
      const row = result.rows.length === 1 ? result.rows[0] : null;
      if (row) report.counts.postgresRows += 1;
      const postgresVector = parseVector(row?.content_embedding_768);
      byPacket.set(candidate.packetKey, { candidate, row, postgresVector, sourceRef, contentHash: hash, postgresRows: result.rows.length });
    }
    const queryCandidate = candidates.map((candidate) => byPacket.get(candidate.packetKey)).find((entry) => entry?.postgresVector?.length === DIMENSIONS);
    if (!queryCandidate) throw new Error('PARITY_POSTGRES_VECTOR_PROBE_UNAVAILABLE');
    const queryVector = queryCandidate.postgresVector;
    report.query.candidateOrdinal = queryCandidate.candidate.candidateOrdinal;
    const points = await qdrantQuery(candidates.map((candidate) => candidate.packetKey).filter(Boolean));
    report.counts.qdrantPoints = points.length;
    const pointsByPacket = new Map();
    for (const point of points) {
      const payload = point.payload ?? {};
      const packetKey = text(payloadValue(payload, 'packet_key'));
      if (packetKey) pointsByPacket.set(packetKey, [...(pointsByPacket.get(packetKey) ?? []), point]);
    }
    const pgRank = [];
    const qdrantRank = [];
    for (const candidate of candidates) {
      const local = byPacket.get(candidate.packetKey);
      const pointCandidates = pointsByPacket.get(candidate.packetKey) ?? [];
      const point = pointCandidates.find((entry) => {
        const payload = entry.payload ?? {};
        const source = text(payloadValue(payload, 'source_ref'));
        const hash = text(payloadValue(payload, 'content_hash'))?.toLowerCase() ?? null;
        return source === candidate.sourceRef && (!local?.contentHash || !hash || hash === local.contentHash);
      }) ?? pointCandidates[0];
      const payload = point?.payload ?? {};
      const qdrantVector = extractQdrantVector(point);
      const observedSourceRef = text(payloadValue(payload, 'source_ref'));
      const observedHash = text(payloadValue(payload, 'content_hash'))?.toLowerCase() ?? null;
      const identityFailures = [];
      if (!local?.row || local.postgresRows !== 1) identityFailures.push(local?.postgresRows === 0 ? 'POSTGRES_CHUNK_MISSING' : 'POSTGRES_CHUNK_AMBIGUOUS');
      if (!point) identityFailures.push('QDRANT_POINT_MISSING');
      if (point && observedSourceRef !== candidate.sourceRef) identityFailures.push('QDRANT_SOURCE_REF_MISMATCH');
      if (local?.contentHash && observedHash && observedHash !== local.contentHash) identityFailures.push('QDRANT_CONTENT_HASH_MISMATCH');
      const stats = vectorStats(local?.postgresVector, qdrantVector);
      const postgresScore = cosine(queryVector, local?.postgresVector);
      const qdrantComputedScore = cosine(queryVector, qdrantVector);
      const qdrantReportedScore = Number.isFinite(Number(point?.score)) ? Number(point.score) : null;
      const qdrantScore = qdrantReportedScore ?? qdrantComputedScore;
      const scoreDiff = postgresScore === null || qdrantScore === null ? null : Math.abs(postgresScore - qdrantScore);
      const scoreMatch = scoreDiff !== null && scoreDiff <= SCORE_TOLERANCE;
      if (!identityFailures.length) report.counts.identityMatches += 1;
      if (!identityFailures.length && stats.withinTolerance) report.counts.vectorMatches += 1;
      if (!identityFailures.length && scoreMatch) report.counts.scoreMatches += 1;
      if (postgresScore !== null) pgRank.push({ candidateOrdinal: candidate.candidateOrdinal, score: postgresScore });
      if (qdrantScore !== null) qdrantRank.push({ candidateOrdinal: candidate.candidateOrdinal, score: qdrantScore });
      report.rows.push({ candidateOrdinal: candidate.candidateOrdinal, packetKey: candidate.packetKey, sourceRef: candidate.sourceRef, contentHash: local?.contentHash ?? null, qdrantPointId: point?.id === undefined ? null : String(point.id), identityFailures, postgresVectorDimensions: local?.postgresVector?.length ?? null, qdrantVectorDimensions: qdrantVector?.length ?? null, vector: stats, postgresScore, qdrantComputedScore, qdrantReportedScore, scoreAbsDiff: scoreDiff, scoreWithinTolerance: scoreMatch });
    }
    const sortRank = (rows) => rows.sort((a, b) => b.score - a.score || a.candidateOrdinal - b.candidateOrdinal).map((row) => row.candidateOrdinal);
    report.rankParity = JSON.stringify(sortRank(pgRank)) === JSON.stringify(sortRank(qdrantRank));
    const allPass = report.counts.identityMatches === candidates.length && report.counts.vectorMatches === candidates.length && report.counts.scoreMatches === candidates.length && report.rankParity;
    report.status = allPass ? 'PGVECTOR_QDRANT_EXACT_PARITY_PROVEN' : 'PGVECTOR_QDRANT_PARITY_BLOCKED';
    report.nextGate = allPass ? 'SCALE_SEMANTIC_COHORT_TO_128' : 'REPAIR_SEMANTIC_PROJECTION_OR_IDENTITY_BINDING';
  } finally {
    await pool.end();
  }
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, counts: report.counts, rankParity: report.rankParity, reportPath }, null, 2));
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
