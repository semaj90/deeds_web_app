#!/usr/bin/env node

/** Read-only audit of current packet IDs against the codebase Qdrant projection. */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const root = REPO_ROOT;
const reportPath = path.join(root, 'docs/reports/current-packet-qdrant-bridge-v1.json');
const planPath = path.join(root, 'docs/reports/current-source-graphify-batch-plan-v1.json');
const qdrantUrl = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const collection = 'codebase_chunks_768';
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const sourceRefs = (Array.isArray(plan.records) ? plan.records : [])
  .filter((row) => row.classification === 'CURRENT_GRAPHIFY_EXACT' && row.sourceRef)
  .map((row) => row.sourceRef);
const env = loadRepoEnv(process.env);
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 1, statement_timeout: 60000 });

try {
  const packetResult = await pool.query(`
    SELECT packet_key, source_ref, chunk_id::text AS chunk_id, qdrant_point_id, content_hash
    FROM public.atlas_packets
    WHERE source_ref = ANY($1::text[])
    ORDER BY source_ref
  `, [sourceRefs]);
  const packets = packetResult.rows;
  const ids = packets.map((row) => String(row.qdrant_point_id ?? '')).filter(Boolean);
  const response = await fetch(`${qdrantUrl}/collections/${collection}/points`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids: ids.map((id) => /^\d+$/.test(id) ? Number(id) : id), with_payload: true, with_vector: false }),
  });
  const responseText = await response.text();
  if (!response.ok) throw new Error(`QDRANT_HTTP_${response.status}:${responseText.slice(0, 500)}`);
  const body = JSON.parse(responseText);
  const points = Array.isArray(body.result) ? body.result : [];
  const byId = new Map(points.map((point) => [String(point.id), point]));
  const comparisons = packets.map((packet) => {
    const point = byId.get(String(packet.qdrant_point_id));
    const payload = point?.payload ?? {};
    return {
      sourceRef: packet.source_ref,
      packetKey: packet.packet_key,
      packetChunkId: packet.chunk_id,
      packetQdrantPointId: packet.qdrant_point_id,
      packetContentHash: packet.content_hash,
      qdrantFound: Boolean(point),
      qdrantChunkId: payload.chunk_id ?? null,
      qdrantSourceRef: payload.source_ref ?? null,
      qdrantContentHash: payload.content_hash ?? null,
    };
  });
  const report = {
    schema: 'atlas.current-packet-qdrant-bridge.v1',
    mode: 'READ_ONLY_CENSUS',
    collection,
    sourcePlan: path.relative(root, planPath),
    counts: {
      plannedSources: sourceRefs.length,
      packetRows: packets.length,
      packetQdrantIds: ids.length,
      qdrantPointsFound: points.length,
      sourceMatches: comparisons.filter((row) => row.qdrantSourceRef === row.sourceRef).length,
      chunkIdMatches: comparisons.filter((row) => row.packetChunkId && row.packetChunkId === row.qdrantChunkId).length,
      contentHashMatches: comparisons.filter((row) => row.packetContentHash && row.packetContentHash === row.qdrantContentHash).length,
    },
    samples: comparisons.slice(0, 10),
    matchedSamples: comparisons.filter((row) => row.qdrantFound).slice(0, 10),
    writes: { postgres: false, qdrant: false, neo4j: false, valkey: false },
    canonicalAuthority: false,
    status: points.length === packets.length ? 'PACKET_QDRANT_BRIDGE_PRESENT' : 'PACKET_QDRANT_BRIDGE_MISSING',
    nextGate: points.length === packets.length ? 'PACKET_QDRANT_PAYLOAD_RECONCILIATION' : 'PACKET_CHUNK_IDENTITY_BRIDGE',
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, counts: report.counts, reportPath: path.relative(root, reportPath) }, null, 2));
} finally {
  await pool.end();
}
