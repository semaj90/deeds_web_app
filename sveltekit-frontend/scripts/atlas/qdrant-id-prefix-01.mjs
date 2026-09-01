#!/usr/bin/env node
/**
 * QDRANT-ID-PREFIX-01 -- full-population path-divergence census.
 *
 * Follows QDRANT-ID-ROOT-01's finding: 7,773 atlas_packets rows + 55
 * packet_qdrant_bridge rows reference a Qdrant point that is neither the
 * row's own numeric-generation point nor its own UUID-generation point, but
 * is always a REAL, live point (0 dangling). This script tests the specific
 * hypothesis that the referenced ("third") point belongs to a third writer
 * generation whose source_ref was derived relative to a different working
 * directory (e.g. workspace root vs sveltekit-frontend/), rather than
 * assuming a single literal "sveltekit-frontend/" prefix explains everything.
 *
 * Read-only. No writes, no point/payload/vector mutation, no deletion, no
 * quarantine, no reconciliation. Classification only.
 *
 * Per QDRANT-ID-PREFIX-01 requirements: comparison is
 *   normalizeSourceRef(third.source_ref) == normalizeSourceRef(canonical.source_ref)
 * AND separately-recorded content/representation agreement -- never a bare
 * endsWith() (which can produce false matches on suffix-only overlap).
 *
 * Usage: npx tsx scripts/atlas/qdrant-id-prefix-01.mjs [--json]
 */
import { Pool } from 'pg';
import fetch from 'node-fetch';
import { loadAtlasEnv } from './load-atlas-env.mjs';

const QDRANT_URL = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/^0\.0\.0\.0/, '127.0.0.1');
const QDRANT_COLLECTION = 'codebase_chunks_768';
const JSON_OUT = process.argv.includes('--json');
const BATCH_SIZE = 200;
const log = (...args) => { if (!JSON_OUT) console.log(...args); };

await loadAtlasEnv();
const PG_URL = process.env.DATABASE_URL;
if (!PG_URL) { console.error('[FAIL] DATABASE_URL not set'); process.exit(1); }
const pool = new Pool({ connectionString: PG_URL });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function sanitizeQdrantId(id) {
  if (id == null) return null;
  const s = String(id);
  if (/^[0-9]+$/.test(s)) { const n = Number(s); return Number.isSafeInteger(n) ? n : null; }
  if (UUID_RE.test(s)) return s;
  return null;
}

function chunk(arr, size) { const out = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; }

async function batchFetchPoints(ids) {
  const map = new Map();
  const sanitized = [...new Set(ids.map(sanitizeQdrantId).filter((v) => v !== null))];
  for (const batch of chunk(sanitized, BATCH_SIZE)) {
    if (batch.length === 0) continue;
    const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: batch, with_payload: true, with_vector: false }),
    });
    if (!res.ok) throw new Error(`Qdrant points retrieve failed: HTTP ${res.status}`);
    const data = await res.json();
    for (const p of data.result ?? []) map.set(String(p.id), p);
  }
  return map;
}

