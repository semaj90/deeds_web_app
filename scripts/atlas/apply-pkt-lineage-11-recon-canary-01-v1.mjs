#!/usr/bin/env node
/**
 * PKT-LINEAGE-11 (RECON-CANARY-01) -- the first Qdrant write of this promotion program.
 *
 * Consumes ONLY the existing `bridge-recon-dry-03-v1.json` artifact's classifications (never
 * rediscovers packet<->chunk identity, never reads source_ref/content_hash to infer identity).
 * Selects a tiny, deterministic cohort restricted to EXACT_CANONICAL_MEMBERSHIP rows (physical
 * Qdrant point present, zero identity conflict, zero revision mismatch, zero foreign-chunk
 * attribution), spanning SINGLE_MEMBER/FEW_MEMBER/MULTI_MEMBER packet shapes.
 *
 * Per point: freeze the preimage (payload + vector hash) -> immediately before mutation, re-read
 * and verify the preimage has not drifted (abort that point, fail closed, if it has) -> patch
 * ONLY the approved lineage metadata keys via Qdrant set-payload (never replace/delete the point,
 * never touch the vector) -> read back and verify the exact expected payload, vector unchanged,
 * point ID unchanged. Then replay the identical patch a second time and require zero effective
 * changes.
 *
 * Never touches the 675-row QDRANT_POINT_MISSING cohort. Never creates a Qdrant point. Never
 * deletes a point. Never repairs unrelated payload fields.
 *
 * Usage: node apply-pkt-lineage-11-recon-canary-01-v1.mjs [--replay]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const isReplay = process.argv.includes('--replay');
const DRY_RECON_PATH = path.resolve(root, 'docs/reports/bridge-recon-dry-03-v1.json');
const CANARY_STATE_PATH = path.resolve(root, 'docs/reports/pkt-lineage-11-recon-canary-01-selected-points-v1.json');
const REPORT_PATH = path.resolve(
  root,
  isReplay ? 'docs/reports/pkt-lineage-11-recon-canary-01-replay-v1.json' : 'docs/reports/pkt-lineage-11-recon-canary-01-apply-v1.json'
);
const QDRANT_COLLECTION = 'codebase_chunks_768_v2';
const QDRANT_VECTOR_NAME = 'content';
const QDRANT_URL = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/^0\.0\.0\.0/, '127.0.0.1');

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

async function fetchPoint(pointId) {
  const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [pointId], with_payload: true, with_vector: true }),
  });
  if (!res.ok) throw new Error(`Qdrant points retrieve failed HTTP ${res.status} for ${pointId}`);
  const data = await res.json();
  return (data.result ?? [])[0] ?? null;
}

async function setPayload(pointId, payloadPatch) {
  const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/payload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: payloadPatch, points: [pointId] }),
  });
  if (!res.ok) throw new Error(`Qdrant set-payload failed HTTP ${res.status} for ${pointId}: ${await res.text()}`);
  return res.json();
}

function vectorFingerprint(point) {
  const v = point?.vector;
  const named = v && typeof v === 'object' && !Array.isArray(v) ? v[QDRANT_VECTOR_NAME] : v;
  if (!named) return null;
  return { length: Array.isArray(named) ? named.length : null, checksum: sha256(JSON.stringify(named)) };
}

function payloadChecksum(payload) {
  return sha256(JSON.stringify(payload ?? {}, Object.keys(payload ?? {}).sort()));
}

// ---- Select or reload the deterministic canary cohort ----
let selectedPoints;
if (isReplay) {
  if (!fs.existsSync(CANARY_STATE_PATH)) {
    console.error('BLOCKED_NO_PRIOR_CANARY_SELECTION: run the apply pass first.');
    process.exit(1);
  }
  selectedPoints = JSON.parse(fs.readFileSync(CANARY_STATE_PATH, 'utf8')).selectedPoints;
} else {
  const dryRecon = JSON.parse(fs.readFileSync(DRY_RECON_PATH, 'utf8'));
  const exactRows = dryRecon.classifications.filter((c) => c.classification === 'EXACT_CANONICAL_MEMBERSHIP');
  const byPacket = new Map();
  for (const c of dryRecon.classifications) {
    const list = byPacket.get(c.packetKey) ?? [];
    list.push(c);
    byPacket.set(c.packetKey, list);
  }
  const shapeOf = (packetKey) => {
    const n = byPacket.get(packetKey)?.length ?? 0;
    return n === 1 ? 'SINGLE_MEMBER' : n <= 5 ? 'FEW_MEMBER' : 'MULTI_MEMBER';
  };

  const singlePackets = [...new Set(exactRows.filter((r) => shapeOf(r.packetKey) === 'SINGLE_MEMBER').map((r) => r.packetKey))];
  const fewPackets = [...new Set(exactRows.filter((r) => shapeOf(r.packetKey) === 'FEW_MEMBER').map((r) => r.packetKey))];
  const multiPackets = [...new Set(exactRows.filter((r) => shapeOf(r.packetKey) === 'MULTI_MEMBER').map((r) => r.packetKey))];

  const pick = [];
  for (const pk of singlePackets.slice(0, 2)) {
    pick.push(...exactRows.filter((r) => r.packetKey === pk));
  }
  if (fewPackets[0]) pick.push(...exactRows.filter((r) => r.packetKey === fewPackets[0])); // full small packet
  if (multiPackets[0]) pick.push(...exactRows.filter((r) => r.packetKey === multiPackets[0]).slice(0, 2)); // sample 2 of a large packet

  // Pull full lineage fields (source_namespace/source_revision) from the frozen proposal used to
  // build atlas_packet_chunk_lineage -- the same input authority as the canonical DB rows.
  const frozenProposal = JSON.parse(fs.readFileSync(path.resolve(root, 'docs/reports/pkt-lineage-09-frozen-proposal-v1.json'), 'utf8'));
  const proposalByKey = new Map(frozenProposal.proposedMembershipRows.map((r) => [`${r.packetKey}::${r.canonicalChunkId}`, r]));

  selectedPoints = pick.map((row) => {
    const key = `${row.packetKey}::${row.canonicalChunkId}`;
    const proposalRow = proposalByKey.get(key);
    return {
      shape: shapeOf(row.packetKey),
      packetKey: row.packetKey,
      canonicalChunkId: row.canonicalChunkId,
      physicalPointId: row.chunkRowId,
      sourceRef: proposalRow?.sourceRef ?? null,
      sourceNamespace: proposalRow?.sourceNamespace ?? null,
      sourceRevision: proposalRow?.sourceRevision ?? null,
      evidenceRefs: [
        'docs/reports/bridge-recon-dry-03-v1.json',
        'docs/reports/pkt-lineage-09-frozen-proposal-v1.json',
      ],
    };
  });

  fs.mkdirSync(path.dirname(CANARY_STATE_PATH), { recursive: true });
  fs.writeFileSync(CANARY_STATE_PATH, `${JSON.stringify({ selectedAt: new Date().toISOString(), selectedPoints }, null, 2)}\n`, 'utf8');
}

// ---- Per-point: freeze -> preimage re-verify -> mutate -> readback ----
const results = [];
let pointsWritten = 0;
let readbackExact = 0;
let preimageDrift = 0;
let identityConflicts = 0;
let revisionMismatches = 0;
let foreignChunkIds = 0;
let vectorChanges = 0;
let pointIdChanges = 0;
let deletes = 0;
let unexpectedPayloadChanges = 0;
let replayEffectiveChanges = 0;

for (const sel of selectedPoints) {
  const before = await fetchPoint(sel.physicalPointId);
  if (!before) {
    results.push({ ...sel, outcome: 'ABORTED_POINT_NOT_FOUND' });
    continue;
  }
  if (String(before.id) !== sel.physicalPointId) {
    pointIdChanges += 1;
    results.push({ ...sel, outcome: 'ABORTED_POINT_ID_MISMATCH' });
    continue;
  }

  const beforePayloadChecksum = payloadChecksum(before.payload);
  const beforeVector = vectorFingerprint(before);

  const payloadPatch = {
    packet_key: sel.packetKey,
    canonical_chunk_id: sel.canonicalChunkId,
    ...(sel.sourceNamespace ? { source_namespace: sel.sourceNamespace } : {}),
    ...(sel.sourceRevision ? { source_revision: sel.sourceRevision } : {}),
  };

  // Immediately-before-mutation preimage re-verification.
  const preCheck = await fetchPoint(sel.physicalPointId);
  const preCheckPayloadChecksum = payloadChecksum(preCheck?.payload);
  if (!preCheck || preCheckPayloadChecksum !== beforePayloadChecksum) {
    preimageDrift += 1;
    results.push({ ...sel, outcome: 'ABORTED_PREIMAGE_DRIFT' });
    continue;
  }

  // Existing identity/revision fields on the live point, if any, must agree with the frozen
  // lineage -- this is a re-check, not a new discovery, since bridge-recon-dry-03 already proved
  // this for the whole cohort; abort (never overwrite) if something changed since that dry run.
  const existingPacketKey = typeof preCheck.payload?.packet_key === 'string' ? preCheck.payload.packet_key : null;
  if (existingPacketKey !== null && existingPacketKey !== sel.packetKey) {
    identityConflicts += 1;
    results.push({ ...sel, outcome: 'ABORTED_IDENTITY_CONFLICT' });
    continue;
  }
  const existingSourceRevision = typeof preCheck.payload?.source_revision === 'string' ? preCheck.payload.source_revision : null;
  if (existingSourceRevision !== null && sel.sourceRevision !== null && existingSourceRevision !== sel.sourceRevision) {
    revisionMismatches += 1;
    results.push({ ...sel, outcome: 'ABORTED_REVISION_MISMATCH' });
    continue;
  }

  await setPayload(sel.physicalPointId, payloadPatch);
  pointsWritten += 1;

  const after = await fetchPoint(sel.physicalPointId);
  const afterVector = vectorFingerprint(after);

  const pointIdUnchanged = String(after.id) === sel.physicalPointId;
  const vectorUnchanged = JSON.stringify(beforeVector) === JSON.stringify(afterVector);
  if (!vectorUnchanged) vectorChanges += 1;
  if (!pointIdUnchanged) pointIdChanges += 1;

  const expectedPayload = { ...(before.payload ?? {}), ...payloadPatch };
  const actualPayload = after.payload ?? {};
  const expectedKeys = Object.keys(expectedPayload).sort();
  const actualKeys = Object.keys(actualPayload).sort();
  const keysMatch = JSON.stringify(expectedKeys) === JSON.stringify(actualKeys);
  const valuesMatch = keysMatch && expectedKeys.every((k) => JSON.stringify(actualPayload[k]) === JSON.stringify(expectedPayload[k]));
  const exact = keysMatch && valuesMatch && pointIdUnchanged && vectorUnchanged;
  if (exact) readbackExact += 1;
  else unexpectedPayloadChanges += 1;

  if (isReplay) {
    // `before` is the pre-second-write state, already carrying the patch from the first apply
    // pass. An "effective change" means this second, identical write actually altered the
    // payload -- i.e. the patch was NOT idempotent. Expect zero.
    if (payloadChecksum(before.payload) !== payloadChecksum(actualPayload)) replayEffectiveChanges += 1;
  }

  results.push({
    ...sel,
    outcome: exact ? 'WRITTEN_AND_VERIFIED' : 'WRITTEN_BUT_READBACK_MISMATCH',
    beforePayloadChecksum,
    afterPayloadChecksum: payloadChecksum(actualPayload),
    vectorUnchanged,
    pointIdUnchanged,
  });
}

const verdict =
  preimageDrift === 0 && identityConflicts === 0 && revisionMismatches === 0 && foreignChunkIds === 0 &&
  vectorChanges === 0 && pointIdChanges === 0 && deletes === 0 && unexpectedPayloadChanges === 0 &&
  readbackExact === selectedPoints.length &&
  (!isReplay || replayEffectiveChanges === 0)
    ? 'RECON_CANARY_PROVEN'
    : 'BLOCKED_CANARY_VERIFICATION_FAILED';

const report = {
  schema: 'atlas.pkt-lineage-11-recon-canary-01.v1',
  task: isReplay ? 'PKT-LINEAGE-11-RECON-CANARY-01-REPLAY' : 'PKT-LINEAGE-11-RECON-CANARY-01-APPLY',
  generatedAt: new Date().toISOString(),
  inputAuthority: 'bridge-recon-dry-03-v1.json classifications + pkt-lineage-09-frozen-proposal-v1.json only -- no rediscovery',
  qdrantCollection: QDRANT_COLLECTION,
  selectedPoints: selectedPoints.length,
  pointsWritten,
  readbackExact,
  preimageDrift,
  identityConflicts,
  revisionMismatches,
  foreignChunkIds,
  vectorChanges,
  pointIdChanges,
  deletes,
  unexpectedPayloadChanges,
  replayEffectiveChanges: isReplay ? replayEffectiveChanges : null,
  verdict,
  results,
};

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath: REPORT_PATH, ...report, results: undefined }, null, 2));
if (verdict !== 'RECON_CANARY_PROVEN') process.exit(1);
