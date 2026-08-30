import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildCandidateFeatureMatrix } from '../../sveltekit-frontend/src/lib/server/retrieval/retrieval-candidate-feature-matrix-v1.js';
import {
  REPAIR_OVERLAY_FEATURE_NAMES,
  buildRepairCandidateFeatureMatrixV1,
  type RepairOverlayFeatureStatesV1,
} from '../../sveltekit-frontend/src/lib/server/retrieval/repair-candidate-feature-matrix-v1.js';
import { buildCandidateFeatureMatrixManifest } from './lib/candidate-feature-matrix-manifest-v1.mts';

const root = resolve(import.meta.dirname, '../..');
const mapPath = resolve(root, '.tmp/atlas/lineage-qualified-candidate-map-v1.json');
const semanticPath = resolve(root, 'docs/reports/lineage-semantic-768-cohort-v1.json');
const graphPath = resolve(root, 'docs/reports/current-graph-feature-gather-v1.json');
const baseManifestPath = resolve(root, 'docs/reports/current-candidate-feature-matrix-manifest-v1.json');
const reportPath = resolve(root, 'docs/reports/current-repair-candidate-feature-matrix-v1.json');

const map = JSON.parse(readFileSync(mapPath, 'utf8'));
const semantic = JSON.parse(readFileSync(semanticPath, 'utf8'));
const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
const currentBaseProof = JSON.parse(readFileSync(baseManifestPath, 'utf8'));

if (!/^sha256:[0-9a-f]{64}$/i.test(String(map.candidateSnapshotRevision ?? ''))) {
  throw new Error('REPAIR_PROOF_CANDIDATE_SNAPSHOT_REVISION_INVALID');
}
if (!/^sha256:[0-9a-f]{64}$/i.test(String(map.ordinalMapChecksum ?? ''))) {
  throw new Error('REPAIR_PROOF_ORDINAL_MAP_CHECKSUM_INVALID');
}
if (!Array.isArray(map.candidates) || map.candidates.length === 0) {
  throw new Error('REPAIR_PROOF_CANDIDATE_MAP_EMPTY');
}
if (!currentBaseProof?.graphManifest?.manifestChecksum) {
  throw new Error('REPAIR_PROOF_BASE_MANIFEST_MISSING');
}

const graphByOrdinal = new Map((graph.features ?? []).map((feature: any) => [feature.candidateOrdinal, feature]));
const semanticByOrdinal = new Map((semantic.candidates ?? []).map((feature: any) => [feature.candidateOrdinal, feature]));

const projections = map.candidates.map((candidate: any) => {
  const graphRow = graphByOrdinal.get(candidate.candidateOrdinal) as any;
  const semanticRow = semanticByOrdinal.get(candidate.candidateOrdinal) as any;
  return {
    packet_key: candidate.packetKey,
    semantic_similarity_768: semanticRow?.semanticSimilarity768,
    authority_norm: graphRow?.pagerankMax,
    source_revision_match: candidate.sourceRevision ? 1 : undefined,
    representation_revision_match: semanticRow?.semanticRevision ? 1 : undefined,
  };
});

const baseMatrix = buildCandidateFeatureMatrix(projections);
const reconstructedBaseManifest = buildCandidateFeatureMatrixManifest({
  map,
  semantic,
  graph,
  matrix: baseMatrix,
  includeGraph: true,
});

// Fail closed if the checked-in base proof no longer describes the current reconstruction.
if (reconstructedBaseManifest.manifestChecksum !== currentBaseProof.graphManifest.manifestChecksum) {
  throw new Error('REPAIR_PROOF_BASE_MANIFEST_DRIFT');
}

const identities = map.candidates.map((candidate: any) => {
  const semanticRow = semanticByOrdinal.get(candidate.candidateOrdinal) as any;
  const graphRow = graphByOrdinal.get(candidate.candidateOrdinal) as any;
  return {
    candidateOrdinal: candidate.candidateOrdinal,
    packetKey: candidate.packetKey,
    sourceRef: candidate.sourceRef,
    sourceRevision: candidate.sourceRevision ?? null,
    workspaceRevision: candidate.workspaceRevision ?? map.workspaceRevision ?? null,
    treeNodeId: candidate.treeNodeId ?? null,
    stableSymbolId: candidate.stableSymbolId ?? null,
    symbolVersionId: candidate.symbolVersionId ?? null,
    observationFeatureRevision: candidate.observationFeatureRevision ?? null,
    astGraphRevision: candidate.astGraphRevision ?? null,
    compilerSemanticGraphRevision: candidate.compilerSemanticGraphRevision ?? null,
    relationshipGraphRevision: graphRow?.graphRevision ?? graph.graphRevision ?? null,
    semanticRevision: semanticRow?.semanticRevision ?? candidate.semanticRevision ?? null,
    representationRevision: semanticRow?.semanticRevision ?? candidate.semanticRevision ?? null,
    analysisPassSetChecksum: candidate.analysisPassSetChecksum ?? null,
  };
});

