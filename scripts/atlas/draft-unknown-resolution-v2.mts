#!/usr/bin/env node
// SUPERSEDED (2026-09-26) by scripts/atlas/build-unknown-resolution-set-v1.mts: this draft targeted a withdrawn migration. Kept as history.
/**
 * UNKNOWN-RESOLUTION v2 draft: rows shaped for the EXISTING unknown_packets owner (UnknownResolutionV1), not a competing table.
 * Supersedes draft-feature-unknowns-v2.mts. Artifact-only: NO database access, nothing inserted.
 * Splits the single NO_QUALIFIED_LEGACY_SUMMARY_HINT reason into two actionable reasons using sealed artifacts.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha = (b: string | Buffer) => `sha256:${crypto.createHash('sha256').update(b).digest('hex')}`;
const rel = (p: string) => path.relative(ROOT, p);
const ndjson = (p: string) => fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const reports = path.join(ROOT, 'docs/reports');
const latest = (prefix: string) => path.join(reports, fs.readdirSync(reports).filter((f) => f.startsWith(prefix)).sort().pop()!);

// Deterministic UUIDv5 (RFC 9562) — an idempotent-upsert surrogate, never identity.
const NAMESPACE = (() => { // frozen: v5(URL namespace, 'atlas.unknown-resolution.v1')
  const url = Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex');
  return uuidv5(url, 'atlas.unknown-resolution.v1');
})();
function uuidv5(ns: Buffer, name: string): Buffer {
  const h = crypto.createHash('sha1').update(ns).update(Buffer.from(name, 'utf8')).digest();
  const b = Buffer.from(h.subarray(0, 16));
  b[6] = (b[6]! & 0x0f) | 0x50; b[8] = (b[8]! & 0x3f) | 0x80;
  return b;
}
const uuidStr = (b: Buffer) => { const h = b.toString('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`; };

// ---- sealed inputs, each verified
// Pinned to an explicit snapshot (never "latest receipt"): a concurrent producer for another snapshot must not be used silently.
const PINNED_SNAPSHOT = process.argv.includes('--snapshot') ? process.argv[process.argv.indexOf('--snapshot') + 1]! : 'sha256:687871b76918f27213c45d72d7200aff82351343cec5577037d75c2c7631e28d'; // canonical: packet_key coordinates (operator decision 2026-09-26)
const featureReceiptFile = fs.readdirSync(reports).filter((f) => f.startsWith('legacy-summary-hint-feature-v2-')).sort()
  .filter((f) => JSON.parse(fs.readFileSync(path.join(reports, f), 'utf8')).bindings?.candidateSnapshotRevision === PINNED_SNAPSHOT).pop();
if (!featureReceiptFile) throw new Error(`NO_FEATURE_RECEIPT_FOR_PINNED_SNAPSHOT:${PINNED_SNAPSHOT}`);
const fr = JSON.parse(fs.readFileSync(path.join(reports, featureReceiptFile), 'utf8'));
const rowsPath = path.resolve(ROOT, fr.artifacts.featureRows.path);
if (sha(fs.readFileSync(rowsPath)) !== fr.artifacts.featureRows.sha256) throw new Error('HINT_FEATURE_ROWS_ARTIFACT_TAMPERED');
const rows = ndjson(rowsPath);
// Per-candidate proven-chunk multiplicity is keyed by packet_key (never by ordinal), taken from the replay-proven overlay proof
// whose destination is the pinned snapshot, then verified against its crosswalk receipt.
const proofFile = fs.readdirSync(reports).filter((f) => f.startsWith('historical-evidence-overlay-proof-v2-')).sort()
  .filter((f) => { const p = JSON.parse(fs.readFileSync(path.join(reports, f), 'utf8')); return p.destination.candidateSnapshotRevision === PINNED_SNAPSHOT && p.status === 'HISTORICAL_EVIDENCE_OVERLAY_REPLAY_PROVEN'; }).pop();
if (!proofFile) throw new Error(`NO_REPLAY_PROVEN_OVERLAY_PROOF_FOR_PINNED_SNAPSHOT:${PINNED_SNAPSHOT}`);
const proof = JSON.parse(fs.readFileSync(path.join(reports, proofFile), 'utf8'));
if (proof.destination.ordinalMapChecksum !== fr.bindings.ordinalMapChecksum) throw new Error('SNAPSHOT_MISMATCH_BETWEEN_OVERLAY_AND_FEATURE');
const crosswalk = JSON.parse(fs.readFileSync(path.resolve(ROOT, proof.destination.cei24Receipt.split('\\').join('/')), 'utf8'));
const multPath = path.resolve(ROOT, crosswalk.output.candidateMultiplicity.path);
if (sha(fs.readFileSync(multPath)) !== crosswalk.output.candidateMultiplicity.sha256) throw new Error('CANDIDATE_MULTIPLICITY_ARTIFACT_TAMPERED');
const mult = ndjson(multPath);
if (mult.some((m: any) => m.candidateSnapshotRevision !== PINNED_SNAPSHOT || m.ordinalMapChecksum !== fr.bindings.ordinalMapChecksum)) throw new Error('MULTIPLICITY_COORDINATE_MISMATCH');
const chunkCountByPacketKey = new Map(mult.map((m: any) => [m.packetKey as string, m.provenChunkCount as number]));
if (chunkCountByPacketKey.size !== mult.length) throw new Error('MULTIPLICITY_DUPLICATE_PACKET_KEY');

// Packet-level summary flag from the CEI-23 numeric plane (context only; never a value for this feature).
const numeric = fs.readFileSync(path.join(ROOT, '.tmp/atlas/candidate-feature-matrix-v1/20260926T150456Z/numeric.f32le'));
const f32 = new Float32Array(numeric.buffer, numeric.byteOffset, numeric.byteLength / 4);
const SUMMARY_COL = 2, COLS = 6;
const matrixRowByPacketKey = new Map(ndjson(path.join(ROOT, '.tmp/atlas/candidate-feature-matrix-v1/20260926T150456Z/candidate-ordinal-map.ndjson')).map((r: any) => [r.packetKey as string, r.candidateOrdinal as number]));

const producerRevision = sha(JSON.stringify({ feature: 'atlas_feature_unknowns.draft.v2', upstreamProducerRevision: fr.producerRevision, script: sha(fs.readFileSync(fileURLToPath(import.meta.url))) }));
const FEATURE = 'legacy_summary_cosine_max';
const WORKSPACE_ID = 'deeds-web-app';
const drafts = rows.filter((r: any) => r.state === 'UNAVAILABLE').map((r: any) => {
  const chunks = chunkCountByPacketKey.get(r.packetKey);
  if (chunks === undefined) throw new Error(`NO_MULTIPLICITY_ROW_FOR_PACKET:${r.packetKey}`);
  const hasChunks = chunks > 0;
  const naturalKey = [WORKSPACE_ID, r.candidateSnapshotRevision, 'CANDIDATE_FEATURE', r.packetKey, FEATURE, 'MISSING_FEATURE_VALUE'].join('\u0000');
  const unknownId = uuidStr(uuidv5(NAMESPACE, naturalKey));
  return {
    // existing unknown_packets columns (NOT NULL ones satisfied without inventing identity)
    unknown_id: unknownId, observation_id: `unknown-resolution-v2:${unknownId}`,
    workspace_id: WORKSPACE_ID, potential_source_ref: r.sourceRef, potential_packet_key: r.packetKey,
    source_kind: 'FEATURE_GAP', status: 'OPEN',
    // UnknownResolutionV1 additive columns
    subject_kind: 'CANDIDATE_FEATURE', subject_id: r.packetKey, snapshot_revision: r.candidateSnapshotRevision,
    unknown_kind: 'MISSING_FEATURE_VALUE', feature_name: FEATURE,
    reason_code: hasChunks ? 'CHUNK_WITHOUT_QUALIFIED_SUMMARY' : 'NO_PROVEN_CHUNK_LINEAGE',
    required_evidence_kind: hasChunks ? 'QUALIFIED_CHUNK_SUMMARY' : 'PROVEN_PACKET_CHUNK_LINEAGE',
    resolver_kind: hasChunks ? 'SUMMARY_GENERATION' : 'SOURCE_LINEAGE_REPAIR',
    resolution_revision: null,
    evidence_payload: { ordinalMapChecksum: r.ordinalMapChecksum, candidateOrdinal: r.candidateOrdinal, matrixRowIndex: r.matrixRowIndex, provenChunkCount: chunks, packetLevelSummaryPresent: f32[matrixRowByPacketKey.get(r.packetKey)! * COLS + SUMMARY_COL] === 1, upstreamReason: r.unavailableReason, producerRevision },
  };
});

// ---- invariants
const keys = new Set(drafts.map((d: any) => d.unknown_id));
const naturalKeys = new Set(drafts.map((d: any) => `${d.workspace_id}|${d.snapshot_revision}|${d.subject_kind}|${d.subject_id}|${d.feature_name}|${d.unknown_kind}`));
const byReason: Record<string, number> = {}; for (const d of drafts) byReason[d.reason_code] = (byReason[d.reason_code] ?? 0) + 1;
const expected = fr.coverage.unavailable;
const checks = {
  matchesUnavailableCount: drafts.length === expected,
  uniqueSurrogateKeys: keys.size === drafts.length,
  uniqueNaturalKeys: naturalKeys.size === drafts.length,
  reasonsPartitionAll: Object.values(byReason).reduce((a, b) => a + b, 0) === drafts.length,
  noValuesStored: drafts.every((d: any) => !('value' in d) && !('rawCosine' in d) && !('rawCosine' in d.evidence_payload)),
  packetIdentityRowsUntouched: drafts.every((d: any) => d.subject_kind !== 'PACKET_IDENTITY'),
  nineAdditiveFieldsPresent: drafts.every((d: any) => ['subject_kind','subject_id','snapshot_revision','unknown_kind','feature_name','reason_code','required_evidence_kind','resolver_kind','resolution_revision'].every((k) => k in d)),
  deterministic: (() => { const d0 = drafts[0]!; const again = uuidStr(uuidv5(NAMESPACE, [d0.workspace_id, d0.snapshot_revision, 'CANDIDATE_FEATURE', d0.subject_id, FEATURE, 'MISSING_FEATURE_VALUE'].join('\u0000'))); return again === d0.unknown_id; })(),
};
if (!Object.values(checks).every(Boolean)) throw new Error(`DRAFT_INVARIANT_FAILED:${JSON.stringify(checks)}`);

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const outDir = path.join(ROOT, `.tmp/atlas/unknown-resolution-draft-v2/${stamp}`);
fs.mkdirSync(outDir, { recursive: true });
const body = drafts.map((d) => JSON.stringify(d)).join('\n') + '\n';
fs.writeFileSync(path.join(outDir, 'unknown_packets.gap-rows.draft.ndjson'), body);
const sqlPath = path.join(ROOT, 'sveltekit-frontend/drizzle/manual/20260926_unknown_resolution_v2_PROPOSED.sql');
const receipt = {
  schema: 'atlas.unknown-resolution-draft-receipt.v2', status: 'DRAFT_ARTIFACT_ONLY_NOT_APPLIED', generatedAt: new Date().toISOString(),
  target: 'public.unknown_packets (EXISTING owner; additive UnknownResolutionV1 columns PROPOSED, not applied)', supersedes: 'feature-unknowns-draft-v2 / atlas_feature_unknowns (withdrawn: competing sibling table)', requiredFollowUp: 'unknown pipeline code must filter subject_kind = PACKET_IDENTITY before any gap row exists', migration: { path: rel(sqlPath), sha256: sha(fs.readFileSync(sqlPath)), applied: false },
  inputs: { featureReceipt: rel(path.join(reports, featureReceiptFile)), featureRows: fr.artifacts.featureRows, chunkMultiplicity: crosswalk.output.candidateMultiplicity, overlayProof: rel(path.join(reports, proofFile)) },
  coordinates: { candidateSnapshotRevision: fr.bindings.candidateSnapshotRevision, ordinalMapChecksum: fr.bindings.ordinalMapChecksum },
  draftRows: drafts.length, byReason, checks, uuidNamespace: uuidStr(NAMESPACE), producerRevision,
  artifact: { path: rel(path.join(outDir, 'unknown_packets.gap-rows.draft.ndjson')), sha256: sha(body), rows: drafts.length },
  packetLevelSummaryPresentAmongDrafts: drafts.filter((d: any) => d.evidence_payload.packetLevelSummaryPresent).length,
  writes: { postgres: 0, qdrant: 0, valkey: 0, rabbitmq: 0, graphify: 0 },
  semantics: 'Typed missing-evidence requirements for identified subjects, stored in the existing unknown owners. Not identity, not a value store, never promoted as packets.',
};
const receiptPath = path.join(reports, `unknown-resolution-draft-v2-${stamp}.json`);
fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
console.log(JSON.stringify({ receiptPath: rel(receiptPath), draftRows: drafts.length, byReason, checks, packetLevelSummaryPresentAmongDrafts: receipt.packetLevelSummaryPresentAmongDrafts, uuidNamespace: receipt.uuidNamespace }, null, 2));
