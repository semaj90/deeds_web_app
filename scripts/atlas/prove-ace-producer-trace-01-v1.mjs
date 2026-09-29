#!/usr/bin/env node
/**
 * ACE-PRODUCER-TRACE-01 (first real exercise, not fixture-only).
 *
 * Traces a small, real bounded cohort end to end:
 *   real admitted candidate-ordinal-map row (REVISION_QUALIFIED, workspaceRevision
 *   sha256:e24bb971...) -> real composed AcePacketV3 packet (from
 *   compose-ace-packets-v3.mjs's actual 2026-09-29 output, 15,732 packets, 0 verify
 *   failures) -> a freshly materialized CandidateFeatureSnapshotV1 over just this
 *   cohort -> bridgeAcePacketsToContextManifestV1() (the real, previously-only-
 *   fixture-tested ACE3-06A bridge).
 *
 * Read-only. No PostgreSQL / Valkey / Qdrant / Neo4j writes. Every artifact read
 * here is a real, already-produced local file -- nothing is synthesized.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './connection-config.mjs';

const N = Number(process.argv.find((a) => a.startsWith('--n='))?.slice(4) ?? 5);

const dist = (f) => pathToFileURL(path.join(REPO_ROOT, 'packages/parent-atlas/dist/core', f)).href;
const { verifyAcePacketV3 } = await import(dist('ace-packet-v3.js'));

const srcUrl = (f) => pathToFileURL(path.join(REPO_ROOT, 'sveltekit-frontend/src/lib/server/atlas', f)).href;
const { materializeCandidateOrdinalMap, candidateOrdinalMapV1Schema, assertCandidateOrdinalMapIntegrityV1 } =
  await import(srcUrl('features/canonical-candidate-v1.ts'));
const { materializeCandidateFeatureSnapshot, candidateFeatureSnapshotV1Schema } =
  await import(srcUrl('features/candidate-feature-snapshot-v1.ts'));
const { bridgeAcePacketsToContextManifestV1 } =
  await import(srcUrl('context/ace-packet-v3-context-manifest-bridge-v1.ts'));

const matrixDir = path.join(REPO_ROOT, '.tmp/atlas/candidate-feature-matrix-v1/20260926T174833Z');
const packetsDir = path.join(REPO_ROOT, '.tmp/atlas/ace-packets-v3/20260929T024243Z');

const steps = [];
const record = (name, ok, detail) => { steps.push({ name, ok, detail }); if (!ok) throw new Error(`ACE_PRODUCER_TRACE_STEP_FAILED:${name}`); };

// Step 1: read the real admitted ordinal-map cohort, pick N REVISION_QUALIFIED rows.
const ordinalRows = fs.readFileSync(path.join(matrixDir, 'candidate-ordinal-map.ndjson'), 'utf8')
  .split('\n').filter(Boolean).map((l) => JSON.parse(l));
const qualified = ordinalRows.filter((r) => r.lineageState === 'REVISION_QUALIFIED');
record('READ_REAL_ORDINAL_MAP', ordinalRows.length > 0, { total: ordinalRows.length, revisionQualified: qualified.length });

const workspaceRevision = qualified[0].workspaceRevision;
const cohort = qualified.slice(0, N);
record('SELECT_COHORT', cohort.length === N, { requested: N, selected: cohort.length, packetKeys: cohort.map((c) => c.packetKey) });

// Step 2: find each cohort member's REAL composed AcePacketV3 packet in the actual shard files.
const shardFiles = fs.readdirSync(packetsDir).filter((f) => f.endsWith('.ndjson'));
const packetByKey = new Map();
for (const f of shardFiles) {
  for (const line of fs.readFileSync(path.join(packetsDir, f), 'utf8').split('\n')) {
    if (!line) continue;
    const p = JSON.parse(line);
    if (cohort.some((c) => c.packetKey === p.identity.packet_key)) packetByKey.set(p.identity.packet_key, p);
  }
  if (packetByKey.size === cohort.length) break;
}
const missing = cohort.filter((c) => !packetByKey.has(c.packetKey)).map((c) => c.packetKey);
record('LOCATE_REAL_COMPOSED_PACKETS', missing.length === 0, { found: packetByKey.size, requested: cohort.length, missing });

// Step 3: verify each real packet independently (not trusting the composer's own self-check).
for (const c of cohort) verifyAcePacketV3(packetByKey.get(c.packetKey));
record('INDEPENDENT_PACKET_VERIFY', true, { verified: cohort.length });

// Step 4: materialize a fresh, real CandidateOrdinalMapV1 + CandidateFeatureSnapshotV1 over just this cohort.
const candidateSnapshotRevision = `sha256:${crypto.createHash('sha256')
  .update(JSON.stringify(cohort.map((c) => c.packetKey).sort())).digest('hex')}`;
const producerRevision = 'ace-producer-trace-01:v1';
const ordinalMap = candidateOrdinalMapV1Schema.parse(materializeCandidateOrdinalMap({
  candidates: cohort.map((c) => ({
    canonicalId: c.packetKey, packetKey: c.packetKey, sourceRef: c.sourceRef,
    treeNodeId: null, symbolVersionId: null, workspaceRevision: c.workspaceRevision, sourceRevision: c.sourceRevision,
    graphRevision: null, semanticRevision: null,
  })),
  candidateSnapshotRevision, workspaceRevision, producerRevision,
}));
assertCandidateOrdinalMapIntegrityV1(ordinalMap);
record('MATERIALIZE_ORDINAL_MAP', ordinalMap.rowCount === N, { rowCount: ordinalMap.rowCount, ordinalMapChecksum: ordinalMap.ordinalMapChecksum });

const featureRevision = `sha256:${crypto.createHash('sha256').update(`ACE-PRODUCER-TRACE-01:${ordinalMap.ordinalMapChecksum}`).digest('hex')}`;
const snapshot = candidateFeatureSnapshotV1Schema.parse(materializeCandidateFeatureSnapshot({
  ordinalMap, featureRevision, producerRevision,
  rows: ordinalMap.candidates.map((cand) => ({
    schema: 'atlas.candidate-feature-row.v1', candidateOrdinal: cand.candidateOrdinal, canonicalId: cand.canonicalId,
    packetKey: cand.packetKey, sourceRef: cand.sourceRef, treeNodeId: null, symbolVersionId: null,
    workspaceRevision: cand.workspaceRevision, sourceRevision: cand.sourceRevision, graphRevision: null, semanticRevision: null,
    featureRevision, representationBindings: [], laneMask: [], evidenceRefs: [],
  })),
}));
record('MATERIALIZE_FEATURE_SNAPSHOT', snapshot.rowCount === N, { rowCount: snapshot.rowCount, snapshotChecksum: snapshot.snapshotChecksum });

// Step 5: the real gate under test -- bridge real packets to a real ContextManifest admission.
const featureAdmission = { status: 'ADMITTED', snapshot };
const selectedOrdinals = snapshot.rows.map((r) => r.candidateOrdinal).sort((a, b) => a - b);
const packets = [...ordinalMap.candidates].sort((a, b) => a.candidateOrdinal - b.candidateOrdinal).map((c) => packetByKey.get(c.packetKey));

let bridgeResult = null;
let bridgeError = null;
try {
  bridgeResult = bridgeAcePacketsToContextManifestV1({
    featureAdmission, selectedOrdinals, packets,
    requestId: 'ace-producer-trace-01:req:1', tokenBudget: 2048,
    retrievalPolicyRevision: 'ace-producer-trace-01:policy:v1', acePlaybookRevision: 'ace-producer-trace-01:playbook:v1',
  });
} catch (err) {
  bridgeError = err instanceof Error ? err.message : String(err);
}
record('BRIDGE_PACKETS_TO_CONTEXT_MANIFEST', bridgeResult !== null, { error: bridgeError, receipt: bridgeResult?.receipt ?? null });

const receipt = {
  schema: 'atlas.ace-producer-trace-01.v1',
  task: 'ACE-PRODUCER-TRACE-01',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_REAL_ARTIFACT_TRACE',
  writesPerformed: false,
  canonicalAuthority: false,
  cohortSize: N,
  workspaceRevision,
  sourceMatrixDir: path.relative(REPO_ROOT, matrixDir),
  sourcePacketsDir: path.relative(REPO_ROOT, packetsDir),
  steps: steps.map((s) => ({ name: s.name, ok: s.ok, detail: s.detail })),
  bridgeReceipt: bridgeResult?.receipt ?? null,
  contextManifestIdentityChecksum: bridgeResult?.admission?.manifest?.identityChecksum ?? null,
  verdict: steps.every((s) => s.ok) && bridgeResult !== null ? 'ACE_PRODUCER_CHAIN_REAL_TRACE_PROVEN' : 'ACE_PRODUCER_CHAIN_TRACE_FAILED',
};
fs.writeFileSync(path.join(REPO_ROOT, 'docs/reports/ace-producer-trace-01-v1.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
process.exit(receipt.verdict === 'ACE_PRODUCER_CHAIN_REAL_TRACE_PROVEN' ? 0 : 1);
