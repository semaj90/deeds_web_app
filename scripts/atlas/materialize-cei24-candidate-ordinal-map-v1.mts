#!/usr/bin/env tsx

/**
 * CEI-24A/B: converge the sealed CEI-23 packet cohort through the existing
 * CanonicalCandidateV1 / CandidateOrdinalMapV1 owner. Artifact-only; no DB or
 * projection access. Packet identity remains distinct from chunk identity.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertCandidateOrdinalMapIntegrityV1,
  candidateOrdinalMapV1Schema,
  materializeCandidateOrdinalMap,
} from '../../sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.ts';
import {
  candidateFeatureSnapshotV1Schema,
  materializeCandidateFeatureSnapshot,
} from '../../sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-snapshot-v1.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const matrixReportArgIndex = process.argv.indexOf('--matrix-report');
const matrixReportInline = process.argv.find((arg) => arg.startsWith('--matrix-report='))?.slice('--matrix-report='.length);
const MATRIX_REPORT = matrixReportInline ?? (matrixReportArgIndex >= 0 ? process.argv[matrixReportArgIndex + 1] : null);
if (!MATRIX_REPORT || path.isAbsolute(MATRIX_REPORT)
  || !MATRIX_REPORT.replaceAll('\\', '/').startsWith('docs/reports/candidate-feature-matrix-draft-v1-')
  || !MATRIX_REPORT.endsWith('.json')) throw new Error('EXPLICIT_CANDIDATE_FEATURE_MATRIX_REPORT_REQUIRED');
const EXPECTED_ROWS = 16_151;
const PRODUCER_REVISION = 'cei24-packet-candidate-ordinal-map:v1';
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
};

const reportBytes = await readFile(path.join(ROOT, MATRIX_REPORT));
const report = JSON.parse(reportBytes.toString('utf8'));
const artifactDir = path.resolve(ROOT, report.outDir);
const descriptorBytes = await readFile(path.join(artifactDir, 'descriptor.json'));
const descriptor = JSON.parse(descriptorBytes.toString('utf8'));
const mapBytes = await readFile(path.join(artifactDir, 'candidate-ordinal-map.ndjson'));
const rows = mapBytes.toString('utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const mapDigest = `sha256:${sha256(mapBytes)}`;
const expectedMapDigest = `sha256:${report.files['candidate-ordinal-map.ndjson'].sha256}`;
if (report.schema !== 'atlas.candidate-feature-matrix-draft.v1' || report.canonical !== false
  || rows.length !== EXPECTED_ROWS || report.candidates !== EXPECTED_ROWS
  || descriptor.candidates !== EXPECTED_ROWS || mapDigest !== expectedMapDigest
  || report.ordinalMapChecksum !== descriptor.ordinalMapChecksum) {
  throw new Error(`CEI24_INPUT_ARTIFACT_INTEGRITY_OR_COHORT_MISMATCH:${JSON.stringify({ schema: report.schema, canonical: report.canonical, rows: rows.length, reportCandidates: report.candidates, descriptorCandidates: descriptor.candidates, mapDigest, expectedMapDigest, reportOrdinalChecksum: report.ordinalMapChecksum, descriptorOrdinalChecksum: descriptor.ordinalMapChecksum, artifactDir })}`);
}

const workspaceRevisions = new Set(rows.map((row) => row.workspaceRevision));
const packetKeys = new Set(rows.map((row) => row.packetKey));
const sourceRefs = new Set(rows.map((row) => row.sourceRef));
if (workspaceRevisions.size !== 1 || rows.some((row, ordinal) => row.candidateOrdinal !== ordinal
  || typeof row.packetKey !== 'string' || row.packetKey.length === 0
  || typeof row.sourceRef !== 'string' || row.sourceRef.length === 0
  || !/^sha256:[a-f0-9]{64}$/i.test(row.sourceRevision)
  || !/^sha256:[a-f0-9]{64}$/i.test(row.workspaceRevision))
  || packetKeys.size !== EXPECTED_ROWS || sourceRefs.size !== EXPECTED_ROWS) {
  throw new Error('CEI24_PACKET_CANDIDATE_COORDINATE_CENSUS_FAILED');
}

// Existing canonical identity semantics explicitly resolve packet_key as a
// canonical packet ID. Do not reinterpret it as canonicalChunkId.
const identityRows = rows.map((row) => ({
  canonicalId: row.packetKey,
  packetKey: row.packetKey,
  sourceRef: row.sourceRef,
  treeNodeId: null,
  symbolVersionId: null,
  workspaceRevision: row.workspaceRevision,
  sourceRevision: row.sourceRevision,
  graphRevision: null,
  semanticRevision: null,
  degradedIdentity: false,
  evidenceRefs: [
    `candidate-feature-matrix:${MATRIX_REPORT}:${mapDigest}`,
    `atlas_packets:${row.packetKey}`,
    `atlas_workspace_source_bindings:${row.sourceRef}:${row.sourceRevision}:${row.workspaceRevision}`,
  ],
  representationBindings: [],
}));
if (new Set(identityRows.map((row) => row.canonicalId)).size !== EXPECTED_ROWS) {
  throw new Error('CEI24_CANONICAL_PACKET_ID_NOT_UNIQUE');
}

const orderedIdentityRows = [...identityRows].sort((a, b) => Buffer.compare(Buffer.from(a.canonicalId), Buffer.from(b.canonicalId)));
const snapshotPayload = {
  schema: 'atlas.cei24-candidate-snapshot-input.v1',
  sourceMatrixReport: MATRIX_REPORT,
  sourceMatrixReportSha256: `sha256:${sha256(reportBytes)}`,
  sourceOrdinalArtifactSha256: mapDigest,
  workspaceRevision: [...workspaceRevisions][0],
  candidates: orderedIdentityRows.map(({ canonicalId, packetKey, sourceRef, sourceRevision, workspaceRevision }) => ({
    canonicalId, packetKey, sourceRef, sourceRevision, workspaceRevision,
  })),
};
const candidateSnapshotRevision = `sha256:${sha256(canonicalJson(snapshotPayload))}`;
const ordinalMap = materializeCandidateOrdinalMap({
  candidates: identityRows,
  candidateSnapshotRevision,
  workspaceRevision: [...workspaceRevisions][0],
  producerRevision: PRODUCER_REVISION,
});
const parsedMap = candidateOrdinalMapV1Schema.parse(ordinalMap);
assertCandidateOrdinalMapIntegrityV1(parsedMap);
const rowByPacket = new Map(rows.map((row) => [row.packetKey, row]));
if (parsedMap.rowCount !== EXPECTED_ROWS
  || new Set(parsedMap.candidates.map((candidate) => candidate.canonicalId)).size !== EXPECTED_ROWS
  || parsedMap.candidates.some((candidate, i) => candidate.candidateOrdinal !== i
    || candidate.candidateSnapshotRevision !== candidateSnapshotRevision
    || candidate.canonicalId !== candidate.packetKey)) {
  throw new Error('CEI24_CANONICAL_ORDINAL_MAP_PROOF_FAILED');
}
const featureRevision = `sha256:${sha256(canonicalJson({
  schema: 'atlas.cei24-identity-coordinate-feature-plane.v1',
  candidateSnapshotRevision,
  ordinalMapChecksum: parsedMap.ordinalMapChecksum,
  featureAvailability: 'ALL_UNAVAILABLE_NO_FEATURE_LANES_ADMITTED',
}))}`;
const featureSnapshot = candidateFeatureSnapshotV1Schema.parse(materializeCandidateFeatureSnapshot({
  ordinalMap: parsedMap,
  featureRevision,
  producerRevision: 'cei24-candidate-feature-snapshot-coordinate-bridge:v1',
  rows: parsedMap.candidates.map((candidate) => ({
    schema: 'atlas.candidate-feature-row.v1' as const,
    candidateOrdinal: candidate.candidateOrdinal,
    canonicalId: candidate.canonicalId,
    packetKey: candidate.packetKey,
    sourceRef: candidate.sourceRef,
    treeNodeId: candidate.treeNodeId,
    symbolVersionId: candidate.symbolVersionId,
    workspaceRevision: candidate.workspaceRevision,
    sourceRevision: candidate.sourceRevision,
    graphRevision: null,
    semanticRevision: null,
    featureRevision,
    representationBindings: [],
    semanticRelevance: null,
    lexicalRelevance: null,
    astAffinity: null,
    graphAuthority: null,
    personalizedPageRank: null,
    communityAffinity: null,
    manifold4OrientationSimilarity: null,
    crossEncoderRawScore: null,
    crossEncoderCalibratedScore: null,
    crossEncoderAvailable: false,
    domainAffinity: null,
    executionUtility: null,
    memoryUtility: null,
    laneMask: [],
    degradedIdentity: false,
    evidenceRefs: candidate.evidenceRefs,
  })),
}));
if (featureSnapshot.rowCount !== EXPECTED_ROWS || featureSnapshot.rows.some((row, i) => {
  const candidate = parsedMap.candidates[i];
  return row.candidateOrdinal !== candidate.candidateOrdinal
    || row.canonicalId !== candidate.canonicalId
    || row.packetKey !== candidate.packetKey
    || row.sourceRef !== candidate.sourceRef
    || row.sourceRevision !== candidate.sourceRevision
    || row.workspaceRevision !== candidate.workspaceRevision;
})) throw new Error('CEI24_FEATURE_SNAPSHOT_IDENTITY_READBACK_FAILED');

const timestamp = new Date().toISOString().replaceAll(':', '').replaceAll('-', '');
const outputDir = `.tmp/atlas/cei24-candidate-ordinal-map-v1/${timestamp}`;
const absoluteOutputDir = path.join(ROOT, outputDir);
await mkdir(absoluteOutputDir, { recursive: true });
const mapPath = path.join(absoluteOutputDir, 'candidate-ordinal-map-v1.json');
const mapBody = `${JSON.stringify(parsedMap, null, 2)}\n`;
await writeFile(mapPath, mapBody, { flag: 'wx' });
const featureSnapshotPath = path.join(absoluteOutputDir, 'candidate-feature-snapshot-v1.json');
const featureSnapshotBody = `${JSON.stringify(featureSnapshot, null, 2)}\n`;
await writeFile(featureSnapshotPath, featureSnapshotBody, { flag: 'wx' });
const summary = {
  schema: 'atlas.cei24-candidate-snapshot-convergence-receipt.v1',
  status: 'PACKET_CANDIDATE_ORDINAL_MAP_PROVEN_CHUNK_CROSSWALK_PENDING',
  generatedAt: new Date().toISOString(),
  inputs: {
    matrixReport: MATRIX_REPORT,
    matrixReportSha256: snapshotPayload.sourceMatrixReportSha256,
    matrixOrdinalArtifactSha256: mapDigest,
    matrixOrdinalMapChecksum: report.ordinalMapChecksum,
  },
  owner: {
    candidateSchema: 'atlas.canonical-candidate.v1',
    mapSchema: parsedMap.schema,
    identityResolution: 'packet_key -> canonicalId (packet identity only)',
    materializer: 'canonical-candidate-v1.ts:materializeCandidateOrdinalMap',
    producerRevision: PRODUCER_REVISION,
  },
  candidateSnapshotRevision,
  ordinalMapChecksum: parsedMap.ordinalMapChecksum,
  featureRevision,
  featureSnapshotChecksum: featureSnapshot.snapshotChecksum,
  counts: {
    inputCeiRows: rows.length,
    canonicalPacketCandidates: parsedMap.rowCount,
    uniqueCanonicalId: new Set(parsedMap.candidates.map((candidate) => candidate.canonicalId)).size,
    exactPacketKey: parsedMap.candidates.filter((candidate) => candidate.canonicalId === candidate.packetKey).length,
    exactSourceRef: parsedMap.candidates.filter((candidate) => {
      const row = rowByPacket.get(candidate.packetKey!);
      return row?.sourceRef === candidate.sourceRef;
    }).length,
    exactSourceRevision: parsedMap.candidates.filter((candidate) => {
      const row = rowByPacket.get(candidate.packetKey!);
      return row?.sourceRevision === candidate.sourceRevision;
    }).length,
    exactWorkspaceRevision: parsedMap.candidates.filter((candidate) => candidate.workspaceRevision === snapshotPayload.workspaceRevision).length,
    denseOrdinals: parsedMap.candidates.every((candidate, i) => candidate.candidateOrdinal === i),
    chunkIdentitiesIncluded: 0,
    semanticRepresentationBindings: 0,
    featureSnapshotRows: featureSnapshot.rowCount,
    admittedFeatureLanes: 0,
  },
  mapArtifact: { path: `${outputDir}/candidate-ordinal-map-v1.json`, rows: parsedMap.rowCount, sha256: `sha256:${sha256(mapBody)}` },
  featureSnapshotArtifact: { path: `${outputDir}/candidate-feature-snapshot-v1.json`, rows: featureSnapshot.rowCount, sha256: `sha256:${sha256(featureSnapshotBody)}`, unavailableFeatureRows: featureSnapshot.rowCount },
  authority: { identityAuthority: false, canonicalAuthority: false, databaseWrites: 0, qdrantWrites: 0, valkeyWrites: 0, rabbitmqPublishes: 0, graphifyRuns: 0 },
  nextGate: 'SUMMARY-HINT-XWALK-01: exact packet -> PROVEN atlas_packet_chunk_lineage -> exact current chunk HINT; preserve 0..N multiplicity per CandidateOrdinal.',
};
const receiptBody = `${JSON.stringify(summary, null, 2)}\n`;
await writeFile(path.join(absoluteOutputDir, 'receipt.json'), receiptBody, { flag: 'wx' });
const reportPath = `docs/reports/cei24-candidate-snapshot-convergence-v1-${timestamp}.json`;
await writeFile(path.join(ROOT, reportPath), receiptBody, { flag: 'wx' });
console.log(JSON.stringify({ status: summary.status, candidateSnapshotRevision, ordinalMapChecksum: parsedMap.ordinalMapChecksum, counts: summary.counts, outputDir, reportPath }, null, 2));
