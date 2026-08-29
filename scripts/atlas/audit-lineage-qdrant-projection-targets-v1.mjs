#!/usr/bin/env node

/** Read-only census of Qdrant projection targets for the lineage canary. */
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const env = loadRepoEnv(process.env);
const root = REPO_ROOT;
const mapPath = path.resolve(env.ATLAS_CANDIDATE_MAP ?? path.join(root, '.tmp/atlas/lineage-qualified-candidate-map-v1.json'));
const reportPath = path.resolve(env.ATLAS_QDRANT_PROJECTION_TARGET_REPORT ?? path.join(root, 'docs/reports/lineage-qdrant-projection-targets-v1.json'));
const qdrantUrl = String(env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/+$/, '');
const collection = String(env.ATLAS_QDRANT_COLLECTION ?? 'codebase_chunks_768');

const clean = (value) => String(value ?? '').trim();
function chunkHash(candidate) {
  const ref = (candidate.evidenceRefs ?? []).find((value) => String(value).startsWith('chunk:'));
  return ref ? clean(String(ref).split(':').at(-1)).toLowerCase() : null;
}

async function main() {
  const map = JSON.parse(await fs.readFile(mapPath, 'utf8'));
  const candidates = Array.isArray(map.candidates) ? map.candidates : [];
  if (!candidates.length) throw new Error('QDRANT_PROJECTION_TARGET_CANDIDATE_MAP_EMPTY');
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 2, application_name: 'atlas-qdrant-projection-target-audit' });
  const report = { schema: 'atlas.lineage-qdrant-projection-targets.v1', mode: 'READ_ONLY', collection, candidateCount: candidates.length, counts: { exactSingleTarget: 0, duplicateSameCollection: 0, projectionIdMismatch: 0, noTarget: 0 }, candidates: [], writes: { postgres: false, qdrant: false, deletes: false }, status: 'FAIL', nextGate: 'QDRANT_NAMED_VECTOR_UPDATE_REVIEW' };
  try {
    const pgRows = await pool.query(`SELECT source_ref, content_hash, qdrant_id::text AS qdrant_id FROM public.codebase_chunk_index WHERE source_ref = ANY($1::text[])`, [candidates.map((candidate) => candidate.sourceRef)]);
    const pgByKey = new Map(pgRows.rows.map((row) => [`${clean(row.source_ref)}\0${clean(row.content_hash).toLowerCase()}`, row]));
    const response = await fetch(`${qdrantUrl}/collections/${encodeURIComponent(collection)}/points/scroll`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filter: { must: [{ key: 'packet_key', match: { any: candidates.map((candidate) => candidate.packetKey) } }] }, limit: Math.max(100, candidates.length * 4), with_payload: true, with_vector: false }) });
    if (!response.ok) throw new Error(`QDRANT_SCROLL_HTTP_${response.status}`);
    const body = await response.json();
    const byPacket = new Map();
    for (const point of body.result?.points ?? []) {
      const key = clean(point.payload?.packet_key);
      if (!key) continue;
      byPacket.set(key, [...(byPacket.get(key) ?? []), point]);
    }
    for (const candidate of candidates) {
      const pgRow = pgByKey.get(`${clean(candidate.sourceRef)}\0${chunkHash(candidate)}`);
      const points = byPacket.get(candidate.packetKey) ?? [];
      const expected = clean(pgRow?.qdrant_id) || null;
      const ids = points.map((point) => String(point.id));
      const matchingPoints = expected === null ? [] : points.filter((point) => String(point.id) === expected || clean(point.payload?.qdrant_point_id) === expected);
      const expectedPresent = matchingPoints.length > 0;
      const classification = points.length === 0 ? 'NO_TARGET' : expectedPresent && points.length === 1 ? 'EXACT_SINGLE_TARGET' : expectedPresent ? 'DUPLICATE_SAME_COLLECTION' : 'PROJECTION_ID_MISMATCH';
      report.counts[classification === 'EXACT_SINGLE_TARGET' ? 'exactSingleTarget' : classification === 'DUPLICATE_SAME_COLLECTION' ? 'duplicateSameCollection' : classification === 'NO_TARGET' ? 'noTarget' : 'projectionIdMismatch'] += 1;
      report.candidates.push({ candidateOrdinal: candidate.candidateOrdinal, packetKey: candidate.packetKey, sourceRef: candidate.sourceRef, postgresQdrantId: expected, qdrantPointIds: ids, pointCount: points.length, matchingPointIds: matchingPoints.map((point) => String(point.id)), authoritativeTarget: matchingPoints.length === 1 ? String(matchingPoints[0].id) : null, targetMatchKind: matchingPoints.map((point) => String(point.id) === expected ? 'POINT_ID' : 'PAYLOAD_QDRANT_POINT_ID'), classification });
    }
    report.status = report.counts.noTarget === 0 && report.counts.projectionIdMismatch === 0 ? 'QDRANT_PROJECTION_TARGETS_CENSUSED' : 'QDRANT_PROJECTION_TARGETS_BLOCKED';
    report.nextGate = report.status === 'QDRANT_PROJECTION_TARGETS_CENSUSED' ? 'QDRANT_NAMED_VECTOR_UPDATE_REVIEW' : 'PROJECTION_ID_RECONCILIATION';
  } finally { await pool.end(); }
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, counts: report.counts, reportPath }, null, 2));
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
