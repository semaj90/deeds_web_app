import { z } from 'zod';

import { candidateOrdinalMapV1Schema } from '../features/canonical-candidate-v1.js';
import {
  createAtlasRapidsBfsClient,
  type AtlasBfsReceiptV1,
  type AtlasBfsRequestV1,
} from './atlas-rapids-bfs-client.js';
import {
  adaptAtlasRapidsBfsReceiptToCandidateOrdinals,
  type GraphNeighborhoodNormalizationReceiptV1,
} from './graph-neighborhood-candidate-ordinal-v1.js';
import { materializeBfsStructuralFeatureSnapshotV1 } from './graph-neighborhood-structural-snapshot-v1.js';
import type { StructuralFeatureSnapshotV1 } from './structural-feature-snapshot-v1.js';

export interface AtlasRapidsBfsClientLike {
  bfs(input: AtlasBfsRequestV1): Promise<AtlasBfsReceiptV1>;
}

export interface ExecuteGraphNeighborhoodV1Input {
  ordinalMap: z.input<typeof candidateOrdinalMapV1Schema>;
  graphRevision: string;
  seedNodeKey: string;
  candidateNodeKeys: string[];
  maxHops: number;
  maxNodes: number;
  direction?: 'outbound' | 'inbound' | 'both';
  edgeTypes?: string[];
  gpuAvailable: boolean;
  frozenSnapshotAvailable: boolean;
  producerRevision: string;
  deadlineMs?: number;
}

export type GraphNeighborhoodExecutionGateV1 =
  | { admitted: true; reasonCodes: ['GPU_FROZEN_GRAPH_OUTBOUND_BFS_ADMITTED'] }
  | { admitted: false; reasonCodes: string[] };

/**
 * GPU graph admission gate. This is deliberately narrower than the general
 * graph algorithm policy: the currently proven resident cuGraph traversal has
 * outbound BFS semantics only and does not yet prove edge-type filtering.
 */
export function admitAtlasRapidsBfsV1(input: ExecuteGraphNeighborhoodV1Input): GraphNeighborhoodExecutionGateV1 {
  const reasons: string[] = [];
  const map = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  const direction = input.direction ?? 'outbound';

  if (!input.gpuAvailable) reasons.push('GPU_UNAVAILABLE');
  if (!input.frozenSnapshotAvailable) reasons.push('FROZEN_GRAPH_SNAPSHOT_UNAVAILABLE');
  if (!input.graphRevision?.trim()) reasons.push('GRAPH_REVISION_REQUIRED');
  if (direction !== 'outbound') reasons.push(`DIRECTION_NOT_PROVEN:${direction}`);
  if ((input.edgeTypes?.length ?? 0) > 0) reasons.push('EDGE_TYPE_FILTERING_NOT_PROVEN');
  if (!input.seedNodeKey?.trim()) reasons.push('SEED_NODE_KEY_REQUIRED');
  if (input.candidateNodeKeys.length === 0) reasons.push('CANDIDATE_NODE_KEYS_REQUIRED');
  if (!input.producerRevision?.trim()) reasons.push('PRODUCER_REVISION_REQUIRED');

  const candidateGraphRevisions = new Set(
    map.candidates.map((candidate) => candidate.graphRevision).filter((value): value is string => value !== null),
  );
  if (candidateGraphRevisions.size !== 1 || !candidateGraphRevisions.has(input.graphRevision)) {
    reasons.push('CANDIDATE_GRAPH_REVISION_SET_MISMATCH');
  }

  if (reasons.length > 0) return { admitted: false, reasonCodes: reasons };
  return { admitted: true, reasonCodes: ['GPU_FROZEN_GRAPH_OUTBOUND_BFS_ADMITTED'] };
}

/**
 * End-to-end bounded GPU neighborhood feature execution.
 *
 * Transport may see graph node/gpu IDs, but they terminate in the normalization
 * adapter. The returned structural snapshot is keyed by CandidateOrdinal and
 * canonicalId and contains only observed BFS distance/proximity evidence.
 */
export async function executeAtlasRapidsBfsStructuralSnapshotV1(
  input: ExecuteGraphNeighborhoodV1Input,
  client: AtlasRapidsBfsClientLike = createAtlasRapidsBfsClient(),
): Promise<{
  sourceReceipt: AtlasBfsReceiptV1;
  normalizationReceipt: GraphNeighborhoodNormalizationReceiptV1;
  snapshot: StructuralFeatureSnapshotV1;
}> {
  const gate = admitAtlasRapidsBfsV1(input);
  if (!gate.admitted) {
    throw new Error(`ATLAS_RAPIDS_BFS_ADMISSION_REJECTED:${gate.reasonCodes.join(',')}`);
  }

  const sourceReceipt = await client.bfs({
    graphRevision: input.graphRevision,
    seedNodeKey: input.seedNodeKey,
    candidateNodeKeys: input.candidateNodeKeys,
    maxHops: input.maxHops,
    maxNodes: input.maxNodes,
    direction: input.direction ?? 'outbound',
    deadlineMs: input.deadlineMs,
  });

  const normalized = adaptAtlasRapidsBfsReceiptToCandidateOrdinals({
    ordinalMap: input.ordinalMap,
    receipt: sourceReceipt,
    producerRevision: input.producerRevision,
  });
  if (normalized.hits.length === 0) {
    throw new Error('ATLAS_RAPIDS_BFS_NO_CANONICAL_CANDIDATE_HITS');
  }

  const snapshot = materializeBfsStructuralFeatureSnapshotV1({
    ordinalMap: input.ordinalMap,
    hits: normalized.hits,
    producerRevision: input.producerRevision,
  });

  return {
    sourceReceipt,
    normalizationReceipt: normalized.receipt,
    snapshot,
  };
}
