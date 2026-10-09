import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  candidateOrdinalMapChecksum,
  materializeCandidateOrdinalMap,
} from '../../sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.js';
import { CANDIDATE_FEATURE_NAMES } from '../../sveltekit-frontend/src/lib/server/atlas/contracts/feature-extraction-v1.js';
import {
  adaptProfilesToCandidateFeatureMatrixV1,
  type CandidateFeatureIdentityV1,
} from '../../sveltekit-frontend/src/lib/server/retrieval/candidate-feature-matrix-adapter-v1.js';
import type { ChunkRetrievalProfileV1 } from '../../sveltekit-frontend/src/lib/server/retrieval/chunk-retrieval-profile-v1.js';

const root = process.cwd();
const workspaceRevision = 'sha256:fixture-workspace-row-crosswalk-v1';
const candidateSnapshotRevision = 'sha256:fixture-candidate-snapshot-row-crosswalk-v1';

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;
}

function fixtureProfile(packetKey: string): ChunkRetrievalProfileV1 {
  return {
    canonicalChunkId: `chunk:${packetKey}`,
    packetKey,
    repositoryId: 'repo:root',
    repositoryRelativePath: `src/${packetKey}.ts`,
    sourceRef: `src/${packetKey}.ts`,
    workspaceRevision,
    sourceRevision: `sha256:source-${packetKey}`,
    keywords: ['row-crosswalk'],
    identifiers: [packetKey],
    nouns: [],
    astPath: [],
    calls: [],
    imports: [],
    exports: [],
    semanticTags: ['fixture'],
    embeddingRepresentation: 'semantic_768',
    primaryDomain: 'retrieval',
    domainConfidence: 1,
    topicIds: [],
    conceptIds: [],
    entityIds: [],
    ontologyTupleIds: [],
    featureRevision: 'fixture-profile-v1',
  };
}

const profiles = [fixtureProfile('packet-a'), fixtureProfile('packet-b')];
const ordinalMap = materializeCandidateOrdinalMap({
  candidateSnapshotRevision,
  workspaceRevision,
  producerRevision: 'fixture-row-crosswalk-v1',
  candidates: profiles.map((profile) => ({
    canonicalId: `canonical:${profile.packetKey}`,
    packetKey: profile.packetKey,
    sourceRef: profile.sourceRef,
    treeNodeId: null,
    symbolVersionId: null,
    workspaceRevision,
    sourceRevision: profile.sourceRevision,
    graphRevision: null,
    semanticRevision: null,
    degradedIdentity: false,
    evidenceRefs: [],
    representationBindings: [],
  })),
});

const result = adaptProfilesToCandidateFeatureMatrixV1({
  profiles: [...profiles].reverse(),
  ordinalMap,
  executorProvenance: [{ executor: 'fixture-profile', executorRevision: 'fixture-profile-v1' }],
});
const matrixFeatureBytes = Buffer.from(
  result.matrix.candidate_features.buffer,
  result.matrix.candidate_features.byteOffset,
  result.matrix.candidate_features.byteLength,
);
const matrixPresenceBytes = Buffer.from(
  result.matrix.presence_mask.buffer,
  result.matrix.presence_mask.byteOffset,
  result.matrix.presence_mask.byteLength,
);
const producerFiles = [
  'scripts/atlas/prove-candidate-feature-matrix-row-crosswalk-v1.mts',
  'sveltekit-frontend/src/lib/server/retrieval/candidate-feature-matrix-adapter-v1.ts',
];
const producerRevision = `sha256:${createHash('sha256')
  .update(Buffer.concat(await Promise.all(producerFiles.map((file) => readFile(resolve(root, file))))))
  .digest('hex')}`;

