import { describe, expect, it } from 'vitest';

import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import { buildGraphSnapshotRevisionV1 } from './graph-snapshot-revision-v1.js';
import { evaluateFanoutAdmissionV1 } from './fanout-admission-v1.js';

const workspaceRevision = `sha256:${'a'.repeat(64)}`;
const sourceInventoryHash = '1'.repeat(64);
const sourceRevision = `sha256:${'b'.repeat(64)}`;
const repositoryRevision = 'c'.repeat(40);
const snapshot = buildGraphSnapshotRevisionV1({
  snapshotId: '11111111-1111-4111-8111-111111111111',
  workspaceRevision,
  sourceInventoryRevision: `sha256:${sourceInventoryHash}`,
  identityContractVersion: 'identity:v2',
  parserContractVersion: 'parser:v2',
  sourceInventoryHash,
  topologyHash: 'd'.repeat(64),
  policyHash: 'e'.repeat(64),
  producerRevision: 'test:snapshot:v2',
});

const node = {
  snapshotId: snapshot.snapshotId,
  graphNodeKey: 'graph-node:1',
  canonicalId: 'canonical:1',
  packetKey: 'packet:1',
  symbolVersionId: 'symbol-version:1',
  sourceRef: 'src/a.ts',
  treeNodeId: 'tree:1',
  sourceRevision,
  evidenceRefs: ['evidence:node:1'],
};

const ordinalMap = materializeCandidateOrdinalMap({
  candidateSnapshotRevision: 'candidate-snapshot:42',
  workspaceRevision,
  producerRevision: 'test:ordinal-map:v1',
  candidates: [
    {
      canonicalId: 'canonical:0', packetKey: 'packet:0', treeNodeId: 'tree:0', symbolVersionId: null,
      workspaceRevision, sourceRevision: `sha256:${'f'.repeat(64)}`, graphRevision: snapshot.graphRevision,
      semanticRevision: 'semantic_768:7', degradedIdentity: false, evidenceRefs: ['evidence:0'],
    },
    {
      canonicalId: node.canonicalId, packetKey: node.packetKey, treeNodeId: node.treeNodeId,
      symbolVersionId: node.symbolVersionId, workspaceRevision, sourceRevision,
      graphRevision: snapshot.graphRevision, semanticRevision: 'semantic_768:7',
      degradedIdentity: false, evidenceRefs: ['evidence:1'],
    },
  ],
});
const expectedOrdinal = ordinalMap.candidates.find((candidate) => candidate.canonicalId === node.canonicalId)!.candidateOrdinal;

function payload(overrides: Record<string, unknown> = {}) {
  return {
    canonical_id: node.canonicalId,
    packet_key: node.packetKey,
    symbol_version_id: node.symbolVersionId,
    source_ref: node.sourceRef,
    tree_node_id: node.treeNodeId,
    source_revision: node.sourceRevision,
    workspace_revision: workspaceRevision,
    workspace_cache_revision: 41,
    repository_revision: repositoryRevision,
    graph_revision: snapshot.graphRevision,
    representation_id: 'semantic_768',
    representation_revision: 7,
    embedding_dimension: 768,
    ...overrides,
  };
}

function evaluate(overrides: Partial<Parameters<typeof evaluateFanoutAdmissionV1>[0]> = {}) {
  return evaluateFanoutAdmissionV1({
    graphSnapshotRevision: snapshot,
    graphNode: node,
    qdrantPayload: payload(),
    candidateOrdinalMap: ordinalMap,
    expectedRepresentationRevision: 7,
    expectedRepositoryRevision: repositoryRevision,
    producerRevision: 'test:fanout-admission:v2',
    ...overrides,
  });
}

