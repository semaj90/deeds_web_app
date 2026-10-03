#!/usr/bin/env node
/**
 * RF-04 live admission + RF-05 live presence replay for `legacy_summary_cosine_max` (v2).
 * Artifact-only: reads the sealed HINT-FEATURE-03A output, wraps it through the existing
 * RepairFeatureProducerArtifactV1 -> ProducerSetV1 -> CandidateFeatureBundleV1 -> presence bridge.
 * No datastore access. No gain claim, no MMR.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCandidateFeatureMatrix } from '../../sveltekit-frontend/src/lib/server/retrieval/retrieval-candidate-feature-matrix-v1.js';
import { REPAIR_OVERLAY_FEATURE_NAMES } from '../../sveltekit-frontend/src/lib/server/retrieval/repair-candidate-feature-matrix-v1.js';
import { buildRepairCandidateFeatureBundleV1 } from '../../sveltekit-frontend/src/lib/server/retrieval/repair-candidate-feature-bundle-v1.js';
import { buildRepairFeatureProducerSetV1, verifyRepairFeatureProducerSetV1 } from '../../sveltekit-frontend/src/lib/server/retrieval/repair-feature-producer-v1.js';
import { buildRepairFeaturePresenceEvidenceV1 } from '../../sveltekit-frontend/src/lib/server/retrieval/repair-feature-presence-evidence-v1.js';
import {
  buildLegacySummaryCosineMaxProducerArtifactV2,
  legacySummaryHintFeatureChecksumV2,
  type HintFeatureRowV2,
} from '../../sveltekit-frontend/src/lib/server/atlas/features/legacy-summary-hint-feature-v2.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha = (b: string | Buffer) => `sha256:${crypto.createHash('sha256').update(b).digest('hex')}`;
const rel = (p: string) => path.relative(ROOT, p);
const args = process.argv.slice(2);
const arg = (n: string, d: string | null) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1]! : d; };
const reports = path.join(ROOT, 'docs/reports');
// Pinned to an explicit candidate snapshot: never "latest receipt" — a concurrent producer for another snapshot must not be admitted silently.
const PINNED_SNAPSHOT = arg('--snapshot', 'sha256:687871b76918f27213c45d72d7200aff82351343cec5577037d75c2c7631e28d')!;
const featureReceiptPath = (() => {
  if (arg('--feature-receipt', null)) return path.resolve(ROOT, arg('--feature-receipt', null)!);
  const matches = fs.readdirSync(reports).filter((f) => f.startsWith('legacy-summary-hint-feature-v2-')).sort()
    .filter((f) => JSON.parse(fs.readFileSync(path.join(reports, f), 'utf8')).bindings?.candidateSnapshotRevision === PINNED_SNAPSHOT);
  if (matches.length === 0) throw new Error(`NO_FEATURE_RECEIPT_FOR_PINNED_SNAPSHOT:${PINNED_SNAPSHOT}`);
  return path.join(reports, matches.pop()!);
})();
const fr = JSON.parse(fs.readFileSync(featureReceiptPath, 'utf8'));
if (fr.bindings.candidateSnapshotRevision !== PINNED_SNAPSHOT) throw new Error('FEATURE_RECEIPT_SNAPSHOT_NOT_PINNED_SNAPSHOT');
if (fr.status !== 'STANDALONE_HINT_FEATURE_MECHANICS_PROVEN' || fr.rfContract?.registryTouched !== false) throw new Error('HINT_FEATURE_03A_NOT_PROVEN');

// ---- verify sealed 03A artifacts before anything is admitted
const rowsPath = path.resolve(ROOT, fr.artifacts.featureRows.path);
const rowsBytes = fs.readFileSync(rowsPath);
if (sha(rowsBytes) !== fr.artifacts.featureRows.sha256) throw new Error('HINT_FEATURE_ROWS_ARTIFACT_TAMPERED');
const rows = rowsBytes.toString('utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)) as HintFeatureRowV2[];
if (legacySummaryHintFeatureChecksumV2(rows) !== fr.featureChecksum) throw new Error('HINT_FEATURE_CHECKSUM_MISMATCH');
if (sha(JSON.stringify(fr.bindings)) !== fr.producerRevision) throw new Error('HINT_FEATURE_PRODUCER_REVISION_MISMATCH');
const { candidateSnapshotRevision, ordinalMapChecksum } = fr.bindings;
if (rows.some((r) => r.candidateSnapshotRevision !== candidateSnapshotRevision || r.ordinalMapChecksum !== ordinalMapChecksum)) throw new Error('HINT_FEATURE_COORDINATE_MISMATCH');

// ---- RF-04 admission
const artifact = buildLegacySummaryCosineMaxProducerArtifactV2({
  rows, producerRevision: fr.producerRevision, inputChecksum: fr.producerRevision, hintVectorArtifactChecksum: fr.bindings.hintVectorArtifactChecksum,
});
const producerSet = buildRepairFeatureProducerSetV1({ candidateSnapshotRevision, ordinalMapChecksum, candidateRowCount: rows.length, artifacts: [artifact] });
verifyRepairFeatureProducerSetV1(producerSet);

// candidate identities in dense ordinal order (the matrix contract requires row === candidateOrdinal)
const ordered = [...rows].sort((a, b) => a.candidateOrdinal - b.candidateOrdinal);
if (ordered.some((r, i) => r.candidateOrdinal !== i)) throw new Error('CANDIDATE_ORDINALS_NOT_DENSE');
const identities = ordered.map((r) => ({ candidateOrdinal: r.candidateOrdinal, packetKey: r.packetKey, sourceRef: r.sourceRef, sourceRevision: r.sourceRevision, workspaceRevision: r.workspaceRevision }));
// This snapshot has no base-plane producer yet: an explicit, sealed EMPTY base plane (all features absent), not a borrowed manifest.
const baseMatrix = buildCandidateFeatureMatrix(ordered.map((r) => ({ packet_key: r.packetKey })));
const baseMatrixManifestChecksum = sha(JSON.stringify({ schema: 'atlas.empty-base-plane.v1', candidateSnapshotRevision, ordinalMapChecksum, packetKeyChecksum: sha(ordered.map((r) => r.packetKey).join('\n')), reason: 'NO_BASE_PLANE_PRODUCER_FOR_CEI24_SNAPSHOT' }));
const matrixInput = { baseMatrix, baseMatrixManifestChecksum, candidateSnapshotRevision, ordinalMapChecksum, producerRevision: `rf04-legacy-summary-cosine-max-v2:${fr.producerRevision}`, identities };
const bundle = buildRepairCandidateFeatureBundleV1({ matrixInput, producerSet });

// ---- RF-05 presence replay
const presenceInput = { candidateSnapshotRevision, ordinalMapChecksum, candidateRowCount: rows.length };
const presence = buildRepairFeaturePresenceEvidenceV1({ ...presenceInput, repairProducerSet: producerSet });
const presenceReplay = buildRepairFeaturePresenceEvidenceV1({ ...presenceInput, repairProducerSet: producerSet });
const presenceBaseline = buildRepairFeaturePresenceEvidenceV1(presenceInput);

// ---- measured invariants
const m = bundle.matrix;
const legacyCol = m.baseFeatureCount + REPAIR_OVERLAY_FEATURE_NAMES.indexOf('legacy_summary_cosine_max');
const cov = m.overlayCoverage.legacy_summary_cosine_max;
const otherOverlayStates = Object.entries(m.overlayFeatureStates).filter(([k]) => k !== 'legacy_summary_cosine_max');
const derivedRows = rows.filter((r) => r.state === 'DERIVED');
const valuesMatch = derivedRows.every((r) => Math.abs(m.featureValues[r.candidateOrdinal * m.featureCount + legacyCol]! - r.rawCosine!) < 1e-6 && m.presenceMask[r.candidateOrdinal * m.featureCount + legacyCol] === 1);
const unavailableMasked = rows.filter((r) => r.state === 'UNAVAILABLE').every((r) => m.presenceMask[r.candidateOrdinal * m.featureCount + legacyCol] === 0);
let basePlanePresent = 0; for (let i = 0; i < baseMatrix.presence_mask.length; i++) basePlanePresent += baseMatrix.presence_mask[i]!;
let otherOverlayPresent = 0;
for (let row = 0; row < m.rowCount; row++) for (let f = m.baseFeatureCount; f < m.featureCount; f++) if (f !== legacyCol) otherOverlayPresent += m.presenceMask[row * m.featureCount + f]!;
const { legacySummaryCosineMax: _l, ...restBaseline } = presenceBaseline.featurePresence;
const { legacySummaryCosineMax: _p, ...restWith } = presence.featurePresence;

const expect = (name: string, cond: boolean) => { if (!cond) throw new Error(`RF04_RF05_INVARIANT_FAILED:${name}`); return true; };
const checks = {
  featureStatePartial: expect('state', m.overlayFeatureStates.legacy_summary_cosine_max === 'PARTIAL'),
  derived178: expect('derived', cov.presentRows === derivedRows.length && cov.presentRows === fr.coverage.derived),
  unavailable15973: expect('unavailable', cov.missingRows === fr.coverage.unavailable),
  totalStates16151: expect('total', cov.presentRows + cov.missingRows === rows.length),
  otherOverlayFeaturesUnchangedUnavailable: expect('others', otherOverlayStates.every(([, v]) => v === 'UNAVAILABLE') && otherOverlayPresent === 0),
  basePlaneStillEmpty: expect('base', basePlanePresent === 0),
  derivedValuesEqualRawCosine: expect('values', valuesMatch),
  unavailableRowsMasked: expect('masked', unavailableMasked),
  presencePartialForFeature: expect('presence', presence.featurePresence.legacySummaryCosineMax === 'PARTIAL' && presenceBaseline.featurePresence.legacySummaryCosineMax === 'UNAVAILABLE'),
  noOtherPresenceKeyChanged: expect('presenceOthers', JSON.stringify(restWith) === JSON.stringify(restBaseline)),
  presenceReplayIdentical: expect('replay', presence.presenceChecksum === presenceReplay.presenceChecksum),
};

// ---- live tamper rejection through the same admission path
const rejects = (fn: () => unknown) => { try { fn(); return false; } catch { return true; } };
const tamperedSet = JSON.parse(JSON.stringify(producerSet)); tamperedSet.artifacts[0].rows[0].value = 0.999;
const tamper = {
  tamperedArtifactValueRejectedByBundle: rejects(() => buildRepairCandidateFeatureBundleV1({ matrixInput, producerSet: tamperedSet })),
  wrongSnapshotRejectedByBundle: rejects(() => buildRepairCandidateFeatureBundleV1({ matrixInput: { ...matrixInput, candidateSnapshotRevision: 'sha256:' + '0'.repeat(64) }, producerSet })),
  wrongOrdinalChecksumRejectedByPresence: rejects(() => buildRepairFeaturePresenceEvidenceV1({ ...presenceInput, ordinalMapChecksum: '0'.repeat(64), repairProducerSet: producerSet })),
};
if (!Object.values(tamper).every(Boolean)) throw new Error('RF04_TAMPER_NOT_REJECTED');

const stamp = new Date().toISOString().replaceAll('-', '').replaceAll(':', '').replace(/\.\d+Z$/, 'Z');
const outDir = path.join(ROOT, `.tmp/atlas/legacy-summary-cosine-max-rf04-v2/${stamp}`);
fs.mkdirSync(outDir, { recursive: true });
const wr = (n: string, o: unknown) => { const b = JSON.stringify(o); fs.writeFileSync(path.join(outDir, n), b); return { path: rel(path.join(outDir, n)), sha256: sha(b) }; };
const artifacts = { producerArtifact: wr('producer-artifact.json', artifact), producerSet: wr('producer-set.json', producerSet), presenceEvidence: wr('presence-evidence.json', presence) };
const receipt = {
  schema: 'atlas.legacy-summary-cosine-max-rf04-rf05-receipt.v2',
  status: 'RF04_CONFORMED_ADMISSION_RF05_PRESENCE_REPLAYED_ARTIFACT_ONLY',
  generatedAt: new Date().toISOString(), featureName: 'legacy_summary_cosine_max',
  canonicalAuthority: false, retrievalVote: false, rankingPromotion: false, mutationAuthority: false,
  input: { featureReceipt: rel(featureReceiptPath), featureChecksum: fr.featureChecksum, producerRevision: fr.producerRevision, queryEmbeddingDigest: fr.bindings.queryEmbeddingDigest },
  coordinates: { candidateSnapshotRevision, ordinalMapChecksum, rows: rows.length },
  contractChange: { registryAppended: 'legacy_summary_cosine_max', appendedAtEnd: true, overlayFeatureCount: REPAIR_OVERLAY_FEATURE_NAMES.length, derivation: 'LEGACY_SUMMARY_HINT_MAX_COSINE', representationId: 'semantic_768', sourceRepresentationId: 'semantic_768', artifactState: 'PARTIAL', runtimeModelRevision: 'UNRESOLVED_RUNTIME_MODEL_REVISION' },
  rf04: { producerSetChecksum: producerSet.producerSetChecksum, artifactChecksum: artifact.artifactChecksum, bundleChecksum: bundle.bundleChecksum, matrixManifestChecksum: m.manifestChecksum, baseMatrixManifestChecksum, baseMatrixNote: 'explicit empty base plane; no base-plane producer exists for this snapshot', coverage: cov },
  rf05: { presenceChecksum: presence.presenceChecksum, featurePresence: presence.featurePresence, baselineFeaturePresence: presenceBaseline.featurePresence },
  checks, tamper, artifacts,
  notMeasured: ['relevance lift (0 graded labels)', 'MMR', 'ACE ContextManifest live replay'],
  writes: { postgres: 0, qdrant: 0, valkey: 0, rabbitmq: 0, graphify: 0 },
};
const receiptPath = path.join(reports, `legacy-summary-cosine-max-rf04-rf05-v2-${stamp}.json`);
fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
console.log(JSON.stringify({ receiptPath: rel(receiptPath), status: receipt.status, coverage: cov, checks, tamper, presence: presence.featurePresence }, null, 2));