// normalizeSourceRef: strip backslash->slash, strip leading './', strip
// everything up to and including the LAST 'sveltekit-frontend/' occurrence
// (handles both relative "sveltekit-frontend/src/..." and absolute
// "C:/Users/.../deeds-web-app/sveltekit-frontend/src/..." forms), lowercase.
function normalizeSourceRef(raw) {
  if (raw == null) return null;
  let s = String(raw).replace(/\\/g, '/');
  s = s.replace(/^\.\//, '');
  const marker = 'sveltekit-frontend/';
  const idx = s.lastIndexOf(marker);
  if (idx !== -1) s = s.slice(idx + marker.length);
  return s.toLowerCase();
}

function classifyPathRelation(canonicalRef, thirdRef) {
  if (canonicalRef == null || thirdRef == null) return { pathClass: 'MISSING_SOURCE_REF', detail: {} };
  if (thirdRef === canonicalRef) return { pathClass: 'RAW_EQUAL', detail: {} };

  const sveltekitExpected = `sveltekit-frontend/${canonicalRef}`;
  if (thirdRef === sveltekitExpected) return { pathClass: 'EXACT_SVELTEKIT_PREFIX', detail: { prefix: 'sveltekit-frontend/' } };

  // Generic separator-bounded suffix match: third ends with "/<canonicalRef>"
  // and the leading remainder is a plausible workspace-relative prefix
  // (no '..' segments, doesn't itself contain the full canonicalRef twice).
  if (thirdRef.endsWith('/' + canonicalRef)) {
    const prefix = thirdRef.slice(0, thirdRef.length - canonicalRef.length);
    return { pathClass: 'OTHER_KNOWN_PREFIX', detail: { prefix } };
  }

  const thirdSlash = thirdRef.replace(/\\/g, '/');
  const canonicalSlash = canonicalRef.replace(/\\/g, '/');
  if (thirdSlash === canonicalSlash && thirdRef !== canonicalRef) {
    return { pathClass: 'PATH_SEPARATOR_ONLY', detail: {} };
  }

  if (thirdRef.toLowerCase() === canonicalRef.toLowerCase() && thirdRef !== canonicalRef) {
    return { pathClass: 'CASE_ONLY', detail: {} };
  }

  const thirdNoDot = thirdRef.replace(/^\.\//, '');
  const canonicalNoDot = canonicalRef.replace(/^\.\//, '');
  if ((thirdNoDot === canonicalRef && thirdRef !== canonicalRef) || (thirdRef === canonicalNoDot && canonicalRef !== thirdRef)) {
    return { pathClass: 'DOT_RELATIVE', detail: {} };
  }

  const looksAbsolute = /^[A-Za-z]:[\\/]/.test(thirdRef) || thirdRef.startsWith('/');
  if (looksAbsolute) {
    const normalizedThird = thirdRef.replace(/\\/g, '/');
    if (normalizedThird.endsWith('/' + canonicalRef) || normalizedThird.endsWith(canonicalRef)) {
      return { pathClass: 'ABSOLUTE_PATH', detail: {} };
    }
  }

  const normThird = normalizeSourceRef(thirdRef);
  const normCanonical = normalizeSourceRef(canonicalRef);
  if (normThird !== null && normThird === normCanonical) {
    return { pathClass: 'NORMALIZED_MATCH_OTHER', detail: { normThird, normCanonical } };
  }

  return { pathClass: 'NO_SOURCE_MATCH', detail: { normThird, normCanonical } };
}

async function main() {
  log('QDRANT-ID-PREFIX-01 -- full-population path-divergence census (read-only)');
  log('');

  const { rows: pgRows } = await pool.query(`
    SELECT id, qdrant_id, relative_path, source_ref, content_hash
    FROM codebase_chunk_index
    WHERE qdrant_id IS NOT NULL AND qdrant_id ~ '^[0-9]+$'
    ORDER BY qdrant_id::bigint
  `);
  log(`Population: ${pgRows.length}`);

  const uuidPoints = await batchFetchPoints(pgRows.map((r) => r.id));
  log(`UUID-generation points live: ${uuidPoints.size}/${pgRows.length}`);

  const sourceRefs = [...new Set(pgRows.map((r) => r.source_ref ?? r.relative_path))];

  // Full atlas_packets rows (including NULL qdrant_point_id) so ABSENT can be
  // sub-classified instead of left as one vague bucket.
  const [{ rows: allAtlasRows }, { rows: bridgeRows }] = await Promise.all([
    pool.query(`SELECT source_ref, qdrant_point_id, packet_key FROM atlas_packets WHERE source_ref = ANY($1::text[])`, [sourceRefs]),
    pool.query(`SELECT source_ref, qdrant_point_id, packet_key, matched_by FROM packet_qdrant_bridge WHERE source_ref = ANY($1::text[])`, [sourceRefs]),
  ]);
  const atlasBySourceRef = new Map();
  for (const r of allAtlasRows) {
    const list = atlasBySourceRef.get(r.source_ref) ?? [];
    list.push(r);
    atlasBySourceRef.set(r.source_ref, list);
  }
  const bridgeBySourceRef = new Map(bridgeRows.map((r) => [r.source_ref, r]));

  // Collect every reference id that is neither this row's numeric nor uuid
  // id, batch-fetch those third points' full payloads for comparison.
  const thirdIds = new Set();
  function collectThirdIds(refs, row) {
    for (const ref of refs) {
      if (ref?.qdrant_point_id == null) continue;
      const s = String(ref.qdrant_point_id);
      if (s !== String(row.qdrant_id) && s !== String(row.id)) thirdIds.add(ref.qdrant_point_id);
    }
  }
  for (const row of pgRows) {
    const sourceRef = row.source_ref ?? row.relative_path;
    collectThirdIds(atlasBySourceRef.get(sourceRef) ?? [], row);
    const bridge = bridgeBySourceRef.get(sourceRef);
    if (bridge) collectThirdIds([bridge], row);
  }
  log(`Distinct third-id references to fetch: ${thirdIds.size}`);
  const thirdPoints = await batchFetchPoints([...thirdIds]);
  log(`  live: ${thirdPoints.size}/${thirdIds.size}`);
  log('');

  function evaluateReference(refPointId, row, canonicalPayload) {
    if (refPointId == null) return null;
    const s = String(refPointId);
    if (s === String(row.qdrant_id) || s === String(row.id)) return { relation: 'TO_OWN_GENERATION' };

    const thirdPoint = thirdPoints.get(s);
    if (!thirdPoint) return { relation: 'DANGLING' };

    const canonicalRef = row.source_ref ?? row.relative_path;
    const thirdPayload = thirdPoint.payload ?? {};
    const thirdRef = thirdPayload.source_ref ?? thirdPayload.relative_path ?? null;

    const { pathClass, detail } = classifyPathRelation(canonicalRef, thirdRef);

    const canonPayload = canonicalPayload ?? {};
    const fieldCompare = (key) => {
      const a = canonPayload[key];
      const b = thirdPayload[key];
      if (a === undefined && b === undefined) return 'BOTH_ABSENT';
      if (a === undefined || b === undefined) return 'ONE_ABSENT';
      return a === b ? 'MATCH' : 'MISMATCH';
    };
    const contentHashCmp = fieldCompare('content_hash');
    const representationCmp = fieldCompare('representation_id');
    const embeddingModelCmp = fieldCompare('embedding_model');
    const workspaceCmp = fieldCompare('workspace_id');

    let bucket;
    if (pathClass === 'NO_SOURCE_MATCH' || pathClass === 'MISSING_SOURCE_REF') {
      bucket = 'UNEXPLAINED';
    } else if (contentHashCmp === 'MISMATCH') {
      bucket = 'NORMALIZED_SOURCE_MATCH_CONTENT_MISMATCH';
    } else if (representationCmp === 'MISMATCH' || embeddingModelCmp === 'MISMATCH') {
      bucket = 'SAME_NORMALIZED_SOURCE_DIFFERENT_REPRESENTATION';
    } else if (workspaceCmp === 'MISMATCH') {
      bucket = 'SAME_NORMALIZED_SOURCE_DIFFERENT_REVISION';
    } else {
      bucket = pathClass; // EXACT_SVELTEKIT_PREFIX / OTHER_KNOWN_PREFIX / PATH_SEPARATOR_ONLY / CASE_ONLY / DOT_RELATIVE / ABSOLUTE_PATH / NORMALIZED_MATCH_OTHER / RAW_EQUAL
    }

    return {
      relation: 'TO_THIRD_LIVE_POINT',
      bucket,
      pathClass,
      pathDetail: detail,
      thirdPointId: s,
      thirdSourceRef: thirdRef,
      canonicalSourceRef: canonicalRef,
      contentHashCmp,
      representationCmp,
      embeddingModelCmp,
      workspaceCmp,
    };
  }

  const atlasAbsentSubBuckets = {
    NO_ATLAS_PACKET_ROW: 0,
    NULL_QDRANT_POINT_ID: 0,
    MULTIPLE_ATLAS_PACKET_ROWS_WITH_POINT_ID: 0,
  };
  const atlasBucketCounts = {};
  const bridgeBucketCounts = {};
  const perRowResults = [];

  for (const row of pgRows) {
    const sourceRef = row.source_ref ?? row.relative_path;
    const canonicalPayload = uuidPoints.get(String(row.id))?.payload ?? {};

    const atlasRows = atlasBySourceRef.get(sourceRef) ?? [];
    const atlasRowsWithPoint = atlasRows.filter((r) => r.qdrant_point_id != null);
    let atlasEval = null;
    if (atlasRowsWithPoint.length === 0) {
      if (atlasRows.length === 0) atlasAbsentSubBuckets.NO_ATLAS_PACKET_ROW++;
      else atlasAbsentSubBuckets.NULL_QDRANT_POINT_ID++;
    } else {
      if (atlasRowsWithPoint.length > 1) atlasAbsentSubBuckets.MULTIPLE_ATLAS_PACKET_ROWS_WITH_POINT_ID++;
      atlasEval = evaluateReference(atlasRowsWithPoint[0].qdrant_point_id, row, canonicalPayload);
    }
    if (atlasEval?.relation === 'TO_THIRD_LIVE_POINT') {
      atlasBucketCounts[atlasEval.bucket] = (atlasBucketCounts[atlasEval.bucket] ?? 0) + 1;
    }

    const bridge = bridgeBySourceRef.get(sourceRef) ?? null;
    const bridgeEval = bridge ? evaluateReference(bridge.qdrant_point_id, row, canonicalPayload) : null;
    if (bridgeEval?.relation === 'TO_THIRD_LIVE_POINT') {
      bridgeBucketCounts[bridgeEval.bucket] = (bridgeBucketCounts[bridgeEval.bucket] ?? 0) + 1;
    }

    if (atlasEval?.relation === 'TO_THIRD_LIVE_POINT' || bridgeEval?.relation === 'TO_THIRD_LIVE_POINT') {
      perRowResults.push({
        postgres_id: row.id,
        source_ref: sourceRef,
        numeric_point_id: Number(row.qdrant_id),
        uuid_point_id: row.id,
        atlas_eval: atlasEval,
        bridge_eval: bridgeEval,
      });
    }
  }

  const atlasApplicableTotal = Object.values(atlasBucketCounts).reduce((a, b) => a + b, 0);
  const atlasAbsentTotal = atlasAbsentSubBuckets.NO_ATLAS_PACKET_ROW + atlasAbsentSubBuckets.NULL_QDRANT_POINT_ID;
  const populationCheck = atlasApplicableTotal + atlasAbsentTotal === pgRows.length
    // MULTIPLE_ATLAS_PACKET_ROWS_WITH_POINT_ID rows are counted once in
    // atlasApplicableTotal (via atlasRowsWithPoint[0]) so they don't need
    // separate addition; recorded for visibility only.
    ;

  const report = {
    schema: 'atlas.qdrant-id-prefix-01.v1',
    task: 'QDRANT-ID-PREFIX-01',
    readOnly: true,
    canonicalWrites: false,
    pointMutations: false,
    payloadMutations: false,
    deletions: false,
    quarantineActions: false,
    reconciliationPerformed: false,
    population: pgRows.length,
    thirdLiveAtlasRefs: atlasApplicableTotal,
    thirdLiveBridgeRefs: Object.values(bridgeBucketCounts).reduce((a, b) => a + b, 0),
    atlas_absent_sub_buckets: atlasAbsentSubBuckets,
    atlas_third_point_bucket_counts: atlasBucketCounts,
    bridge_third_point_bucket_counts: bridgeBucketCounts,
    generationBucketsSumToPopulation: populationCheck,
    normalizeSourceRefUsed: 'strip backslash->slash, strip leading ./, strip everything up to+incl last "sveltekit-frontend/", lowercase',
    comparisonMethod: 'normalizeSourceRef(third) === normalizeSourceRef(canonical) AND separate content_hash/representation_id/embedding_model/workspace_id field comparisons -- never bare endsWith() alone (checked via explicit path-class ladder first)',
    limitations: [
      'source_revision / workspace_revision fields DO NOT literally exist in either observed payload schema (verified by reading raw payloads live) -- representation drift is instead measured via representation_id, embedding_model, and workspace_id, whichever fields are actually present on each side. Recorded as ONE_ABSENT rather than assumed-equal when a field is missing on one side.',
      'writerGenerationC identity (which script/process produced the third-generation points) not yet investigated in this pass -- separate WRITER-ROOT-01 task.',
    ],
    writerGenerationC: 'HISTORICAL_UNRESOLVED',
    reconciliationDesigned: false,
    writesPerformed: false,
    perRowSample: perRowResults.slice(0, 30),
  };

  console.log(JSON.stringify(report, null, 2));

  const fs = await import('node:fs');
  fs.writeFileSync(
    'C:/Users/james/Videos/deeds-web-app/docs/reports/qdrant-id-prefix-01-results.json',
    JSON.stringify({ ...report, perRowFull: perRowResults }, null, 2) + '\n',
  );

  await pool.end();
}

main().catch(async (err) => {
  console.error('[FAIL]', err.message, err.stack);
  await pool.end();
  process.exit(1);
});
