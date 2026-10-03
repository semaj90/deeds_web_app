#!/usr/bin/env node
/**
 * backfill-packet-qdrant-pid-exact-v1.mjs
 *
 * Exact-identity backfill of atlas_packets.qdrant_point_id / qdrant_collection / qdrant_vector_dim.
 * Postgres stays canonical; these are derived mirror fields.
 *
 * Join rule: Qdrant payload.packet_key === atlas_packets.packet_key, AND exactly ONE point in the
 * collection carries that packet_key. Packets with several chunk points are AMBIGUOUS (packet vs
 * chunk grain) and are never guessed. No file-path / source_ref joins (see LEIDEN-QDRANT lesson).
 *
 * Default = rehearsal: writes inside a transaction, reads back, ROLLS BACK. --apply commits.
 * Pre-image of every touched row is written to docs/reports before any write.
 * Only rows whose qdrant_point_id IS NULL are updated (idempotent, never overwrites).
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const APPLY = process.argv.includes('--apply');
const COLLECTION = 'codebase_chunks_768';
const QDRANT = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const stamp = new Date().toISOString().slice(0, 10);
const preImagePath = path.join(REPO_ROOT, `docs/reports/qdrant-pid-backfill-preimage-${stamp}.json`);
const receiptPath = path.join(REPO_ROOT, 'docs/reports/qdrant-pid-backfill-exact-v1.json');

const info = await (await fetch(`${QDRANT}/collections/${COLLECTION}`)).json();
const vecCfg = info.result.config.params.vectors;
const dim = vecCfg?.content?.size ?? vecCfg?.size;
if (dim !== 768) throw new Error(`UNEXPECTED_VECTOR_DIM:${dim}`);

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1 });
const { rows: missing } = await pool.query(
  `SELECT packet_key, qdrant_point_id, qdrant_collection, qdrant_vector_dim FROM atlas_packets WHERE qdrant_point_id IS NULL`);
const missingKeys = new Set(missing.map((r) => r.packet_key));

const pointsByPacket = new Map();
let offset = null;
do {
  const res = await fetch(`${QDRANT}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ limit: 5000, offset, with_payload: ['packet_key'], with_vector: false }),
  });
  const j = (await res.json()).result;
  for (const p of j.points) {
    const pk = p.payload?.packet_key;
    if (!pk || !missingKeys.has(pk)) continue;
    if (!pointsByPacket.has(pk)) pointsByPacket.set(pk, []);
    pointsByPacket.get(pk).push(String(p.id));
  }
  offset = j.next_page_offset;
} while (offset);

const unique = [...pointsByPacket].filter(([, ids]) => ids.length === 1).map(([packetKey, [pointId]]) => ({ packetKey, pointId }));
const ambiguous = pointsByPacket.size - unique.length;

fs.writeFileSync(preImagePath, JSON.stringify({
  schema: 'atlas.qdrant-pid-backfill-preimage.v1', collection: COLLECTION,
  rows: missing.filter((r) => unique.some((u) => u.packetKey === r.packet_key)),
}, null, 2));

const client = await pool.connect();
const receipt = { schema: 'atlas.qdrant-pid-backfill-exact.v1', mode: APPLY ? 'apply' : 'rehearsal', collection: COLLECTION, vectorDim: dim,
  packetsMissingPointId: missing.length, packetsWithAnyExactPoint: pointsByPacket.size, uniqueEligible: unique.length, ambiguousSkipped: ambiguous,
  preImage: path.relative(REPO_ROOT, preImagePath) };
try {
  await client.query('BEGIN');
  let updated = 0;
  for (const u of unique) {
    const r = await client.query(
      `UPDATE atlas_packets SET qdrant_point_id=$1, qdrant_collection=$2, qdrant_vector_dim=$3, updated_at=NOW()
       WHERE packet_key=$4 AND qdrant_point_id IS NULL`, [u.pointId, COLLECTION, dim, u.packetKey]);
    updated += r.rowCount;
  }
  const { rows: [rb] } = await client.query(
    `SELECT COUNT(*)::int n FROM atlas_packets WHERE packet_key = ANY($1::text[]) AND qdrant_point_id IS NOT NULL AND qdrant_collection=$2`,
    [unique.map((u) => u.packetKey), COLLECTION]);
  receipt.updated = updated; receipt.readbackInTransaction = rb.n;
  if (updated !== unique.length || rb.n !== unique.length) throw new Error(`READBACK_MISMATCH:${updated}/${rb.n}/${unique.length}`);
  await client.query(APPLY ? 'COMMIT' : 'ROLLBACK');
  receipt.committed = APPLY;
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  receipt.error = String(e.message ?? e); receipt.committed = false;
} finally { client.release(); await pool.end(); }
fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
console.log(JSON.stringify(receipt, null, 2));
if (receipt.error) process.exit(1);
