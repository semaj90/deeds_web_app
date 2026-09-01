#!/usr/bin/env node
/**
 * QDRANT-ID-ROOT-01 -- writer/generation census, read-only.
 *
 * Supersedes treating QDRANT-PROJECTION-ID-OWNER-01's 143-row result as a
 * near-complete freeze candidate. That result showed 0/143 bridge/atlas_packets
 * references resolve to either live generation for the dual-live subset --
 * this script classifies the FULL population (every codebase_chunk_index row
 * carrying a legacy numeric qdrant_id) to find out how much of the repo-wide
 * projection-id space is actually contested, not just the narrow dual-live
 * slice.
 *
 * Read-only. No writes to Postgres, Qdrant, Redis, or Neo4j. No point,
 * payload, or vector mutation. No deletion, no quarantine.
 *
 * Per-row classification buckets (population = codebase_chunk_index rows
 * with a numeric qdrant_id):
 *   NUMERIC_ONLY                    -- numeric point live, own-UUID point absent
 *   UUID_ONLY                       -- numeric point absent, own-UUID point live
 *   NUMERIC_AND_UUID                -- both live (vector parity computed separately)
 *   NEITHER_LIVE                    -- Postgres claims a qdrant_id but no point answers
 *
 * For rows with a packet_qdrant_bridge / atlas_packets reference (joined by
 * source_ref), the referenced point id is classified as:
 *   TO_NUMERIC / TO_UUID / TO_THIRD_LIVE_POINT / DANGLING (id not live anywhere)
 *   ABSENT (no reference row at all)
 *
 * "Third live point" is deliberately distinguished from "dangling": a
 * dangling reference just returns nothing; a third-live-point reference can
 * silently return SOMEONE ELSE'S packet, which is the more dangerous failure
 * mode -- this is the finding QDRANT-PROJECTION-ID-OWNER-01 surfaced for one
 * row and this census checks at scale.
 *
 * Usage: npx tsx scripts/atlas/qdrant-id-root-01.mjs [--json] [--with-vectors]
 */
import { Pool } from 'pg';
import fetch from 'node-fetch';
import { loadAtlasEnv } from './load-atlas-env.mjs';

const QDRANT_URL = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/^0\.0\.0\.0/, '127.0.0.1');
const QDRANT_COLLECTION = 'codebase_chunks_768';
const JSON_OUT = process.argv.includes('--json');
const WITH_VECTORS = process.argv.includes('--with-vectors');
const BATCH_SIZE = 200;
const log = (...args) => { if (!JSON_OUT) console.log(...args); };

await loadAtlasEnv();
const PG_URL = process.env.DATABASE_URL;
if (!PG_URL) {
  console.error('[FAIL] DATABASE_URL not set');
  process.exit(1);
}
const pool = new Pool({ connectionString: PG_URL });

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Qdrant point IDs are strictly unsigned 64-bit integer or UUID -- anything
// else (a malformed/garbage reference value from a bridge/atlas row) is
// invalid input, not a valid-but-dangling id. Sanitize before sending so one
// garbage value doesn't 400 the whole batch; garbage ids are simply never
// present in the returned liveness map (correctly resolves to DANGLING).
function sanitizeQdrantId(id) {
  if (id == null) return null;
  const s = String(id);
  if (/^[0-9]+$/.test(s)) {
    const n = Number(s);
    return Number.isSafeInteger(n) ? n : null;
  }
  if (UUID_RE.test(s)) return s;
  return null;
}

async function batchFetchPoints(ids, withVector) {
  const map = new Map();
  const sanitized = [...new Set(ids.map(sanitizeQdrantId).filter((v) => v !== null))];
  for (const batch of chunk(sanitized, BATCH_SIZE)) {
    if (batch.length === 0) continue;
    const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: batch, with_payload: true, with_vector: !!withVector }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Qdrant points retrieve failed: HTTP ${res.status} -- batch sample: ${JSON.stringify(batch.slice(0, 5))} -- ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    for (const p of data.result ?? []) map.set(String(p.id), p);
  }
  return map;
}