const proofBody = {
  schema: 'atlas.candidate-feature-matrix-row-crosswalk-proof.v1',
  status: 'FIXTURE_PROVEN',
  workspaceRevision,
  candidateSnapshotRevision,
  ordinalMap,
  ordinalMapChecksum: result.ordinalMapChecksum,
  ordinalMapRevision: result.ordinalMapRevision,
  featureVocabulary: CANDIDATE_FEATURE_NAMES,
  featureVocabularyChecksum: sha256(CANDIDATE_FEATURE_NAMES),
  rowBindingChecksum: result.rowBindingChecksum,
  matrixReceipt: result.receipt,
  identities: result.identities,
  rowCount: result.matrix.candidate_count,
  columnCount: result.matrix.feature_count,
  candidatePacketKeys: result.matrix.candidate_packet_keys,
  matrixFeatureBytesF32LE: matrixFeatureBytes.toString('base64'),
  matrixPresenceBytesU8: matrixPresenceBytes.toString('base64'),
  matrixChecksum: result.matrixChecksum,
  identityChecksum: result.identityChecksum,
  producerRevision,
  canonicalAuthority: false,
  canonicalWritesPerformed: false,
  rankingPromotion: false,
};
const receipt = { ...proofBody, receiptChecksum: sha256(proofBody) };
const receiptPath = resolve(root, '.tmp/atlas/candidate-feature-matrix-row-crosswalk-fixture-v1.json');
await mkdir(resolve(root, '.tmp/atlas'), { recursive: true });
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');

const readback = JSON.parse(await readFile(receiptPath, 'utf8')) as typeof receipt;
const readbackOrdinalMapChecksum = candidateOrdinalMapChecksum({
  candidateSnapshotRevision: readback.ordinalMap.candidateSnapshotRevision,
  workspaceRevision: readback.ordinalMap.workspaceRevision,
  candidates: readback.ordinalMap.candidates,
});
const readbackRows = readback.identities as CandidateFeatureIdentityV1[];
const readbackRowBindingChecksum = sha256({
  schema: 'atlas.candidate-matrix-row-crosswalk.v1',
  ordinalMapRevision: readback.ordinalMapRevision,
  workspaceRevision: readback.workspaceRevision,
  rows: readbackRows.map(({ candidateOrdinal, rowOrdinal, canonicalId, packetKey, symbolVersionId, sourceRef, sourceRevision }) => ({
    candidateOrdinal,
    rowOrdinal,
    canonicalId,
    packetKey,
    symbolVersionId,
    sourceRef,
    sourceRevision,
  })),
});
const featureBytes = Buffer.from(readback.matrixFeatureBytesF32LE, 'base64');
const presenceBytes = Buffer.from(readback.matrixPresenceBytesU8, 'base64');
if (featureBytes.byteLength !== readback.rowCount * readback.columnCount * Float32Array.BYTES_PER_ELEMENT ||
    presenceBytes.byteLength !== readback.rowCount * readback.columnCount) {
  throw new Error('CANDIDATE_MATRIX_READBACK_BYTE_LENGTH_MISMATCH');
}
const featureValues = Array.from({ length: featureBytes.byteLength / Float32Array.BYTES_PER_ELEMENT }, (_, index) =>
  featureBytes.readFloatLE(index * Float32Array.BYTES_PER_ELEMENT));
