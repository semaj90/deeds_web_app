import { describe, expect, it, vi } from 'vitest';
import { buildClusterFeatureProjectionV1 } from '../contracts/cluster-feature-projection-v1.js';
import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import { runSomRadixOrderBridgeV1, type OrfClusterProjectionRowV1 } from './som-radix-order-bridge-v1.js';

const WS = `sha256:${'e'.repeat(64)}`;
const FEATURE_REVISION = 'orf-feature:v1';
const REPRESENTATION_REVISION = 'sem768:v1';
const CLUSTER_PRODUCER_REVISION = 'cluster-producer:v1';
const count = 3;

function fixture() {
  const candidates = Array.from({ length: count }, (_, ordinal) => ({
    canonicalId: `canonical:${ordinal}`,
    packetKey: `packet:${ordinal}`,
    sourceRef: `src/file-${ordinal}.ts`,
    treeNodeId: null,
    symbolVersionId: null,
    workspaceRevision: WS,
    sourceRevision: `sha256:${String(ordinal).padStart(64, 'a')}`,
    graphRevision: null,
    semanticRevision: null,
    degradedIdentity: false,
    evidenceRefs: [],
    representationBindings: [],
  }));
  const ordinalMap = materializeCandidateOrdinalMap({
    candidates,
    candidateSnapshotRevision: `sha256:${'a'.repeat(64)}`,
    workspaceRevision: WS,
    producerRevision: 'candidate-map:v1',
  });

  const rows: OrfClusterProjectionRowV1[] = ordinalMap.candidates.map((candidate, ordinal) => {
    const clusterId = [2, 1, 1][ordinal];
    const somRow = [0, 0, 1][ordinal];
    const somCol = [3, 2, 1][ordinal];
    const clusterFeatureProjection = buildClusterFeatureProjectionV1({
      packetKey: candidate.packetKey!,
      sourceRef: candidate.sourceRef!,
      sourceVersionReceiptId: `receipt:${ordinal}`,
      sourceRepresentationId: 'semantic_768',
      sourceRepresentationRevision: REPRESENTATION_REVISION,
      routingRepresentationId: null,
      autoencoderRevision: null,
      kmeans: { clusterId, probability: 0.9, distanceToCentroid: 0.1, algorithmRevision: 'kmeans:r1', randomState: 3 },
      som: { row: somRow, col: somCol, distance: 0.2, algorithmRevision: 'som:r1' },
      graphCommunity: { communityId: null, algorithm: null, algorithmRevision: null, graphRevision: null },
      producerRevision: CLUSTER_PRODUCER_REVISION,
    });
    return {
      packet_key: candidate.packetKey!,
      feature_revision: FEATURE_REVISION,
      source_revision: candidate.sourceRevision,
      registry_revision: 'registry:r1',
      source_ref: candidate.sourceRef!,
      source_version_receipt_id: `receipt:${ordinal}`,
      workspace_revision: candidate.workspaceRevision,
      representation_id: 'semantic_768',
      representation_revision: REPRESENTATION_REVISION,
      tree_node_id: null,
      ontology_classes: [],
      ast_observation_kinds: ['FUNCTION_DECL'],
      langextract_classes: [],
      flattened_tags: ['ast=function_decl'],
      ontology_mask: Array.from({ length: 32 }, (_, i) => i === 1 ? 1 : 0),
      ast_pattern_mask: Array.from({ length: 32 }, (_, i) => i === 0 ? 1 : 0),
      structural_flags: { hasFunction: true },
      evidence_refs: ['evidence:source'],
      producer_revision: 'orf-producer:r1',
      input_digest: 'b'.repeat(64),
      cluster_feature_projection: clusterFeatureProjection,
      kmeans_cluster_id: clusterId,
      som_row: somRow,
      som_col: somCol,
    };
  });
  return { ordinalMap, rows };
}

