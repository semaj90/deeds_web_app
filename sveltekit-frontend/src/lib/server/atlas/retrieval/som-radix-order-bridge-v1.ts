import {
  assertCandidateOrdinalMapIntegrityV1,
  candidateOrdinalMapV1Schema,
  type CandidateOrdinalMapV1,
} from '../features/canonical-candidate-v1.js';
import {
  assertClusterFeatureProjectionBindingV1,
  verifyClusterFeatureProjectionV1,
} from '../contracts/cluster-feature-projection-v1.js';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import {
  readOrfRowsForCandidateMapV1,
  type OrfDbRowV1,
} from './orf-feature-row-reader-v1.js';
import type {
  ComputePool,
  SomRadixOrderResult,
} from '$lib/server/workers/compute-pool.js';

export const SOM_RADIX_ORDER_BRIDGE_V1_SCHEMA = 'atlas.som-radix-order-bridge.v1' as const;

export interface OrfClusterProjectionRowV1 extends OrfDbRowV1 {
  cluster_feature_projection?: unknown;
  kmeans_cluster_id?: number | null;
  som_row?: number | null;
  som_col?: number | null;
}

export interface SomRadixOrderBridgeReceiptV1 {
  schema: typeof SOM_RADIX_ORDER_BRIDGE_V1_SCHEMA;
  authority: 'PROPOSAL_ONLY';
  canonicalAuthority: false;
  writesPerformed: false;
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
  workspaceRevision: string;
  featureRevision: string;
  representationRevision: string;
  sourceBindingChecksum: string;
  orderedCandidateOrdinals: number[];
  result: SomRadixOrderResult;
}

/** Verify the worker returned an exact permutation of the admitted ordinal map. */
function assertSomRadixWorkerResultV1(
  value: SomRadixOrderResult,
  input: {
    kmeansClusterIds: Uint16Array;
    somBmuIds: Uint16Array;
    candidateOrdinals: Uint32Array;
  },
): void {
  const count = input.candidateOrdinals.length;
  if (value?.schema !== 'atlas.som-radix-order.worker-result.v1'
    || value.authority !== 'PROPOSAL_ONLY'
    || !['NAPI_RADIX', 'JS_REFERENCE'].includes(value.backend)
    || !(value.sourceIndices instanceof Uint32Array)
    || !(value.sortedCandidateOrdinals instanceof Uint32Array)
    || value.sourceIndices.length !== count
    || value.sortedCandidateOrdinals.length !== count) {
    throw new Error('SOM_RADIX_WORKER_RESULT_INVALID');
  }

  const seen = new Uint8Array(count);
  let previousCluster = -1;
  let previousBmu = -1;
  let previousOrdinal = -1;
  for (let out = 0; out < count; out++) {
    const sourceIndex = value.sourceIndices[out];
    if (sourceIndex >= count || seen[sourceIndex]) {
      throw new Error('SOM_RADIX_WORKER_PERMUTATION_INVALID');
    }
    seen[sourceIndex] = 1;
    const ordinal = value.sortedCandidateOrdinals[out];
    if (ordinal !== input.candidateOrdinals[sourceIndex]) {
      throw new Error('SOM_RADIX_WORKER_ORDINAL_BINDING_MISMATCH');
    }
    const cluster = input.kmeansClusterIds[sourceIndex];
    const bmu = input.somBmuIds[sourceIndex];
    if (cluster < previousCluster
      || (cluster === previousCluster && bmu < previousBmu)
      || (cluster === previousCluster && bmu === previousBmu && ordinal <= previousOrdinal)) {
      throw new Error('SOM_RADIX_WORKER_ORDER_INVALID');
    }
    previousCluster = cluster;
    previousBmu = bmu;
    previousOrdinal = ordinal;
  }
}

/**
 * Join exact ORF cluster receipts to an admitted CandidateOrdinalMap and send one
 * bounded batch through the existing CPU worker. Missing/stale features reject
 * the complete batch; this never turns a partial subset into a new candidate map.
 */
