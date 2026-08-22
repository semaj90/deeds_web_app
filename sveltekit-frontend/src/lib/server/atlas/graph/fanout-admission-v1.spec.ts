import { describe, expect, it } from 'vitest';

import { buildGraphSnapshotRevisionV1 } from './graph-snapshot-revision-v1.js';
import { evaluateFanoutAdmissionV1 } from './fanout-admission-v1.js';

const snapshot = buildGraphSnapshotRevisionV1({
  snapshotId: '11111111-1111-4111-8111-111111111111',
  workspaceRevision: `sha256:${'a'.repeat(64)}`,
  sourceInventoryRevision: `sha256:${'b'.repeat(64)}`,
  identityContractVersion: 'identity:v1',
  parserContractVersion: 'parser:v1',
  sourceInventoryHash: 'b'.repeat(64),
  topologyHash: 'c'.repeat(64),
  policyHash: 'd'.repeat(64),
  producerRevision: 'test:snapshot:v1',
});

const node = {
  snapshotId: snapshot.snapshotId,
  graphNodeKey: 'graph-node:1',
  canonicalId: 'canonical:1',
  packetKey: 'packet:1',
  symbolVersionId: 'symbol-version:1',
  sourceRef: 'src/a.ts',
  treeNodeId: 'tree:1',
  sourceRevision: `sha256:${'e'.repeat(64)}`,
  evidenceRefs: ['evidence:node:1'],
};

function payload(overrides: Record<string, unknown> = {}) {
  return {
    canonical_id: node.canonicalId,
    packet_key: node.packetKey,
    symbol_version_id: node.symbolVersionId,
    source_ref: node.sourceRef,
    tree_node_id: node.treeNodeId,
    source_revision: node.sourceRevision,
    workspace_world_revision: snapshot.workspaceRevision,
    repository_revision: '1'.repeat(40),
    workspace_revision: 41,
    workspace_cache_revision: 41,
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
    candidateSnapshotRevision: 'candidate-snapshot:42',
    expectedRepresentationRevision: 7,
    producerRevision: 'test:fanout-admission:v1',
    ...overrides,
  });
}

describe('FanoutAdmissionV1', () => {
  it('creates CandidateOrdinal only after complete canonical admission', () => {
    const result = evaluate();
    expect(result.status).toBe('ADMITTED_TO_CANDIDATE_ORDINAL');
    expect(result.admitted).toBe(true);
    expect(result.workspaceWorldRevision).toBe(snapshot.workspaceRevision);
    expect(result.repositoryRevisionObserved).toBe('1'.repeat(40));
    expect(result.legacyWorkspaceCacheRevisionObserved).toBe('41');
    expect(result.candidateOrdinalMap?.rowCount).toBe(1);
    expect(result.candidateOrdinalMap?.candidates[0]?.candidateOrdinal).toBe(0);
    expect(result.candidateOrdinalMap?.candidates[0]?.canonicalId).toBe(node.canonicalId);
    expect(result.candidateOrdinalMap?.candidates[0]?.workspaceRevision).toBe(snapshot.workspaceRevision);
    expect(result.candidateOrdinalMap?.candidates[0]?.sourceRevision).toBe(node.sourceRevision);
    expect(result.candidateOrdinalMap?.candidates[0]?.graphRevision).toBe(snapshot.graphRevision);
    expect(result.candidateOrdinalMap?.identityAuthority).toBe(false);
    expect(result.canonicalWritesAttempted).toBe(false);
    expect(result.qdrantWritesAttempted).toBe(false);
    expect(result.neo4jWritesAttempted).toBe(false);
  });

  it('rejects a graph node bound to another snapshot', () => {
    const result = evaluate({
      graphNode: { ...node, snapshotId: '22222222-2222-4222-8222-222222222222' },
    });
    expect(result.status).toBe('SNAPSHOT_BINDING_MISMATCH');
    expect(result.candidateOrdinalMap).toBeNull();
  });

  it('rejects a source-backed graph node without authoritative sourceRevision', () => {
    const result = evaluate({ graphNode: { ...node, sourceRevision: null } });
    expect(result.status).toBe('SOURCE_REVISION_MISSING');
    expect(result.blockers).toContain('AUTHORITATIVE_SOURCE_REVISION_REQUIRED');
    expect(result.candidateOrdinalMap).toBeNull();
  });

  it('rejects source_ref/tree_node-only Qdrant identity', () => {
    const result = evaluate({
      qdrantPayload: payload({
        canonical_id: undefined,
        symbol_version_id: undefined,
        packet_key: undefined,
      }),
    });
    expect(result.status).toBe('CANONICAL_IDENTITY_REJECTED');
    expect(result.candidateOrdinalMap).toBeNull();
  });

  it('does not let Git provenance or cache epoch substitute logical workspace world state', () => {
    const qdrant = payload();
    delete qdrant.workspace_world_revision;
    const result = evaluate({ qdrantPayload: qdrant });
    expect(result.status).toBe('REVISION_LINEAGE_REJECTED');
    expect(result.blockers).toContain('WORKSPACE_WORLD_REVISION_MISMATCH');
    expect(result.repositoryRevisionObserved).toBe('1'.repeat(40));
    expect(result.legacyWorkspaceCacheRevisionObserved).toBe('41');
    expect(result.candidateOrdinalMap).toBeNull();
  });

  it('rejects source, graph, semantic lane, and representation revision drift', () => {
    for (const [field, value] of [
      ['source_revision', `sha256:${'9'.repeat(64)}`],
      ['graph_revision', '8'.repeat(64)],
      ['representation_revision', 8],
      ['representation_id', 'legacy_384'],
    ] as const) {
      const result = evaluate({ qdrantPayload: payload({ [field]: value }) });
      expect(result.status).toBe('REVISION_LINEAGE_REJECTED');
      expect(result.candidateOrdinalMap).toBeNull();
    }
  });

  it('is deterministic for identical admitted evidence', () => {
    const first = evaluate();
    const second = evaluate();
    expect(second.receiptChecksum).toBe(first.receiptChecksum);
    expect(second.candidateOrdinalMap?.ordinalMapChecksum)
      .toBe(first.candidateOrdinalMap?.ordinalMapChecksum);
  });
});
