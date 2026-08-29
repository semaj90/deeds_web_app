#!/usr/bin/env node

/** Read-only CandidateOrdinal ↔ executor-local graph/GPU ABI proof. */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const matrixPath = path.resolve(process.env.ATLAS_MATRIX_MANIFEST ?? path.join(root, 'docs/reports/current-candidate-feature-matrix-manifest-v1.json'));
const roundTripPath = path.resolve(process.env.ATLAS_GRAPH_ORDINAL_ROUNDTRIP ?? path.join(root, 'docs/reports/current-graph-candidate-ordinal-roundtrip-v1.json'));
const reportPath = path.resolve(process.env.ATLAS_GPU_ABI_REPORT ?? path.join(root, 'docs/reports/candidate-ordinal-gpu-abi-v1.json'));

function digest(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

async function main() {
  const matrix = JSON.parse(await fs.readFile(matrixPath, 'utf8'));
  const roundTrip = JSON.parse(await fs.readFile(roundTripPath, 'utf8'));
  const rows = matrix.graphManifest?.rows ?? [];
  const nodes = roundTrip.bindings ?? roundTrip.nodes ?? [];
  const expectedOrdinals = rows.map((row) => row.candidateOrdinal);
  const rowByOrdinal = new Map(rows.map((row) => [row.candidateOrdinal, row]));
  const unknownOrdinals = nodes.filter((node) => !rowByOrdinal.has(node.candidateOrdinal));
  const revisionMismatches = nodes.filter((node) => node.workspaceRevision !== matrix.graphManifest?.rows?.[0]?.workspaceRevision || node.candidateSnapshotRevision !== matrix.graphManifest?.candidateSnapshotRevision);
  const graphOrdinals = nodes.map((node) => node.graphOrdinal);
  const denseGraphOrdinals = graphOrdinals.length === new Set(graphOrdinals).size && graphOrdinals.every((value, index) => value === index);
  const decoded = nodes.map((node) => ({ graphOrdinal: node.graphOrdinal, candidateOrdinal: node.candidateOrdinal, packetKey: node.packetKey, matrixRow: rowByOrdinal.get(node.candidateOrdinal)?.matrixRow ?? null }));
  const report = {
    schema: 'atlas.candidate-ordinal-gpu-abi-proof.v1',
    mode: 'READ_ONLY_EXECUTOR_COORDINATE_ROUND_TRIP',
    candidateSnapshotRevision: matrix.graphManifest?.candidateSnapshotRevision ?? null,
    ordinalMapChecksum: matrix.graphManifest?.ordinalMapChecksum ?? null,
    graphRevision: roundTrip.graphRevision ?? null,
    workspaceRevision: roundTrip.workspaceRevision ?? null,
    matrix: { rowCount: rows.length, featureCount: matrix.graphManifest?.featureCount ?? null, manifestChecksum: matrix.graphManifest?.manifestChecksum ?? null, ordinalsUnique: new Set(expectedOrdinals).size === expectedOrdinals.length },
    executor: { graphNodeCount: nodes.length, graphOrdinalDense: denseGraphOrdinals, renumbering: roundTrip.renumbering ?? false, unknownOrdinals: unknownOrdinals.length, revisionMismatches: revisionMismatches.length },
    decodedRows: decoded,
    checksums: { candidateOrdinalSet: digest(expectedOrdinals), decodedCoordinateSet: digest(decoded.map((row) => [row.graphOrdinal, row.candidateOrdinal, row.packetKey])) },
    featureRowsRemainRevisionBound: rows.every((row) => row.candidateSnapshotRevision === undefined || row.candidateSnapshotRevision === matrix.graphManifest?.candidateSnapshotRevision),
    gpuExecutionObserved: false,
    rankingPromotion: false,
    canonicalAuthority: false,
    writesPerformed: false,
    status: nodes.length > 0 && unknownOrdinals.length === 0 && revisionMismatches.length === 0 && denseGraphOrdinals && new Set(expectedOrdinals).size === expectedOrdinals.length ? 'CANDIDATE_ORDINAL_GPU_ABI_FIXTURE_PROVEN' : 'CANDIDATE_ORDINAL_GPU_ABI_BLOCKED',
    nextGate: 'LIVE_8098_CANDIDATE_ORDINAL_DECODE_AND_CUVS_EXACT_PARITY',
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, matrixRows: rows.length, graphNodes: nodes.length, unknownOrdinals: unknownOrdinals.length, revisionMismatches: revisionMismatches.length, reportPath }, null, 2));
  if (report.status !== 'CANDIDATE_ORDINAL_GPU_ABI_FIXTURE_PROVEN') process.exitCode = 1;
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
