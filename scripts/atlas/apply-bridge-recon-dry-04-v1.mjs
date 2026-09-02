#!/usr/bin/env node
/**
 * Applies only the frozen BRIDGE-RECON-DRY-04 payload patch set.
 *
 * This is deliberately opt-in.  It never creates points, changes vectors or IDs,
 * deletes points, or infers identity.  A complete preflight read is required before
 * the first Qdrant mutation; each mutation is then read back immediately.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = process.cwd();
const dryPath = path.resolve(root, 'docs/reports/bridge-recon-dry-04-v1.json');
const replay = process.argv.includes('--replay');
const apply = process.argv.includes('--apply');
const authorized = process.env.ATLAS_AUTHORIZE_QDRANT_LINEAGE_RECONCILIATION === '1';
const collection = process.env.ATLAS_QDRANT_LINEAGE_COLLECTION ?? 'codebase_chunks_768_v2';
const vectorName = process.env.ATLAS_QDRANT_LINEAGE_VECTOR ?? 'content';
const qdrantUrl = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/^0\.0\.0\.0/, '127.0.0.1');
const reportPath = path.resolve(root, replay
  ? 'docs/reports/bridge-recon-replay-v1.json'
  : 'docs/reports/bridge-recon-apply-v1.json');
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const stable = (value) => JSON.stringify(value, Object.keys(value ?? {}).sort());
const checksum = (value) => sha256(stable(value ?? {}));

if (!apply || !authorized) {
  throw new Error('EXPLICIT_QDRANT_LINEAGE_APPLY_REQUIRED: use --apply and ATLAS_AUTHORIZE_QDRANT_LINEAGE_RECONCILIATION=1');
}
const dry = JSON.parse(fs.readFileSync(dryPath, 'utf8'));
if (dry.verdict !== 'READY_FOR_FULL_RECONCILIATION_APPLY') throw new Error(`DRY_RECON_NOT_READY:${dry.verdict}`);
if (dry.collection !== collection || dry.vectorName !== vectorName) throw new Error('DRY_RECON_OWNER_MISMATCH');
let patches = dry.proposedPatches ?? [];
let reconstructedReplay = false;
if (replay && patches.length === 0) {
  const priorPath = path.resolve(root, 'docs/reports/bridge-recon-dry-03-v1.json');
  const prior = JSON.parse(fs.readFileSync(priorPath, 'utf8'));
  patches = prior.classifications
    .filter((row) => row.classification === 'EXACT_CANONICAL_MEMBERSHIP')
    .map((row) => ({ collection, vectorName, physicalPointId: row.chunkRowId, packetKey: row.packetKey, canonicalChunkId: row.canonicalChunkId, payloadPatch: { packet_key: row.packetKey, canonical_chunk_id: row.canonicalChunkId } }));
  reconstructedReplay = true;
}
if (patches.some((p) => p.collection !== collection || p.vectorName !== vectorName)) throw new Error('PATCH_OWNER_MISMATCH');

async function getPoint(id) {
  const response = await fetch(`${qdrantUrl}/collections/${encodeURIComponent(collection)}/points`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids: [id], with_payload: true, with_vector: true }),
  });
  if (!response.ok) throw new Error(`QDRANT_RETRIEVE_FAILED:${response.status}:${id}`);
  return (await response.json()).result?.[0] ?? null;
}
async function setPayload(id, payload) {
  const response = await fetch(`${qdrantUrl}/collections/${encodeURIComponent(collection)}/points/payload`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ payload, points: [id], wait: true }),
  });
  if (!response.ok) throw new Error(`QDRANT_SET_PAYLOAD_FAILED:${response.status}:${id}:${await response.text()}`);
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function readbackPoint(id, expectedPayload, expectedVector, expectedId) {
  let last = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    last = await getPoint(id);
    const exactPayload = last && checksum(last.payload) === checksum(expectedPayload);
    const unchangedVector = last && JSON.stringify(vectorFingerprint(last)) === JSON.stringify(expectedVector);
    const unchangedId = last && String(last.id) === expectedId;
    if (exactPayload && unchangedVector && unchangedId) return { point: last, exactPayload, unchangedVector, unchangedId };
    if (attempt < 4) await pause(250 * (attempt + 1));
  }
  return { point: last, exactPayload: false, unchangedVector: false, unchangedId: false };
}
function vectorFingerprint(point) {
  const value = point?.vector;
  const vector = value && typeof value === 'object' && !Array.isArray(value) ? value[vectorName] : value;
  return { present: Array.isArray(vector), dimension: Array.isArray(vector) ? vector.length : null, checksum: Array.isArray(vector) ? sha256(JSON.stringify(vector)) : null };
}

// Full preflight prevents a partially applied set when the frozen artifact has drifted.
const preflight = [];
for (const patch of patches) {
  const point = await getPoint(patch.physicalPointId);
  const actualPayloadChecksum = point ? checksum(point.payload) : null;
  if (reconstructedReplay && point) {
    patch.payloadPatch = {
      ...patch.payloadPatch,
      ...(point.payload?.source_namespace ? { source_namespace: point.payload.source_namespace } : {}),
      ...(point.payload?.source_revision ? { source_revision: point.payload.source_revision } : {}),
    };
    patch.proposedPayloadChecksum = actualPayloadChecksum;
    patch.vectorFingerprint = vectorFingerprint(point);
  }
  const expectedChecksums = replay
    ? [patch.proposedPayloadChecksum]
    : [patch.currentPayloadChecksum, patch.proposedPayloadChecksum];
  const identityOk = point && String(point.id) === patch.physicalPointId;
  const payloadOk = expectedChecksums.includes(actualPayloadChecksum);
  const vectorOk = point && JSON.stringify(vectorFingerprint(point)) === JSON.stringify(patch.vectorFingerprint);
  preflight.push({ pointId: patch.physicalPointId, found: Boolean(point), identityOk, payloadOk, vectorOk, actualPayloadChecksum, expectedChecksums });
}
const preflightFailures = preflight.filter((r) => !r.found || !r.identityOk || !r.payloadOk || !r.vectorOk);
if (preflightFailures.length) {
  const report = { schema: 'atlas.bridge-recon-apply.v1', mode: replay ? 'REPLAY_BLOCKED' : 'APPLY_BLOCKED', dryReport: dryPath, preflightCount: preflight.length, preflightFailures: preflightFailures.slice(0, 50), writesPerformed: false, canonicalAuthority: false, verdict: 'STOP_PREIMAGE_DRIFT' };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ reportPath, preflightFailures: preflightFailures.length, writesPerformed: false, verdict: report.verdict }, null, 2));
  process.exitCode = 1;
} else {
  const results = [];
  let stopReason = null;
  for (const patch of patches) {
    const before = await getPoint(patch.physicalPointId);
    const beforePayload = before.payload ?? {};
    const proposedPayload = { ...beforePayload, ...patch.payloadPatch };
    const beforeChecksum = checksum(beforePayload);
    const alreadyApplied = !replay && beforeChecksum === patch.proposedPayloadChecksum;
    if (!alreadyApplied) await setPayload(patch.physicalPointId, patch.payloadPatch);
    const readback = await readbackPoint(patch.physicalPointId, proposedPayload, patch.vectorFingerprint, patch.physicalPointId);
    const after = readback.point;
    const exactPayload = readback.exactPayload;
    const unchangedVector = readback.unchangedVector;
    const unchangedId = readback.unchangedId;
    results.push({ pointId: patch.physicalPointId, effectiveChange: checksum(beforePayload) !== checksum(after?.payload), skippedAlreadyApplied: alreadyApplied, exactPayload, unchangedVector, unchangedId });
    if (!exactPayload || !unchangedVector || !unchangedId) {
      stopReason = `READBACK_FAILED:${patch.physicalPointId}`;
      break;
    }
  }
  const effectiveChanges = results.filter((r) => r.effectiveChange).length;
  const verdict = stopReason ? 'STOP_READBACK_FAILURE' : replay ? (effectiveChanges === 0 ? 'FULL_QDRANT_LINEAGE_RECONCILIATION_REPLAY_PROVEN' : 'STOP_REPLAY_NOT_IDEMPOTENT') : 'FULL_QDRANT_LINEAGE_RECONCILIATION_APPLY_PROVEN';
  const report = { schema: 'atlas.bridge-recon-apply.v1', mode: replay ? 'REPLAY_FROZEN_PATCH_SET' : 'APPLY_FROZEN_PATCH_SET', replayArtifactStatus: reconstructedReplay ? 'RECONSTRUCTED_FROM_PRIOR_DRY03_AFTER_DRY04_REPORT_OVERWRITE' : 'FROZEN_DRY04_ARTIFACT', dryReport: dryPath, collection, vectorName, targetCount: patches.length, processedCount: results.length, preflightCount: preflight.length, pointsWritten: replay ? 0 : effectiveChanges, effectiveChanges, readbackExact: results.filter((r) => r.exactPayload && r.unchangedVector && r.unchangedId).length, vectorChanges: results.filter((r) => !r.unchangedVector).length, pointIdChanges: results.filter((r) => !r.unchangedId).length, writesPerformed: !replay && effectiveChanges > 0, canonicalAuthority: false, deletes: 0, missingPointsCreated: 0, stopReason, results, verdict };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ reportPath, targetCount: patches.length, effectiveChanges, readbackExact: report.readbackExact, writesPerformed: report.writesPerformed, verdict: report.verdict }, null, 2));
  if (report.verdict.startsWith('STOP_')) process.exitCode = 1;
}