export async function runSomRadixOrderBridgeV1(input: {
  ordinalMap: unknown;
  rows: readonly OrfClusterProjectionRowV1[];
  expectedFeatureRevision: string;
  expectedRepresentationRevision: string;
  expectedClusterProducerRevision: string;
  computePool: Pick<ComputePool, 'runSomRadixOrderProposal'>;
}): Promise<SomRadixOrderBridgeReceiptV1> {
  if (!input.expectedFeatureRevision.trim()
    || !input.expectedRepresentationRevision.trim()
    || !input.expectedClusterProducerRevision.trim()) {
    throw new Error('SOM_RADIX_EXPECTED_REVISIONS_REQUIRED');
  }

  const ordinalMap: CandidateOrdinalMapV1 = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  assertCandidateOrdinalMapIntegrityV1(ordinalMap);
  if (ordinalMap.rowCount === 0) throw new Error('SOM_RADIX_CANDIDATE_MAP_EMPTY');

  const admitted = readOrfRowsForCandidateMapV1({
    ordinalMap,
    expectedCandidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
    expectedOrdinalMapChecksum: ordinalMap.ordinalMapChecksum,
    expectedWorkspaceRevision: ordinalMap.workspaceRevision,
    rows: input.rows,
    expectedFeatureRevision: input.expectedFeatureRevision,
    expectedRepresentationRevision: input.expectedRepresentationRevision,
  });
  if (admitted.rejected.length > 0 || admitted.accepted.length !== ordinalMap.rowCount) {
    throw new Error(`SOM_RADIX_ORF_BINDING_INCOMPLETE:${JSON.stringify(admitted.rejectionCounts)}`);
  }

  const rowsByPacket = new Map<string, OrfClusterProjectionRowV1[]>();
  for (const row of input.rows) {
    const rows = rowsByPacket.get(row.packet_key) ?? [];
    rows.push(row);
    rowsByPacket.set(row.packet_key, rows);
  }

  const kmeansClusterIds = new Uint16Array(ordinalMap.rowCount);
  const somBmuIds = new Uint16Array(ordinalMap.rowCount);
  const candidateOrdinals = new Uint32Array(ordinalMap.rowCount);
  const bindings: Array<Record<string, unknown>> = [];

  for (const accepted of admitted.accepted) {
    const candidate = accepted.candidate;
    const matchingRows = (rowsByPacket.get(candidate.packetKey) ?? [])
      .filter((row) => row.feature_revision === input.expectedFeatureRevision);
    if (matchingRows.length !== 1) {
      throw new Error(`SOM_RADIX_ORF_ROW_CARDINALITY_INVALID:${candidate.candidateOrdinal}`);
    }
    const row = matchingRows[0];
    const projection = verifyClusterFeatureProjectionV1(row.cluster_feature_projection);
    if (projection.producerRevision !== input.expectedClusterProducerRevision) {
      throw new Error(`SOM_RADIX_CLUSTER_PRODUCER_REVISION_MISMATCH:${candidate.candidateOrdinal}`);
    }
    assertClusterFeatureProjectionBindingV1(projection, {
      packetKey: candidate.packetKey,
      sourceRef: candidate.sourceRef,
      sourceVersionReceiptId: row.source_version_receipt_id,
      representationId: row.representation_id,
      representationRevision: row.representation_revision,
    });

    const clusterId = row.kmeans_cluster_id;
    const somRow = row.som_row;
    const somCol = row.som_col;
    if (!Number.isInteger(clusterId) || clusterId! < 0 || clusterId! > 65_535
      || !Number.isInteger(somRow) || somRow! < 0 || somRow! >= 20
      || !Number.isInteger(somCol) || somCol! < 0 || somCol! >= 20) {
      throw new Error(`SOM_RADIX_CLUSTER_ASSIGNMENT_INCOMPLETE:${candidate.candidateOrdinal}`);
    }
    if (projection.kmeans.clusterId !== clusterId
      || projection.som.row !== somRow
      || projection.som.col !== somCol) {
      throw new Error(`SOM_RADIX_SCALAR_PROJECTION_MISMATCH:${candidate.candidateOrdinal}`);
    }

    const ordinal = candidate.candidateOrdinal;
    kmeansClusterIds[ordinal] = clusterId!;
    somBmuIds[ordinal] = somRow! * 20 + somCol!;
    candidateOrdinals[ordinal] = ordinal;
    bindings[ordinal] = {
      candidateOrdinal: ordinal,
      canonicalId: candidate.canonicalId,
      packetKey: candidate.packetKey,
      sourceRef: candidate.sourceRef,
      sourceRevision: candidate.sourceRevision,
      workspaceRevision: candidate.workspaceRevision,
      representationRevision: input.expectedRepresentationRevision,
      featureRevision: input.expectedFeatureRevision,
      clusterProjectionDigest: projection.projectionDigest,
      clusterProducerRevision: projection.producerRevision,
    };
  }

  const sourceBindingChecksum = `sha256:${canonicalSha256V1({
    schema: 'atlas.som-radix-order-source-bindings.v1',
    candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    workspaceRevision: ordinalMap.workspaceRevision,
    bindings,
  })}`;
  const result = await input.computePool.runSomRadixOrderProposal({
    kmeansClusterIds,
    somBmuIds,
    candidateOrdinals,
  });
  assertSomRadixWorkerResultV1(result, { kmeansClusterIds, somBmuIds, candidateOrdinals });

  return {
    schema: SOM_RADIX_ORDER_BRIDGE_V1_SCHEMA,
    authority: 'PROPOSAL_ONLY',
    canonicalAuthority: false,
    writesPerformed: false,
    candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    workspaceRevision: ordinalMap.workspaceRevision,
    featureRevision: input.expectedFeatureRevision,
    representationRevision: input.expectedRepresentationRevision,
    sourceBindingChecksum,
    orderedCandidateOrdinals: Array.from(result.sortedCandidateOrdinals),
    result,
  };
}
