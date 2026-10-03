#!/usr/bin/env node
/**
 * UNKNOWN-ADAPTER-02: sealed feature/lineage artifacts -> UnknownResolutionSetV1 (FEATURE_EVIDENCE_GAP).
 * Artifact + receipt only: NO database, Qdrant, Valkey, RabbitMQ or Graphify access, and no `pg` import.
 * Supersedes draft-unknown-resolution-v2.mts (which targeted a migration that has been withdrawn).
 * Pinned to an explicit snapshot (never "latest receipt"): default is the canonical packet_key snapshot.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  UNKNOWN_REASON_RESOLVER_TABLE_V1,
  UNKNOWN_RESOLUTION_NAMESPACE_V1,
  UNKNOWN_RESOLUTION_SCHEMA_V1,
  buildUnknownResolutionSetV1,
  unknownIdFromNaturalKeyV1,
  verifyUnknownResolutionSetV1,
  type UnknownReasonCodeV1,
  type UnknownResolutionV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/contracts/unknown-resolution-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const arg = (n: string, d: string) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1]! : d; };
const CANONICAL_SNAPSHOT = 'sha256:687871b76918f27213c45d72d7200aff82351343cec5577037d75c2c7631e28d';
const PINNED_SNAPSHOT = arg('--snapshot', CANONICAL_SNAPSHOT);
const FEATURE = 'legacy_summary_cosine_max';
const sha = (b: string | Buffer) => `sha256:${crypto.createHash('sha256').update(b).digest('hex')}`;
const rel = (p: string) => path.relative(ROOT, p);
const ndjson = (p: string) => fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const reports = path.join(ROOT, 'docs/reports');
const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(reports, f), 'utf8'));

// ---- sealed inputs, each verified and snapshot-pinned
const featureFile = fs.readdirSync(reports).filter((f) => f.startsWith('legacy-summary-hint-feature-v2-')).sort()
  .filter((f) => readJson(f).bindings?.candidateSnapshotRevision === PINNED_SNAPSHOT).pop();
if (!featureFile) throw new Error(`NO_FEATURE_RECEIPT_FOR_PINNED_SNAPSHOT:${PINNED_SNAPSHOT}`);
const fr = readJson(featureFile);
const rowsPath = path.resolve(ROOT, fr.artifacts.featureRows.path);
const rowsBytes = fs.readFileSync(rowsPath);
if (sha(rowsBytes) !== fr.artifacts.featureRows.sha256) throw new Error('HINT_FEATURE_ROWS_ARTIFACT_TAMPERED');
const featureRows = rowsBytes.toString('utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));

const proofFile = fs.readdirSync(reports).filter((f) => f.startsWith('historical-evidence-overlay-proof-v2-')).sort()
  .filter((f) => { const p = readJson(f); return p.destination.candidateSnapshotRevision === PINNED_SNAPSHOT && p.status === 'HISTORICAL_EVIDENCE_OVERLAY_REPLAY_PROVEN'; }).pop();
if (!proofFile) throw new Error(`NO_REPLAY_PROVEN_OVERLAY_PROOF_FOR_PINNED_SNAPSHOT:${PINNED_SNAPSHOT}`);
const proof = readJson(proofFile);
if (proof.destination.ordinalMapChecksum !== fr.bindings.ordinalMapChecksum) throw new Error('SNAPSHOT_MISMATCH_BETWEEN_OVERLAY_AND_FEATURE');
const crosswalk = JSON.parse(fs.readFileSync(path.resolve(ROOT, proof.destination.cei24Receipt.split('\\').join('/')), 'utf8'));
const multPath = path.resolve(ROOT, crosswalk.output.candidateMultiplicity.path);
const multBytes = fs.readFileSync(multPath);
if (sha(multBytes) !== crosswalk.output.candidateMultiplicity.sha256) throw new Error('CANDIDATE_MULTIPLICITY_ARTIFACT_TAMPERED');
const mult = multBytes.toString('utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
if (mult.some((m: any) => m.candidateSnapshotRevision !== PINNED_SNAPSHOT || m.ordinalMapChecksum !== fr.bindings.ordinalMapChecksum)) throw new Error('MULTIPLICITY_COORDINATE_MISMATCH');
const chunkCountByPacketKey = new Map<string, number>(mult.map((m: any) => [m.packetKey as string, m.provenChunkCount as number]));
if (chunkCountByPacketKey.size !== mult.length) throw new Error('MULTIPLICITY_DUPLICATE_PACKET_KEY');

// ---- build (twice, to prove byte-identical replay)
const producerRevision = sha(JSON.stringify({ builder: 'build-unknown-resolution-set-v1', upstream: fr.producerRevision, namespace: UNKNOWN_RESOLUTION_NAMESPACE_V1, script: sha(fs.readFileSync(fileURLToPath(import.meta.url))) }));
function build() {
  const rows: UnknownResolutionV1[] = featureRows.filter((r: any) => r.state === 'UNAVAILABLE').map((r: any) => {
    const chunks = chunkCountByPacketKey.get(r.packetKey);
    if (chunks === undefined) throw new Error(`NO_MULTIPLICITY_ROW_FOR_PACKET:${r.packetKey}`);
    const reasonCode: UnknownReasonCodeV1 = chunks > 0 ? 'CHUNK_WITHOUT_QUALIFIED_SUMMARY' : 'NO_PROVEN_CHUNK_LINEAGE';
    const route = UNKNOWN_REASON_RESOLVER_TABLE_V1[reasonCode];
    return {
      schema: UNKNOWN_RESOLUTION_SCHEMA_V1,
      unknownId: unknownIdFromNaturalKeyV1(['FEATURE_EVIDENCE_GAP', PINNED_SNAPSHOT, r.packetKey, FEATURE]),
      subjectKind: 'FEATURE_EVIDENCE_GAP', subjectId: r.packetKey, snapshotRevision: PINNED_SNAPSHOT,
      unknownKind: 'MISSING_FEATURE_VALUE', featureName: FEATURE, reasonCode,
      requiredEvidenceKind: route.requiredEvidenceKind, resolverKind: route.resolverKind, status: 'OPEN',
      evidenceRefs: [`candidate-ordinal:${r.candidateOrdinal}`, `proven-chunk-count:${chunks}`, `feature-row:${fr.artifacts.featureRows.sha256}`],
      resolutionRevision: null, canonicalAuthority: false,
    } satisfies UnknownResolutionV1;
  });
  return buildUnknownResolutionSetV1({
    subjectKind: 'FEATURE_EVIDENCE_GAP', snapshotRevision: PINNED_SNAPSHOT, ordinalMapChecksum: fr.bindings.ordinalMapChecksum, coordinateArtifactChecksum: crosswalk.output.candidateMultiplicity.sha256, rows,
    inputChecksums: { featureRows: fr.artifacts.featureRows.sha256, candidateMultiplicity: crosswalk.output.candidateMultiplicity.sha256, historicalEvidenceOverlaySet: fr.bindings.historicalEvidenceOverlaySetChecksum },
    producerRevision,
  });
}
const set = build();
const again = build();
verifyUnknownResolutionSetV1(set);
const byReason: Record<string, number> = {};
for (const r of set.rows) byReason[r.reasonCode] = (byReason[r.reasonCode] ?? 0) + 1;
// Frozen expectations (operator-stated for the canonical snapshot). Rows are DERIVED first; these only assert the derivation, never generate it.
const EXPECTED = { snapshot: CANONICAL_SNAPSHOT, ordinalMapChecksum: 'd0ccf96093ecf7ec9575271159038524367c62f3aba3ff6a32bad668f9e25ea3', total: 15973, byReason: { NO_PROVEN_CHUNK_LINEAGE: 15638, CHUNK_WITHOUT_QUALIFIED_SUMMARY: 335 } } as const;
const rfReceipt = readJson('legacy-summary-cosine-max-rf04-rf05-v2-20260926T165559Z.json');
const pinnedIsCanonical = PINNED_SNAPSHOT === EXPECTED.snapshot;
const checks = {
  expectedCountsMatchFrozen: !pinnedIsCanonical || (set.rowCount === EXPECTED.total
    && Object.keys(byReason).length === Object.keys(EXPECTED.byReason).length
    && Object.entries(EXPECTED.byReason).every(([k, v]) => byReason[k] === v)
    && byReason.NO_PROVEN_CHUNK_LINEAGE + byReason.CHUNK_WITHOUT_QUALIFIED_SUMMARY === EXPECTED.total),
  ordinalMapChecksumMatchesFrozen: !pinnedIsCanonical || (set.ordinalMapChecksum === EXPECTED.ordinalMapChecksum && rfReceipt.coordinates.ordinalMapChecksum === EXPECTED.ordinalMapChecksum),
  totalMatchesFrozenRfMissingRows: !pinnedIsCanonical || (rfReceipt.rf04.coverage.missingRows === EXPECTED.total && set.rowCount === rfReceipt.rf04.coverage.missingRows),
  resolverMatchesRoutingTable: set.rows.every((r) => UNKNOWN_REASON_RESOLVER_TABLE_V1[r.reasonCode].resolverKind === r.resolverKind),
  rowsEqualUnavailable: set.rowCount === fr.coverage.unavailable,
  reasonsPartitionAll: Object.values(byReason).reduce((a, b) => a + b, 0) === set.rowCount,
  uniqueIds: new Set(set.rows.map((r) => r.unknownId)).size === set.rowCount,
  byteIdenticalReplay: set.setChecksum === again.setChecksum && JSON.stringify(set) === JSON.stringify(again),
  noValuesStored: set.rows.every((r) => !('value' in r) && !('rawCosine' in r)),
  packetIdentityRowsAbsent: set.rows.every((r) => r.subjectKind === 'FEATURE_EVIDENCE_GAP'),
};
if (!Object.values(checks).every(Boolean)) throw new Error(`UNKNOWN_SET_INVARIANT_FAILED:${JSON.stringify(checks)}`);

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const outDir = path.join(ROOT, `.tmp/atlas/unknown-resolution-set-v1/${stamp}`);
fs.mkdirSync(outDir, { recursive: true });
const setBody = JSON.stringify(set);
fs.writeFileSync(path.join(outDir, 'unknown-resolution-set.json'), setBody);
const receipt = {
  schema: 'atlas.unknown-resolution-set-receipt.v1', status: 'UNKNOWN_RESOLUTION_SET_SEALED_ARTIFACT_ONLY', generatedAt: new Date().toISOString(),
  canonicalAuthority: false, supersedes: 'unknown-resolution-draft-v2 (draft-unknown-resolution-v2.mts; withdrawn migration target)',
  storage: 'artifact only — no database owner is created or modified; unknown_packets / unknown_resolution_ledger untouched',
  coordinates: { candidateSnapshotRevision: PINNED_SNAPSHOT, ordinalMapChecksum: fr.bindings.ordinalMapChecksum, coordinateArtifactChecksum: crosswalk.output.candidateMultiplicity.sha256 },
  inputs: { featureReceipt: `docs/reports/${featureFile}`, overlayProof: `docs/reports/${proofFile}`, ...set.inputChecksums },
  rowCount: set.rowCount, byReason, setChecksum: set.setChecksum, producerRevision, checks,
  artifact: { path: rel(path.join(outDir, 'unknown-resolution-set.json')), sha256: sha(setBody), bytes: Buffer.byteLength(setBody) },
  writes: { postgres: 0, qdrant: 0, valkey: 0, rabbitmq: 0, graphify: 0 },
};
const receiptPath = path.join(reports, `unknown-resolution-set-v1-${stamp}.json`);
fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
console.log(JSON.stringify({ receiptPath: rel(receiptPath), rowCount: set.rowCount, byReason, checks, setChecksum: set.setChecksum }, null, 2));