describe('FanoutAdmissionV1', () => {
  it('admits fully aligned evidence and preserves the pre-existing nonzero CandidateOrdinal', () => {
    const result = evaluate();
    expect(expectedOrdinal).not.toBe(0);
    expect(result.status).toBe('ADMITTED_TO_CANDIDATE_ORDINAL');
    expect(result.admitted).toBe(true);
    expect(result.workspaceRevision).toBe(workspaceRevision);
    expect(result.repositoryRevision).toBe(repositoryRevision);
    expect(result.candidateOrdinal).toBe(expectedOrdinal);
    expect(result.candidateOrdinalMapChecksum).toBe(ordinalMap.ordinalMapChecksum);
    expect(result.ordinalRemappingPerformed).toBe(false);
    expect(result.rankingMutationPerformed).toBe(false);
    expect(result.extraRrfVotesCreated).toBe(false);
  });

  it('rejects a candidate map from a different workspace world state', () => {
    const wrong = materializeCandidateOrdinalMap({
      candidateSnapshotRevision: 'candidate-snapshot:other',
      workspaceRevision: `sha256:${'9'.repeat(64)}`,
      producerRevision: 'test:wrong-map:v1',
      candidates: [],
    });
    const result = evaluate({ candidateOrdinalMap: wrong });
    expect(result.status).toBe('CANDIDATE_SNAPSHOT_REJECTED');
    expect(result.blockers).toContain('CANDIDATE_ORDINAL_MAP_WORKSPACE_REVISION_MISMATCH');
    expect(result.candidateOrdinal).toBeNull();
  });

  it('rejects a node bound to another snapshot before considering Qdrant', () => {
    const result = evaluate({ graphNode: { ...node, snapshotId: '22222222-2222-4222-8222-222222222222' } });
    expect(result.status).toBe('SNAPSHOT_BINDING_MISMATCH');
    expect(result.candidateOrdinal).toBeNull();
  });

  it('rejects missing authoritative source revision', () => {
    const result = evaluate({ graphNode: { ...node, sourceRevision: null } });
    expect(result.status).toBe('SOURCE_REVISION_MISSING');
    expect(result.blockers).toContain('AUTHORITATIVE_SOURCE_REVISION_REQUIRED');
  });

  it('rejects source_ref/tree_node-only projection identity', () => {
    const result = evaluate({ qdrantPayload: payload({ canonical_id: undefined, symbol_version_id: undefined, packet_key: undefined }) });
    expect(result.status).toBe('CANONICAL_IDENTITY_REJECTED');
    expect(result.candidateOrdinal).toBeNull();
  });

  it('does not let legacy cache epoch or Git provenance satisfy canonical workspace revision', () => {
    const projection = payload();
    delete projection.workspace_revision;
    const result = evaluate({ qdrantPayload: projection });
    expect(result.status).toBe('REVISION_LINEAGE_REJECTED');
    expect(result.blockers).toContain('WORKSPACE_REVISION_MISMATCH');
  });

  it('checks Git provenance separately when an expected repository revision is supplied', () => {
    const result = evaluate({ qdrantPayload: payload({ repository_revision: '9'.repeat(40) }) });
    expect(result.status).toBe('REVISION_LINEAGE_REJECTED');
    expect(result.blockers).toContain('REPOSITORY_REVISION_MISMATCH');
  });

  it('rejects workspace/graph/source/representation drift', () => {
    for (const [field, value] of [
      ['workspace_revision', `sha256:${'8'.repeat(64)}`],
      ['graph_revision', '7'.repeat(64)],
      ['source_revision', `sha256:${'6'.repeat(64)}`],
      ['representation_revision', 8],
      ['representation_id', 'legacy_384'],
    ] as const) {
      const result = evaluate({ qdrantPayload: payload({ [field]: value }) });
      expect(result.status).toBe('REVISION_LINEAGE_REJECTED');
      expect(result.candidateOrdinal).toBeNull();
    }
  });

  it('rejects canonical hits that are absent from the immutable ordinal snapshot', () => {
    const mapWithoutCandidate = materializeCandidateOrdinalMap({
      candidateSnapshotRevision: 'candidate-snapshot:42', workspaceRevision,
      producerRevision: 'test:ordinal-map:v1', candidates: [ordinalMap.candidates[0]!],
    });
    const result = evaluate({ candidateOrdinalMap: mapWithoutCandidate });
    expect(result.status).toBe('CANDIDATE_SNAPSHOT_REJECTED');
    expect(result.blockers).toContain('CANONICAL_ID_NOT_IN_CANDIDATE_ORDINAL_MAP');
  });

  it('is deterministic for the same admitted evidence', () => {
    expect(evaluate().receiptChecksum).toBe(evaluate().receiptChecksum);
  });
});