const readbackMatrixChecksum = sha256({
  candidatePacketKeys: readback.candidatePacketKeys,
  candidateFeatures: featureValues,
  presenceMask: Array.from(presenceBytes),
  featureCount: readback.columnCount,
});
const readbackMatrixReceipt = readback.matrixReceipt;
const matrixReceiptBody = Object.fromEntries(
  Object.entries(readbackMatrixReceipt).filter(([key]) => key !== 'receiptChecksum'),
);
const readbackMatrixReceiptChecksum = sha256(matrixReceiptBody);
const expectedMatrixRevision = sha256({
  featureVocabularyChecksum: readbackMatrixReceipt.featureVocabularyChecksum,
  rowBindingChecksum: readbackMatrixReceipt.rowBindingChecksum,
  workspaceRevision: readbackMatrixReceipt.workspaceRevision,
  graphRevision: null,
  graphUnavailableReason: readbackMatrixReceipt.graphUnavailableReason,
  representationRevision: null,
  representationUnavailableReason: readbackMatrixReceipt.representationUnavailableReason,
});
const readbackAvailableFeatureCount = Array.from(presenceBytes).reduce((sum, value) => sum + value, 0);
const receiptChecksum = sha256(Object.fromEntries(
  Object.entries(readback).filter(([key]) => key !== 'receiptChecksum'),
));
const mapRowsMatch = readbackRows.every((row, index) => {
  const candidate = readback.ordinalMap.candidates[index];
  return row.candidateOrdinal === index && row.rowOrdinal === index &&
    candidate?.candidateOrdinal === row.candidateOrdinal && candidate.canonicalId === row.canonicalId &&
    candidate.packetKey === row.packetKey && candidate.sourceRef === row.sourceRef &&
    candidate.sourceRevision === row.sourceRevision && candidate.workspaceRevision === row.workspaceRevision;
});

if (readbackOrdinalMapChecksum !== readback.ordinalMapChecksum ||
    readbackRowBindingChecksum !== readback.rowBindingChecksum ||
    readbackMatrixChecksum !== readback.matrixChecksum ||
    readbackMatrixReceiptChecksum !== readbackMatrixReceipt.receiptChecksum ||
    readbackMatrixReceipt.matrixChecksum !== readbackMatrixChecksum ||
    readbackMatrixReceipt.rowBindingChecksum !== readbackRowBindingChecksum ||
    readbackMatrixReceipt.candidateOrdinalMapChecksum !== readback.ordinalMapChecksum ||
    readbackMatrixReceipt.candidateOrdinalMapRevision !== readback.ordinalMapRevision ||
    readbackMatrixReceipt.featureVocabularyChecksum !== sha256(readback.featureVocabulary) ||
    readbackMatrixReceipt.matrixRevision !== expectedMatrixRevision ||
    readbackMatrixReceipt.rowCount !== readback.rowCount || readbackMatrixReceipt.columnCount !== readback.columnCount ||
    readbackMatrixReceipt.availableFeatureCount !== readbackAvailableFeatureCount ||
    readbackMatrixReceipt.unavailableFeatureCount !== readback.rowCount * readback.columnCount - readbackAvailableFeatureCount ||
    readbackMatrixReceipt.graphRevision !== null ||
    readbackMatrixReceipt.representationRevision !== null ||
    receiptChecksum !== readback.receiptChecksum ||
    readbackRows.length !== readback.rowCount || readback.featureVocabulary.length !== readback.columnCount ||
    new Set(readbackRows.map((row) => row.candidateOrdinal)).size !== readback.rowCount ||
    new Set(readbackRows.map((row) => row.rowOrdinal)).size !== readback.rowCount ||
    new Set(readbackRows.map((row) => row.canonicalId)).size !== readback.rowCount || !mapRowsMatch ||
    readback.canonicalAuthority !== false || readback.canonicalWritesPerformed !== false ||
    readback.rankingPromotion !== false) {
  throw new Error('CANDIDATE_FEATURE_MATRIX_ROW_CROSSWALK_READBACK_MISMATCH');
}

console.log(JSON.stringify({
  status: readback.status,
  rowCount: readback.rowCount,
  columnCount: readback.columnCount,
  rowOrdinalsMatchCandidateOrdinals: true,
  rowBindingChecksum: readback.rowBindingChecksum,
  matrixChecksum: readback.matrixChecksum,
  ordinalMapChecksum: readback.ordinalMapChecksum,
  readback: 'MATCH',
  canonicalAuthority: false,
  canonicalWritesPerformed: false,
  rankingPromotion: false,
  receiptPath: '.tmp/atlas/candidate-feature-matrix-row-crosswalk-fixture-v1.json',
  receiptChecksum: readback.receiptChecksum,
}, null, 2));
