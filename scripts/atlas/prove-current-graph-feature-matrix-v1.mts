import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildCandidateFeatureMatrix } from '../../sveltekit-frontend/src/lib/server/retrieval/retrieval-candidate-feature-matrix-v1.js';

const root = resolve(import.meta.dirname, '../..');
const map = JSON.parse(readFileSync(resolve(root, '.tmp/atlas/lineage-qualified-candidate-map-v1.json'), 'utf8'));
const graph = JSON.parse(readFileSync(resolve(root, 'docs/reports/current-graph-feature-gather-v1.json'), 'utf8'));
const reportPath = resolve(root, 'docs/reports/current-graph-feature-matrix-v1.json');

const byOrdinal = new Map(graph.features.map((feature: { candidateOrdinal: number }) => [feature.candidateOrdinal, feature]));
const projections = map.candidates.map((candidate: any) => {
  const feature = byOrdinal.get(candidate.candidateOrdinal) as any;
  return {
    packet_key: candidate.packetKey,
    authority_norm: feature?.pagerankMax,
    source_revision_match: candidate.sourceRevision ? 1 : undefined,
    representation_revision_match: candidate.semanticRevision ? 1 : undefined,
  };
});

const matrix = buildCandidateFeatureMatrix(projections);
const authorityIndex = 4;
const authorityPresent = Array.from(matrix.presence_mask).filter((_, index) => index % matrix.feature_count === authorityIndex && matrix.presence_mask[index] === 1).length;
const report = {
  schema: 'atlas.current-graph-feature-matrix-v1',
  mode: 'NON_PRODUCTION_DERIVED_FEATURE_ARTIFACT',
  graphRevision: graph.graphRevision,
  featureRevision: graph.featureRevision,
  workspaceRevision: graph.workspaceRevision,
  candidateSnapshotRevision: graph.candidateSnapshotRevision,
  ordinalMapChecksum: graph.ordinalMapChecksum,
  candidateCount: matrix.candidate_count,
  featureCount: matrix.feature_count,
  matrixShape: [matrix.candidate_count, matrix.feature_count],
  authorityNormPresentCount: authorityPresent,
  graphFeaturePresenceReason: 'CURRENT_GRAPH_ARTIFACT_AVAILABLE_FOR_BOUNDED_CODE_COHORT',
  unavailableFeaturesRemainMasked: true,
  writesPerformed: false,
  canonicalAuthority: false,
  status: 'CURRENT_GRAPH_FEATURE_MATRIX_PROVEN_BOUNDED',
  nextGate: 'GOLDEN_RETRIEVAL_FEATURE_JOIN_AND_REPLAY',
};
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, matrixShape: report.matrixShape, authorityNormPresentCount: authorityPresent, reportPath: 'docs/reports/current-graph-feature-matrix-v1.json' }, null, 2));
