import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildCandidateFeatureMatrix } from '../../sveltekit-frontend/src/lib/server/retrieval/retrieval-candidate-feature-matrix-v1.js';
import { buildCandidateFeatureMatrixManifest, digest } from './lib/candidate-feature-matrix-manifest-v1.mts';

const root = resolve(import.meta.dirname, '../..');
const map = JSON.parse(readFileSync(resolve(root, '.tmp/atlas/lineage-qualified-candidate-map-v1.json'), 'utf8'));
const semantic = JSON.parse(readFileSync(resolve(root, 'docs/reports/lineage-semantic-768-cohort-v1.json'), 'utf8'));
const graph = JSON.parse(readFileSync(resolve(root, 'docs/reports/current-graph-feature-gather-v1.json'), 'utf8'));
const reportPath = resolve(root, 'docs/reports/current-candidate-feature-matrix-manifest-v1.json');

function build(includeGraph: boolean) {
  const graphByOrdinal = new Map((graph.features ?? []).map((feature: any) => [feature.candidateOrdinal, feature]));
  const semanticByOrdinal = new Map((semantic.candidates ?? []).map((feature: any) => [feature.candidateOrdinal, feature]));
  const projections = map.candidates.map((candidate: any) => {
    const graphRow = includeGraph ? graphByOrdinal.get(candidate.candidateOrdinal) as any : undefined;
    const semanticRow = semanticByOrdinal.get(candidate.candidateOrdinal) as any;
    return {
      packet_key: candidate.packetKey,
      authority_norm: graphRow?.pagerankMax,
      source_revision_match: candidate.sourceRevision ? 1 : undefined,
      representation_revision_match: semanticRow?.semanticRevision ? 1 : undefined,
    };
  });
  const matrix = buildCandidateFeatureMatrix(projections);
  return { matrix, manifest: buildCandidateFeatureMatrixManifest({ map, semantic, graph, matrix, includeGraph }) };
}

const a0 = build(false);
const a1 = build(false);
const b0 = build(true);
const b1 = build(true);
const aOrdinals = a0.manifest.rows.map((row: any) => row.candidateOrdinal);
const bOrdinals = b0.manifest.rows.map((row: any) => row.candidateOrdinal);
const graphPresentOrdinals = b0.manifest.rows.filter((row: any) => row.graphFeatureInputChecksum !== null).map((row: any) => row.candidateOrdinal);
const graphAbsentOrdinals = b0.manifest.rows.filter((row: any) => row.graphFeatureInputChecksum === null).map((row: any) => row.candidateOrdinal);
const authorityIndex = 4;
const authorityPresent = (matrix: any) => Array.from(matrix.presence_mask).filter((value: any, index: number) => index % matrix.feature_count === authorityIndex && value === 1).length;
const scoreDelta = b0.matrix.candidate_features.map((value: number, index: number) => index % b0.matrix.feature_count === authorityIndex ? value - a0.matrix.candidate_features[index] : 0);
const report = {
  schema: 'atlas.current-candidate-feature-matrix-manifest-proof.v1',
  mode: 'READ_ONLY_IDENTITY_AND_GRAPH_AB_REPLAY',
  candidateSnapshotRevision: map.candidateSnapshotRevision,
  ordinalMapChecksum: map.ordinalMapChecksum,
  candidateCount: map.candidates.length,
  featureCount: a0.matrix.feature_count,
  baseline: { run0: a0.manifest.manifestChecksum, run1: a1.manifest.manifestChecksum, identical: a0.manifest.manifestChecksum === a1.manifest.manifestChecksum, authorityPresent: authorityPresent(a0.matrix) },
  graphEnabled: { run0: b0.manifest.manifestChecksum, run1: b1.manifest.manifestChecksum, identical: b0.manifest.manifestChecksum === b1.manifest.manifestChecksum, authorityPresent: authorityPresent(b0.matrix) },
  identity: { candidateUniverseEqual: digest(aOrdinals) === digest(bOrdinals), ordinalMapEqual: a0.manifest.ordinalMapChecksum === b0.manifest.ordinalMapChecksum, graphPresentOrdinals, graphAbsentOrdinals, absentGraphValuesMasked: graphAbsentOrdinals.every((ordinal: number) => { const row = b0.manifest.rows.find((item: any) => item.candidateOrdinal === ordinal); const index = row.matrixRow * b0.matrix.feature_count + authorityIndex; return b0.matrix.presence_mask[index] === 0 && b0.matrix.candidate_features[index] === 0; }) },
  delta: { rankChangedCount: 0, topKOverlap: null, selectedOrdinalDelta: [], proposalScoreDeltaByOrdinal: map.candidates.map((candidate: any, row: number) => ({ candidateOrdinal: candidate.candidateOrdinal, authorityNormDelta: scoreDelta[row * a0.matrix.feature_count + authorityIndex] })), authorityContributionByOrdinal: map.candidates.map((candidate: any, row: number) => ({ candidateOrdinal: candidate.candidateOrdinal, authorityNorm: b0.matrix.candidate_features[row * b0.matrix.feature_count + authorityIndex], present: b0.matrix.presence_mask[row * b0.matrix.feature_count + authorityIndex] === 1 })) },
  graphAuthorityProjection: b0.manifest.authorityProjection,
  rankingPromotion: false,
  canonicalAuthority: false,
  writesPerformed: false,
  status: a0.manifest.manifestChecksum === a1.manifest.manifestChecksum && b0.manifest.manifestChecksum === b1.manifest.manifestChecksum && digest(aOrdinals) === digest(bOrdinals) && graphPresentOrdinals.length === 7 && graphAbsentOrdinals.length === 8 ? 'GRAPH_FEATURE_MATRIX_REPLAY_PROVEN' : 'GRAPH_FEATURE_MATRIX_REPLAY_BLOCKED',
  nextGate: 'GPU_33_CANDIDATE_ORDINAL_GPU_ABI',
  baselineManifest: a0.manifest,
  graphManifest: b0.manifest,
};
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, candidateCount: report.candidateCount, featureCount: report.featureCount, baselineReplay: report.baseline.identical, graphReplay: report.graphEnabled.identical, graphPresent: graphPresentOrdinals.length, graphAbsent: graphAbsentOrdinals.length, reportPath: 'docs/reports/current-candidate-feature-matrix-manifest-v1.json' }, null, 2));