function cosineSim(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) return null;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return null;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function main() {
  log('QDRANT-ID-ROOT-01 -- writer/generation census (read-only)');
  log(`Collection: ${QDRANT_COLLECTION}`);
  log('');

  const { rows: pgRows } = await pool.query(`
    SELECT id, qdrant_id, relative_path, source_ref, content_hash
    FROM codebase_chunk_index
    WHERE qdrant_id IS NOT NULL AND qdrant_id ~ '^[0-9]+$'
    ORDER BY qdrant_id::bigint
  `);
  log(`Population (numeric qdrant_id present): ${pgRows.length}`);

  const numericIds = pgRows.map((r) => Number(r.qdrant_id));
  const uuidIds = pgRows.map((r) => r.id);

  log('Batch-fetching numeric-id points...');
  const numericPoints = await batchFetchPoints(numericIds, false);
  log(`  live: ${numericPoints.size}/${numericIds.length}`);
  log('Batch-fetching own-uuid-id points...');
  const uuidPoints = await batchFetchPoints(uuidIds, false);
  log(`  live: ${uuidPoints.size}/${uuidIds.length}`);

  const sourceRefs = [...new Set(pgRows.map((r) => r.source_ref ?? r.relative_path))];
  const [{ rows: bridgeRows }, { rows: packetRows }] = await Promise.all([
    pool.query(
      `SELECT source_ref, qdrant_point_id, packet_key FROM packet_qdrant_bridge WHERE source_ref = ANY($1::text[])`,
      [sourceRefs],
    ),
    pool.query(
      `SELECT source_ref, qdrant_point_id, packet_key FROM atlas_packets WHERE source_ref = ANY($1::text[]) AND qdrant_point_id IS NOT NULL`,
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

  // Third-id liveness: collect every bridge/atlas reference id that is
  // neither this row's numeric nor uuid id, and batch-check whether it's
  // live ANYWHERE in the collection (third live point) or nowhere (dangling).
  const thirdIdCandidates = new Set();
  for (const row of pgRows) {
    const sourceRef = row.source_ref ?? row.relative_path;
    const bridge = bridgeBySourceRef.get(sourceRef);
    if (bridge && String(bridge.qdrant_point_id) !== String(row.qdrant_id) && String(bridge.qdrant_point_id) !== String(row.id)) {
      thirdIdCandidates.add(bridge.qdrant_point_id);
    }
    const packets = packetsBySourceRef.get(sourceRef) ?? [];
    for (const p of packets) {
      if (String(p.qdrant_point_id) !== String(row.qdrant_id) && String(p.qdrant_point_id) !== String(row.id)) {
        thirdIdCandidates.add(p.qdrant_point_id);
      }
    }
  }
  log(`Third-id references to resolve (bridge/atlas pointing at neither generation): ${thirdIdCandidates.size}`);
  const thirdIdLiveness = await batchFetchPoints([...thirdIdCandidates], false);
  log(`  of those, live somewhere in the collection: ${thirdIdLiveness.size}`);
  log('');

  function classifyReference(refPointId, row) {
    if (refPointId == null) return 'ABSENT';
    const s = String(refPointId);
    if (s === String(row.qdrant_id)) return 'TO_NUMERIC';
    if (s === String(row.id)) return 'TO_UUID';
    if (thirdIdLiveness.has(s)) return 'TO_THIRD_LIVE_POINT';
    return 'DANGLING';
  }

  const dualLiveVectorFetch = WITH_VECTORS
    ? await (async () => {
        const dualLiveRows = pgRows.filter((r) => numericPoints.has(String(r.qdrant_id)) && uuidPoints.has(String(r.id)));
        const nMap = await batchFetchPoints(dualLiveRows.map((r) => Number(r.qdrant_id)), true);
        const uMap = await batchFetchPoints(dualLiveRows.map((r) => r.id), true);
        return { nMap, uMap };
      })()
    : null;

  const counts = {
    NUMERIC_ONLY: 0,
    UUID_ONLY: 0,
    NUMERIC_AND_UUID: 0,
    NEITHER_LIVE: 0,
  };
  const vectorCounts = { VECTOR_EQUIVALENT: 0, VECTOR_DIVERGED: 0, VECTOR_INDETERMINATE: 0 };
  const bridgeRefCounts = { TO_NUMERIC: 0, TO_UUID: 0, TO_THIRD_LIVE_POINT: 0, DANGLING: 0, ABSENT: 0 };
  const atlasRefCounts = { TO_NUMERIC: 0, TO_UUID: 0, TO_THIRD_LIVE_POINT: 0, DANGLING: 0, ABSENT: 0 };

  const perRow = [];
  for (const row of pgRows) {
    const hasNumeric = numericPoints.has(String(row.qdrant_id));
    const hasUuid = uuidPoints.has(String(row.id));
    let bucket;
    if (hasNumeric && hasUuid) bucket = 'NUMERIC_AND_UUID';
    else if (hasNumeric) bucket = 'NUMERIC_ONLY';
    else if (hasUuid) bucket = 'UUID_ONLY';
    else bucket = 'NEITHER_LIVE';
    counts[bucket]++;

    let vectorClass = null;
    if (bucket === 'NUMERIC_AND_UUID' && dualLiveVectorFetch) {
      const np = dualLiveVectorFetch.nMap.get(String(row.qdrant_id));
      const up = dualLiveVectorFetch.uMap.get(String(row.id));
      const nv = np?.vector?.content ?? np?.vector ?? null;
      const uv = up?.vector?.content ?? up?.vector ?? null;
      const cosine = cosineSim(nv, uv);
      vectorClass = cosine === null ? 'VECTOR_INDETERMINATE' : cosine >= 0.999999 ? 'VECTOR_EQUIVALENT' : 'VECTOR_DIVERGED';
      vectorCounts[vectorClass]++;
    }

    const sourceRef = row.source_ref ?? row.relative_path;
    const bridge = bridgeBySourceRef.get(sourceRef) ?? null;
    const packets = packetsBySourceRef.get(sourceRef) ?? [];
    const packetWithPoint = packets[0] ?? null;

    const bridgeClass = bridge ? classifyReference(bridge.qdrant_point_id, row) : 'ABSENT';
    const atlasClass = packetWithPoint ? classifyReference(packetWithPoint.qdrant_point_id, row) : 'ABSENT';
    bridgeRefCounts[bridgeClass]++;
    atlasRefCounts[atlasClass]++;

    perRow.push({
      postgres_id: row.id,
      source_ref: sourceRef,
      numeric_point_id: Number(row.qdrant_id),
      uuid_point_id: row.id,
      generation_bucket: bucket,
      vector_class: vectorClass,
      bridge_reference_class: bridgeClass,
      atlas_packet_reference_class: atlasClass,
    });
  }

  const report = {
    schema: 'atlas.qdrant-id-root-01.v1',
    task: 'QDRANT-ID-ROOT-01',
    readOnly: true,
    canonicalWrites: false,
    pointMutations: false,
    payloadMutations: false,
    deletions: false,
    quarantineActions: false,
    collection: QDRANT_COLLECTION,
    populationSize: pgRows.length,
    generation_bucket_counts: counts,
    dual_live_vector_parity_counts: WITH_VECTORS ? vectorCounts : 'NOT_COMPUTED (pass --with-vectors)',
    bridge_reference_class_counts: bridgeRefCounts,
    atlas_packet_reference_class_counts: atlasRefCounts,
    limitations: [
      'No writer/writerRevision/createdAt/pointIdAlgorithm/payloadSchema provenance captured -- not present as queryable Postgres or Qdrant fields; would require reconstructing from git history or payload heuristics, not attempted here.',
      'Vector parity only computed when --with-vectors is passed (extra fetch cost); representation-identity gating (same representationId/representationRevision/embeddingModel before trusting cosine) not yet applied -- see report note.',
      'thirdIdLiveness check only covers ids actually referenced by a bridge/atlas_packets row for this population, not every point in the collection.',
    ],
    decision: {
      likely_cause: 'Multiple historical Qdrant projection writers/generations coexist, while bridge and atlas_packets projection references were populated under incompatible point-ID ownership rules.',
      QDRANT_PROJECTION_OWNERSHIP: 'NOT_FROZEN',
      QDRANT_ID_ROOT_01_STATUS: 'FAIL_UNRESOLVED_OWNERSHIP',
    },
    perRowSampleFirst25: perRow.slice(0, 25),
  };

  console.log(JSON.stringify(report, null, 2));

  const fs = await import('node:fs');
  fs.writeFileSync(
    'C:/Users/james/Videos/deeds-web-app/docs/reports/qdrant-id-root-01-results.json',
    JSON.stringify({ ...report, perRowFull: perRow }, null, 2) + '\n',
  );

  await pool.end();
}

main().catch(async (err) => {
  console.error('[FAIL]', err.message, err.stack);
  await pool.end();
  process.exit(1);
});
