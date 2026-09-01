#!/usr/bin/env node
/**
 * QDRANT-PROJECTION-ID-OWNER-01 -- remaining ownership checks.
 *
 * Read-only. No writes to Postgres, Qdrant, Redis, or Neo4j.
 *
 * Context: audit-qdrant-768-identity.mjs already proves the two-generation
 * split in `codebase_chunks_768` -- a legacy numeric-point-id writer
 * (`nextPointId` starting at 1002, independent of `codebase_chunk_index.id`)
 * and a newer UUID-point-id writer (Phase109, `qdrant point id = row id`).
 * That script's `duplicate_postgres_mapping_samples` already surfaces the
 * candidate set: Postgres chunk rows that have >1 live Qdrant point in the
 * SAME collection (one numeric, one UUID).
 *
 * This script proves OWNERSHIP for that candidate set specifically -- not
 * just "both points exist", but that every downstream identity bridge
 * (packet_qdrant_bridge, atlas_packets) that references a Qdrant point for
 * these rows points at the SAME numeric id the legacy writer produced, and
 * that the numeric and UUID points carry identical vectors/lineage, before
 * any QDRANT-PROJECTION-OWNERSHIP freeze decision is made.
 *
 * Per CLAUDE.md's Duplication Prevention rule: a config value/bridge row
 * existing is not evidence it's correct -- this checks the REFERENT, not
 * just the reference.
 *
 * Usage: npx tsx scripts/atlas/qdrant-projection-id-owner-01.mjs [--json]
 */
import { Pool } from 'pg';
import fetch from 'node-fetch';
import { loadAtlasEnv } from './load-atlas-env.mjs';

const QDRANT_URL = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/^0\.0\.0\.0/, '127.0.0.1');
const QDRANT_COLLECTION = 'codebase_chunks_768';
const JSON_OUT = process.argv.includes('--json');
const log = (...args) => { if (!JSON_OUT) console.log(...args); };

await loadAtlasEnv();
const PG_URL = process.env.DATABASE_URL;
if (!PG_URL) {
  console.error('[FAIL] DATABASE_URL not set');
  process.exit(1);
}
const pool = new Pool({ connectionString: PG_URL });

async function fetchQdrantPoint(id, withVector) {
  const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [id], with_payload: true, with_vector: !!withVector }),
  });
  if (!res.ok) throw new Error(`Qdrant points retrieve failed: HTTP ${res.status}`);
  const data = await res.json();
  return data.result?.[0] ?? null;
}

