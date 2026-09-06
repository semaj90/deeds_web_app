#!/usr/bin/env node
/**
 * RETRIEVAL-01L-08A Qdrant projection APPLY -- the authorized write.
 *
 * Consumes ONLY the frozen proposal
 * (docs/reports/retrieval-01l-08a-qdrant-projection-proposal-v1.json) verbatim -- does not
 * independently recompute cohort membership or PostgreSQL admission. Creates exactly the 434
 * points that proposal describes, in Qdrant `codebase_chunks_768_v2`, named vector `content`
 * only. Touches no other store: no Postgres write, no Neo4j write, no Valkey write.
 *
 * Per point:
 *   1. Preimage check -- GET the target point ID. This proposal is pure CREATION (the source
 *      audit proved 0/434 already exist); if a point unexpectedly already exists, abort that
 *      point rather than silently overwriting it.
 *   2. Fetch the vector fresh from Postgres (content_embedding::text -> JSON float array) at
 *      apply time -- never read from the proposal artifact, which deliberately never carries raw
 *      vector data (Wire Format Layering Rule).
 *   3. Upsert (PUT .../points?wait=true) with exactly the proposed payload plus the freshly-read
 *      vector under the `content` named vector.
 *   4. Readback -- GET the point again, verify: point exists, id unchanged, vector present at
 *      dimension 768, payload matches the proposed payload exactly (key-for-key).
 *
 * --replay: re-applies the identical proposal a second time and requires zero *effective* change
 * (upserting the same vector+payload to the same point ID is idempotent by construction; this
 * flag proves it empirically rather than assuming it) -- matching this session's established
 * freeze -> authorize -> apply -> replay pattern (PKT-LINEAGE-09, PKT-LINEAGE-11).
 *
 * Rollback: every point created by this script is newly-created (not a patch of prior data), so
 * rollback is DELETE by the exact point-ID list recorded in this receipt's `rollbackArtifact` --
 * never a blind collection-wide delete.
 *
 * Usage: node apply-retrieval-01l-08a-qdrant-projection-v1.mjs [--replay]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const isReplay = process.argv.includes('--replay');
const proposalPath = path.join(root, 'docs', 'reports', 'retrieval-01l-08a-qdrant-projection-proposal-v1.json');
const outPath = path.join(
  root, 'docs', 'reports',
  isReplay ? 'retrieval-01l-08a-qdrant-projection-replay-v1.json' : 'retrieval-01l-08a-qdrant-projection-apply-v1.json',
);
const QDRANT_URL = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/^0\.0\.0\.0/, '127.0.0.1');
const VECTOR_NAME = 'content';
const BATCH_SIZE = 50;

const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
const stable = (obj) => JSON.stringify(obj ?? {}, Object.keys(obj ?? {}).sort());
const payloadChecksum = (obj) => sha256(stable(obj));

const proposal = JSON.parse(fs.readFileSync(proposalPath, 'utf8'));
if (proposal.status !== 'PROJECTION_PROPOSAL_FROZEN') {
  console.error(`BLOCKED_PROPOSAL_NOT_FROZEN: status=${proposal.status}`);
  process.exit(1);
}
if (proposal.scope !== 'PKT_LINEAGE_08A_COHORT_ONLY') {
  console.error(`BLOCKED_WRONG_SCOPE: ${proposal.scope}`);
  process.exit(1);
}
const collection = proposal.collection;
const points = proposal.proposedPoints;

// Re-verify the proposal's own internal checksums before consuming it -- an apply must never
// trust a proposal artifact that has drifted from its own recorded checksum.
const recomputedTargetSetChecksum = sha256(JSON.stringify(points.map((p) => p.proposedPointId).sort()));
if (recomputedTargetSetChecksum !== proposal.targetPointSetChecksum) {
  console.error('BLOCKED_PROPOSAL_CHECKSUM_MISMATCH: targetPointSetChecksum does not match its own recorded value');
  process.exit(1);
}

async function fetchQdrantPoints(ids) {
  const res = await fetch(`${QDRANT_URL}/collections/${collection}/points`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, with_payload: true, with_vector: true }),
  });
  if (!res.ok) throw new Error(`Qdrant points retrieve failed HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return new Map((data.result ?? []).map((pt) => [String(pt.id), pt]));
}

async function upsertBatch(batch) {
  const res = await fetch(`${QDRANT_URL}/collections/${collection}/points?wait=true`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points: batch }),
  });
  if (!res.ok) throw new Error(`Qdrant upsert failed HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

function vectorOf(point) {
  const v = point?.vector;
  const named = v && typeof v === 'object' && !Array.isArray(v) ? v[VECTOR_NAME] : v;
  return Array.isArray(named) ? named : null;
}

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 4, statement_timeout: 60000 });

const results = [];
let preimageUnexpectedExisting = 0;
let vectorFetchFailures = 0;
let pointsUpserted = 0;
let readbackExact = 0;
let readbackMismatch = 0;
let replayEffectiveChanges = 0;

try {
  // ---- Preimage pass: confirm current existence state for every target point ----
  const ids = points.map((p) => p.proposedPointId);
  const preimageMap = await fetchQdrantPoints(ids);

  if (!isReplay) {
    for (const id of ids) {
      if (preimageMap.has(id)) preimageUnexpectedExisting += 1;
    }
    if (preimageUnexpectedExisting > 0) {
      console.error(`BLOCKED_UNEXPECTED_PREEXISTING_POINTS: ${preimageUnexpectedExisting} of ${ids.length} target points already exist in Qdrant -- this proposal assumed pure creation. Aborting entire apply, zero points written.`);
      process.exit(1);
    }
  }

  // ---- Fetch fresh vectors from Postgres for every proposed point ----
  const chunkRowIds = points.map((p) => p.vectorSource.rowId);
  const { rows: vectorRows } = await pool.query(
    `SELECT id::text AS id, content_embedding::text AS emb_text FROM public.codebase_chunk_index WHERE id = ANY($1::uuid[])`,
    [chunkRowIds],
  );
  const vectorByRowId = new Map(vectorRows.map((r) => [r.id, r.emb_text]));

  const preparedPoints = [];
  for (const p of points) {
    const embText = vectorByRowId.get(p.vectorSource.rowId);
    if (!embText) {
      vectorFetchFailures += 1;
      results.push({ proposedPointId: p.proposedPointId, outcome: 'ABORTED_VECTOR_NOT_FOUND' });
      continue;
    }
    let vector;
    try {
      vector = JSON.parse(embText);
    } catch {
      vectorFetchFailures += 1;
      results.push({ proposedPointId: p.proposedPointId, outcome: 'ABORTED_VECTOR_PARSE_FAILED' });
      continue;
    }
    if (!Array.isArray(vector) || vector.length !== 768) {
      vectorFetchFailures += 1;
      results.push({ proposedPointId: p.proposedPointId, outcome: 'ABORTED_VECTOR_WRONG_DIMENSION', dimension: vector?.length ?? null });
      continue;
    }
    preparedPoints.push({ proposal: p, vector, expectedPayloadChecksum: payloadChecksum(p.proposedPayload) });
  }

  if (vectorFetchFailures > 0) {
    console.error(`BLOCKED_VECTOR_FETCH_FAILURES: ${vectorFetchFailures} of ${points.length} points could not get a valid fresh vector. Aborting entire apply, zero points written.`);
    process.exit(1);
  }

  // ---- Upsert in batches ----
  for (let i = 0; i < preparedPoints.length; i += BATCH_SIZE) {
    const batch = preparedPoints.slice(i, i + BATCH_SIZE).map(({ proposal: p, vector }) => ({
      id: p.proposedPointId,
      vector: { [VECTOR_NAME]: vector },
      payload: p.proposedPayload,
    }));
    await upsertBatch(batch);
    pointsUpserted += batch.length;
  }

  // ---- Readback: verify every point exactly ----
  const afterMap = await fetchQdrantPoints(ids);
  for (const { proposal: p, expectedPayloadChecksum } of preparedPoints) {
    const after = afterMap.get(p.proposedPointId);
    if (!after) {
      readbackMismatch += 1;
      results.push({ proposedPointId: p.proposedPointId, outcome: 'READBACK_POINT_MISSING' });
      continue;
    }
    const idExact = String(after.id) === p.proposedPointId;
    const vec = vectorOf(after);
    const dimensionExact = Array.isArray(vec) && vec.length === 768;
    const actualPayloadChecksum = payloadChecksum(after.payload);
    const payloadExact = actualPayloadChecksum === expectedPayloadChecksum;
    const exact = idExact && dimensionExact && payloadExact;

    const beforePoint = preimageMap.get(p.proposedPointId);
    if (isReplay && beforePoint) {
      const beforePayloadChecksum = payloadChecksum(beforePoint.payload);
      const beforeVec = vectorOf(beforePoint);
      const beforeVecChecksum = Array.isArray(beforeVec) ? sha256(JSON.stringify(beforeVec)) : null;
      const afterVecChecksum = Array.isArray(vec) ? sha256(JSON.stringify(vec)) : null;
      if (beforePayloadChecksum !== actualPayloadChecksum || beforeVecChecksum !== afterVecChecksum) {
        replayEffectiveChanges += 1;
      }
    }

    if (exact) readbackExact += 1; else readbackMismatch += 1;
    results.push({
      proposedPointId: p.proposedPointId,
      outcome: exact ? 'WRITTEN_AND_VERIFIED' : 'WRITTEN_BUT_READBACK_MISMATCH',
      idExact,
      dimensionExact,
      payloadExact,
    });
  }
} finally {
  await pool.end();
}

const rollbackArtifact = {
  action: 'DELETE_BY_EXACT_POINT_ID_LIST',
  collection,
  pointIds: points.map((p) => p.proposedPointId),
  entryCount: points.length,
  checksum: sha256(JSON.stringify(points.map((p) => p.proposedPointId).sort())),
};

const verdict = preimageUnexpectedExisting > 0 || vectorFetchFailures > 0 || readbackMismatch > 0 || (isReplay && replayEffectiveChanges > 0)
  ? 'BLOCKED_VERIFICATION_FAILED'
  : isReplay
    ? 'REPLAY_IDEMPOTENT_PROVEN'
    : 'PROJECTION_APPLY_PROVEN';

const report = {
  schema: 'atlas.retrieval-01l-08a-qdrant-projection-apply.v1',
  task: isReplay ? 'RETRIEVAL-01L-08A-QDRANT-PROJECTION-REPLAY' : 'RETRIEVAL-01L-08A-QDRANT-PROJECTION-APPLY',
  generatedAt: new Date().toISOString(),
  consumedProposalChecksum: proposal.proposalChecksum,
  consumedTargetPointSetChecksum: proposal.targetPointSetChecksum,
  collection,
  vectorName: VECTOR_NAME,
  cohortSize: points.length,
  writesToNonQdrantStores: { postgres: false, neo4j: false, valkey: false },
  preimageUnexpectedExisting,
  vectorFetchFailures,
  pointsUpserted,
  readbackExact,
  readbackMismatch,
  replayEffectiveChanges: isReplay ? replayEffectiveChanges : null,
  rollbackArtifact,
  verdict,
  results,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath: outPath, ...report, results: undefined }, null, 2));
process.exitCode = verdict === 'PROJECTION_APPLY_PROVEN' || verdict === 'REPLAY_IDEMPOTENT_PROVEN' ? 0 : 1;
