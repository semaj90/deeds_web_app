import { describe, expect, it } from 'vitest';

import { buildGraphSnapshotRevisionV1 } from './graph-snapshot-revision-v1.js';
import { evaluateFanoutAdmissionV1 } from './fanout-admission-v1.js';

const snapshot = buildGraphSnapshotRevisionV1({
  snapshotId: '11111111-1111-4111-8111-111111111111',
  workspaceRevision: 'a'.repeat(40),
  sourceInventoryRevision: 'inventory:42',
  identityContractVersion: 'identity:v1',
  parserContractVersion: 'parser:v1',
  sourceInventoryHash: 'a'.repeat(64),
  topologyHash: 'b'.repeat(64),
  policyHash: 'c'.repeat(64),
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
  sourceRevision: 'sha256:source-1',
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
    repository_revision: snapshot.workspaceRevision,
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
  it('admits only fully aligned evidence and assigns CandidateOrdinal after admission', () => {
    const result = evaluate();
    expect(result.status).toBe('ADMITTED_TO_CANDIDATE_ORDINAL');
    expect(result.admitted).toBe(true);
    expect(result.repositoryRevision).toBe(snapshot.workspaceRevision);
    expect(result.candidateOrdinalMap?.rowCount).toBe(1);
    expect(result.candidateOrdinalMap?.candidates[0]?.candidateOrdinal).toBe(0);
    expect(result.candidateOrdinalMap?.candidates[0]?.canonicalId).toBe(node.canonicalId);
    expect(result.candidateOrdinalMap?.candidates[0]?.sourceRevision).toBe(node.sourceRevision);
    expect(result.candidateOrdinalMap?.candidates[0]?.graphRevision).toBe(snapshot.graphRevision);
    expect(result.candidateOrdinalMap?.identityAuthority).toBe(false);
    expect(result.canonicalWritesAttempted).toBe(false);
    expect(result.qdrantWritesAttempted).toBe(false);
    expect(result.neo4jWritesAttempted).toBe(false);
  });

  it('rejects a node bound to another snapshot before considering Qdrant', () => {
    const result = evaluate({
      graphNode: { ...node, snapshotId: '22222222-2222-4222-8222-222222222222' },
    });
    expect(result.status).toBe('SNAPSHOT_BINDING_MISMATCH');
    expect(result.candidateOrdinalMap).toBeNull();
  });

  it('rejects missing authoritative source revision', () => {
    const result = evaluate({ graphNode: { ...node, sourceRevision: null } });
    expect(result.status).toBe('SOURCE_REVISION_MISSING');
    expect(result.blockers).toContain('AUTHORITATIVE_SOURCE_REVISION_REQUIRED');
  });

  it('rejects source_ref/tree_node-only projection identity', () => {
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

  it('does not let legacy workspace/cache epoch satisfy repository revision', () => {
    const projection = payload();
    delete projection.repository_revision;
    const result = evaluate({ qdrantPayload: projection });
    expect(result.status).toBe('REVISION_LINEAGE_REJECTED');
    expect(result.blockers).toContain('REPOSITORY_REVISION_MISMATCH');
    expect(result.candidateOrdinalMap).toBeNull();
  });

  it('rejects repository/graph/source/representation drift', () => {
    for (const [field, value] of [
      ['repository_revision', 'b'.repeat(40)],
      ['graph_revision', 'graph:other'],
      ['source_revision', 'sha256:other'],
      ['representation_revision', 8],
      ['representation_id', 'legacy_384'],
    ] as const) {
      const result = evaluate({ qdrantPayload: payload({ [field]: value }) });
      expect(result.status).toBe('REVISION_LINEAGE_REJECTED');
      expect(result.candidateOrdinalMap).toBeNull();
    }
  });

  it('is deterministic for the same admitted evidence', () => {
    const first = evaluate();
    const second = evaluate();
    expect(second.receiptChecksum).toBe(first.receiptChecksum);
    expect(second.candidateOrdinalMap?.ordinalMapChecksum)
      .toBe(first.candidateOrdinalMap?.ordinalMapChecksum);
  });
});
