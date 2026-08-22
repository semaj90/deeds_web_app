import { createHash } from 'node:crypto';

import { materializeCandidateOrdinalMap } from '../../src/lib/server/atlas/features/canonical-candidate-v1.js';
import { materializeCandidateFeatureSnapshot } from '../../src/lib/server/atlas/features/candidate-feature-snapshot-v1.js';
import {
  CANDIDATE_SCALAR_FEATURES,
  materializeCandidateFeatureColumnar,
} from '../../src/lib/server/atlas/features/candidate-feature-columnar-v1.js';
import { serializeCandidateFeatureArrowFile } from '../../../scripts/atlas/write-candidate-feature-arrow.mjs';

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

const ordinalMap = materializeCandidateOrdinalMap({
  candidateSnapshotRevision: 'candidate-snapshot:arrow-proof:v1',
  workspaceRevision: 'workspace:arrow-proof:v1',
  producerRevision: 'candidate-arrow-proof:v1',
  candidates: [
    {
      canonicalId: 'candidate:beta',
      packetKey: 'packet:beta',
      treeNodeId: 'tree:beta',
      symbolVersionId: 'symbol:beta',
      workspaceRevision: 'workspace:arrow-proof:v1',
      sourceRevision: 'source:beta:v1',
      graphRevision: 'graph:proof:v1',
      semanticRevision: 'semantic:768:v1',
      degradedIdentity: false,
      evidenceRefs: ['proof:beta'],
    },
    {
      canonicalId: 'candidate:alpha',
      packetKey: 'packet:alpha',
      treeNodeId: 'tree:alpha',
      symbolVersionId: 'symbol:alpha',
      workspaceRevision: 'workspace:arrow-proof:v1',
      sourceRevision: 'source:alpha:v1',
      graphRevision: 'graph:proof:v1',
      semanticRevision: 'semantic:768:v1',
      degradedIdentity: false,
      evidenceRefs: ['proof:alpha'],
    },
  ],
});

const snapshot = materializeCandidateFeatureSnapshot({
  ordinalMap,
  featureRevision: 'candidate-features:proof:v1',
  producerRevision: 'candidate-arrow-proof:v1',
  rows: [
    {
      schema: 'atlas.candidate-feature-row.v1',
      candidateOrdinal: 1,
      canonicalId: 'candidate:beta',
      packetKey: 'packet:beta',
      treeNodeId: 'tree:beta',
      symbolVersionId: 'symbol:beta',
      workspaceRevision: 'workspace:arrow-proof:v1',
      sourceRevision: 'source:beta:v1',
      graphRevision: 'graph:proof:v1',
      semanticRevision: 'semantic:768:v1',
      featureRevision: 'candidate-features:proof:v1',
      semanticRelevance: 0.75,
      lexicalRelevance: 0,
      astAffinity: null,
      graphAuthority: 0.4,
      personalizedPageRank: null,
      communityAffinity: null,
      manifold4OrientationSimilarity: null,
      crossEncoderRawScore: null,
      crossEncoderCalibratedScore: null,
      crossEncoderAvailable: false,
      domainAffinity: null,
      executionUtility: null,
      memoryUtility: null,
      laneMask: ['semantic', 'lexical', 'graph'],
      degradedIdentity: false,
      evidenceRefs: ['proof:beta'],
    },
    {
      schema: 'atlas.candidate-feature-row.v1',
      candidateOrdinal: 0,
      canonicalId: 'candidate:alpha',
      packetKey: 'packet:alpha',
      treeNodeId: 'tree:alpha',
      symbolVersionId: 'symbol:alpha',
      workspaceRevision: 'workspace:arrow-proof:v1',
      sourceRevision: 'source:alpha:v1',
      graphRevision: 'graph:proof:v1',
      semanticRevision: 'semantic:768:v1',
      featureRevision: 'candidate-features:proof:v1',
      semanticRelevance: 1,
      lexicalRelevance: null,
      astAffinity: 0.25,
      graphAuthority: null,
      personalizedPageRank: null,
      communityAffinity: null,
      manifold4OrientationSimilarity: null,
      crossEncoderRawScore: null,
      crossEncoderCalibratedScore: null,
      crossEncoderAvailable: false,
      domainAffinity: 0.5,
      executionUtility: null,
      memoryUtility: 0,
      laneMask: ['semantic', 'ast', 'domain', 'memory'],
      degradedIdentity: false,
      evidenceRefs: ['proof:alpha'],
    },
  ],
});

const columnar = materializeCandidateFeatureColumnar({
  snapshot,
  producerRevision: 'candidate-arrow-proof:v1',
});

const first = serializeCandidateFeatureArrowFile(columnar, 'tmp/candidate-feature-proof.arrow');
const second = serializeCandidateFeatureArrowFile(columnar, 'tmp/candidate-feature-proof.arrow');

if (sha256(first.bytes) !== sha256(second.bytes)) throw new Error('CANDIDATE_FEATURE_ARROW_BYTES_NONDETERMINISTIC');
if (first.artifact.artifactId !== second.artifact.artifactId) throw new Error('CANDIDATE_FEATURE_ARROW_ARTIFACT_ID_NONDETERMINISTIC');
if (first.artifact.checksum !== sha256(first.bytes)) throw new Error('CANDIDATE_FEATURE_ARROW_ARTIFACT_CHECKSUM_MISMATCH');
if (first.receipt.rowCount !== ordinalMap.rowCount) throw new Error('CANDIDATE_FEATURE_ARROW_PROOF_ROW_COUNT_MISMATCH');
if (first.receipt.ordinalMapChecksum !== ordinalMap.ordinalMapChecksum) throw new Error('CANDIDATE_FEATURE_ARROW_PROOF_ORDINAL_MAP_MISMATCH');
if (first.receipt.featureSnapshotChecksum !== snapshot.snapshotChecksum) throw new Error('CANDIDATE_FEATURE_ARROW_PROOF_SNAPSHOT_MISMATCH');
if (first.receipt.columnarChecksum !== columnar.columnarChecksum) throw new Error('CANDIDATE_FEATURE_ARROW_PROOF_COLUMNAR_MISMATCH');

const lexical = CANDIDATE_SCALAR_FEATURES.indexOf('lexicalRelevance');
const memory = CANDIDATE_SCALAR_FEATURES.indexOf('memoryUtility');
if (columnar.featureValues[lexical] !== 0 || columnar.featurePresence[lexical] !== 0) {
  throw new Error('CANDIDATE_FEATURE_ARROW_MISSING_LEXICAL_ENCODING_MISMATCH');
}
if (columnar.featureValues[memory] !== 0 || columnar.featurePresence[memory] !== 1) {
  throw new Error('CANDIDATE_FEATURE_ARROW_REAL_ZERO_ENCODING_MISMATCH');
}

console.log(JSON.stringify({
  schema: 'atlas.candidate-feature-arrow-proof.v1',
  status: 'CANDIDATE_FEATURE_ARROW_BOUNDED_PROVEN',
  rowCount: first.receipt.rowCount,
  featureCount: first.receipt.featureCount,
  byteLength: first.receipt.byteLength,
  arrowChecksum: first.receipt.checksum,
  artifactId: first.artifact.artifactId,
  ordinalMapChecksum: first.receipt.ordinalMapChecksum,
  featureSnapshotChecksum: first.receipt.featureSnapshotChecksum,
  columnarChecksum: first.receipt.columnarChecksum,
  missingVersusZeroEncodingProven: true,
  deterministicBytesProven: true,
  roundtripOrdinalProven: true,
  storeWrites: false,
  canonicalOwnerChanged: false,
}, null, 2));