// This proof is intentionally conservative. Existing base-plane features remain in the existing
// [C,25] owner. None of the new repair-only challenger columns has a checked-in, revision-bound
// producer artifact that can be joined to this exact 15-row candidate snapshot today, so every
// overlay feature remains UNAVAILABLE. Future producers must supply explicit rows + state changes.
const overlayFeatureStates = Object.fromEntries(
  REPAIR_OVERLAY_FEATURE_NAMES.map((name) => [name, 'UNAVAILABLE']),
) as RepairOverlayFeatureStatesV1;

const run0 = buildRepairCandidateFeatureMatrixV1({
  baseMatrix,
  baseMatrixManifestChecksum: reconstructedBaseManifest.manifestChecksum,
  candidateSnapshotRevision: map.candidateSnapshotRevision,
  ordinalMapChecksum: map.ordinalMapChecksum,
  producerRevision: 'repair-candidate-feature-matrix-v1',
  identities,
  overlayFeatureStates,
});
const run1 = buildRepairCandidateFeatureMatrixV1({
  baseMatrix,
  baseMatrixManifestChecksum: reconstructedBaseManifest.manifestChecksum,
  candidateSnapshotRevision: map.candidateSnapshotRevision,
  ordinalMapChecksum: map.ordinalMapChecksum,
  producerRevision: 'repair-candidate-feature-matrix-v1',
  identities,
  overlayFeatureStates,
});

const basePlanePreserved = (() => {
  for (let row = 0; row < baseMatrix.candidate_count; row++) {
    for (let feature = 0; feature < baseMatrix.feature_count; feature++) {
      const baseIndex = row * baseMatrix.feature_count + feature;
      const repairIndex = row * run0.featureCount + feature;
      if (run0.featureValues[repairIndex] !== baseMatrix.candidate_features[baseIndex]) return false;
      if (run0.presenceMask[repairIndex] !== baseMatrix.presence_mask[baseIndex]) return false;
    }
  }
  return true;
})();

const overlayPresenceCount = (() => {
  let count = 0;
  for (let row = 0; row < run0.rowCount; row++) {
    for (let feature = run0.baseFeatureCount; feature < run0.featureCount; feature++) {
      count += run0.presenceMask[row * run0.featureCount + feature] === 1 ? 1 : 0;
    }
  }
  return count;
})();

const report = {
  schema: 'atlas.current-repair-candidate-feature-matrix-proof.v1',
  mode: 'READ_ONLY_TOURNAMENT_MATRIX_CONTRACT_REPLAY',
  candidateSnapshotRevision: run0.candidateSnapshotRevision,
  ordinalMapChecksum: run0.ordinalMapChecksum,
  candidateCount: run0.rowCount,
  baseFeatureCount: run0.baseFeatureCount,
  repairOverlayFeatureCount: run0.repairFeatureCount,
  totalFeatureCount: run0.featureCount,
  baseMatrixManifestChecksum: run0.baseMatrixManifestChecksum,
  baseMatrixChecksum: run0.baseMatrixChecksum,
  basePlanePreserved,
  overlayPresenceCount,
  overlayFeatureStates: run0.overlayFeatureStates,
  overlayCoverage: run0.overlayCoverage,
  replay: {
    manifest0: run0.manifestChecksum,
    manifest1: run1.manifestChecksum,
    identical: run0.manifestChecksum === run1.manifestChecksum,
    matrixIdentical: run0.matrixChecksum === run1.matrixChecksum,
    presenceIdentical: run0.presenceMaskChecksum === run1.presenceMaskChecksum,
    identityIdentical: run0.identityChecksum === run1.identityChecksum,
  },
  authority: {
    canonicalAuthority: run0.canonicalAuthority,
    retrievalVote: run0.retrievalVote,
    rankingPromotion: run0.rankingPromotion,
    mutationAuthority: run0.mutationAuthority,
  },
  writesPerformed: false,
  status:
    basePlanePreserved &&
    overlayPresenceCount === 0 &&
    run0.manifestChecksum === run1.manifestChecksum &&
    run0.matrixChecksum === run1.matrixChecksum &&
    run0.presenceMaskChecksum === run1.presenceMaskChecksum &&
    run0.identityChecksum === run1.identityChecksum
      ? 'REPAIR_CANDIDATE_FEATURE_MATRIX_CONTRACT_PROVEN'
      : 'REPAIR_CANDIDATE_FEATURE_MATRIX_CONTRACT_BLOCKED',
  nextGate: 'JOIN_ONE_REVISION_BOUND_REPAIR_FEATURE_PRODUCER_THEN_RUN_TOURNAMENT_ABLATION',
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: report.status,
  candidateCount: report.candidateCount,
  baseFeatureCount: report.baseFeatureCount,
  repairOverlayFeatureCount: report.repairOverlayFeatureCount,
  totalFeatureCount: report.totalFeatureCount,
  basePlanePreserved: report.basePlanePreserved,
  overlayPresenceCount: report.overlayPresenceCount,
  replayIdentical: report.replay.identical,
  reportPath: 'docs/reports/current-repair-candidate-feature-matrix-v1.json',
}, null, 2));
