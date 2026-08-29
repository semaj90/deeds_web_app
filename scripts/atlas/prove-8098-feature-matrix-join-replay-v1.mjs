/** Read-only join/replay proof for 8098 graph features and the 15-row matrix. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const matrixPath = resolve(root, 'docs/reports/current-candidate-feature-matrix-manifest-v1.json');
const artifactManifestPath = resolve(root, 'docs/reports/embedding-tile-artifacts/embedding-tiles-v1.manifest.json');
const reportPath = resolve(root, 'docs/reports/8098-feature-matrix-join-replay-v1.json');
const baseUrl = process.env.ATLAS_GPU_8098_URL ?? 'http://127.0.0.1:8098';
const request = { artifactPath: 'docs/reports/embedding-tile-artifacts/embedding-tiles-v1.arrow', featurePath: 'docs/reports/current-graph-feature-gather-v1.json' };

const stable = (value) => JSON.stringify(value, Object.keys(value).sort());
const report = { schema: 'atlas.8098-feature-matrix-join-replay.v1', readOnly: true, status: 'BLOCKED', checks: {}, errors: [] };
try {
  const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'));
  const artifactManifest = JSON.parse(readFileSync(artifactManifestPath, 'utf8'));
  if (matrix.status !== 'GRAPH_FEATURE_MATRIX_REPLAY_PROVEN') throw new Error(`MATRIX_NOT_PROVEN:${matrix.status}`);
  const call = async () => { const response = await fetch(`${baseUrl}/v1/tile-artifact/enrich`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) }); if (!response.ok) throw new Error(`ENRICH_HTTP_${response.status}:${await response.text()}`); return response.json(); };
  const [first, second] = await Promise.all([call(), call()]);
  const expectedOrdinals = matrix.baselineManifest.rows.map((row) => row.candidateOrdinal).sort((a, b) => a - b);
  const expectedPresent = matrix.identity.graphPresentOrdinals.slice().sort((a, b) => a - b);
  const expectedAbsent = matrix.identity.graphAbsentOrdinals.slice().sort((a, b) => a - b);
  const actualOrdinals = first.rows.map((row) => row.candidateOrdinal).sort((a, b) => a - b);
  const actualPresent = first.rows.filter((row) => row.graphFeaturePresent).map((row) => row.candidateOrdinal).sort((a, b) => a - b);
  const actualAbsent = first.rows.filter((row) => !row.graphFeaturePresent).map((row) => row.candidateOrdinal).sort((a, b) => a - b);
  report.checks = {
    matrixManifestProven: true,
    artifactSnapshotMatch: artifactManifest.candidateSnapshotRevision === matrix.candidateSnapshotRevision,
    artifactOrdinalMapMatch: artifactManifest.ordinalMapChecksum === matrix.ordinalMapChecksum,
    candidateCount: first.candidateCount === 15,
    ordinalJoinExact: stable(actualOrdinals) === stable(expectedOrdinals),
    graphPresentMaskExact: stable(actualPresent) === stable(expectedPresent),
    graphAbsentMaskExact: stable(actualAbsent) === stable(expectedAbsent),
    replayIdentical: stable(first) === stable(second),
    rankingPromotion: first.rankingPromotion === false,
    logicalLaneVote: first.logicalLaneVote === 'NONE',
    canonicalAuthority: first.canonicalAuthority === false,
    noWrites: Object.values(first.writes ?? {}).every((value) => value === false),
  };
  if (!Object.values(report.checks).every(Boolean)) throw new Error('FEATURE_MATRIX_JOIN_REPLAY_CHECK_FAILED');
  report.result = { candidateCount: first.candidateCount, graphFeaturePresentCount: first.graphFeaturePresentCount, graphFeatureAbsentCount: first.graphFeatureAbsentCount, graphRevision: first.graphRevision, featureRevision: first.featureRevision };
  report.status = '8098_FEATURE_MATRIX_JOIN_REPLAY_PROVEN';
} catch (error) { report.errors.push(String(error?.message ?? error)); }
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, checks: report.checks, result: report.result, errors: report.errors, reportPath }, null, 2));
if (report.status === 'BLOCKED') process.exitCode = 1;