describe('SOM radix order bridge v1', () => {
  it('joins revision-qualified ORF cluster projections to exact candidate ordinals before worker dispatch', async () => {
    const { ordinalMap, rows } = fixture();
    const runSomRadixOrderProposal = vi.fn(async (input) => ({
      schema: 'atlas.som-radix-order.worker-result.v1' as const,
      authority: 'PROPOSAL_ONLY' as const,
      backend: 'JS_REFERENCE' as const,
      sourceIndices: new Uint32Array([1, 2, 0]),
      sortedCandidateOrdinals: new Uint32Array([1, 2, 0]),
    }));
    const result = await runSomRadixOrderBridgeV1({
      ordinalMap,
      rows,
      expectedFeatureRevision: FEATURE_REVISION,
      expectedRepresentationRevision: REPRESENTATION_REVISION,
      expectedClusterProducerRevision: CLUSTER_PRODUCER_REVISION,
      computePool: { runSomRadixOrderProposal },
    });

    expect(runSomRadixOrderProposal).toHaveBeenCalledOnce();
    expect(Array.from(runSomRadixOrderProposal.mock.calls[0][0].kmeansClusterIds)).toEqual([2, 1, 1]);
    expect(Array.from(runSomRadixOrderProposal.mock.calls[0][0].somBmuIds)).toEqual([3, 2, 21]);
    expect(Array.from(result.orderedCandidateOrdinals)).toEqual([1, 2, 0]);
    expect(result.authority).toBe('PROPOSAL_ONLY');
    expect(result.writesPerformed).toBe(false);
    expect(result.sourceBindingChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('rejects incomplete or stale clusters before worker dispatch', async () => {
    const { ordinalMap, rows } = fixture();
    const runSomRadixOrderProposal = vi.fn();
    const base = {
      ordinalMap,
      expectedFeatureRevision: FEATURE_REVISION,
      expectedRepresentationRevision: REPRESENTATION_REVISION,
      expectedClusterProducerRevision: CLUSTER_PRODUCER_REVISION,
      computePool: { runSomRadixOrderProposal },
    };

    await expect(runSomRadixOrderBridgeV1({ ...base, rows: rows.slice(1) }))
      .rejects.toThrow('SOM_RADIX_ORF_BINDING_INCOMPLETE');
    await expect(runSomRadixOrderBridgeV1({
      ...base,
      rows: rows.map((row, i) => i === 0 ? { ...row, cluster_feature_projection: null } : row),
    })).rejects.toThrow();
    await expect(runSomRadixOrderBridgeV1({
      ...base,
      expectedClusterProducerRevision: 'cluster-producer:stale',
      rows,
    })).rejects.toThrow('SOM_RADIX_CLUSTER_PRODUCER_REVISION_MISMATCH');

    expect(runSomRadixOrderProposal).not.toHaveBeenCalled();
  });

  it.each([
    ['duplicate source index', [0, 0, 2], [0, 0, 1], 'SOM_RADIX_WORKER_PERMUTATION_INVALID'],
    ['ordinal mismatch', [2, 1, 0], [0, 1, 2], 'SOM_RADIX_WORKER_ORDINAL_BINDING_MISMATCH'],
    ['unsorted result', [0, 1, 2], [0, 1, 2], 'SOM_RADIX_WORKER_ORDER_INVALID'],
  ])('rejects a worker %s before producing a proposal receipt', async (_name, indices, ordinals, expected) => {
    const { ordinalMap, rows } = fixture();
    const runSomRadixOrderProposal = vi.fn(async () => ({
      schema: 'atlas.som-radix-order.worker-result.v1' as const,
      authority: 'PROPOSAL_ONLY' as const,
      backend: 'JS_REFERENCE' as const,
      sourceIndices: new Uint32Array(indices),
      sortedCandidateOrdinals: new Uint32Array(ordinals),
    }));

    await expect(runSomRadixOrderBridgeV1({
      ordinalMap,
      rows,
      expectedFeatureRevision: FEATURE_REVISION,
      expectedRepresentationRevision: REPRESENTATION_REVISION,
      expectedClusterProducerRevision: CLUSTER_PRODUCER_REVISION,
      computePool: { runSomRadixOrderProposal },
    })).rejects.toThrow(expected);
  });
});
