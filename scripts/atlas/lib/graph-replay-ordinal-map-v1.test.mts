import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import {
  candidateOrdinalMapChecksum,
  type CandidateOrdinalMapV1,
} from '../../../sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.js';
import {
  mapGraphEntitiesToCandidateOrdinalsV1,
  resolveGraphReplayReportPathV1,
  verifyGraphReplayOrdinalMapV1,
} from './graph-replay-ordinal-map-v1.mjs';

const workspaceRevision = `sha256:${'a'.repeat(64)}`;
const candidateSnapshotRevision = `sha256:${'b'.repeat(64)}`;

function candidateMap(): CandidateOrdinalMapV1 {
  const candidate = {
    schema: 'atlas.canonical-candidate.v1' as const,
    candidateOrdinal: 0,
    canonicalId: 'packet:fixture-1',
    packetKey: 'packet:fixture-1',
    sourceRef: 'src/fixture.ts',
    treeNodeId: null,
    symbolVersionId: null,
    workspaceRevision,
    sourceRevision: `sha256:${'c'.repeat(64)}`,
    graphRevision: null,
    semanticRevision: null,
    candidateSnapshotRevision,
    degradedIdentity: false,
    evidenceRefs: [],
    representationBindings: [],
  };
  const checksumPayload = { candidateSnapshotRevision, workspaceRevision, candidates: [candidate] };
  return {
    schema: 'atlas.candidate-ordinal-map.v1',
    candidateSnapshotRevision,
    workspaceRevision,
    rowCount: 1,
    candidates: [candidate],
    ordinalMapChecksum: candidateOrdinalMapChecksum(checksumPayload),
    identityAuthority: false,
    producerRevision: `sha256:${'d'.repeat(64)}`,
  };
}

test('accepts only the owner-verified map and matching replay coordinates', () => {
  const map = candidateMap();
  assert.deepEqual(verifyGraphReplayOrdinalMapV1({
      candidateMap: map,
      workspaceRevision,
      candidateSnapshotRevision,
      ordinalMapChecksum: `sha256:${map.ordinalMapChecksum}`,
  }), map);
});

test('rejects mismatched workspace, snapshot, and map checksum', () => {
  const map = candidateMap();
  const input = { candidateMap: map, workspaceRevision, candidateSnapshotRevision, ordinalMapChecksum: `sha256:${map.ordinalMapChecksum}` };
  assert.throws(() => verifyGraphReplayOrdinalMapV1({ ...input, workspaceRevision: `sha256:${'e'.repeat(64)}` }), /GRAPH_RO_REPLAY_ORDINAL_MAP_WORKSPACE_REVISION_MISMATCH/);
  assert.throws(() => verifyGraphReplayOrdinalMapV1({ ...input, candidateSnapshotRevision: `sha256:${'f'.repeat(64)}` }), /GRAPH_RO_REPLAY_ORDINAL_MAP_SNAPSHOT_REVISION_MISMATCH/);
  assert.throws(() => verifyGraphReplayOrdinalMapV1({ ...input, ordinalMapChecksum: `sha256:${'0'.repeat(64)}` }), /GRAPH_RO_REPLAY_ORDINAL_MAP_CHECKSUM_MISMATCH/);
});

test('rejects a schema-valid but internally corrupt ordinal sequence', () => {
  const map = candidateMap();
  const corrupt = { ...map, candidates: [{ ...map.candidates[0], candidateOrdinal: 1 }] };
  assert.throws(() => verifyGraphReplayOrdinalMapV1({
    candidateMap: corrupt,
    workspaceRevision,
    candidateSnapshotRevision,
    ordinalMapChecksum: `sha256:${map.ordinalMapChecksum}`,
  }), /CANDIDATE_ORDINAL_MAP_ORDINAL_SEQUENCE_BROKEN/);
});

test('crosswalks exact graph identities and reports unmatched entities', () => {
  const map = candidateMap();
  assert.deepEqual(mapGraphEntitiesToCandidateOrdinalsV1({ candidateMap: map, entityCanonicalIds: ['packet:fixture-1'] }), {
    matchedEntityCount: 1,
    unmatchedEntityCount: 0,
    candidateOrdinalPairsChecksum: 'sha256:cb5b19d8a6a745d89b21082977cc1efa5fd5c9dd8d8ad27743bdeb3196f0ebc1',
    sampleCandidateOrdinals: [{ canonicalId: 'packet:fixture-1', candidateOrdinal: 0 }],
    crosswalkStatus: 'EXACT',
  });
  assert.equal(mapGraphEntitiesToCandidateOrdinalsV1({ candidateMap: map, entityCanonicalIds: ['packet:fixture-1', 'ontology:other'] }).crosswalkStatus, 'PARTIAL');
  assert.throws(() => mapGraphEntitiesToCandidateOrdinalsV1({ candidateMap: map, entityCanonicalIds: ['packet:fixture-1', 'packet:fixture-1'] }), /GRAPH_RO_REPLAY_GRAPH_ENTITY_ID_MISSING_OR_DUPLICATE/);
});

test('preserves the existing default destination and accepts scratch JSON only', () => {
  const root = 'C:/repo';
  assert.equal(resolveGraphReplayReportPathV1(root), resolve(root, 'docs/reports/relationship-graph-readonly-replay-v1.json'));
  assert.equal(resolveGraphReplayReportPathV1(root, '.tmp/atlas/replay.json'), resolve(root, '.tmp/atlas/replay.json'));
});

test('rejects traversal, absolute, non-JSON, and empty output paths', () => {
  const root = 'C:/repo';
  for (const output of ['.tmp/atlas/../report.json', 'docs/reports/replay.json', 'C:/repo/.tmp/atlas/replay.json', '.tmp/atlas/replay.txt', '']) {
    assert.throws(() => resolveGraphReplayReportPathV1(root, output));
  }
});