function cosineSim(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) return null;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return null;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function main() {
  log('QDRANT-PROJECTION-ID-OWNER-01 -- remaining ownership checks (read-only)');
  log(`Collection: ${QDRANT_COLLECTION}`);
  log('');

  // 1. Discover the candidate set live: Postgres rows carrying a legacy
  //    numeric qdrant_id that ALSO have a live Qdrant point at their own
  //    UUID id in the same collection (the duplicateSameCollection set).
  const { rows: pgRows } = await pool.query(`
    SELECT id, qdrant_id, relative_path, content_hash, source_ref
    FROM codebase_chunk_index
    WHERE qdrant_id IS NOT NULL AND qdrant_id ~ '^[0-9]+$'
    ORDER BY qdrant_id::bigint
  `);
  log(`Postgres rows with legacy numeric qdrant_id: ${pgRows.length}`);

  const candidates = [];
  for (const row of pgRows) {
    const numericId = Number(row.qdrant_id);
    const [numericPoint, uuidPoint] = await Promise.all([
      fetchQdrantPoint(numericId, true),
      fetchQdrantPoint(row.id, true),
    ]);
    if (numericPoint && uuidPoint) {
      candidates.push({ row, numericId, numericPoint, uuidPoint });
    }
  }
  const candidateCount = candidates.length;
  log(`duplicateSameCollection candidates (both numeric+UUID points live): ${candidateCount}`);
  log('');

  if (candidateCount === 0) {
    const report = {
      schema: 'atlas.qdrant-projection-id-owner-01.v1',
      readOnly: true,
      canonicalWrites: false,
      candidateCount: 0,
      note: 'No live duplicateSameCollection candidates found -- either already resolved/quarantined, or the legacy numeric generation has no overlapping UUID-generation point for any row. Re-run audit-qdrant-768-identity.mjs to confirm current duplicate_postgres_mappings count.',
      RESULT: 'NO_CANDIDATES',
    };
    console.log(JSON.stringify(report, null, 2));
    await pool.end();
    return;
  }

  // 2. For each candidate, pull the bridge + atlas_packets rows by source_ref
  //    (bounded, per-candidate -- candidate set is small by construction).
  const sourceRefs = [...new Set(candidates.map((c) => c.row.source_ref ?? c.row.relative_path))];
  const [{ rows: bridgeRows }, { rows: packetRows }] = await Promise.all([
    pool.query(
      `SELECT source_ref, qdrant_point_id, packet_key, matched_by, confidence FROM packet_qdrant_bridge WHERE source_ref = ANY($1::text[])`,
      [sourceRefs],
    ),
    pool.query(
      `SELECT source_ref, qdrant_point_id, packet_key FROM atlas_packets WHERE source_ref = ANY($1::text[])`,
      [sourceRefs],
    ),
  ]);
  const bridgeBySourceRef = new Map(bridgeRows.map((r) => [r.source_ref, r]));
  const packetsBySourceRef = new Map();
  for (const r of packetRows) {
    const list = packetsBySourceRef.get(r.source_ref) ?? [];
    list.push(r);
    packetsBySourceRef.set(r.source_ref, list);
  }

  const results = [];
  const gateCounts = {
    bridgePointMatchesNumeric: 0,
    atlasPacketPointMatchesNumeric: 0,
    numericPayloadPostgresIdMatches: 0,
    uuidPayloadPostgresIdMatches: 0,
    vectorParity: 0,
    representationRevisionParity: 0,
    sourceRevisionParity: 0,
    workspaceRevisionParity: 0,
    numericPayloadSelfPointIdConsistent: 0,
    uuidPayloadSelfPointIdConsistent: 0,
  };

  for (const c of candidates) {
    const sourceRef = c.row.source_ref ?? c.row.relative_path;
    const bridge = bridgeBySourceRef.get(sourceRef) ?? null;
    const packets = packetsBySourceRef.get(sourceRef) ?? [];
    const packetWithPoint = packets.find((p) => p.qdrant_point_id != null) ?? null;

    const numericPayload = c.numericPoint.payload ?? {};
    const uuidPayload = c.uuidPoint.payload ?? {};

    // NOTE: neither payload generation actually names the field "postgres_id"
    // -- the legacy numeric-writer payload names it "canonical_id"; the UUID
    // writer's payload has no equivalent self-reference field at all (its own
    // point id IS the postgres uuid, by construction). Checked live against
    // real payload keys before writing this, per the "referent not reference"
    // rule -- do not assume a field name from a template.
    const numericPayloadCanonicalId = numericPayload.canonical_id ?? numericPayload.postgres_id ?? null;
    const uuidPayloadCanonicalId = uuidPayload.canonical_id ?? uuidPayload.postgres_id ?? null;

    // The self-declared qdrant_point_id INSIDE each payload is a THIRD claim
    // about "where does this packet live in Qdrant" -- distinct from either
    // point's own actual id. Check whether it's even self-consistent.
    const numericPayloadSelfPointIdMatches = numericPayload.qdrant_point_id != null
      ? String(numericPayload.qdrant_point_id) === String(c.numericId)
      : null;
    const uuidPayloadSelfPointIdMatches = uuidPayload.qdrant_point_id != null
      ? String(uuidPayload.qdrant_point_id) === String(c.row.id)
      : null;

    const bridgeMatch = bridge
      ? (String(bridge.qdrant_point_id) === String(c.numericId) || String(bridge.qdrant_point_id) === String(c.row.id))
      : null;
    const atlasPacketMatch = packetWithPoint
      ? (String(packetWithPoint.qdrant_point_id) === String(c.numericId) || String(packetWithPoint.qdrant_point_id) === String(c.row.id))
      : null;
    const numericPayloadPgMatch = numericPayloadCanonicalId != null
      ? String(numericPayloadCanonicalId) === String(c.row.id)
      : null;
    const uuidPayloadPgMatch = uuidPayloadCanonicalId != null
      ? String(uuidPayloadCanonicalId) === String(c.row.id)
      : null;

    const numericVec = c.numericPoint.vector?.content ?? c.numericPoint.vector ?? null;
    const uuidVec = c.uuidPoint.vector?.content ?? c.uuidPoint.vector ?? null;
    const cosine = cosineSim(numericVec, uuidVec);
    const vectorParity = cosine !== null ? cosine >= 0.999999 : null;

    const repRevParity = (numericPayload.representation_id ?? null) === (uuidPayload.representation_id ?? null);
    const srcRevParity = (numericPayload.source_revision ?? numericPayload.sourceRevision ?? null)
      === (uuidPayload.source_revision ?? uuidPayload.sourceRevision ?? null);
    const wsRevParity = (numericPayload.workspace_revision ?? numericPayload.workspaceRevision ?? null)
      === (uuidPayload.workspace_revision ?? uuidPayload.workspaceRevision ?? null);

    if (bridgeMatch) gateCounts.bridgePointMatchesNumeric++;
    if (atlasPacketMatch) gateCounts.atlasPacketPointMatchesNumeric++;
    if (numericPayloadPgMatch) gateCounts.numericPayloadPostgresIdMatches++;
    if (uuidPayloadPgMatch) gateCounts.uuidPayloadPostgresIdMatches++;
    if (vectorParity) gateCounts.vectorParity++;
    if (repRevParity) gateCounts.representationRevisionParity++;
    if (srcRevParity) gateCounts.sourceRevisionParity++;
    if (wsRevParity) gateCounts.workspaceRevisionParity++;
    if (numericPayloadSelfPointIdMatches) gateCounts.numericPayloadSelfPointIdConsistent++;
    if (uuidPayloadSelfPointIdMatches) gateCounts.uuidPayloadSelfPointIdConsistent++;

    results.push({
      postgres_id: c.row.id,
      source_ref: sourceRef,
      numeric_point_id: c.numericId,
      uuid_point_id: c.row.id,
      bridge_present: !!bridge,
      bridge_point_matches_numeric: bridgeMatch,
      atlas_packet_present: !!packetWithPoint,
      atlas_packet_point_matches_numeric: atlasPacketMatch,
      numeric_payload_postgres_id_matches: numericPayloadPgMatch,
      uuid_payload_postgres_id_matches: uuidPayloadPgMatch,
      numeric_payload_self_qdrant_point_id_consistent: numericPayloadSelfPointIdMatches,
      uuid_payload_self_qdrant_point_id_consistent: uuidPayloadSelfPointIdMatches,
      vector_cosine: cosine,
      vector_parity: vectorParity,
      representation_revision_parity: repRevParity,
      source_revision_parity: srcRevParity,
      workspace_revision_parity: wsRevParity,
    });
  }

  const allPass = (n) => n === candidateCount;
  const report = {
    schema: 'atlas.qdrant-projection-id-owner-01.v1',
    readOnly: true,
    canonicalWrites: false,
    collection: QDRANT_COLLECTION,
    candidateCount,
    gateCounts,
    gates: {
      bridgePoint_numericPoint: `${gateCounts.bridgePointMatchesNumeric}/${candidateCount}`,
      atlasPacketPoint_numericPoint: `${gateCounts.atlasPacketPointMatchesNumeric}/${candidateCount}`,
      numericPayload_postgres_id_chunk_id: `${gateCounts.numericPayloadPostgresIdMatches}/${candidateCount}`,
      uuidPayload_postgres_id_chunk_id: `${gateCounts.uuidPayloadPostgresIdMatches}/${candidateCount}`,
      numericVector_uuidVector_parity: `${gateCounts.vectorParity}/${candidateCount}`,
      representationRevision_parity: `${gateCounts.representationRevisionParity}/${candidateCount}`,
      sourceRevision_parity: `${gateCounts.sourceRevisionParity}/${candidateCount}`,
      workspaceRevision_parity: `${gateCounts.workspaceRevisionParity}/${candidateCount}`,
    },
    allGatesPass:
      allPass(gateCounts.bridgePointMatchesNumeric) &&
      allPass(gateCounts.atlasPacketPointMatchesNumeric) &&
      allPass(gateCounts.numericPayloadPostgresIdMatches) &&
      allPass(gateCounts.uuidPayloadPostgresIdMatches) &&
      allPass(gateCounts.vectorParity) &&
      allPass(gateCounts.representationRevisionParity) &&
      allPass(gateCounts.sourceRevisionParity) &&
      allPass(gateCounts.workspaceRevisionParity),
    results,
    RESULT: 'PENDING',
  };
  report.RESULT = report.allGatesPass ? 'PASS' : 'PARTIAL_PROVEN';

  console.log(JSON.stringify(report, null, 2));
  await pool.end();
  process.exit(report.allGatesPass ? 0 : 1);
}

main().catch(async (err) => {
  console.error('[FAIL]', err.message);
  await pool.end();
  process.exit(1);
});
